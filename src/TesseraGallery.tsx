import type { ReactEventHandler, ReactNode } from 'react'

import { useTesseraGallery } from './useTesseraGallery'
import type { GalleryItem, LayoutOptions, ScrollContainerRef } from './types'

type Props<T> = {
  items: GalleryItem<T>[]
  renderItem: (
    item: GalleryItem<T>,
    layout: { width: number; height: number; loaded: boolean; focused: boolean },
    handlers: { onLoad: ReactEventHandler<HTMLImageElement>; onError: ReactEventHandler<HTMLImageElement> },
  ) => ReactNode
  scrollContainerRef?: ScrollContainerRef
} & LayoutOptions

export function TesseraGallery<T>({ items, renderItem, scrollContainerRef, ...options }: Props<T>): ReactNode {
  const { containerRef, rows, gap, onLoad, onError, virtualWindow, focusedIndex, handleItemFocus, handleItemKeyDown } = useTesseraGallery(items, options, scrollContainerRef)
  const { lastRow = 'left' } = options

  const navigable = options.navigable === true
  const padding = options.padding ?? 0

  const firstIndex = virtualWindow?.firstIndex ?? 0
  const lastIndex = virtualWindow?.lastIndex ?? rows.length - 1
  const visibleRows = virtualWindow ? rows.slice(firstIndex, lastIndex + 1) : rows

  // Track flat item index across all displayed rows, starting from the first visible row
  let flatIdx = 0
  for (let r = 0; r < firstIndex; r++) {
    flatIdx += rows[r].items.length
  }

  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', flexDirection: 'column', gap: `${gap}px`, padding: padding > 0 ? `${padding}px` : undefined }}
      {...(navigable ? { role: 'grid', 'aria-rowcount': rows.length } : {})}
    >
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
          <div
            key={rowIndex}
            style={{ display: 'flex', gap: `${gap}px`, justifyContent, contain: 'layout' }}
            {...(navigable ? { role: 'row', 'aria-rowindex': rowIndex + 1 } : {})}
          >
            {row.items.map(({ item, width, height, loaded }, colIdx) => {
              const itemIndex = flatIdx++
              const focused = navigable && focusedIndex === itemIndex
              return (
                <div
                  key={item.key}
                  {...(navigable ? {
                    role: 'gridcell',
                    'aria-colindex': colIdx + 1,
                    tabIndex: focused ? 0 : -1,
                    'data-tessera-index': itemIndex,
                    onKeyDown: (e) => handleItemKeyDown(itemIndex, e),
                    onFocus: () => handleItemFocus(itemIndex),
                  } : {})}
                >
                  {renderItem(
                    item,
                    { width, height, loaded, focused },
                    {
                      onLoad: e => onLoad(item.key, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight),
                      onError: () => onError(item.key),
                    },
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
      {virtualWindow && virtualWindow.bottomSpacerHeight > 0 && (
        <div style={{ height: virtualWindow.bottomSpacerHeight, contain: 'layout' }} />
      )}
    </div>
  )
}
