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
  virtualWindow: VirtualWindow | null
} {
  // ─── Hooks ─────────────────────────────────────────────────────────────────

  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  // Aspect ratio cache — populated from items with known aspectRatio and via onLoad
  const aspectRatioCache = useRef<Map<string | number, number>>(new Map())
  // Tracks which items have been confirmed browser-loaded via onLoad
  const loadedSet = useRef<Set<string | number>>(new Set())
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

  const onLoad = useCallback(
    (key: string | number, naturalWidth: number, naturalHeight: number) => {
      if (naturalWidth <= 0 || naturalHeight <= 0) return

      let changed = false

      // Only cache aspect ratio if not already known (pre-known takes precedence)
      if (!aspectRatioCache.current.has(key)) {
        aspectRatioCache.current.set(key, naturalWidth / naturalHeight)
        changed = true
      }

      if (!loadedSet.current.has(key)) {
        loadedSet.current.add(key)
        changed = true
      }

      if (changed) rerender()
    },
    [],
  )

  // ─── Append-only layout ────────────────────────────────────────────────────
  //
  // Full rows are committed once determined and never reshuffled. Only the
  // frontier — the last partial row + any new items — is recomputed each render.
  // This prevents existing images from jumping when new items are appended.

  const resolvedItems = items.filter(item => aspectRatioCache.current.has(item.key))

  const resolvedRowHeight =
    typeof options.rowHeight === 'function' ? options.rowHeight(containerWidth) : options.rowHeight

  const resolvedGap =
    typeof options.gap === 'function' ? options.gap(containerWidth) : (options.gap ?? 0)

  const optionsKey = `${resolvedRowHeight}|${resolvedGap}|${options.maxShrink ?? 0.75}|${options.maxStretch ?? 1.5}`

  // Reset committed rows when container width, key options, or item set changes
  if (
    containerWidth !== committedContainerWidthRef.current ||
    optionsKey !== committedOptionsKeyRef.current ||
    resolvedItems.length < committedItemCountRef.current
  ) {
    committedRowsRef.current = []
    committedItemCountRef.current = 0
    committedContainerWidthRef.current = containerWidth
    committedOptionsKeyRef.current = optionsKey
  }

  // Compute layout only for items beyond the committed frontier
  const frontierItems = resolvedItems.slice(committedItemCountRef.current)

  const frontierLayout =
    containerWidth > 0 && frontierItems.length > 0
      ? computeTesseraLayout(
          frontierItems.map(item => ({
            aspectRatio: aspectRatioCache.current.get(item.key)!,
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

  // Promote all full rows (all but last) from frontier to committed
  if (frontierRows.length > 1) {
    for (let i = 0; i < frontierRows.length - 1; i++) {
      committedRowsRef.current.push(frontierRows[i])
      committedItemCountRef.current += frontierRows[i].items.length
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

  return { containerRef, rows: prevRowsRef.current, gap: resolvedGap, onLoad, virtualWindow }
}
