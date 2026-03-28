import type { ReactEventHandler, ReactNode } from 'react'

import { useTesseraGallery } from './useTesseraGallery'
import type { GalleryItem, LayoutOptions } from './types'

type Props<T> = {
  items: GalleryItem<T>[]
  renderItem: (
    item: GalleryItem<T>,
    layout: { width: number; height: number; loaded: boolean },
    handlers: { onLoad: ReactEventHandler<HTMLImageElement> },
  ) => ReactNode
} & LayoutOptions

export function TesseraGallery<T>({ items, renderItem, ...options }: Props<T>): ReactNode {
  const { containerRef, rows, onLoad } = useTesseraGallery(items, options)
  const { gap = 0, lastRow = 'left' } = options

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: `${gap}px` }}>
      {rows.map((row, rowIndex) => {
        const isLastRow = rowIndex === rows.length - 1
        const justifyContent =
          isLastRow && lastRow === 'center' ? 'center' :
          isLastRow && lastRow === 'right'  ? 'flex-end' :
          'flex-start'

        return (
          <div key={rowIndex} style={{ display: 'flex', gap: `${gap}px`, justifyContent }}>
            {row.items.map(({ item, width, height, loaded }) =>
              renderItem(
                item,
                { width, height, loaded },
                {
                  onLoad: e =>
                    onLoad(item.key, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight),
                },
              )
            )}
          </div>
        )
      })}
    </div>
  )
}
