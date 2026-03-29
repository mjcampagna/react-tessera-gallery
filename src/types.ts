export type LayoutOptions = {
  rowHeight: number | ((containerWidth: number) => number)
  gap?: number | ((containerWidth: number) => number)
  lastRow?: 'justify' | 'left' | 'center' | 'right' | 'hide'
  minColumns?: number
  maxNumRows?: number
  maxShrink?: number
  maxStretch?: number
  justifyThreshold?: number
  virtualize?: boolean
  overscan?: number
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
  items: Array<{
    item: GalleryItem<T>
    width: number
    height: number
    loaded: boolean
  }>
  height: number
}
