import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type RefObject } from 'react'
import type React from 'react'

import { computeTesseraLayout } from './computeTesseraLayout'
import { useVirtualWindow, resolveScrollEl } from './useVirtualWindow'
import type { GalleryItem, LayoutOptions, ResolvedRow, ScrollContainerRef, TesseraRenderMetrics } from './types'

type CommittedRow<T> = {
  height: number
  items: Array<{ item: GalleryItem<T>; width: number; height: number }>
}

function toResolvedRow<T>(
  row: CommittedRow<T>,
  loadedSet: Set<string | number>,
  rowIndex: number,
  startIndex: number,
): ResolvedRow<T> {
  return {
    rowIndex,
    startIndex,
    height: row.height,
    items: row.items.map(({ item, width, height }, colIndex) => ({
      item,
      itemIndex: startIndex + colIndex,
      colIndex,
      width,
      height,
      loaded: loadedSet.has(item.key),
    })),
  }
}

type VirtualWindow = {
  firstIndex: number
  lastIndex: number
  topSpacerHeight: number
  bottomSpacerHeight: number
}

function buildRenderMetrics<T>(
  rows: ResolvedRow<T>[],
  totalItemCount: number,
  totalRowCount: number,
  virtualized: boolean,
): TesseraRenderMetrics {
  return {
    virtualized,
    mountedItemCount: rows.reduce((sum, row) => sum + row.items.length, 0),
    mountedRowCount: rows.length,
    totalItemCount,
    totalRowCount,
    firstMountedRowIndex: rows[0]?.rowIndex ?? null,
    lastMountedRowIndex: rows.at(-1)?.rowIndex ?? null,
  }
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function finiteNonNegative(value: number, fallback = 0): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}


