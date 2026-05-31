# Changelog

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
