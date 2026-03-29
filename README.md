# @slithy/react-tessera-gallery

React photo gallery with optimal justified layout. Uses a Knuth-Plass dynamic programming algorithm to break items into rows that minimize deviation from a target row height. Supports incremental loading, unknown aspect ratios, and append-only rendering to prevent layout jumps as new images load.

## Installation

```bash
npm install @slithy/react-tessera-gallery
```

**Peer dependencies:** `react@^17 || ^18 || ^19`

---

## `<TesseraGallery>`

The main component. Accepts a list of items and a `renderItem` function; handles all layout and loading state internally.

```tsx
import { TesseraGallery } from '@slithy/react-tessera-gallery'

<TesseraGallery
  items={photos}
  rowHeight={200}
  gap={4}
  renderItem={(item, { width, height, loaded }, handlers) => (
    <img
      key={item.key}
      src={item.src}
      width={width}
      height={height}
      onLoad={handlers.onLoad}
      style={{ opacity: loaded ? 1 : 0 }}
    />
  )}
/>
```

`rowHeight` and `gap` also accept a callback for responsive layouts — the callback receives the current container width and is re-evaluated whenever the container resizes:

```tsx
<TesseraGallery
  items={photos}
  rowHeight={w => w < 600 ? 120 : 240}
  gap={w => w < 600 ? 2 : 4}
  renderItem={...}
/>
```

**Props:**

| Prop | Type | Default | Description |
|---|---|---|---|
| `items` | `GalleryItem<T>[]` | — | Items to display. Each must have a `key`. `aspectRatio` is optional — see below. |
| `renderItem` | `(item, layout, handlers) => ReactNode` | — | Render function called for each item |
| `rowHeight` | `number \| (containerWidth: number) => number` | — | Target row height in pixels |
| `gap` | `number \| (containerWidth: number) => number` | `0` | Gap between items and rows in pixels |
| `lastRow` | `'left' \| 'center' \| 'right' \| 'justify' \| 'hide'` | `'left'` | Alignment of the last (partial) row |
| `maxNumRows` | `number` | `Infinity` | Maximum number of rows to render; overflow items are dropped |
| `maxShrink` | `number` | `0.75` | Minimum row height as a fraction of `rowHeight` |
| `maxStretch` | `number` | `1.5` | Maximum row height as a multiple of `rowHeight` |
| `justifyThreshold` | `number` | `1` | Justify the last row if its natural fill ratio meets this threshold (0–1) |

**`renderItem` arguments:**

| Argument | Type | Description |
|---|---|---|
| `item` | `GalleryItem<T>` | The original item |
| `layout.width` | `number` | Computed pixel width for this item |
| `layout.height` | `number` | Computed pixel height for this item |
| `layout.loaded` | `boolean` | Whether the browser has confirmed this image loaded via `handlers.onLoad` |
| `handlers.onLoad` | `ReactEventHandler<HTMLImageElement>` | Pass to `<img onLoad={...}>` to track load state |

---

## `GalleryItem<T>`

Items passed to `TesseraGallery` must satisfy `GalleryItem<T>`:

```ts
type GalleryItem<T> = T & {
  key: string | number
  aspectRatio?: number  // optional — discovered via onLoad if omitted
}
```

Items with a known `aspectRatio` are laid out immediately. Items without one are held out of the layout until `handlers.onLoad` fires, at which point their aspect ratio is derived from `naturalWidth / naturalHeight` and they enter the layout with `loaded: true`.

---

## `useTesseraGallery`

The hook underlying `<TesseraGallery>`. Use this directly for custom rendering or when you need lower-level control.

```ts
import { useTesseraGallery } from '@slithy/react-tessera-gallery'

const { containerRef, rows, gap, onLoad } = useTesseraGallery(items, options)
```

**Returns:**

| Property | Type | Description |
|---|---|---|
| `containerRef` | `RefObject<HTMLDivElement \| null>` | Attach to your container element to observe its width |
| `rows` | `ResolvedRow<T>[]` | Computed layout rows, each with `height` and `items` |
| `gap` | `number` | Resolved gap value (useful when `gap` was passed as a callback) |
| `onLoad` | `(key, naturalWidth, naturalHeight) => void` | Call when an image loads |

---

## `computeTesseraLayout`

The pure layout function. Takes items with known aspect ratios, a container width, and options; returns row data with pixel dimensions. No React dependency.

```ts
import { computeTesseraLayout } from '@slithy/react-tessera-gallery'

const rows = computeTesseraLayout(
  [{ aspectRatio: 1.5 }, { aspectRatio: 1 }, { aspectRatio: 2 }],
  600,
  { rowHeight: 200, gap: 4 },
)
```
