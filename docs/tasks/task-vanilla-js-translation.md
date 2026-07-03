# Task: Vanilla JS Translation

Translate `@slithy/react-tessera-gallery` into a standalone, framework-agnostic
`tessera-gallery` package. Target: a direct alternative to justified-gallery,
no React dependency.

---

## Status

**Blockers:** none for starting Layer 1 (pure layout copy) — it has no
dependency on either open decision below. Two decisions should be made before
going further:

1. **Repo location** (first checklist item below) — new standalone repo vs. a
   package in `../slithy`. Neither `~/Code/tessera-gallery` nor
   `slithy/packages/tessera-gallery` exists yet, so this is genuinely open.
2. **Layer 5 scope** (keyboard navigation) — ship in v1 or defer. Affects the
   Public API sketch and the Tests list, so settle it before finalizing either.

Housekeeping, not a blocker: `src/` (the thing being copied from) is currently
at a clean, pushed `0.10.0` — safe to fork from as-is.

**Model recommendation:** use a stronger-reasoning model (Opus) for Layer 2
(orchestration port) and the Layer 4 diffing algorithm — these are where the
append-only commit machinery had real, subtle bugs in the React version (stale
item references, the `maxNumRows` ratchet, the spacer `gap` double-count), and
a new imperative port risks reintroducing analogous mistakes rather than
copying working code. Sonnet is a good fit for Layer 1 (mechanical copy),
Layer 3 (well-specified port plus one added `ResizeObserver`), Layer 5 (mirrors
an already-built feature), tests, and docs. Worth a deep review pass (Fable, as
was done for the React version) before publishing — that review → fix cycle is
what caught most of the issues listed throughout this doc.

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

- [ ] `ResizeObserver` for container width — plain variable, same API; guard against zero-width
      fires (`if (width > 0)`) — iOS Safari fires with `width: 0` on initial mount
- [ ] Aspect ratio cache — `Map`, no change
- [ ] Loaded set — `Set`, no change
- [ ] Error set — `Set`, no change; `onError(key)` marks a key as errored
- [ ] `skipErrors` option — when enabled, filter items by the error set before
      computing layout so broken images don't occupy a slot
- [ ] Cache pruning — aspect ratio cache, loaded set, and error set are pruned
      against the current item set (with slack) once they outgrow it, to avoid
      unbounded growth in long-lived/infinite-scroll usage
- [ ] Append-only committed-rows logic — plain arrays, no change; drop the
      `isStable` stabilization ref (not needed without React reconciliation)
- [ ] Committed rows store geometry + item keys only, not item objects — live
      items are resolved by index at render time so item data updates always
      propagate
- [ ] Key-mismatch guard — compare committed row keys against the current
      items each update; reset to a full re-layout on prepend/reorder/removal.
      Append-only is a documented contract, not an enforced one — items
      shifting under a stale committed slot otherwise corrupts the layout
      silently
- [ ] `maxNumRows` global budget — pass `maxNumRows` minus the already-committed
      row count to each frontier layout call, not the full budget every time
      (otherwise every re-render can commit more rows, ratcheting past the cap)
- [ ] `onLoad(key, naturalWidth, naturalHeight)` — plain method, same logic
- [ ] Options resolution (`rowHeight`/`gap` as function or number) — no change
- [ ] Re-trigger layout on: container resize, `setItems()` call, `onLoad()` call,
      `onError()` call (if `skipErrors` is enabled)

---

## Layer 3 — Virtual window (logic port)

Port `useVirtualWindow` logic. Already plain DOM APIs under the hook wrapper.

- [ ] Passive scroll listener with rAF debounce — same implementation
- [ ] `getBoundingClientRect()` math for container-local top/bottom — same
- [ ] `scrollContainerRef` support (`clientHeight` vs `window.innerHeight`) — same
- [ ] `ResizeObserver` on `document.documentElement` (window-scroll mode) or on
      the scroll container element (container-scroll mode) — catches layout
      shifts that don't fire a `scroll` or `resize` event (e.g. content above
      the gallery changing height)
- [ ] Wire into orchestration layer: recompute virtual window on scroll,
      resize, and the `ResizeObserver` callback above

---

## Layer 4 — DOM rendering (new work)

