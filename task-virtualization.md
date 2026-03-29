# Task: Virtualization

Render only items near the viewport. For large collections the full DOM is expensive — Google Photos keeps ~50 tiles in the DOM at any time regardless of library size.

In both layout modes the layout is already fully computed before rendering — we have pixel dimensions for everything. Virtualization is a rendering concern only; no changes to the pure layout functions are needed.

---

## Problem shape

Both layout modes share the same core requirement: the container must maintain its full scroll height so the scrollbar is accurate, while only the rows/items near the viewport are actually rendered. Off-screen rows/items are replaced by spacer elements of the correct height.

The two modes differ in how item height is known:

- **Justified rows** (`TesseraGallery`): every `LayoutRow` has a pixel `height`. Total scroll height = sum of row heights + gaps. Per-row spacers are straightforward.
- **Masonry** (`MasonryGallery`): each column has independently accumulating height. Total container height = max column height. Per-item heights are known from `computeMasonryLayout`. Spacers work per column.

---

## Proposed API

Virtualization should be opt-in to keep the default simple. A `virtualize` prop on each component is the cleanest interface:

```tsx
<TesseraGallery items={...} rowHeight={200} virtualize />
```

No additional props should be required. The overscan (how many px beyond the viewport to render) can be a fixed internal constant (e.g. `1.5 × viewport height`) or an optional `overscan` prop if tuning is needed.

---

## Shared infrastructure

A new internal hook `useVirtualWindow` that:
1. Attaches a scroll listener to `window` (or an optional scroll container ref)
2. Tracks `scrollTop` + `viewportHeight`, debounced via `requestAnimationFrame`
3. Returns `{ top, bottom }` — the visible pixel range within the gallery container

This hook is only instantiated when `virtualize` is true.

---

## Implementation: Justified (`TesseraGallery`)

Rows already have `height`. Compute cumulative `rowTop` offsets from the layout. For each row, check if `[rowTop, rowTop + row.height]` intersects `[top - overscan, bottom + overscan]`.

Render two spacer `<div>`s: one before the first visible row (height = `firstVisibleRowTop`) and one after the last (height = remaining). Visible rows render normally between them.

---

## Implementation: Masonry (`MasonryGallery`)

> **Note:** Masonry code lives in `../react-masonry-gallery`. This section should be moved there once virtualization is implemented for that package.

Each column renders independently. Per column, track cumulative item heights. Render a top spacer div for off-screen items above, then visible items, then a bottom spacer for off-screen items below. The column `<div>` always occupies its full height via the spacers — no absolute positioning needed.

---

## Considerations

**Unknown aspect ratios.** Items without a known aspect ratio aren't in the layout yet, so they have no pixel height and can't be virtualized. This is the existing behavior — they simply don't appear until `onLoad` fires. No change needed.

**Scroll container.** ✓ Done — `scrollContainerRef` prop added to `TesseraGallery` and `useTesseraGallery`. When provided, the scroll listener attaches to that element instead of `window`.

**Resize.** The existing `ResizeObserver` on `containerRef` already triggers layout recomputation. On resize, `useVirtualWindow` needs to recompute visible range — this happens naturally if `viewportHeight` is re-read from `window.innerHeight` inside the RAF callback.

**`contain` CSS property.** ✓ Done — `contain: layout` is already applied to row wrappers in `TesseraGallery`. Add to spacer divs when virtualization is implemented.

---

## Scope

### `react-tessera-gallery` ✓ Complete

- ✓ `contain: layout` on row wrappers in `TesseraGallery`
- ✓ `rows` reference stabilized in `useTesseraGallery`
- ✓ `useVirtualWindow` hook — passive scroll listener, rAF debounce, container-local range
- ✓ `virtualize?: boolean` added to `LayoutOptions`
- ✓ `useTesseraGallery` computes row offsets and `virtualWindow`
- ✓ `TesseraGallery` renders visible rows slice with top/bottom spacer divs
- ✓ `overscan` prop — defaults to `rowHeight * 2`
- ✓ `scrollContainerRef` prop — for galleries inside scrollable divs
- ✓ Tests: `useVirtualWindow` unit tests + `TesseraGallery` integration tests

### `react-masonry-gallery`

> Move this section to `../react-masonry-gallery` when implementing virtualization there.

- `useVirtualWindow` can be shared or duplicated — decide at implementation time
- Modify `useMasonryGallery` / `MasonryGallery` to accept and act on `virtualize`
- No changes to `computeMasonryLayout` or public types (except adding `virtualize?: boolean` to `MasonryOptions`)
- Tests: integration tests confirming only in-range items per column are rendered

---

## Out of scope

- Section/segment grouping (Google Photos style date bucketing)
- Low-res placeholder images / progressive loading
- Scroll-speed-based prefetch heuristics
