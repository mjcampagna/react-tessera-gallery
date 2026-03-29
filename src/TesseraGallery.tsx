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
  const { containerRef, rows, gap, onLoad, virtualWindow } = useTesseraGallery(items, options)
  const { lastRow = 'left' } = options

  const firstIndex = virtualWindow?.firstIndex ?? 0
  const lastIndex = virtualWindow?.lastIndex ?? rows.length - 1
  const visibleRows = virtualWindow ? rows.slice(firstIndex, lastIndex + 1) : rows

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: `${gap}px` }}>
      {virtualWindow && virtualWindow.topSpacerHeight > 0 && (
        <div style={{ height: virtualWindow.topSpacerHeight, contain: 'layout' }} />
      )}
      {visibleRows.map((row, i) => {
        const rowIndex = firstIndex + i
        const isLastRow = rowIndex === rows.length - 1
        const justifyContent =
          isLastRow && lastRow === 'center' ? 'center' :
          isLastRow && lastRow === 'right'  ? 'flex-end' :
          'flex-start'

        return (
          <div key={rowIndex} style={{ display: 'flex', gap: `${gap}px`, justifyContent, contain: 'layout' }}>
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
      {virtualWindow && virtualWindow.bottomSpacerHeight > 0 && (
        <div style={{ height: virtualWindow.bottomSpacerHeight, contain: 'layout' }} />
      )}
    </div>
  )
}
