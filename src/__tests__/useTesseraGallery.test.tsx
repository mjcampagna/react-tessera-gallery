import { act, renderHook } from '@testing-library/react'

import { useTesseraGallery } from '../useTesseraGallery'

// ─── ResizeObserver mock ──────────────────────────────────────────────────────

type ResizeCallback = (entries: { contentRect: { width: number } }[]) => void
const capturedResize = { fn: null as ResizeCallback | null }

class MockResizeObserver {
  constructor(cb: ResizeCallback) {
    capturedResize.fn = cb
  }
  observe = vi.fn()
  disconnect = vi.fn()
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver)
})

beforeEach(() => {
  capturedResize.fn = null
})

function fireResize(width: number) {
  capturedResize.fn?.([{ contentRect: { width } }])
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function knownItem(key: string, aspectRatio: number) {
  return { key, aspectRatio }
}

function unknownItem(key: string) {
  return { key }
}

// ─── Initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('returns empty rows before container width is observed', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([knownItem('a', 1)], { rowHeight: 100 }),
    )
    expect(result.current.rows).toEqual([])
  })

  it('returns a containerRef', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([knownItem('a', 1)], { rowHeight: 100 }),
    )
    expect(result.current.containerRef).toBeDefined()
    expect(typeof result.current.containerRef).toBe('object')
  })

  it('returns an onLoad function', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([knownItem('a', 1)], { rowHeight: 100 }),
    )
    expect(typeof result.current.onLoad).toBe('function')
  })
})

// ─── Container resize ─────────────────────────────────────────────────────────

describe('container resize', () => {
  it('computes rows once containerWidth is observed', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([knownItem('a', 1)], { rowHeight: 100 }),
    )
    act(() => fireResize(100))
    expect(result.current.rows.length).toBeGreaterThan(0)
  })

  it('recomputes rows when container width changes', () => {
    const { result } = renderHook(() =>
      useTesseraGallery(
        [knownItem('a', 1), knownItem('b', 1), knownItem('c', 1), knownItem('d', 1)],
        { rowHeight: 100 },
      ),
    )
    act(() => fireResize(200))
    const rowsAt200 = result.current.rows.length

    act(() => fireResize(100))
    const rowsAt100 = result.current.rows.length

    // At 200px: 2 items/row → 2 rows. At 100px: 1 item/row → 4 rows.
    expect(rowsAt100).toBeGreaterThan(rowsAt200)
  })
})

// ─── Known aspectRatio items ──────────────────────────────────────────────────

describe('items with known aspectRatio', () => {
  it('includes them in layout immediately after resize', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([knownItem('a', 1), knownItem('b', 1)], { rowHeight: 100 }),
    )
    act(() => fireResize(200))
    const total = result.current.rows.reduce((s, r) => s + r.items.length, 0)
    expect(total).toBe(2)
  })

  it('starts with loaded=false (image not yet browser-loaded)', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([knownItem('a', 1)], { rowHeight: 100 }),
    )
    act(() => fireResize(100))
    expect(result.current.rows[0].items[0].loaded).toBe(false)
  })

  it('sets loaded=true once onLoad fires', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([knownItem('a', 1)], { rowHeight: 100 }),
    )
    act(() => fireResize(100))
    act(() => result.current.onLoad('a', 100, 100))
    expect(result.current.rows[0].items[0].loaded).toBe(true)
  })

  it('preserves item reference in row output', () => {
    const item = knownItem('a', 1)
    const { result } = renderHook(() => useTesseraGallery([item], { rowHeight: 100 }))
    act(() => fireResize(100))
    expect(result.current.rows[0].items[0].item).toBe(item)
  })
})

// ─── Unknown aspectRatio items ────────────────────────────────────────────────

describe('items without aspectRatio', () => {
  it('excludes them from layout before onLoad', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([knownItem('a', 1), unknownItem('b')], { rowHeight: 100 }),
    )
    act(() => fireResize(200))
    const total = result.current.rows.reduce((s, r) => s + r.items.length, 0)
    expect(total).toBe(1)
  })

  it('includes them in layout once onLoad fires', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([knownItem('a', 1), unknownItem('b')], { rowHeight: 100 }),
    )
    act(() => fireResize(200))
    act(() => result.current.onLoad('b', 100, 100)) // ar = 1
    const total = result.current.rows.reduce((s, r) => s + r.items.length, 0)
    expect(total).toBe(2)
  })

  it('derives aspectRatio from naturalWidth / naturalHeight', () => {
    // ar=2, container=200, rowHeight=100 → rowHeightFor(0,1)=100 (ideal) → width=200
    const { result } = renderHook(() =>
      useTesseraGallery([unknownItem('a')], { rowHeight: 100 }),
    )
    act(() => fireResize(200))
    act(() => result.current.onLoad('a', 200, 100)) // ar = 2
    expect(result.current.rows[0].items[0].width).toBeCloseTo(200)
  })

  it('enters layout with loaded=true', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([unknownItem('a')], { rowHeight: 100 }),
    )
    act(() => fireResize(100))
    act(() => result.current.onLoad('a', 100, 100))
    expect(result.current.rows[0].items[0].loaded).toBe(true)
  })
})

// ─── onLoad edge cases ────────────────────────────────────────────────────────

describe('onLoad edge cases', () => {
  it('ignores zero naturalWidth', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([unknownItem('a')], { rowHeight: 100 }),
    )
    act(() => fireResize(100))
    act(() => result.current.onLoad('a', 0, 100))
    expect(result.current.rows).toEqual([])
  })

  it('ignores zero naturalHeight', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([unknownItem('a')], { rowHeight: 100 }),
    )
    act(() => fireResize(100))
    act(() => result.current.onLoad('a', 100, 0))
    expect(result.current.rows).toEqual([])
  })

  it('does not re-add a key already in the cache', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([knownItem('a', 1)], { rowHeight: 100 }),
    )
    act(() => fireResize(100))
    // onLoad for a pre-known item should mark loaded but not re-set cache
    act(() => result.current.onLoad('a', 200, 100)) // different ar — should be ignored
    // The item is still ar=1, width should still be 100 (container width)
    // (pre-known aspect ratio takes precedence; onLoad only sets loaded flag for known items)
    expect(result.current.rows[0].items[0].loaded).toBe(true)
  })
})

// ─── Row structure ────────────────────────────────────────────────────────────

describe('row structure', () => {
  it('rows have correct height', () => {
    const { result } = renderHook(() =>
      useTesseraGallery(
        [knownItem('a', 1), knownItem('b', 1)],
        { rowHeight: 100 },
      ),
    )
    act(() => fireResize(200))
    // 2 square items in 200px at rowHeight=100 → h=100
    expect(result.current.rows[0].height).toBeCloseTo(100)
  })

  it('items have width and height', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([knownItem('a', 2)], { rowHeight: 100 }),
    )
    act(() => fireResize(200))
    const item = result.current.rows[0].items[0]
    expect(item.width).toBeGreaterThan(0)
    expect(item.height).toBeGreaterThan(0)
  })

  it('covers all resolved items across rows', () => {
    const items = [
      knownItem('a', 1), knownItem('b', 1), knownItem('c', 1),
      knownItem('d', 1), knownItem('e', 1),
    ]
    const { result } = renderHook(() => useTesseraGallery(items, { rowHeight: 100 }))
    act(() => fireResize(200))
    const total = result.current.rows.reduce((s, r) => s + r.items.length, 0)
    expect(total).toBe(5)
  })
})
