# Code Review: `src/` Evaluation

> Review of `src/` — opportunities for improvement, edge cases, and bugs.
> No changes made; report only. (Claude Fable 5, 2026-06-11)

Findings are ordered roughly by severity.

## Bugs

**1. Committed rows hold stale item references — item data updates are ignored.** ✅ *Fixed 2026-06-11*
`useTesseraGallery.ts:299-312` commits rows that capture the `item` objects at commit time, and `toResolvedRow` renders from those captures. If a consumer updates an item's data (new object, same key — e.g. a caption edit or src swap), the reset check at `useTesseraGallery.ts:251-254` only fires when `resolvedItems.length` *shrinks*, so every committed row keeps rendering the old object until a width/options change forces a reset. Only the uncommitted frontier row sees fresh data. A cheap fix would be re-mapping committed rows to `resolvedItems[index]` each render (layout geometry stays locked, item references stay current). Relatedly, **prepends/reorders silently corrupt the layout**: the frontier is `items.slice(committedItemCount)` by index, so inserting at the front shifts every item under the wrong committed slot. Append-only is the documented contract, but there's no guard (e.g. comparing the last committed key) and no warning when it's violated.

**2. `maxNumRows` ratchets past its limit in the hook.** ✅ *Fixed 2026-06-11*
`computeTesseraLayout` truncates correctly, but the hook passes `maxNumRows` to every *frontier* computation (`useTesseraGallery.ts:270-276`). Render 1 with 20 items and `maxNumRows: 3` produces 3 rows and commits 2; the truncated items stay in the frontier, so the next re-render (any parent update, any `onLoad`) lays out the remainder with a fresh budget of 3 rows and commits 2 more. Each re-render grows the gallery by up to `maxNumRows − 1` rows until all items are shown. Tests only cover `maxNumRows` on the pure function, which is why this isn't caught.

**3. Virtualization spacers are off by one flex `gap`.**
`topSpacerHeight = rowTops[firstIndex]` (`useTesseraGallery.ts:378-379`) already includes the gap that should sit between the clipped rows and the first rendered row — but the spacer is a flex child, so the container's `gap` inserts another one (`TesseraGallery.tsx:29-31`). Once `firstIndex > 0`, all content shifts down by `gap` px and total scroll height inflates by up to `2 × gap`, causing a small visible jump the moment the first row gets clipped. The spacer heights should subtract one `gap` each (clamped at 0). The existing spacer tests all use the default `gap: 0`, so they can't see it.

**4. `optionsKey` omits `minColumns`.** ✅ *Fixed 2026-06-11*
The committed-rows reset key at `useTesseraGallery.ts:243` covers rowHeight/gap/maxShrink/maxStretch, but `minColumns` changes `effectiveIdealHeight` and therefore every row's geometry. Changing it at runtime leaves committed rows laid out under the old value until something else triggers a reset.

**5. `onFocusedIndexChange` fires twice per keyboard navigation.**
`navigateTo` calls it directly (`useTesseraGallery.ts:499`), then `target.focus()` triggers the cell's `onFocus`, which calls `handleItemFocus` → the callback again with the same index (`useTesseraGallery.ts:561-564`). Harmless for idempotent consumers, surprising for anyone counting events or syncing controlled state.

**6. Docs drift: `overscan` default.** ✅ *Fixed 2026-06-11 (README + CLAUDE.md; optional JSDoc default in `types.ts` folded into the Sonnet backlog)*
Code uses `resolvedRowHeight * 4` (`useTesseraGallery.ts:343`); CLAUDE.md says `rowHeight * 2`, and `types.ts` doesn't document a default at all.

## Edge cases worth handling or documenting

