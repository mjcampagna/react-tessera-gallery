import { act, renderHook } from '@testing-library/react'

import { useTesseraGallery } from '../useTesseraGallery'
import type { GalleryItem, LayoutOptions, ResolvedRow } from '../types'

// ─── Global mocks ─────────────────────────────────────────────────────────────

beforeAll(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0 })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

// ─── ResizeObserver mock ──────────────────────────────────────────────────────
//
// The hook attaches ResizeObserver inside a useEffect, gated on containerRef
// having a DOM element. In renderHook there's no real DOM, so observe() is never
// called. We store the callback in the constructor instead — that way tests can
// fire resize events without needing an element attached to the ref.

let fireResize: (width: number) => void = () => {}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    constructor(cb: ResizeObserverCallback) {
      fireResize = (width: number) =>
        act(() => { cb([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver) })
    }
    observe() {}
    disconnect() {}
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeItem(key: string, aspectRatio?: number): GalleryItem<{ key: string }> {
  return aspectRatio !== undefined ? { key, aspectRatio } : { key }
}

// Keys of all items in row order, left to right, top to bottom.
function allKeys(rows: ResolvedRow<{ key: string }>[]): string[] {
  return rows.flatMap(r => r.items.map(i => i.item.key))
}

function findItem(rows: ResolvedRow<{ key: string }>[], key: string) {
  for (const row of rows) {
    const match = row.items.find(i => i.item.key === key)
    if (match) return match
  }
  return null
}

// 3 square (AR=1) items fill a 300px container exactly at rowHeight=100.
// Using this geometry keeps row composition predictable across all tests.
const WIDTH = 300
const OPTIONS: LayoutOptions = { rowHeight: 100 }

// Nine keys split into three rows of three.
const KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8']

// ─── Rendering without pre-known aspect ratios ────────────────────────────────
//
// Regression: the old commit loop broke on any item missing an aspect ratio,
// leaving the gallery showing only the last frontier row (a handful of items).
// After the fix, all items commit immediately using placeholder ratios.

describe('rendering without pre-known aspect ratios', () => {
  it('renders all items even when no aspectRatio is provided', () => {
    const items = KEYS.map(k => makeItem(k))
    const { result } = renderHook(() => useTesseraGallery(items, OPTIONS))
    fireResize(WIDTH)

    expect(allKeys(result.current.rows)).toHaveLength(9)
    expect(allKeys(result.current.rows)).toEqual(KEYS)
  })

  it('renders all items even when onLoad never fires (cached-image scenario)', () => {
    // If an image loads from cache before React attaches the onLoad handler,
    // the event is lost and onLoad never fires. The gallery must not stall.
    const items = KEYS.map(k => makeItem(k))
    const { result } = renderHook(() => useTesseraGallery(items, OPTIONS))
    fireResize(WIDTH)

    // No onLoad calls — gallery must still show all items
    expect(allKeys(result.current.rows)).toHaveLength(9)
  })

  it('renders items using 1:1 placeholder sizing before any image loads', () => {
    // Item with unknown ratio ends up width≈100 in a 3-per-row layout
    const items = KEYS.map(k => makeItem(k))
    const { result } = renderHook(() => useTesseraGallery(items, OPTIONS))
    fireResize(WIDTH)

    const renderedItem = findItem(result.current.rows, '0')
    expect(renderedItem).not.toBeNull()
    expect(renderedItem!.width).toBeCloseTo(100) // WIDTH / 3 items = 100
    expect(renderedItem!.height).toBeCloseTo(100)
  })
})

// ─── Provisional commitment and rollback ──────────────────────────────────────
//
// Items '0'-'2' have pre-known aspect ratios → their row commits cleanly.
// Items '3'-'8' have no pre-known ratio → committed provisionally.
// When a provisional item's real ratio arrives via onLoad, committed rows roll
// back to before the first provisional row so the zone re-lays out accurately.
// Rows before the provisional zone (the "stable zone") are never disturbed.

describe('provisional commitment', () => {
  function makeProvisionalItems() {
    return [
      makeItem('0', 1), makeItem('1', 1), makeItem('2', 1), // clean zone
      makeItem('3'),    makeItem('4'),    makeItem('5'),     // provisional zone
      makeItem('6'),    makeItem('7'),    makeItem('8'),     // frontier
    ]
  }

  it('all items render immediately, including provisional ones', () => {
    const { result } = renderHook(() => useTesseraGallery(makeProvisionalItems(), OPTIONS))
    fireResize(WIDTH)

    expect(allKeys(result.current.rows)).toHaveLength(9)
    expect(allKeys(result.current.rows)).toEqual(KEYS)
  })

  it('stable zone rows are not disturbed when a provisional item loads', () => {
    const { result } = renderHook(() => useTesseraGallery(makeProvisionalItems(), OPTIONS))
    fireResize(WIDTH)

    // Row 0 is the stable zone
    expect(result.current.rows[0].items.map(i => i.item.key)).toEqual(['0', '1', '2'])

    // Provisional item loads with a real (different) ratio
    act(() => { result.current.onLoad('3', 200, 100) }) // AR=2

    // Stable zone unchanged
    expect(result.current.rows[0].items.map(i => i.item.key)).toEqual(['0', '1', '2'])
  })

  it('all items remain visible after provisional zone is rolled back and re-laid-out', () => {
    const { result } = renderHook(() => useTesseraGallery(makeProvisionalItems(), OPTIONS))
    fireResize(WIDTH)

    act(() => { result.current.onLoad('3', 200, 100) }) // AR=2

    expect(allKeys(result.current.rows)).toHaveLength(9)
  })

  it('re-lays out provisional zone using the real aspect ratio', () => {
    const { result } = renderHook(() => useTesseraGallery(makeProvisionalItems(), OPTIONS))
    fireResize(WIDTH)

    // Item '3' rendered with placeholder AR=1: width ≈ 100
    expect(findItem(result.current.rows, '3')!.width).toBeCloseTo(100)

    // Item '3' loads with real AR=2
    act(() => { result.current.onLoad('3', 200, 100) })

    // After re-layout, '3' is wider than the placeholder (100px).
    // With real AR=2 in a 300px container, the minimum possible width is 150px
    // (height clamped to maxShrink=0.75 → 75px, width=2×75=150).
    expect(findItem(result.current.rows, '3')!.width).toBeGreaterThan(100)
  })

  it('stable zone grows as items in the provisional zone acquire real ratios', () => {
    const { result } = renderHook(() => useTesseraGallery(makeProvisionalItems(), OPTIONS))
    fireResize(WIDTH)

    // Load items 3–5 sequentially (same AR=1, so layout structure unchanged)
    act(() => { result.current.onLoad('3', 100, 100) })
    act(() => { result.current.onLoad('4', 100, 100) })
    act(() => { result.current.onLoad('5', 100, 100) })

    // All items still present
    expect(allKeys(result.current.rows)).toHaveLength(9)
    // Stable zone expanded — rows 0 and 1 are now cleanly committed
    expect(result.current.rows[0].items.map(i => i.item.key)).toEqual(['0', '1', '2'])
    expect(result.current.rows[1].items.map(i => i.item.key)).toEqual(['3', '4', '5'])
  })
})

// ─── onLoad ──────────────────────────────────────────────────────────────────

describe('onLoad', () => {
  it('sets loaded to true for the item', () => {
    const items = KEYS.map(k => makeItem(k))
    const { result } = renderHook(() => useTesseraGallery(items, OPTIONS))
    fireResize(WIDTH)

    expect(findItem(result.current.rows, '0')!.loaded).toBe(false)
    act(() => { result.current.onLoad('0', 100, 100) })
    expect(findItem(result.current.rows, '0')!.loaded).toBe(true)
  })

  it('ignores calls with zero or negative dimensions', () => {
    const items = ['0', '1', '2'].map(k => makeItem(k))
    const { result } = renderHook(() => useTesseraGallery(items, OPTIONS))
    fireResize(WIDTH)

    act(() => { result.current.onLoad('0', 0, 100) })
    act(() => { result.current.onLoad('0', 100, 0) })
    act(() => { result.current.onLoad('0', -1, 100) })

    expect(findItem(result.current.rows, '0')!.loaded).toBe(false)
  })

  it('does not overwrite a pre-known aspect ratio', () => {
    // Pre-known AR=2 should survive an onLoad reporting AR=1
    const items = [makeItem('0', 2), makeItem('1', 1), makeItem('2', 1)]
    const { result } = renderHook(() => useTesseraGallery(items, OPTIONS))
    fireResize(WIDTH)

    const widthBefore = findItem(result.current.rows, '0')!.width

    // onLoad reports a different ratio — pre-known takes precedence
    act(() => { result.current.onLoad('0', 100, 100) }) // AR=1

    expect(findItem(result.current.rows, '0')!.width).toBeCloseTo(widthBefore)
  })

  it('does not trigger a rollback when item had a pre-known aspect ratio', () => {
    // All items have pre-known ratios — no provisional tracking — onLoad should
    // only update the loaded flag, not disturb committed rows.
    const items = KEYS.map(k => makeItem(k, 1))
    const { result } = renderHook(() => useTesseraGallery(items, OPTIONS))
    fireResize(WIDTH)

    const keysBefore = allKeys(result.current.rows)

    act(() => { result.current.onLoad('0', 100, 100) })

    expect(allKeys(result.current.rows)).toEqual(keysBefore)
    expect(findItem(result.current.rows, '0')!.loaded).toBe(true)
  })
})

// ─── onError ─────────────────────────────────────────────────────────────────

describe('onError', () => {
  it('does not set loaded for an errored item', () => {
    const items = ['0', '1', '2'].map(k => makeItem(k))
    const { result } = renderHook(() => useTesseraGallery(items, OPTIONS))
    fireResize(WIDTH)

    act(() => { result.current.onError('0') })

    expect(findItem(result.current.rows, '0')!.loaded).toBe(false)
  })

  it('triggers rollback for a provisionally committed item', () => {
    const items = [
      makeItem('0', 1), makeItem('1', 1), makeItem('2', 1), // stable zone
      makeItem('3'),    makeItem('4'),    makeItem('5'),     // provisional
      makeItem('6'),    makeItem('7'),    makeItem('8'),
    ]
    const { result } = renderHook(() => useTesseraGallery(items, OPTIONS))
    fireResize(WIDTH)

    expect(allKeys(result.current.rows)).toHaveLength(9)

    // Error on a provisional item — triggers rollback, assigns fallback AR=1
    act(() => { result.current.onError('3') })

    // Stable zone unchanged; all items still visible
    expect(result.current.rows[0].items.map(i => i.item.key)).toEqual(['0', '1', '2'])
    expect(allKeys(result.current.rows)).toHaveLength(9)
  })

  it('does not trigger a rollback when item had a pre-known aspect ratio', () => {
    const items = KEYS.map(k => makeItem(k, 1))
    const { result } = renderHook(() => useTesseraGallery(items, OPTIONS))
    fireResize(WIDTH)

    const keysBefore = allKeys(result.current.rows)

    act(() => { result.current.onError('0') })

    expect(allKeys(result.current.rows)).toEqual(keysBefore)
  })
})

// ─── Options and layout ───────────────────────────────────────────────────────

describe('options', () => {
  it('returns the resolved gap', () => {
    const items = ['0', '1', '2'].map(k => makeItem(k, 1))
    const { result } = renderHook(() => useTesseraGallery(items, { rowHeight: 100, gap: 8 }))
    fireResize(WIDTH)

    expect(result.current.gap).toBe(8)
  })

  it('resolves a function-based gap using container width', () => {
    const items = ['0', '1', '2'].map(k => makeItem(k, 1))
    const gap = (w: number) => Math.round(w / 100)
    const { result } = renderHook(() => useTesseraGallery(items, { rowHeight: 100, gap }))
    fireResize(WIDTH)

    expect(result.current.gap).toBe(Math.round(WIDTH / 100))
  })

  it('resets layout when container width changes', () => {
    const items = KEYS.map(k => makeItem(k, 1))
    const { result } = renderHook(() => useTesseraGallery(items, OPTIONS))
    fireResize(WIDTH)

    expect(allKeys(result.current.rows)).toHaveLength(9)

    // Resize to a narrower container — layout resets and recomputes
    fireResize(200) // 2 items per row at AR=1

    expect(allKeys(result.current.rows)).toHaveLength(9)
    // With 200px container and AR=1 items, rows hold 2 items each
    expect(result.current.rows[0].items).toHaveLength(2)
  })

  it('returns rows:[] and gap:0 before container width is observed', () => {
    const items = ['0'].map(k => makeItem(k, 1))
    const { result } = renderHook(() => useTesseraGallery(items, OPTIONS))

    // No fireResize — containerWidth is still 0
    expect(result.current.rows).toHaveLength(0)
    expect(result.current.gap).toBe(0)
  })
})

// ─── Navigation ──────────────────────────────────────────────────────────────

describe('navigation', () => {
  it('returns focusedIndex starting at 0', () => {
    const { result } = renderHook(() => useTesseraGallery([makeItem('0', 1)], OPTIONS))
    expect(result.current.focusedIndex).toBe(0)
  })

  it('handleItemFocus updates focusedIndex', () => {
    const items = KEYS.slice(0, 3).map(k => makeItem(k, 1))
    const { result } = renderHook(() => useTesseraGallery(items, OPTIONS))
    fireResize(WIDTH)
    act(() => { result.current.handleItemFocus(2) })
    expect(result.current.focusedIndex).toBe(2)
  })

  it('returns handleItemKeyDown as a function', () => {
    const { result } = renderHook(() => useTesseraGallery([makeItem('0', 1)], OPTIONS))
    expect(typeof result.current.handleItemKeyDown).toBe('function')
  })
})
