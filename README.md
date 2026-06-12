# @slithy/react-tessera-gallery

React photo gallery with optimal justified layout. Uses a Knuth-Plass dynamic programming algorithm to break items into rows that minimize deviation from a target row height. Supports incremental loading, unknown aspect ratios, and append-only rendering to prevent layout jumps as new images load. Includes opt-in virtualization to keep the DOM small regardless of collection size.

## Features

- **Optimal row layout** — Knuth-Plass dynamic programming minimizes deviation from a target row height across the full item set, not just greedily row-by-row
- **Append-only rendering** — committed rows are locked and never reshuffled as new images load; only the trailing partial row is live
- **Incremental loading** — items without a known `aspectRatio` render immediately with a placeholder ratio and re-layout once `onLoad` fires with real dimensions; `loaded` reflects browser load state
- **Responsive** — `rowHeight` and `gap` accept `(containerWidth: number) => number` callbacks, re-evaluated on every container resize
- **Panorama handling** — ultra-wide items that can't share a row get their own full-width row, exempt from height constraints
- **Virtualization** — opt-in `virtualize` prop materializes only rows near the viewport via spacer divs; no overhead when disabled
- **Render metrics** — opt-in `onRenderMetricsChange` callback reports mounted vs. total row counts on each render cycle
- **Three-layer API** — use the full component, the hook, or the pure layout function depending on how much control you need
- ESM only · zero runtime dependencies · `sideEffects: false`

---

## Installation

```bash
pnpm add @slithy/react-tessera-gallery
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
      onError={handlers.onError}
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
| `overscan` | `number` | `rowHeight * 4` | Extra pixels to render beyond the viewport edge in each direction. Increase if images appear blank during fast scrolling. |
| `skipErrors` | `boolean` | `false` | When true, items whose images fire `onError` are removed from the layout entirely rather than rendered as placeholders. |
| `scrollContainerRef` | `ScrollContainerRef` | — | Required when the gallery is inside a scrollable div. The scroll listener attaches to this element instead of `window`. Accepts a `useRef` ref object or a `useState`-based element reference. |
| `onRenderMetricsChange` | `(metrics: TesseraRenderMetrics) => void` | — | Fired whenever the rendered row window changes. Should be stable (e.g. `useCallback`). See `TesseraRenderMetrics`. |

**`renderItem` arguments:**

| Argument | Type | Description |
|---|---|---|
| `item` | `GalleryItem<T>` | The original item |
| `layout.width` | `number` | Computed pixel width for this item |
| `layout.height` | `number` | Computed pixel height for this item |
| `layout.loaded` | `boolean` | Whether the browser has confirmed this image loaded via `handlers.onLoad` |
| `handlers.onLoad` | `ReactEventHandler<HTMLImageElement>` | Pass to `<img onLoad={...}>` to track load state and resolve aspect ratio |
| `handlers.onError` | `ReactEventHandler<HTMLImageElement>` | Pass to `<img onError={...}>` to handle broken images — marks the item unloaded and (when `skipErrors` is set) removes it from layout |

---

## Virtualization

Enable `virtualize` to keep the DOM and render work small for large collections. Only rows within the viewport (plus `overscan`) are materialized; spacer divs above and below maintain the full scroll height.

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
// useRef
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

// useState — useful when the ref needs to be a reactive dependency
const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)

<div ref={setScrollEl} style={{ overflowY: 'auto', height: '100%' }}>
  <TesseraGallery
    items={photos}
    rowHeight={200}
    virtualize
    scrollContainerRef={scrollEl}
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

---

## Consumer performance guide

For best results, give the gallery stable inputs. Derive `items` with `useMemo` so unrelated parent renders do not force the gallery to reprocess the collection:

```tsx
const items = useMemo(
  () =>
    photos.map(photo => ({
      key: photo.id,
      src: photo.src,
      alt: photo.alt,
      aspectRatio: photo.width / photo.height,
    })),
  [photos],
)

<TesseraGallery items={items} rowHeight={200} virtualize renderItem={renderPhoto} />
```

Providing `aspectRatio` upfront is the biggest stability win. The gallery can discover aspect ratios from image `onLoad`, but known ratios let it compute the final layout on the first pass and avoid re-layout work as thumbnails load.

Memoize responsive option callbacks and `renderItem` when they are created in a parent component:

```tsx
const rowHeight = useCallback((width: number) => (width < 700 ? 140 : 220), [])
const gap = useCallback((width: number) => (width < 700 ? 2 : 6), [])

<TesseraGallery items={items} rowHeight={rowHeight} gap={gap} virtualize renderItem={renderPhoto} />
```

When `virtualize` is enabled, only the rendered row window is materialized, but visible items still receive fresh layout values as the viewport changes. If item rendering is non-trivial, wrap the item component in `React.memo` and compare primitive layout props:

```tsx
type PhotoProps = {
  item: PhotoItem
  width: number
  height: number
  loaded: boolean
  onLoad: React.ReactEventHandler<HTMLImageElement>
}