- **`maxShrink ≥ 1` degenerates the whole layout.** `finitePositive` accepts it, making `minHeight ≥ idealHeight`, so nearly every candidate row fails the height check and falls into the pano path — every item becomes a solo full-width row. Clamping to `(0, 1)` (or warning) would be kinder than silent garbage.
- **Virtualization × provisional aspect ratios.** Items committed with the placeholder ratio whose rows are outside the virtual window never mount, so `onLoad` never fires and the placeholder persists. When the user finally scrolls there, the load triggers `rollbackProvisionalRows`, which can re-layout rows the user is currently looking at — a mid-scroll jump. Probably inherent to the design, but worth a documented recommendation (provide `aspectRatio` upfront when virtualizing).
- **Roving tabindex breaks when the focused row is virtualized out.** The only `tabIndex={0}` cell lives on the focused item (`TesseraGallery.tsx:53`); if its row unmounts, DOM focus drops to `<body>` and Tab skips the gallery entirely until something refocuses it. Same failure if a controlled `focusedIndex` exceeds the displayed count (clamping only happens inside `navigateTo`).
- **Window-mode virtual range goes stale without scrolling.** With no `scrollContainerRef`, the range updates on `scroll`/`resize` only (`useVirtualWindow.ts:61-69`). If content above the gallery changes height, the gallery moves but the visible window isn't recomputed until the next scroll — wrong rows can be mounted in the meantime.
- **Late-populating `scrollContainerRef`.** `resolveScrollEl` is called once when the effect runs; if `ref.current` is still null (conditionally rendered ancestor), the listener permanently binds to `window`. A re-check or documented requirement would help.
- ✅ *Fixed 2026-06-11* — **Unbounded caches.** `aspectRatioCache`, `loadedSet`, and `errorSet` are never pruned. For an infinite-feed gallery with key churn, that's a slow leak. *(Now pruned with slack once the caches outgrow the current item set.)*
- ✅ *Addressed 2026-06-11* — **Ref mutation during render** (committing rows, cache writes) is technically impure under React's concurrent-rendering rules. The guards make it largely idempotent, but a discarded concurrent render still advances `committedItemCountRef` — combined with bug #1's weak reset condition, that's the riskiest corner. *(Invariants documented in the hook; the key-mismatch guard from #1 closed the riskiest path.)*

## Smaller observations

- The `dp[n]` unreachable fallback (`computeTesseraLayout.ts:145-154`) looks like dead code: the pano branch guarantees `dp[i+1]` is reachable from any reachable `dp[i]`, so `dp[n]` is always finite. Fine as a safety net, but a comment saying so would prevent someone trying to test it.
- Widow rows in a later frontier batch match `prevRowHeight` *within that batch only* — the first row of a new frontier resets to `effectiveIdealHeight` rather than the actual previous committed row's height, so an appended widow can visibly snap. Minor, follows from the append-only design.
- Justified rows get integer pixel widths via largest-remainder, but non-justified last rows keep fractional widths — a small inconsistency that can cause sub-pixel raggedness on widow rows.
- Keyboard support is solid (arrows, Home/End, Ctrl+Home/End) but lacks PageUp/PageDown, which screen-reader grid users often expect.
- Row `key={row.rowIndex}` means a provisional rollback that shifts row boundaries remounts every affected row's subtree; keying by `startIndex` or the first item's key would preserve more DOM across re-layouts.

## Overall

The core algorithm and input sanitization are in very good shape — the pure layout function is careful and well-tested. The real exposure is concentrated in the hook's append-only commit machinery (items #1, #2, #4) and the gap-aware spacer math (#3); those four are the ones to fix first.

## Execution plan

Almost everything is independent — the one real cluster is the append-only commit machinery in `useTesseraGallery.ts`, where three fixes touch the same code and should be sequenced.

### The sequential cluster: commit machinery

**#1 (stale item references) → #2 (maxNumRows ratchet) → #4 (optionsKey omits minColumns)**, in that order.

- **#1 first**, because its natural fix restructures what a committed row *is*: instead of capturing `item` objects at commit time, committed rows would store geometry only (widths, heights, item counts) and look up the live item by index at render time. That same restructuring is where the prepend/reorder guard naturally lands (compare committed keys against current keys). Doing #2 or #4 first means redoing them after this refactor.
- **#2 second**, because its fix changes the commit loop (`useTesseraGallery.ts:299-312`) — the budget of rows the hook is allowed to commit must become global (committed rows + frontier rows ≤ maxNumRows) rather than per-frontier-computation. That loop is exactly what #1 just rewrote, so sequencing avoids conflicting edits.
- **#4 last** — it's a one-line addition to the `optionsKey` string in the reset block, trivially rebased on whatever #1 did to that block. (Strictly it *could* go first since it's so small, but it lives in the same dozen lines.)

Two of the smaller items ride along with this cluster rather than standing alone: the **cache-pruning** fix (prune `aspectRatioCache`/`loadedSet`/`errorSet` against current keys) wants the same "walk current items by key" pass that #1 introduces, and the **render-purity comment/hardening** is documentation of the exact invariants #1 reshapes.

### Fully independent — any order, or in parallel

