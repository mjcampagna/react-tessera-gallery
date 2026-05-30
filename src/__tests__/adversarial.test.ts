import { act, renderHook } from '@testing-library/react'

import { useTesseraGallery } from '../useTesseraGallery'
import type { GalleryItem, ResolvedRow } from '../types'

let fireResize: (width: number) => void = () => {}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0 })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
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

function item(key: string, aspectRatio?: number): GalleryItem<{ key: string }> {
  return aspectRatio !== undefined ? { key, aspectRatio } : { key }
}

function allCells(rows: ResolvedRow<{ key: string }>[]) {
  return rows.flatMap(row => row.items)
}

describe('useTesseraGallery adversarial inputs', () => {
  it('ignores invalid pre-known aspect ratios and keeps layout dimensions finite', () => {
    const { result } = renderHook(() =>
      useTesseraGallery(
        [item('a', Number.NaN), item('b', Number.POSITIVE_INFINITY), item('c', -1)],
        { rowHeight: 100 },
      ),
    )

    fireResize(300)

    expect(allCells(result.current.rows)).toHaveLength(3)
    for (const cell of allCells(result.current.rows)) {
      expect(Number.isFinite(cell.width)).toBe(true)
      expect(Number.isFinite(cell.height)).toBe(true)
      expect(cell.width).toBeGreaterThanOrEqual(0)
      expect(cell.height).toBeGreaterThanOrEqual(0)
    }
  })

  it('ignores non-finite load dimensions instead of marking the item loaded', () => {
    const { result } = renderHook(() =>
      useTesseraGallery([item('a')], { rowHeight: 100 }),
    )

    fireResize(100)
    act(() => { result.current.onLoad('a', Number.POSITIVE_INFINITY, 100) })

    expect(result.current.rows[0].items[0].loaded).toBe(false)
  })

  it('clamps invalid responsive gaps to zero', () => {
    const { result } = renderHook(() =>
      useTesseraGallery(
        [item('a', 1), item('b', 1)],
        { rowHeight: 100, gap: () => Number.NaN },
      ),
    )

    fireResize(200)

    expect(result.current.gap).toBe(0)
    expect(result.current.rows[0].items[0].width + result.current.rows[0].items[1].width).toBe(200)
  })

  it('returns no rows when a responsive rowHeight resolves to an invalid value', () => {
    const { result } = renderHook(() =>
      useTesseraGallery(
        [item('a', 1), item('b', 1)],
        { rowHeight: () => Number.NaN },
      ),
    )

    fireResize(200)

    expect(result.current.rows).toEqual([])
  })
})
