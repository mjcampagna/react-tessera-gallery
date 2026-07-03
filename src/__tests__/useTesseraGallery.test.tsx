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
  it('renders with placeholder aspect ratio before onLoad', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([knownItem('a', 1), unknownItem('b')], { rowHeight: 100 }),
    )
    act(() => fireResize(200))
    const total = result.current.rows.reduce((s, r) => s + r.items.length, 0)
    expect(total).toBe(2)
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
    // Item still renders with placeholder ar; bad onLoad does not mark it loaded
    expect(result.current.rows[0].items[0].loaded).toBe(false)
  })

  it('ignores zero naturalHeight', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([unknownItem('a')], { rowHeight: 100 }),
    )
    act(() => fireResize(100))
    act(() => result.current.onLoad('a', 100, 0))
    // Item still renders with placeholder ar; bad onLoad does not mark it loaded
    expect(result.current.rows[0].items[0].loaded).toBe(false)
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

// ─── onError ─────────────────────────────────────────────────────────────────

describe('onError', () => {
  it('renders the item with fallback ar=1 and loaded=false', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([unknownItem('a')], { rowHeight: 100 }),
    )
    act(() => fireResize(100))
    act(() => result.current.onError('a'))
    expect(result.current.rows[0].items[0].loaded).toBe(false)
    expect(result.current.rows[0].items[0].width).toBeCloseTo(100)
  })

  it('allows subsequent items to commit past an errored item', () => {
    // Two items: 'a' errors, 'b' has known ar. 'b' should still appear in layout.
    const { result } = renderHook(() =>
      useTesseraGallery([unknownItem('a'), knownItem('b', 1)], { rowHeight: 100 }),
    )
    act(() => fireResize(200))
    act(() => result.current.onError('a'))
    const total = result.current.rows.reduce((s, r) => s + r.items.length, 0)
    expect(total).toBe(2)
  })

  it('is a no-op if aspect ratio is already cached', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([knownItem('a', 2)], { rowHeight: 100 }),
    )
    act(() => fireResize(200))
    const widthBefore = result.current.rows[0].items[0].width
    act(() => result.current.onError('a'))
    // Pre-known ar=2 is preserved; width unchanged
    expect(result.current.rows[0].items[0].width).toBeCloseTo(widthBefore)
  })
})

// ─── getItemHandlers ───────────────────────────────────────────────────────────

describe('getItemHandlers', () => {
  it('returns the same handlers object for a key across renders', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([knownItem('a', 1), knownItem('b', 1)], { rowHeight: 100 }),
    )
    act(() => fireResize(200))
    const first = result.current.getItemHandlers('a')

    // Trigger a re-render unrelated to item 'a' — handlers must stay referentially stable.
    act(() => fireResize(150))
    const second = result.current.getItemHandlers('a')

    expect(second).toBe(first)
    expect(second.onLoad).toBe(first.onLoad)
    expect(second.onError).toBe(first.onError)
  })

  it('returns different handlers for different keys', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([knownItem('a', 1), knownItem('b', 1)], { rowHeight: 100 }),
    )
    act(() => fireResize(200))
    expect(result.current.getItemHandlers('a')).not.toBe(result.current.getItemHandlers('b'))
  })
})

// ─── skipErrors ──────────────────────────────────────────────────────────────

describe('skipErrors', () => {
  it('omits errored items from layout', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([unknownItem('a'), knownItem('b', 1)], { rowHeight: 100, skipErrors: true }),
    )
    act(() => fireResize(200))
    act(() => result.current.onError('a'))
    const keys = result.current.rows.flatMap(r => r.items.map(i => i.item.key))
    expect(keys).toEqual(['b'])
  })

  it('omits errored pre-known-ar items from layout', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([knownItem('a', 2), knownItem('b', 1)], { rowHeight: 100, skipErrors: true }),
    )
    act(() => fireResize(200))
    act(() => result.current.onError('a'))
    const keys = result.current.rows.flatMap(r => r.items.map(i => i.item.key))
    expect(keys).toEqual(['b'])
  })

  it('renders errored items normally when skipErrors is false', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([unknownItem('a'), knownItem('b', 1)], { rowHeight: 100, skipErrors: false }),
    )
    act(() => fireResize(200))
    act(() => result.current.onError('a'))
    const keys = result.current.rows.flatMap(r => r.items.map(i => i.item.key))
    expect(keys).toContain('a')
    expect(keys).toContain('b')
  })
})

// ─── onRenderMetricsChange ────────────────────────────────────────────────────

describe('onRenderMetricsChange', () => {
  it('fires with correct metrics after resize', () => {
    const onRenderMetricsChange = vi.fn()
    const items = [
      knownItem('a', 1), knownItem('b', 1), knownItem('c', 1),
      knownItem('d', 1), knownItem('e', 1),
    ]
    renderHook(() =>
      useTesseraGallery(items, { rowHeight: 100, onRenderMetricsChange }),
    )
    act(() => fireResize(200))
    const call = onRenderMetricsChange.mock.calls.at(-1)?.[0]
    expect(call.virtualized).toBe(false)
    expect(call.totalItemCount).toBe(5)
    expect(call.mountedItemCount).toBe(call.totalItemCount)
    expect(call.mountedRowCount).toBe(call.totalRowCount)
    expect(call.firstMountedRowIndex).toBe(0)
    expect(call.lastMountedRowIndex).toBe(call.totalRowCount - 1)
  })

  it('does not fire again when rows are stable', () => {
    const onRenderMetricsChange = vi.fn()
    const items = [knownItem('a', 1)]
    const { rerender } = renderHook(() =>
      useTesseraGallery(items, { rowHeight: 100, onRenderMetricsChange }),
    )
    act(() => fireResize(100))
    const countAfterResize = onRenderMetricsChange.mock.calls.length
    rerender()
    expect(onRenderMetricsChange.mock.calls.length).toBe(countAfterResize)
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