| Fix | Where | Status | Assignee |
|---|---|---|---|
| #3 spacer off-by-gap | virtual window math + `TesseraGallery.tsx` spacers | Open | **Sonnet** — fully specified in finding #3; subtract one `gap` from each spacer height (clamp at 0); add `gap > 0` spacer tests |
| #5 double `onFocusedIndexChange` | `navigateTo`/`handleItemFocus` | Open | **Sonnet** — fully specified; suppress the duplicate call when programmatic focus lands |
| #6 overscan docs drift | CLAUDE.md / README / `types.ts` | ✅ Done 2026-06-11 | — |
| `maxShrink ≥ 1` clamp | `computeTesseraLayout.ts` | Open | **Sonnet** — clamp to `(0, 1)` in input sanitization; add a pure-function test |
| Window-mode stale range | `useVirtualWindow.ts` | Open | **Sonnet, after approach is agreed** — how to detect the gallery moving without a scroll event (ResizeObserver on container vs. document) is a design choice; decide before delegating |
| Late-populating `scrollContainerRef` | `useVirtualWindow.ts` | Open | **Sonnet** — bundle with the stale-range fix; both touch the same effect |
| PageUp/PageDown, roving-tabindex hardening | navigation/render code | Open | **Sonnet, after approach is agreed** — PageUp/PageDown is mechanical, but the tabindex fallback when the focused row is virtualized out needs a behavior decision first |

Each open item is a small, self-contained change — give Sonnet the relevant finding paragraph plus the table row as the prompt; nothing else from this doc is required context. Items marked "after approach is agreed" have a design decision embedded; settle it (here or in the prompt) before delegating, or the implementation choice gets made implicitly.

One soft interaction worth knowing: #3's fix needs new tests with `gap > 0` — the cluster refactor is already landed, so write those tests against the current (post-refactor) hook.

### Summary

Land the independent items whenever convenient (each is a small, self-verifying PR), and do #1 → #2 → #4 as one sequenced effort — arguably a single PR, since together they amount to "make the commit machinery correct under re-renders and option changes."

### Status

**Done — 2026-06-11 (Fable 5):**

- **Cluster fixed** (#1, #2, #4 plus both ride-alongs). Committed rows now store geometry + keys only and resolve live items by index at render time; a key-mismatch guard resets the layout on prepends/reorders; the frontier layout receives `maxNumRows` minus already-committed rows; `optionsKey` includes `minColumns` and `maxNumRows`; caches are pruned (with slack) when they outgrow the item set; render-purity invariants documented in the hook. Nine regression tests added in `useTesseraGallery.test.ts`. All 157 tests pass; lint and build clean.
- **#6 docs drift fixed.** `overscan` default corrected in README and CLAUDE.md; CHANGELOG entry added; item identity/ordering contract documented in README and CLAUDE.md.

**Done — 2026-06-12 (Sonnet):**

- **#3 spacer off-by-gap.** Both spacer heights subtract one `resolvedGap` (clamped at 0). Two new tests with `gap=8`.
- **#5 double `onFocusedIndexChange`.** `programmaticFocusRef` suppresses the duplicate callback from `target.focus()`. New test verifies exactly one firing per keystroke.
- **`maxShrink` clamp.** Values ≥ 1 or ≤ 0 fall back to 0.75. New pure-function test.
- **Late-populating `scrollContainerRef`.** Documented requirement in JSDoc.
- **Window-mode stale range.** `ResizeObserver` on `document.documentElement` detects layout shifts above the gallery. New test fires the observer directly.
- **Roving-tabindex hardening + PageUp/PageDown.** Container gets `tabIndex=0` when the focused row is virtualized off-screen; keydown guard prevents double-handling. PageUp/PageDown jump by visible-row count, preserving column. Eight new tests.
- **Backlog polish.** `dp[n]` fallback comment; JSDoc `@default` annotations in `types.ts`; row keyed by `startIndex`; `Math.round` on non-justified last-row widths.
- **Docs.** README: keyboard navigation section, navigable/focusedIndex/onFocusedIndexChange/onActivate/layout.focused props, maxShrink constraint, scrollContainerRef mount-time note. CLAUDE.md: keyboard navigation and scrollContainerRef requirement.

**Not planned (accepted behavior):** widow rows snapping to `effectiveIdealHeight` in a later frontier batch (inherent to append-only); virtualization × provisional aspect-ratio jumps (mitigated by documented `aspectRatio`-upfront recommendation).
