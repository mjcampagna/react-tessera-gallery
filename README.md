# @slithy/react-tessera-gallery

React photo gallery with optimal justified layout. Uses a Knuth-Plass dynamic programming algorithm to break items into rows that minimize deviation from a target row height. Supports incremental loading, unknown aspect ratios, and append-only rendering to prevent layout jumps as new images load. Includes opt-in virtualization to keep the DOM small regardless of collection size.

## Features

- **Optimal row layout** — Knuth-Plass dynamic programming minimizes deviation from a target row height across the full item set, not just greedily row-by-row
- **Append-only rendering** — committed rows are locked and never reshuffled as new images load; only the trailing partial row is live
- **Incremental loading** — items without a known `aspectRatio` are held out of the layout and discovered via `onLoad`; they enter the layout with `loaded: true`
- **Responsive** — `rowHeight` and `gap` accept `(containerWidth: number) => number` callbacks, re-evaluated on every container resize
- **Panorama handling** — ultra-wide items that can't share a row get their own full-width row, exempt from height constraints
- **Virtualization** — opt-in `virtualize` prop renders only rows near the viewport via spacer divs; no overhead when disabled
- **Three-layer API** — use the full component, the hook, or the pure layout function depending on how much control you need
- ESM only · zero runtime dependencies · `sideEffects: false`

---

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
| `minColumns` | `number` | — | Soft minimum items per row — caps `rowHeight` so rows of at least N items are viable. Ultra-wide panos that can't share a row are exempt and always get their own full-width row. |
| `maxNumRows` | `number` | `Infinity` | Maximum number of rows to render; overflow items are dropped |
| `maxShrink` | `number` | `0.75` | Hard minimum row height as a fraction of `rowHeight`; rows cannot be placed below this height |
| `maxStretch` | `number` | `1.5` | Controls how steeply the badness penalty rises above `rowHeight`; not a hard ceiling — rows may exceed this height if no better placement exists |
| `justifyThreshold` | `number` | `0.9` | Justify the last row if its natural fill ratio meets this threshold (0–1) |
| `virtualize` | `boolean` | `false` | Only render rows near the viewport; spacer divs maintain full scroll height. Opt-in — no overhead when disabled. |
| `overscan` | `number` | `rowHeight * 2` | Extra pixels to render beyond the viewport edge in each direction. Increase if images appear blank during fast scrolling. |
| `scrollContainerRef` | `RefObject<HTMLElement \| null>` | — | Required when the gallery is inside a scrollable div. The scroll listener attaches to this element instead of `window`. |

**`renderItem` arguments:**

| Argument | Type | Description |
|---|---|---|
| `item` | `GalleryItem<T>` | The original item |
| `layout.width` | `number` | Computed pixel width for this item |
| `layout.height` | `number` | Computed pixel height for this item |
| `layout.loaded` | `boolean` | Whether the browser has confirmed this image loaded via `handlers.onLoad` |
| `handlers.onLoad` | `ReactEventHandler<HTMLImageElement>` | Pass to `<img onLoad={...}>` to track load state |

---

## Virtualization

Enable `virtualize` to keep the DOM small for large collections. Only rows within the viewport (plus `overscan`) are rendered; spacer divs above and below maintain the full scroll height.

```tsx
<TesseraGallery
  items={photos}
  rowHeight={200}
  virtualize
  renderItem={...}
/>
```

**With a scrollable container:** if the gallery is inside a scrollable div rather than the page itself scrolling, pass a ref to that element via `scrollContainerRef`. Without it, the scroll listener attaches to `window` and never fires.

```tsx
const scrollRef = useRef<HTMLDivElement>(null)

<div ref={scrollRef} style={{ overflowY: 'auto', height: '100%' }}>
  <TesseraGallery
    items={photos}
    rowHeight={200}
    virtualize
    scrollContainerRef={scrollRef}
    renderItem={...}
  />
</div>
```