The only genuine rewrite. Replace React's reconciler with direct DOM
manipulation. Append-only design keeps this manageable — committed rows are
never touched after creation.

- [ ] On `setItems()` or resize: compute full layout, diff against current row
      count, append only new row elements (committed rows) and replace/update
      the frontier row
- [ ] Key/identify committed row elements by `startIndex` (the first item's
      index), not row position — a provisional rollback that shifts row
      boundaries should only remount the affected rows, not all of them
- [ ] Spacer divs above/below for virtualization
- [ ] Spacer height math: if the row container uses `display: flex` +
      `gap`, subtract one `gap` from each spacer height (clamped at 0) — the
      container's `gap` already inserts space next to the spacer, so naive
      cumulative math double-counts it. See `../research/virtualization-reference.md`
      for the full writeup of this gotcha
- [ ] Row elements: `display: flex`, `gap`, `justifyContent` for last-row modes
      (`left` / `center` / `right`), `contain: layout` — same CSS as React version
- [ ] Non-justified last row: round item widths (the React version uses
      `Math.round`) to avoid sub-pixel raggedness
- [ ] Spacer divs: `contain: layout`
- [ ] Item rendering: accept a `renderItem(item, { width, height, loaded })`
      callback returning an `HTMLElement`; the library sets `width`/`height` as
      inline styles (or delegates entirely to the callback)
- [ ] Wire `onLoad` to each `<img>` element's load event (or expose it for the
      consumer's `renderItem` to attach); wire `onError` similarly
- [ ] `destroy()` — disconnect ResizeObserver(s), remove scroll listener, cancel
      any pending rAF

---

## Layer 5 — Keyboard navigation (new work, scope decision needed)

The React version added an opt-in `navigable` mode after this doc was
originally written: the gallery becomes a `role="grid"` ARIA widget with a
roving tabindex (one cell holds `tabIndex=0` at a time), handling arrow keys,
Home/End, Ctrl+Home/Ctrl+End, PageUp/PageDown, and Space/Enter. Focus can be
controlled via `focusedIndex` + `onFocusedIndexChange`, with `onActivate(index,
shiftKey)` firing on Space/Enter. When virtualization scrolls the focused row
off-screen, the container itself takes `tabIndex=0` as a fallback so Tab still
reaches the gallery.

This is a genuinely new feature area, not a straight port — decide whether
it's in scope for v1 or deferred.

- [ ] Decide: include keyboard navigation in v1, or defer to a later release
- [ ] If included: port roving-tabindex logic and the arrow/Home/End/
      Ctrl+Home/Ctrl+End/PageUp/PageDown/Space/Enter key handling
- [ ] ARIA structure: `role="grid"` + `aria-rowcount` on the container,
      `role="row"` + `aria-rowindex` per row, `role="gridcell"` per item
- [ ] Focus API: uncontrolled internal state, or controlled `focusedIndex` +
      change callback (React uses props; vanilla will need either a setter
      method or DOM `CustomEvent`)
- [ ] Container `tabIndex=0` fallback when the focused row is virtualized
      off-screen; first keypress scrolls it back into view

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
- [ ] The sketch above predates `onError`/`skipErrors` and (if in scope)
      `navigable`/`focusedIndex`/`onFocusedIndexChange`/`onActivate` — extend
      `TesseraOptions`/`TesseraItem`/`handlers` once Layer 2 and Layer 5
      decisions are settled

---

## Tests

- [ ] Port `computeTesseraLayout` tests (straight copy)
- [ ] Port `useVirtualWindow` tests → test the plain scroll-tracking logic
      directly (no hook wrapper needed)
- [ ] Port `useTesseraGallery` tests → test the orchestration class/factory with
      a jsdom container
- [ ] Integration test: `setItems()` → DOM snapshot of row/item structure
- [ ] Integration test: virtualization spacer heights (include a `gap > 0`
      case — the default-`gap` case can't catch the double-counting bug noted
      in Layer 4)
- [ ] Integration test: append-only — existing rows not re-rendered on item append
- [ ] Integration test: prepend/reorder triggers the key-mismatch guard and
      resets the layout, rather than silently corrupting committed rows
- [ ] Integration test: `skipErrors` excludes errored items from layout
- [ ] If Layer 5 is in scope: port the keyboard-navigation and roving-tabindex
      tests

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
