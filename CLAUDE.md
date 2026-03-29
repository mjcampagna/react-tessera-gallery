# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build       # tsup — bundles ESM + generates .d.ts declarations
npm run dev         # tsup watch mode
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm run test        # vitest run (single pass)
npm run test:watch  # vitest (watch mode)
npm run clean       # rm -rf dist
```

To run a single test file: `npx vitest run src/__tests__/computeTesseraLayout.test.ts`

## Architecture

This is a publishable React library (`@slithy/react-tessera-gallery`) providing a justified photo gallery layout using a Knuth-Plass dynamic programming algorithm. It is part of the `slithy` monorepo scope but lives as a standalone project here.

### Three-layer API

The library exposes three levels of abstraction, all exported from `src/index.ts`:

1. **`TesseraGallery`** ([src/TesseraGallery.tsx](src/TesseraGallery.tsx)) — Top-level component. Accepts `items`, a `renderItem` render prop, and `LayoutOptions`. Handles all rendering internally.

2. **`useTesseraGallery`** ([src/useTesseraGallery.ts](src/useTesseraGallery.ts)) — Hook for consumers who need direct access to layout state. Returns `containerRef`, `rows` (`ResolvedRow<T>[]`), `gap` (resolved number), `onLoad` callback, and `virtualWindow` (non-null when `virtualize` is enabled).

3. **`computeTesseraLayout`** ([src/computeTesseraLayout.ts](src/computeTesseraLayout.ts)) — Pure layout function, no React dependency. Takes items with known aspect ratios, container width, and `LayoutOptions`; returns `LayoutRow[]` with pixel dimensions.

### Key design decisions

**Append-only rendering:** Once rows are fully committed, they are never reshuffled. Only the "frontier" (the last partial row plus any new items) is recomputed on each update. This prevents layout jumps when images lazy-load or new items append.

**Aspect ratio handling:** Items may declare `aspectRatio` upfront. If unknown, the hook discovers it via the `onLoad` callback when the `<img>` fires its load event, then caches it. Pre-known `aspectRatio` takes precedence and `onLoad` will not overwrite it.

**Knuth-Plass algorithm:** `computeTesseraLayout` uses dynamic programming with a cubic badness penalty (`|deviation|³`) for rows deviating from `rowHeight`. Hard constraints are `minHeight = rowHeight * maxShrink` and `maxHeight = rowHeight * maxStretch`. Binary search finds the first valid `j` per row start, skipping portrait-heavy items efficiently.

**Pano special case:** If a single item is so wide that `rowHeightFor(i, i+1) < minHeight` — meaning even alone it falls below the minimum — it is force-placed as a solo full-width row, exempt from height constraints. This handles ultra-wide panoramas at any position in the layout.

**`minColumns`:** A soft minimum that caps `effectiveIdealHeight` so rows of at least N items are viable. Panos are exempt. This is the recommended safeguard for narrow containers when `rowHeight` is a static number.

**Responsive options:** `rowHeight` and `gap` accept `number | ((containerWidth: number) => number)`. The callback is resolved inside the hook using the width it already observes. `useTesseraGallery` returns the resolved `gap` so components don't need to re-resolve it.

**Virtualization:** Opt-in via `virtualize` prop. Implemented via `useVirtualWindow` ([src/useVirtualWindow.ts](src/useVirtualWindow.ts)) — attaches a passive scroll listener debounced with `requestAnimationFrame`, returns the visible pixel range in container-local coordinates. `useTesseraGallery` computes cumulative row offsets and derives `virtualWindow` (first/last visible row indices + spacer heights). `TesseraGallery` renders only the visible slice of rows with spacer divs above and below. No effect when disabled.

`scrollContainerRef` (optional third arg to `useTesseraGallery`, prop on `TesseraGallery`) — when the gallery is inside a scrollable div, pass a ref to that element. The scroll listener attaches to it instead of `window`, and `clientHeight` is used instead of `window.innerHeight`. Without this, scroll events never reach `window` and the visible range never updates.

### Types

All shared types live in [src/types.ts](src/types.ts): `GalleryItem<T>`, `LayoutOptions`, `LayoutRow`, `ResolvedRow<T>`.

`LayoutOptions` key fields: `rowHeight` (required), `gap`, `lastRow`, `minColumns`, `maxNumRows`, `maxShrink` (default `0.75`), `maxStretch` (default `1.5`), `justifyThreshold` (default `0.9`), `virtualize` (default `false`).

### Build output

ESM only (`dist/index.js` + `dist/index.d.ts`). `sideEffects: false`. Peer deps: React 17/18/19.

## Slithy monorepo relationship

This repo is the canonical source for `@slithy/react-tessera-gallery`. The monorepo at `../slithy` syncs `src/` from here via:

```bash
pnpm --filter @slithy/react-tessera-gallery sync   # rsync src/ into monorepo
pnpm --filter @slithy/react-tessera-gallery build
```

After pushing changes here, run `sync` + `build` in slithy to update the published package. Publishing is handled through the slithy monorepo via Changesets.

## Code conventions

**Imports:** No file extensions on relative imports (`.js`, `.ts`) — `moduleResolution: Bundler` handles this.

TypeScript and React conventions are defined in `~/Code/CLAUDE.md` and apply here.
