import type React from 'react'
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
  const { containerRef, rows, totalRows, gap, onLoad, onError, virtualWindow, focusedIndex, handleItemFocus, handleItemKeyDown } = useTesseraGallery(items, options, scrollContainerRef)
  const { lastRow = 'left' } = options

  const navigable = options.navigable === true
  const padding = options.padding ?? 0

  // Roving tabindex: the focused cell normally carries tabIndex=0. When the
  // focused row is scrolled off-screen by virtualization, no cell has tabIndex=0
  // and Tab skips the gallery. Fall back to tabIndex=0 on the container so the
  // gallery stays reachable; keyboard navigation resumes from focusedIndex.
  const firstVisible = rows[0]
  const lastVisible = rows.at(-1)
  const focusedRowMounted =
    !navigable ||
    (firstVisible !== undefined &&
     lastVisible !== undefined &&
     focusedIndex >= firstVisible.startIndex &&
     focusedIndex < lastVisible.startIndex + lastVisible.items.length)

  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', flexDirection: 'column', gap: `${gap}px`, padding: padding > 0 ? `${padding}px` : undefined }}
      {...(navigable ? { role: 'grid', 'aria-rowcount': totalRows } : {})}
      {...(navigable && !focusedRowMounted ? {
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
          if (e.target === e.currentTarget) handleItemKeyDown(focusedIndex, e)
        },
      } : {})}
    >
      {virtualWindow && virtualWindow.topSpacerHeight > 0 && (
        <div style={{ height: virtualWindow.topSpacerHeight, contain: 'layout' }} />
      )}
      {rows.map(row => {
        const isLastRow = row.rowIndex === totalRows - 1
        const justifyContent =
          isLastRow && lastRow === 'center' ? 'center' :
          isLastRow && lastRow === 'right'  ? 'flex-end' :
          'flex-start'

        return (
          <div
            key={row.rowIndex}
            style={{ display: 'flex', gap: `${gap}px`, justifyContent, contain: 'layout' }}
            {...(navigable ? { role: 'row', 'aria-rowindex': row.rowIndex + 1 } : {})}
          >
            {row.items.map(({ item, itemIndex, colIndex, width, height, loaded }) => {
              const focused = navigable && focusedIndex === itemIndex
              return (
                <div
                  key={item.key}
                  {...(navigable ? {
                    role: 'gridcell',
                    'aria-colindex': colIndex + 1,
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
