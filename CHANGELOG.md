# Changelog

## 0.10.0 — 2026-06-12

### Added

- **PageUp / PageDown keyboard navigation.** Jumps forward or backward by the number of currently visible rows, preserving column position. Requires `navigable`.
- **Container tabIndex fallback for virtualized-out focused row.** When virtualization scrolls the focused row off-screen, the container receives `tabIndex=0` so the gallery remains reachable via Tab. The first keypress scrolls the row back into view and transfers focus to the cell.

### Fixed

- **Virtualization spacers off by one gap.** Each spacer height was over-counted by one `gap`, inflating scroll height and causing a visible jump when the first row was clipped. Spacers now subtract one gap (clamped at 0).
- **`onFocusedIndexChange` fired twice per keyboard navigation.** `navigateTo` called the callback directly, then `target.focus()` triggered a second call via `handleItemFocus`. The duplicate is now suppressed.
- **`maxShrink ≥ 1` degenerates the layout.** Values outside the valid `(0, 1)` range are now ignored and fall back to the default `0.75`.
- **Window-mode virtual range goes stale after layout shifts.** Content changing height above the gallery (expanding accordions, dynamic content) moved the gallery without firing a scroll event, leaving the virtual range stale. A `ResizeObserver` on `document.documentElement` now re-measures when document layout changes.

## 2026-06-11

### Fixed

- Committed rows now resolve live item objects by key/index at render time instead of capturing references at commit time. Updating an item's data (new object, same `key`) is now reflected immediately in already-laid-out rows; previously it was ignored until an unrelated layout reset.
- Prepending, removing, or reordering items is now detected by key comparison and triggers a clean full re-layout. Previously, non-append mutations silently rendered items under the wrong layout slots.
- `maxNumRows` is now enforced as a global cap in `useTesseraGallery` / `TesseraGallery`. Previously each re-render granted the incremental layout a fresh row budget, growing the gallery past the cap until all items were shown.
- Changing `minColumns` or `maxNumRows` at runtime now resets committed rows and re-lays out. Previously these options were missing from the layout reset key, so changes had no effect until the container resized.

### Internal

- Aspect-ratio / loaded / error caches are now pruned for departed item keys once they grow well past the current item set, bounding memory growth in long-lived galleries with item churn.
- Documented the render-purity invariants of the hook's append-only commit machinery.

## 2026-06-08

### Added

- `onRenderMetricsChange?: (metrics: TesseraRenderMetrics) => void` — optional callback fired whenever the rendered row window changes. Reports `virtualized`, `mountedItemCount`, `mountedRowCount`, `totalItemCount`, `totalRowCount`, `firstMountedRowIndex`, and `lastMountedRowIndex`. Useful for analytics, debugging, and scroll progress indicators. Should be stable (e.g. `useCallback`) to avoid spurious fires.
- `TesseraRenderMetrics` type is now exported from the package.

## 2026-05-31

### Breaking

- `useTesseraGallery().rows` now returns render rows when virtualization is enabled, rather than all layout rows.
- `ResolvedRow<T>` now includes `rowIndex` and `startIndex`; row item entries now include `itemIndex` and `colIndex`.

### Added

- `useTesseraGallery()` now returns `totalRows` as the full gallery row count, regardless of virtualization.

### Performance

- Virtualized galleries now resolve only the visible/overscanned row window for rendering.
- Image load state updates now rebuild only render-window rows in virtualized mode.
- Virtual row lookup now uses row offsets and binary search instead of scanning every row on scroll.