**Pagination and `overscan`:** if you're using an IntersectionObserver to trigger pagination (fetching the next page of items), the observer's `rootMargin` and `overscan` serve different purposes and should be tuned independently.

`overscan` controls how much pre-rendered DOM buffer exists above and below the viewport — it only kicks in once item data is already in the layout. `rootMargin` controls how early the fetch fires. The full chain is:

```
rootMargin fires → fetch → data arrives → items enter layout → overscan renders them → user arrives
```

Everything from the fetch onward must complete before the user reaches the overscan boundary. That means `rootMargin` should lead by at least `overscan` distance plus expected network latency — in practice often 2–3× `overscan`. If `rootMargin` is smaller than `overscan`, the data may not be available when overscan tries to render it, causing a hard stop at the bottom of the current layout.

**Performance and `React.memo`:** when `virtualize` is enabled, `renderItem` is called for every visible item on every scroll tick. If your item component is expensive to render, wrap it in `React.memo`. Note that the `layout` object (`{ width, height, loaded }`) is a new reference on every render — if your comparator checks object identity, use a custom comparator or destructure the values:

```tsx
const Photo = React.memo(
  ({ item, width, height, loaded }) => (
    <img src={item.src} width={width} height={height} style={{ opacity: loaded ? 1 : 0 }} />
  ),
  (prev, next) =>
    prev.width === next.width &&
    prev.height === next.height &&
    prev.loaded === next.loaded &&
    prev.item === next.item,
)

<TesseraGallery
  items={photos}
  rowHeight={200}
  virtualize
  renderItem={(item, layout, handlers) => (
    <Photo key={item.key} item={item} {...layout} />
  )}
/>
```

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

Providing `aspectRatio` upfront is recommended when possible — it produces a stable layout from the first render and is required for virtualization to work without visible row shifts.

---

## `useTesseraGallery`

The hook underlying `<TesseraGallery>`. Use this directly for custom rendering or when you need lower-level control.

```ts
import { useTesseraGallery } from '@slithy/react-tessera-gallery'

const { containerRef, rows, gap, onLoad } = useTesseraGallery(items, options, scrollContainerRef)
```

**Returns:**

| Property | Type | Description |
|---|---|---|
| `containerRef` | `RefObject<HTMLDivElement \| null>` | Attach to your container element to observe its width |
| `rows` | `ResolvedRow<T>[]` | Computed layout rows, each with `height` and `items` |
| `gap` | `number` | Resolved gap value (useful when `gap` was passed as a callback) |
| `onLoad` | `(key, naturalWidth, naturalHeight) => void` | Call when an image loads |
| `virtualWindow` | `{ firstIndex, lastIndex, topSpacerHeight, bottomSpacerHeight } \| null` | Set when `virtualize` is true; describes which rows are visible and the spacer heights needed to maintain full scroll height |

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

**Options (`LayoutOptions`):**

| Option | Type | Default | Description |
|---|---|---|---|
| `rowHeight` | `number \| (containerWidth: number) => number` | — | Target row height in pixels |
| `gap` | `number \| (containerWidth: number) => number` | `0` | Gap between items and rows in pixels |
| `lastRow` | `'left' \| 'center' \| 'right' \| 'justify' \| 'hide'` | `'left'` | Alignment of the last (partial) row |
| `minColumns` | `number` | — | Soft minimum items per row; caps `rowHeight` so N-item rows are viable |
| `maxNumRows` | `number` | `Infinity` | Maximum number of rows; overflow items are dropped |
| `maxShrink` | `number` | `0.75` | Hard minimum row height as a fraction of `rowHeight`; rows cannot be placed below this height |
| `maxStretch` | `number` | `1.5` | Controls how steeply the badness penalty rises above `rowHeight`; not a hard ceiling — rows may exceed this height if no better placement exists |
| `justifyThreshold` | `number` | `0.9` | Justify the last row if its natural fill ratio meets this threshold (0–1) |

**Returns:** `LayoutRow[]` — each row has `height: number` and `items: Array<{ aspectRatio, width, height }>`.
