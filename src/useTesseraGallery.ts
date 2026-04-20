import { useCallback, useEffect, useReducer, useRef, useState, type RefObject } from 'react'

import { computeTesseraLayout } from './computeTesseraLayout'
import { useVirtualWindow } from './useVirtualWindow'
import type { GalleryItem, LayoutOptions, ResolvedRow, ScrollContainerRef } from './types'

type CommittedRow<T> = {
  height: number
  items: Array<{ item: GalleryItem<T>; width: number; height: number }>
}

function toResolvedRow<T>(row: CommittedRow<T>, loadedSet: Set<string | number>): ResolvedRow<T> {
  return {
    height: row.height,
    items: row.items.map(({ item, width, height }) => ({
      item,
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


export function useTesseraGallery<T>(
  items: GalleryItem<T>[],
  options: LayoutOptions,
  scrollContainerRef?: ScrollContainerRef,
): {
  containerRef: RefObject<HTMLDivElement | null>
  rows: ResolvedRow<T>[]
  gap: number
  onLoad: (key: string | number, naturalWidth: number, naturalHeight: number) => void
  onError: (key: string | number) => void
  virtualWindow: VirtualWindow | null
} {
  // ─── Hooks ─────────────────────────────────────────────────────────────────

  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

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
    if (item.aspectRatio !== undefined) {
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
      if (naturalWidth <= 0 || naturalHeight <= 0) return

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

  const resolvedRowHeight =
    typeof options.rowHeight === 'function' ? options.rowHeight(containerWidth) : options.rowHeight

  const resolvedGap =
    typeof options.gap === 'function' ? options.gap(containerWidth) : (options.gap ?? 0)

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
          options,
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

  const rows: ResolvedRow<T>[] = committedRowsRef.current.map(row => toResolvedRow(row, loadedSet.current))
  const lastFrontierRow = frontierRows[frontierRows.length - 1]
  if (lastFrontierRow) {
    rows.push(toResolvedRow(lastFrontierRow, loadedSet.current))
  }

  // Stabilize the rows reference — only return a new array if something actually
  // changed. This prevents consumers using React.memo from re-rendering when a
  // parent re-renders for unrelated reasons but the gallery layout hasn't changed.
  const isStable =
    rows.length === prevRowsRef.current.length &&
    rows.every((row, i) => {
      const prev = prevRowsRef.current[i]
      return (
        row.height === prev?.height &&
        row.items.length === prev?.items.length &&
        row.items.every(
          (item, j) =>
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

  // ─── Virtual window ────────────────────────────────────────────────────────

  let virtualWindow: VirtualWindow | null = null

  if (options.virtualize && virtualRange !== null && prevRowsRef.current.length > 0) {
    const stableRows = prevRowsRef.current
    const overscan = options.overscan ?? resolvedRowHeight * 2
    const visibleTop = virtualRange.top - overscan
    const visibleBottom = virtualRange.bottom + overscan

    // Compute cumulative row tops
    const rowTops: number[] = []
    let cumTop = 0
    for (const row of stableRows) {
      rowTops.push(cumTop)
      cumTop += row.height + resolvedGap
    }
    const totalHeight = cumTop - resolvedGap

    let firstIndex = stableRows.length
    let lastIndex = -1
    for (let i = 0; i < stableRows.length; i++) {
      const rowBottom = rowTops[i] + stableRows[i].height
      if (rowBottom > visibleTop && rowTops[i] < visibleBottom) {
        if (firstIndex === stableRows.length) firstIndex = i
        lastIndex = i
      }
    }

    // Fallback: show all rows if none are in range (e.g. before first scroll measurement)
    if (firstIndex > lastIndex) {
      firstIndex = 0
      lastIndex = stableRows.length - 1
    }

    const topSpacerHeight = rowTops[firstIndex]
    const bottomSpacerHeight = totalHeight - (rowTops[lastIndex] + stableRows[lastIndex].height)

    virtualWindow = { firstIndex, lastIndex, topSpacerHeight, bottomSpacerHeight }
  }

  return { containerRef, rows: prevRowsRef.current, gap: resolvedGap, onLoad, onError, virtualWindow }
}
