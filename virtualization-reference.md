# Virtualization Reference

Research notes distilled from external sources. Covers both React-specific implementation guidance and general browser/JS techniques that may apply as the library evolves.

---

## Why large DOM is expensive

The browser rendering pipeline — parse → DOM → CSSOM → Render Tree → Layout (Reflow) → Paint → Composite — runs for every element, even offscreen ones. The browser doesn't skip elements it can't see. With thousands of gallery items:

- **Layout (Reflow)** is the most expensive step — every element's size and position must be calculated
- **Paint** is triggered whenever elements change
- **Memory** grows linearly with DOM node count — `querySelectorAll` and similar operations become proportionally slower
- **Time-To-Interactive (TTI)** increases with initial node count

Virtualization solves all of these by keeping the DOM node count fixed and small regardless of dataset size.

---

## Positioning: `transform: translateY()` vs `top`

When using absolute positioning for virtualized items:

- **`top`** triggers a layout reflow — the browser recalculates positions for the element and potentially its siblings/ancestors
- **`transform: translateY()`** bypasses layout entirely — the offset is sent directly to the GPU as a compositing hint

This matters most during scroll events, which fire at high frequency. For our spacer-div approach (flow layout with spacer `<div>`s rather than absolute positioning), this is less relevant — spacers don't move, the DOM just adds or removes rows between them. But if we ever switch to an absolute-positioning model, `transform` is the right tool.

---

## Scroll event handling

- Use `requestAnimationFrame` to debounce scroll updates — defer DOM mutations to the next paint cycle, preventing layout thrashing from multiple reads/writes per frame
- Scroll events fire much faster than the display refresh rate — batching via rAF ensures at most one update per frame
- For a "fake scroll" (custom scroll simulation): listen to `wheel` events, track a virtual scroll offset, and use that to derive which items are in the window. This decouples rendering from native scroll behavior and gives full control over scroll speed and inertia — but is complex and likely overkill for a standard gallery

---

## DOM update methods (Vanilla JS context)

When updating cell/item content without re-creating nodes (node recycling pattern):

| Method | Performance | Notes |
|---|---|---|
| `innerHTML` | Slow | Parses HTML, triggers full DOM reconstruction and reflow |
| `innerText` | Moderate | Respects CSS, forces layout recalculation |
| `textContent` | Fast | Sets text directly, minimal reflow — preferred for frequent updates |

Not directly applicable to React (React handles reconciliation), but relevant if we ever implement a non-React rendering path or want to understand why React's reconciliation adds overhead vs. direct DOM manipulation.

---

## Node recycling (Vanilla JS)

Instead of creating and destroying DOM nodes as items scroll in/out:

1. Maintain a fixed pool of DOM nodes equal to the visible window size
2. As items exit the viewport at the top, update their data (text, src, etc.) and reposition them to the bottom — ready to scroll back into view
3. The browser only ever works with a constant number of nodes

In React, reconciliation approximates this — React reuses component instances via `key` when possible. But React's VDOM diffing and synthetic event system add overhead that pure DOM manipulation avoids. For extreme performance requirements, a non-React path (or Canvas) is the ceiling.

---

## React-specific: `React.memo`

During virtualization, visible items receive new props on every scroll event (updated position, layout values). Without memoization, every visible item re-renders on every scroll tick — a significant performance hit.

**`React.memo` is essential for virtualized item components.**

Complications for our library:
- `renderItem` is user-provided — we can't memo it on the consumer's behalf
- The layout object `{ width, height, loaded }` is created inline each render, producing a new object reference even when values haven't changed
- Consumers who wrap their `renderItem` output in `React.memo` may need a custom comparator to handle the layout object reference

**Document this as a consumer responsibility** when virtualization is implemented.

---

## `contain: layout`

Adding `contain: layout` to row wrappers and spacer divs tells the browser that layout changes inside the element don't affect the outside. This isolates reflow to the container, preventing cascading recalculations up the tree.

Worth adding to row and spacer `<div>`s regardless of whether `virtualize` is enabled — it's a safe hint with no visible side effects.

---

## Canvas rendering (future ceiling)

For absolute maximum performance — millions of items, real-time updates — DOM virtualization still has overhead: each visible item is an HTML element that must be laid out and painted. The next step is Canvas:

- All items are drawn as pixels on a `<canvas>` — no DOM nodes
- Google Sheets uses this approach
- Eliminates layout, paint, and compositing per-element overhead entirely
- Loses native browser behavior: no tab focus, no copy-paste, no accessibility, no CSS

Not a consideration for this library in its current form, but the ceiling to be aware of.

---

## Spacer div approach vs. absolute positioning

Our planned approach (two spacer divs — one above, one below visible rows) vs. the alternative (absolute positioning + `transform: translateY()`):

**Spacer divs (our plan):**
- Simpler — flow layout, no coordinate math
- Spacers maintain scroll height naturally
- Row order is preserved in DOM
- Works well when row heights vary and are known (our case)

**Absolute positioning:**
- More flexible — items can be repositioned without affecting siblings
- Pairs well with node recycling (no DOM insertion/removal, just repositioning)
- Requires explicit container height and per-item coordinate calculation
- `transform: translateY()` avoids reflow on position updates

For our justified layout with known row heights, the spacer approach is the right starting point.