const Photo = React.memo(
  ({ item, width, height, loaded, onLoad }: PhotoProps) => (
    <img
      src={item.src}
      alt={item.alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      onLoad={onLoad}
      style={{ opacity: loaded ? 1 : 0 }}
    />
  ),
  (prev, next) =>
    prev.item === next.item &&
    prev.width === next.width &&
    prev.height === next.height &&
    prev.loaded === next.loaded &&
    prev.onLoad === next.onLoad,
)

const renderPhoto = useCallback(
  (item: PhotoItem, { width, height, loaded }, handlers) => (
    <Photo
      item={item}
      width={width}
      height={height}
      loaded={loaded}
      onLoad={handlers.onLoad}
    />
  ),
  [],
)
```

For infinite scrolling, fetch before users reach the live frontier row. `overscan` only controls how much already-loaded content is rendered around the viewport; it does not fetch data. Use an IntersectionObserver `rootMargin` large enough to cover network latency, image metadata availability, and the gallery's overscan distance.

If you consume `useTesseraGallery` directly, remember that `rows` means "render rows" when `virtualize` is enabled. Use `totalRows`, `row.rowIndex`, and item `itemIndex` / `colIndex` for ARIA metadata, scroll math, analytics, and any UI that needs full-gallery indices.

---

## `GalleryItem<T>`

Items passed to `TesseraGallery` must satisfy `GalleryItem<T>`:

```ts
type GalleryItem<T> = T & {
  key: string | number
  aspectRatio?: number  // optional — discovered via onLoad if omitted
}
```

Items with a known `aspectRatio` are laid out immediately. Items without one render immediately using a placeholder aspect ratio and re-layout once `handlers.onLoad` fires with real dimensions derived from `naturalWidth / naturalHeight`.

Providing `aspectRatio` upfront is recommended when possible — it produces a stable layout from the first render and avoids the re-layout pass when images load.

**Item identity and ordering:** items are tracked by `key`. Updating an item's data (passing a new object with the same key) is always reflected immediately, including in rows that are already laid out — layout geometry is unaffected. Appending items preserves the position of everything already laid out (this is the append-only guarantee). Prepending, removing, or reordering items is supported, but the gallery detects the change by key comparison and performs a full re-layout — positions are not preserved.

---

## `TesseraRenderMetrics`

Passed to `onRenderMetricsChange` whenever the rendered row window changes.

```ts
type TesseraRenderMetrics = {
  virtualized: boolean
  mountedItemCount: number
  mountedRowCount: number
  totalItemCount: number
  totalRowCount: number
  firstMountedRowIndex: number | null
  lastMountedRowIndex: number | null
}
```

| Field | Description |
|---|---|
| `virtualized` | Whether `virtualize` is enabled |
| `mountedItemCount` | Number of items currently in the DOM |
| `mountedRowCount` | Number of rows currently in the DOM |
| `totalItemCount` | Total items across the full gallery. When `skipErrors` is enabled, errored items are excluded. Note: with append-only rendering, this reflects committed items and may grow as images load and aspect ratios resolve. |
| `totalRowCount` | Total rows across the full gallery |
| `firstMountedRowIndex` | Row index of the first mounted row (`null` if no rows) |
| `lastMountedRowIndex` | Row index of the last mounted row (`null` if no rows) |

When `virtualize` is disabled, `mountedItemCount === totalItemCount` and `mountedRowCount === totalRowCount`.

`onRenderMetricsChange` should be stable — wrap it in `useCallback` to avoid spurious fires when the parent re-renders.

---

## `useTesseraGallery`

The hook underlying `<TesseraGallery>`. Use this directly for custom rendering or when you need lower-level control.

```ts
import { useTesseraGallery } from '@slithy/react-tessera-gallery'

const { containerRef, rows, totalRows, gap, onLoad, onError } = useTesseraGallery(items, options, scrollContainerRef)
```

**Returns:**

| Property | Type | Description |
|---|---|---|
| `containerRef` | `RefObject<HTMLDivElement \| null>` | Attach to your container element to observe its width |
| `rows` | `ResolvedRow<T>[]` | Render rows. When `virtualize` is enabled, this contains only the visible/overscanned rows. |
| `totalRows` | `number` | Total number of rows in the full gallery, regardless of virtualization. Use this for ARIA row counts and full-gallery metadata. |
| `gap` | `number` | Resolved gap value (useful when `gap` was passed as a callback) |
| `onLoad` | `(key, naturalWidth, naturalHeight) => void` | Call when an image loads to resolve its aspect ratio and mark it loaded |
| `onError` | `(key) => void` | Call when an image fails to load; writes a fallback aspect ratio so the layout can commit past it, and marks the item for removal when `skipErrors` is set |
| `virtualWindow` | `{ firstIndex, lastIndex, topSpacerHeight, bottomSpacerHeight } \| null` | Set when `virtualize` is true; describes which rows are visible and the spacer heights needed to maintain full scroll height |

`ResolvedRow<T>` includes `rowIndex`, `startIndex`, `height`, and `items`. Each item entry includes the original `item`, `itemIndex`, `colIndex`, `width`, `height`, and `loaded`.

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
