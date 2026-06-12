import type { RefObject } from 'react'

export type ScrollContainerRef = RefObject<HTMLElement | null> | HTMLElement | null

export type TesseraRenderMetrics = {
  virtualized: boolean
  mountedItemCount: number
  mountedRowCount: number
  totalItemCount: number
  totalRowCount: number
  firstMountedRowIndex: number | null
  lastMountedRowIndex: number | null
}

export type LayoutOptions = {
  rowHeight: number | ((containerWidth: number) => number)
  /** @default 0 */
  gap?: number | ((containerWidth: number) => number)
  /** @default 'left' */
  lastRow?: 'justify' | 'left' | 'center' | 'right' | 'hide'
  minColumns?: number
  maxNumRows?: number
  /** Fraction of idealHeight a row may shrink to. Must be in (0, 1); values outside that range fall back to the default. @default 0.75 */
  maxShrink?: number
  /** @default 1.5 */
  maxStretch?: number
  /** @default 0.9 */
  justifyThreshold?: number
  padding?: number
  /** @default false */
  virtualize?: boolean
  /** Pixels of extra rows rendered above and below the visible window. @default rowHeight * 4 */
  overscan?: number
  /** @default false */
  skipErrors?: boolean
  /** @default false */
  navigable?: boolean
  focusedIndex?: number
  onFocusedIndexChange?: (index: number) => void
  onActivate?: (index: number, shiftKey: boolean) => void
  /** Should be stable (e.g. `useCallback`) — called on every render where metrics change. */
  onRenderMetricsChange?: (metrics: TesseraRenderMetrics) => void
}

export type LayoutRow = {
  items: Array<{
    aspectRatio: number
    width: number
    height: number
  }>
  height: number
}

export type GalleryItem<T> = T & {
  key: string | number
  aspectRatio?: number
}

export type ResolvedRow<T> = {
  rowIndex: number
  startIndex: number
  items: Array<{
    item: GalleryItem<T>
    itemIndex: number
    colIndex: number
    width: number
    height: number
    loaded: boolean
  }>
  height: number
}
