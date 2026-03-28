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

This is a publishable React library (`@slithy/react-tessera-gallery`) that provides a justified photo gallery layout using a Knuth-Plass dynamic programming algorithm. It is part of the `slithy` monorepo scope but lives as a standalone project here.

### Three-layer API

The library exposes three levels of abstraction, all exported from `src/index.ts`:

1. **`TesseraGallery`** ([src/TesseraGallery.tsx](src/TesseraGallery.tsx)) — Top-level component. Accepts `items`, a `renderItem` render prop, and layout options. Handles all rendering internally.

2. **`useTesseraGallery`** ([src/useTesseraGallery.ts](src/useTesseraGallery.ts)) — Hook for consumers who need direct access to layout state. Returns `containerRef`, `rows` (array of `ResolvedRow`), and an `onLoad` callback for image elements.

3. **`computeTesseraLayout`** ([src/computeTesseraLayout.ts](src/computeTesseraLayout.ts)) — Pure layout function, no React dependency. Takes items with known aspect ratios, container width, and `LayoutOptions`; returns `LayoutRow[]` with pixel dimensions.

### Key design decisions

**Append-only rendering:** Once rows are fully committed, they are never reshuffled. Only the "frontier" (the last partial row plus any new items) is recomputed on each update. This prevents layout jumps when images lazy-load or new items append.

**Aspect ratio handling:** Items may declare `aspectRatio` upfront. If unknown, the hook discovers it via the `onLoad` callback when the `<img>` fires its load event, then caches it. `computeTesseraLayout` only operates on items with known ratios.

**Knuth-Plass algorithm:** The layout algorithm in `computeTesseraLayout.ts` uses dynamic programming with a cubic badness penalty for rows that deviate from the target `rowHeight`. Hard constraints are `minHeight = rowHeight * maxShrink` and `maxHeight = rowHeight * maxStretch`.

### Types

All shared types live in [src/types.ts](src/types.ts): `GalleryItem<T>`, `LayoutOptions`, `LayoutRow`, `ResolvedRow<T>`.

### Build output

ESM only (`dist/index.js` + `dist/index.d.ts`). `sideEffects: false`. Peer deps: React 17/18/19.

## Slithy monorepo relationship

This repo is the canonical source for `@slithy/react-tessera-gallery`. The monorepo at `../slithy` syncs `src/` from here via:

```bash
pnpm --filter @slithy/react-tessera-gallery sync   # rsync src/ into monorepo
pnpm --filter @slithy/react-tessera-gallery build
```

After pushing changes here, run `sync` + `build` in slithy to update the published package. Publishing is handled through the slithy monorepo via Changesets.

## Code conventions (from slithy)

**ESLint:** No type casting with `as SomeType` — fix types properly. `as const` is fine. These rules come from `@slithy/eslint-config`.

**Imports:** No file extensions on relative imports (`.js`, `.ts`) — `moduleResolution: Bundler` handles this.

**React patterns:**
- Prefer derived/computed values over `useEffect` for state sync
- Prefer event handlers over `useEffect` for user-triggered actions
- Prefer `key` prop resets over `useEffect` for resetting component state
- Component body order: hooks → local state → computed values → event handlers → early returns → JSX