export function useTesseraGallery<T>(
  items: GalleryItem<T>[],
  options: LayoutOptions,
  scrollContainerRef?: ScrollContainerRef,
): {
  containerRef: RefObject<HTMLDivElement | null>
  rows: ResolvedRow<T>[]
  totalRows: number
  gap: number
  onLoad: (key: string | number, naturalWidth: number, naturalHeight: number) => void
  onError: (key: string | number) => void
  virtualWindow: VirtualWindow | null
  focusedIndex: number
  handleItemFocus: (index: number) => void
  handleItemKeyDown: (itemIndex: number, e: React.KeyboardEvent) => void
} {
  // ─── Hooks ─────────────────────────────────────────────────────────────────

  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const pendingFocusRef = useRef<number | null>(null)

  // Aspect ratio cache — populated from items with known aspectRatio and via onLoad
  const aspectRatioCache = useRef<Map<string | number, number>>(new Map())
  // Tracks which items have been confirmed browser-loaded via onLoad
  const loadedSet = useRef<Set<string | number>>(new Set())
  // Tracks items whose images failed to load
  const errorSet = useRef<Set<string | number>>(new Set())
  // Increment to trigger re-renders when cache or loadedSet changes
  const [, rerender] = useReducer(n => n + 1, 0)

  // Stabilized rows output — only updated when content genuinely changes
  const prevRowsRef = useRef<ResolvedRow<T>[]>([])
  const allRowsRef = useRef<CommittedRow<T>[]>([])
  const rowTopsRef = useRef<number[]>([])
  const rowStartsRef = useRef<number[]>([])
  const totalItemsRef = useRef(0)

  const virtualRange = useVirtualWindow(containerRef, options.virtualize === true, scrollContainerRef)

  // Append-only layout: committed rows are locked and never reshuffled
  const committedRowsRef = useRef<CommittedRow<T>[]>([])
  const committedItemCountRef = useRef(0)
  const committedContainerWidthRef = useRef(0)
  const committedOptionsKeyRef = useRef('')
  const committedErrorSetSizeRef = useRef(0)
  // Tracks the item count at the start of the first provisionally committed row
  // (a row committed using a placeholder aspect ratio). Infinity when none exist.
  const firstProvisionalRowStartCountRef = useRef<number>(Infinity)
  // Keys of items committed with placeholder aspect ratios, pending real values.
  const provisionalCommittedKeysRef = useRef<Set<string | number>>(new Set())

  // ─── Render-time sync ──────────────────────────────────────────────────────

  // Sync items with pre-known aspectRatios into cache every render.
  // Pre-known aspectRatio takes precedence — onLoad will not overwrite it.
  for (const item of items) {
    if (item.aspectRatio !== undefined && Number.isFinite(item.aspectRatio) && item.aspectRatio > 0) {
      aspectRatioCache.current.set(item.key, item.aspectRatio)
    }
  }

  // ─── Effects ───────────────────────────────────────────────────────────────

  // ResizeObserver — genuine external synchronization, useEffect is correct here
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? 0
      if (width > 0) setContainerWidth(width)
    })
    const el = containerRef.current
    if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // ─── Callbacks ─────────────────────────────────────────────────────────────

  // Roll back committed rows to before the first provisional row, so that
  // items which were committed with placeholder ratios can be re-laid-out once
  // real aspect ratios arrive via onLoad. Rows before the provisional zone are
  // preserved — only the provisional zone and beyond are reset.
  const rollbackProvisionalRows = useCallback(() => {
    const boundary = firstProvisionalRowStartCountRef.current
    if (boundary === Infinity) return
    let countSoFar = 0
    let rowCount = 0
    for (const row of committedRowsRef.current) {
      if (countSoFar === boundary) break
      countSoFar += row.items.length
      rowCount++
    }
    committedRowsRef.current = committedRowsRef.current.slice(0, rowCount)
    committedItemCountRef.current = boundary
    firstProvisionalRowStartCountRef.current = Infinity
    provisionalCommittedKeysRef.current.clear()
  }, [])

  const onLoad = useCallback(
    (key: string | number, naturalWidth: number, naturalHeight: number) => {
      if (
        !Number.isFinite(naturalWidth) ||
        !Number.isFinite(naturalHeight) ||
        naturalWidth <= 0 ||
        naturalHeight <= 0
      ) return

      let changed = false

      // Only cache aspect ratio if not already known (pre-known takes precedence)
      if (!aspectRatioCache.current.has(key)) {
        aspectRatioCache.current.set(key, naturalWidth / naturalHeight)
        changed = true
        // If this item was provisionally committed with a placeholder ratio,
        // roll back to before that row so it can be re-laid-out accurately.
        if (provisionalCommittedKeysRef.current.has(key)) {
          rollbackProvisionalRows()
        }
      }

      if (!loadedSet.current.has(key)) {
        loadedSet.current.add(key)
        changed = true
      }

      if (changed) rerender()
    },
    [rollbackProvisionalRows],
  )

  const onError = useCallback(
    (key: string | number) => {
      let changed = false

      // Write a fallback aspect ratio for the errored item so layout can include it.
      // Do not add to loadedSet — loaded stays false.
      if (!aspectRatioCache.current.has(key)) {
        aspectRatioCache.current.set(key, 1)
        changed = true
        if (provisionalCommittedKeysRef.current.has(key)) {
          rollbackProvisionalRows()
        }
      }

      // Always record the error so skipErrors can filter this item from layout.
      if (!errorSet.current.has(key)) {
        errorSet.current.add(key)
        changed = true
      }

      if (changed) rerender()
    },
    [rollbackProvisionalRows],
  )

  // ─── Append-only layout ────────────────────────────────────────────────────
  //
  // Full rows are committed once determined and never reshuffled. Only the
  // frontier — the last partial row + any new items — is recomputed each render.
  // This prevents existing images from jumping when new items are appended.

  // Include all items. Items without a cached aspect ratio use 1 as a placeholder
  // until onLoad fires with the real dimensions. When skipErrors is enabled,
  // items that errored are omitted from layout entirely.
  const resolvedItems = options.skipErrors
    ? items.filter(item => !errorSet.current.has(item.key))
    : items

  const rawRowHeight =
    typeof options.rowHeight === 'function' ? options.rowHeight(containerWidth) : options.rowHeight
  const resolvedRowHeight = finitePositive(rawRowHeight, 0)

  const rawGap =
    typeof options.gap === 'function' ? options.gap(containerWidth) : (options.gap ?? 0)
  const resolvedGap = finiteNonNegative(rawGap)

  const optionsKey = `${resolvedRowHeight}|${resolvedGap}|${options.maxShrink ?? 0.75}|${options.maxStretch ?? 1.5}`

  const errorSetSize = errorSet.current.size

  // Reset committed rows when container width, key options, or item set changes.
  // Also reset when skipErrors is on and the error set grows — a committed item
  // may have been filtered out, which the length-only check won't always catch.
  if (
    containerWidth !== committedContainerWidthRef.current ||
    optionsKey !== committedOptionsKeyRef.current ||
    resolvedItems.length < committedItemCountRef.current ||
    (options.skipErrors && errorSetSize !== committedErrorSetSizeRef.current)
  ) {
    committedRowsRef.current = []
    committedItemCountRef.current = 0
    committedContainerWidthRef.current = containerWidth
    committedOptionsKeyRef.current = optionsKey
    committedErrorSetSizeRef.current = errorSetSize
    firstProvisionalRowStartCountRef.current = Infinity
    provisionalCommittedKeysRef.current.clear()
  }

  // Compute layout only for items beyond the committed frontier
  const frontierItems = resolvedItems.slice(committedItemCountRef.current)

  const frontierLayout =
    containerWidth > 0 && frontierItems.length > 0
      ? computeTesseraLayout(
          frontierItems.map(item => ({
            aspectRatio: aspectRatioCache.current.get(item.key) ?? 1,
          })),
          containerWidth,
          { ...options, rowHeight: resolvedRowHeight, gap: resolvedGap },
        )
      : []

  // Convert frontier layout rows to typed rows with item references
  const frontierRows: CommittedRow<T>[] = []
  let itemIdx = 0
  for (const layoutRow of frontierLayout) {
    frontierRows.push({
      height: layoutRow.height,
      items: layoutRow.items.map(layoutItem => ({
        item: frontierItems[itemIdx++],
        width: layoutItem.width,
        height: layoutItem.height,
      })),
    })
  }

  // Promote full rows from frontier to committed. Rows containing placeholder
  // aspect ratios (items not yet in cache) are committed immediately so the
  // gallery renders without delay. Their keys are tracked as provisional so
  // that when a real ratio arrives via onLoad, committed rows roll back to
  // before the first provisional row and re-layout with the accurate value.
  // Rows before the provisional zone are never disturbed.
  for (let i = 0; i < frontierRows.length - 1; i++) {
    const row = frontierRows[i]
    const rowStartCount = committedItemCountRef.current
    committedRowsRef.current.push(row)
    committedItemCountRef.current += row.items.length
    for (const { item } of row.items) {
      if (!aspectRatioCache.current.has(item.key)) {
        provisionalCommittedKeysRef.current.add(item.key)
        if (firstProvisionalRowStartCountRef.current === Infinity) {
          firstProvisionalRowStartCountRef.current = rowStartCount
        }
      }
    }
  }

  const allRows: CommittedRow<T>[] = [...committedRowsRef.current]
  const lastFrontierRow = frontierRows[frontierRows.length - 1]
  if (lastFrontierRow) {
    allRows.push(lastFrontierRow)
  }

  const rowTops: number[] = []
  const rowStarts: number[] = []
  let cumulativeTop = 0
  let cumulativeItems = 0
  for (const row of allRows) {
    rowTops.push(cumulativeTop)
    rowStarts.push(cumulativeItems)
    cumulativeTop += row.height + resolvedGap
    cumulativeItems += row.items.length
  }
  const totalRows = allRows.length
  const totalHeight = totalRows > 0 ? cumulativeTop - resolvedGap : 0

  allRowsRef.current = allRows
  rowTopsRef.current = rowTops
  rowStartsRef.current = rowStarts
  totalItemsRef.current = cumulativeItems

  // ─── Virtual window ────────────────────────────────────────────────────────

  let virtualWindow: VirtualWindow | null = null

  if (options.virtualize && virtualRange !== null && totalRows > 0) {
    const overscan = options.overscan ?? resolvedRowHeight * 4
    const visibleTop = virtualRange.top - overscan
    const visibleBottom = virtualRange.bottom + overscan

    const padding = options.padding ?? 0

    let low = 0
    let high = totalRows
    while (low < high) {
      const mid = Math.floor((low + high) / 2)
      const rowBottom = rowTops[mid] + padding + allRows[mid].height
      if (rowBottom > visibleTop) {
        high = mid
      } else {
        low = mid + 1
      }
    }
    const firstIndex = Math.min(totalRows - 1, low)

    low = 0
    high = totalRows
    while (low < high) {
      const mid = Math.floor((low + high) / 2)
      const rowTop = rowTops[mid] + padding
      if (rowTop < visibleBottom) {
        low = mid + 1
      } else {
        high = mid
      }
    }
    let lastIndex = Math.max(0, low - 1)
    if (firstIndex > lastIndex) {
      lastIndex = firstIndex
    }

    const topSpacerHeight = rowTops[firstIndex]
    const bottomSpacerHeight = totalHeight - (rowTops[lastIndex] + allRows[lastIndex].height)

    virtualWindow = { firstIndex, lastIndex, topSpacerHeight, bottomSpacerHeight }
  }

  const firstRenderRow = options.virtualize ? virtualWindow?.firstIndex : 0
  const lastRenderRow = options.virtualize ? virtualWindow?.lastIndex : totalRows - 1
  const rows: ResolvedRow<T>[] =
    firstRenderRow === undefined ||
    lastRenderRow === undefined ||
    firstRenderRow > lastRenderRow
      ? []
      : allRows
          .slice(firstRenderRow, lastRenderRow + 1)
          .map((row, offset) => {
            const rowIndex = firstRenderRow + offset
            return toResolvedRow(row, loadedSet.current, rowIndex, rowStarts[rowIndex] ?? 0)
          })

  // Stabilize the render rows reference — only return a new array if something
  // actually changed. This prevents consumers using React.memo from re-rendering
  // when a parent re-renders for unrelated reasons but the visible gallery
  // output hasn't changed.
  const isStable =
    rows.length === prevRowsRef.current.length &&
    rows.every((row, i) => {
      const prev = prevRowsRef.current[i]
      return (
        prev !== undefined &&
        row.rowIndex === prev.rowIndex &&
        row.startIndex === prev.startIndex &&
        row.height === prev.height &&
        row.items.length === prev.items.length &&
        row.items.every(
          (item, j) =>
            item.itemIndex === prev.items[j]?.itemIndex &&
            item.colIndex === prev.items[j]?.colIndex &&
            item.width === prev.items[j]?.width &&
            item.height === prev.items[j]?.height &&
            item.loaded === prev.items[j]?.loaded &&
            item.item === prev.items[j]?.item,
        )
      )
    })
  if (!isStable) {
    prevRowsRef.current = rows
  }

  const stableRows = prevRowsRef.current

  const renderMetrics = useMemo(
    () => buildRenderMetrics(stableRows, resolvedItems.length, totalRows, options.virtualize === true),
    [stableRows, resolvedItems.length, totalRows, options.virtualize],
  )

  useEffect(() => {
    options.onRenderMetricsChange?.(renderMetrics)
  }, [options.onRenderMetricsChange, renderMetrics])

  // ─── Navigation ────────────────────────────────────────────────────────────

  const isControlled = options.focusedIndex !== undefined

  function scrollToRow(rowIndex: number): void {
    const padding = options.padding ?? 0
    const stableRows = allRowsRef.current
    const rowTop = padding + (rowTopsRef.current[rowIndex] ?? 0)
    const rowH = stableRows[rowIndex]?.height ?? 0
    const rowBottom = rowTop + rowH
    const scrollEl = resolveScrollEl(scrollContainerRef)
    if (scrollEl) {
      const visibleTop = scrollEl.scrollTop + padding
      const visibleBottom = scrollEl.scrollTop + scrollEl.clientHeight - padding
      if (rowTop < visibleTop) {
        scrollEl.scrollTop = rowTop - padding
      } else if (rowBottom > visibleBottom) {
        scrollEl.scrollTop = rowBottom - scrollEl.clientHeight + padding
      }
    } else {
      const containerEl = containerRef.current
      if (!containerEl) return
      const absTop = containerEl.getBoundingClientRect().top + window.scrollY + rowTop
      const absBottom = absTop + rowH
      const visibleTop = window.scrollY + padding
      const visibleBottom = window.scrollY + window.innerHeight - padding
      if (absTop < visibleTop) {
        window.scrollTo({ top: absTop - padding })
      } else if (absBottom > visibleBottom) {
        window.scrollTo({ top: absBottom - window.innerHeight + padding })
      }
    }
  }

  function findRowCol(flatIndex: number): { rowIndex: number; colIndex: number; rowStart: number; rowLen: number } {
    const stableRows = allRowsRef.current
    const rowStarts = rowStartsRef.current
    let low = 0
    let high = stableRows.length
    while (low < high) {
      const mid = Math.floor((low + high) / 2)
      const start = rowStarts[mid] ?? 0
      const end = start + (stableRows[mid]?.items.length ?? 0)
      if (flatIndex < start) {
        high = mid
      } else if (flatIndex >= end) {
        low = mid + 1
      } else {
        return { rowIndex: mid, colIndex: flatIndex - start, rowStart: start, rowLen: stableRows[mid].items.length }
      }
    }
    const lastLen = stableRows[stableRows.length - 1]?.items.length ?? 0
    const lastStart = rowStarts[stableRows.length - 1] ?? 0
    return { rowIndex: stableRows.length - 1, colIndex: lastLen - 1, rowStart: lastStart, rowLen: lastLen }
  }

  function navigateTo(newIndex: number): void {
    const displayedCount = totalItemsRef.current
    if (displayedCount === 0) return
    const clamped = Math.max(0, Math.min(newIndex, displayedCount - 1))
    if (!isControlled) setFocusedIndex(clamped)
    options.onFocusedIndexChange?.(clamped)
    const target = containerRef.current?.querySelector<HTMLElement>(`[data-tessera-index="${clamped}"]`)
    if (target) {
      target.focus({ preventScroll: true })
    } else {
      scrollToRow(findRowCol(clamped).rowIndex)
      pendingFocusRef.current = clamped
    }
  }

  function handleItemKeyDown(itemIndex: number, e: React.KeyboardEvent): void {
    const stableRows = allRowsRef.current
    const displayedCount = totalItemsRef.current
    const { rowIndex, colIndex, rowStart, rowLen } = findRowCol(itemIndex)
    const rowEnd = rowStart + rowLen - 1
    switch (e.key) {
      case 'ArrowRight':
        if (e.metaKey) break
        e.preventDefault()
        navigateTo(itemIndex + 1)
        break
      case 'ArrowLeft':
        if (e.metaKey) break
        e.preventDefault()
        navigateTo(itemIndex - 1)
        break
      case 'ArrowDown': {
        if (e.metaKey) break
        e.preventDefault()
        if (rowIndex + 1 < stableRows.length) {
          const nextRowLen = stableRows[rowIndex + 1].items.length
          navigateTo(rowEnd + 1 + Math.min(colIndex, nextRowLen - 1))
        }
        break
      }
      case 'ArrowUp': {
        if (e.metaKey) break
        e.preventDefault()
        if (rowIndex > 0) {
          const prevRowLen = stableRows[rowIndex - 1].items.length
          navigateTo(rowStart - prevRowLen + Math.min(colIndex, prevRowLen - 1))
        }
        break
      }
      case 'Home':
        e.preventDefault()
        navigateTo(e.ctrlKey ? 0 : rowStart)
        break
      case 'End':
        e.preventDefault()
        navigateTo(e.ctrlKey ? displayedCount - 1 : rowEnd)
        break
      case ' ':
      case 'Enter':
        e.preventDefault()
        options.onActivate?.(itemIndex, e.shiftKey)
        break
    }
  }

  const effectiveFocusedIndex = isControlled ? options.focusedIndex! : focusedIndex

  function handleItemFocus(index: number): void {
    if (!isControlled) setFocusedIndex(index)
    options.onFocusedIndexChange?.(index)
  }

  // Runs after every render — completes a pending focus once the target element appears in the DOM
  useLayoutEffect(() => {
    if (pendingFocusRef.current === null) return
    const target = containerRef.current?.querySelector<HTMLElement>(`[data-tessera-index="${pendingFocusRef.current}"]`)
    if (target) {
      target.focus({ preventScroll: true })
      pendingFocusRef.current = null
    }
  })

  return { containerRef, rows: prevRowsRef.current, totalRows, gap: resolvedGap, onLoad, onError, virtualWindow, focusedIndex: effectiveFocusedIndex, handleItemFocus, handleItemKeyDown }
}
