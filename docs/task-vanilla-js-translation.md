# Task: Vanilla JS Translation

Translate `@slithy/react-tessera-gallery` into a standalone, framework-agnostic
`tessera-gallery` package. Target: a direct alternative to justified-gallery,
no React dependency.

---

## Repo / project setup

- [ ] Decide repo: new standalone repo, or a second package alongside React in a
      shared monorepo
- [ ] Initialize package (`tessera-gallery` or `@slithy/tessera-gallery`)
- [ ] Configure tsup (ESM + CJS + `.d.ts`), TypeScript, eslint, vitest
- [ ] Set peer deps (none — fully standalone)

---

## Layer 1 — Pure layout (zero changes)

`computeTesseraLayout` and `types.ts` copy over as-is.

- [ ] Copy `computeTesseraLayout.ts` into new package
- [ ] Copy relevant types (`LayoutOptions`, `LayoutRow`) — drop React-specific
      types (`GalleryItem`, `ResolvedRow`) or re-scope them for vanilla use
- [ ] Copy existing `computeTesseraLayout` tests verbatim
- [ ] Confirm tests pass in new package

---

## Layer 2 — Layout orchestration (logic port, not rewrite)

Port the stateful logic from `useTesseraGallery` into a plain class or factory
function. The logic is already framework-agnostic; only the state containers
change.

- [ ] `ResizeObserver` for container width — plain variable, same API
- [ ] Aspect ratio cache — `Map`, no change
- [ ] Loaded set — `Set`, no change
- [ ] Append-only committed-rows logic — plain arrays, no change; drop the
      `isStable` stabilization ref (not needed without React reconciliation)
- [ ] `onLoad(key, naturalWidth, naturalHeight)` — plain method, same logic
- [ ] Options resolution (`rowHeight`/`gap` as function or number) — no change
- [ ] Re-trigger layout on: container resize, `setItems()` call, `onLoad()` call

---

## Layer 3 — Virtual window (logic port)

Port `useVirtualWindow` logic. Already plain DOM APIs under the hook wrapper.

- [ ] Passive scroll listener with rAF debounce — same implementation
- [ ] `getBoundingClientRect()` math for container-local top/bottom — same
- [ ] `scrollContainerRef` support (`clientHeight` vs `window.innerHeight`) — same
- [ ] Wire into orchestration layer: recompute virtual window on scroll + resize

---

## Layer 4 — DOM rendering (new work)

The only genuine rewrite. Replace React's reconciler with direct DOM
manipulation. Append-only design keeps this manageable — committed rows are
never touched after creation.

- [ ] On `setItems()` or resize: compute full layout, diff against current row
      count, append only new row elements (committed rows) and replace/update
      the frontier row
- [ ] Spacer divs above/below for virtualization
- [ ] Row elements: `display: flex`, `gap`, `justifyContent` for last-row modes
      (`left` / `center` / `right`) — same CSS as React version
- [ ] Item rendering: accept a `renderItem(item, { width, height, loaded })`
      callback returning an `HTMLElement`; the library sets `width`/`height` as
      inline styles (or delegates entirely to the callback)
- [ ] Wire `onLoad` to each `<img>` element's load event (or expose it for the
      consumer's `renderItem` to attach)
- [ ] `destroy()` — disconnect ResizeObserver, remove scroll listener, cancel
      any pending rAF

---

## Public API

```ts
interface TesseraItem {
  key: string | number
  aspectRatio?: number
}

interface TesseraOptions extends LayoutOptions {
  renderItem: (
    item: TesseraItem,
    layout: { width: number; height: number; loaded: boolean },
    handlers: { onLoad: (e: Event) => void },
  ) => HTMLElement
  scrollContainer?: HTMLElement   // replaces scrollContainerRef
}

class TesseraGallery {
  constructor(container: HTMLElement, options: TesseraOptions)
  setItems(items: TesseraItem[]): void
  destroy(): void
}
```

- [ ] Finalize API shape (class vs factory function vs both)
- [ ] Decide whether `renderItem` or a simpler `{ src, srcset, alt }` item
      shape is the right default (render prop is flexible; opinionated `<img>`
      is easier for common cases — could offer both)
- [ ] Export `computeTesseraLayout` as a named export for headless use

---

## Tests

- [ ] Port `computeTesseraLayout` tests (straight copy)
- [ ] Port `useVirtualWindow` tests → test the plain scroll-tracking logic
      directly (no hook wrapper needed)
- [ ] Port `useTesseraGallery` tests → test the orchestration class/factory with
      a jsdom container
- [ ] Integration test: `setItems()` → DOM snapshot of row/item structure
- [ ] Integration test: virtualization spacer heights
- [ ] Integration test: append-only — existing rows not re-rendered on item append

---

## Docs / README

- [ ] Usage example (basic)
- [ ] Usage example (virtualization + scrollContainer)
- [ ] API reference
- [ ] Comparison notes vs justified-gallery (algorithm, append-only, TS-first)

---

## Publishing

- [ ] Decide versioning: start at `0.1.0` or mirror React package version
- [ ] `sideEffects: false`
- [ ] Confirm tree-shaking of `computeTesseraLayout` standalone export
- [ ] Publish via slithy monorepo Changesets, or standalone npm publish
