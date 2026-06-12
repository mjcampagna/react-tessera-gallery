import { act, renderHook } from '@testing-library/react'

import { useVirtualWindow } from '../useVirtualWindow'

// ─── Global mocks ─────────────────────────────────────────────────────────────

// Capture the ResizeObserver callback so tests can fire it directly to simulate
// layout shifts (document.documentElement resize) without dispatching DOM events.
let capturedRoCallback: (() => void) | null = null

beforeAll(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('ResizeObserver', class {
    constructor(cb: () => void) { capturedRoCallback = cb }
    observe = vi.fn()
    disconnect = vi.fn()
  })
})

afterEach(() => {
  capturedRoCallback = null
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Must be called outside renderHook callbacks — a new object reference on each
// render would change the containerRef dependency, re-running the effect every
// render and causing an infinite setRange → re-render loop.
function mockRef(rectTop: number) {
  return {
    current: {
      getBoundingClientRect: vi.fn().mockReturnValue({ top: rectTop }),
    } as unknown as HTMLElement,
  }
}

// ─── disabled ────────────────────────────────────────────────────────────────

describe('disabled', () => {
  it('returns null when enabled is false', () => {
    const ref = { current: null }
    const { result } = renderHook(() => useVirtualWindow(ref, false))
    expect(result.current).toBeNull()
  })

  it('returns null when enabled is false even if ref has an element', () => {
    const ref = mockRef(0)
    const { result } = renderHook(() => useVirtualWindow(ref, false))
    expect(result.current).toBeNull()
  })
})

// ─── initial range ────────────────────────────────────────────────────────────

describe('initial range', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true })
  })

  it('returns null when ref has no element', () => {
    const ref = { current: null }
    const { result } = renderHook(() => useVirtualWindow(ref, true))
    expect(result.current).toBeNull()
  })

  it('returns range when gallery is at the top of the page', () => {
    // rect.top=0: gallery top aligns with viewport top (no scroll)
    const ref = mockRef(0)
    const { result } = renderHook(() => useVirtualWindow(ref, true))
    expect(result.current).toEqual({ top: 0, bottom: 600 })
  })

  it('returns container-local range accounting for scroll position', () => {
    // rect.top=-200: gallery top is 200px above the viewport (scrolled down 200px)
    // containerTop = 200, visible range is [200, 800] in container coordinates
    const ref = mockRef(-200)
    const { result } = renderHook(() => useVirtualWindow(ref, true))
    expect(result.current).toEqual({ top: 200, bottom: 800 })
  })
})

// ─── scroll updates ───────────────────────────────────────────────────────────

describe('scroll updates', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true })
  })

  it('updates range when window scrolls', () => {
    const rectTop = { value: 0 }
    const ref = {
      current: {
        getBoundingClientRect: vi.fn(() => ({ top: rectTop.value })),
      } as unknown as HTMLElement,
    }
    const { result } = renderHook(() => useVirtualWindow(ref, true))
    expect(result.current).toEqual({ top: 0, bottom: 600 })

    act(() => {
      rectTop.value = -300
      window.dispatchEvent(new Event('scroll'))
    })

    expect(result.current).toEqual({ top: 300, bottom: 900 })
  })
})

// ─── cleanup ─────────────────────────────────────────────────────────────────

describe('cleanup', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true })
  })

  it('stops updating after unmount', () => {
    const rectTop = { value: 0 }
    const ref = {
      current: {
        getBoundingClientRect: vi.fn(() => ({ top: rectTop.value })),
      } as unknown as HTMLElement,
    }
    const { result, unmount } = renderHook(() => useVirtualWindow(ref, true))
    unmount()

    act(() => {
      rectTop.value = -300
      window.dispatchEvent(new Event('scroll'))
    })

    // Range should remain at the value set before unmount
    expect(result.current).toEqual({ top: 0, bottom: 600 })
  })
})

// ─── layout shift detection ───────────────────────────────────────────────────

describe('layout shift detection (window mode)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true })
  })

  it('updates range when content above shifts gallery position without a scroll event', () => {
    // Simulate: gallery at top of page (rect.top=0), then content above grows 100px,
    // pushing the gallery down (rect.top=100). No scroll event fires — only the
    // document.documentElement ResizeObserver callback triggers the re-measurement.
    const rectTop = { value: 0 }
    const ref = {
      current: {
        getBoundingClientRect: vi.fn(() => ({ top: rectTop.value })),
      } as unknown as HTMLElement,
    }
    const { result } = renderHook(() => useVirtualWindow(ref, true))
    expect(result.current).toEqual({ top: 0, bottom: 600 })

    act(() => {
      rectTop.value = 100
      capturedRoCallback?.()
    })

    // containerTop = -100 (gallery top is 100px below viewport top — fully visible)
    expect(result.current).toEqual({ top: -100, bottom: 500 })
  })
})
