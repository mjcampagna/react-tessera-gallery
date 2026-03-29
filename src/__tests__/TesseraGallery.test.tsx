import { act, render, screen } from '@testing-library/react'

import { TesseraGallery } from '../TesseraGallery'
import type { GalleryItem } from '../types'

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
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

beforeEach(() => {
  capturedResize.fn = null
})

function fireResize(width: number) {
  capturedResize.fn?.([{ contentRect: { width } }])
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Photo = GalleryItem<{ src: string }>

function photo(key: string, aspectRatio: number): Photo {
  return { key, src: `/${key}.jpg`, aspectRatio }
}

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('rendering', () => {
  it('renders without crashing', () => {
    render(
      <TesseraGallery
        items={[photo('a', 1)]}
        rowHeight={100}
        renderItem={(item, { width, height }) => (
          <img key={item.key} src={item.src} width={width} height={height} alt="" />
        )}
      />,
    )
  })

  it('renders no items before container width is observed', () => {
    render(
      <TesseraGallery
        items={[photo('a', 1)]}
        rowHeight={100}
        renderItem={(item, { width, height }) => (
          <img key={item.key} src={item.src} width={width} height={height} data-testid="img" alt="" />
        )}
      />,
    )
    expect(screen.queryAllByTestId('img')).toHaveLength(0)
  })

  it('renders items after container width is observed', () => {
    render(
      <TesseraGallery
        items={[photo('a', 1), photo('b', 1)]}
        rowHeight={100}
        renderItem={(item, { width, height }) => (
          <img key={item.key} src={item.src} width={width} height={height} data-testid="img" alt="" />
        )}
      />,
    )
    act(() => fireResize(200))
    expect(screen.getAllByTestId('img')).toHaveLength(2)
  })

  it('renders all items across rows', () => {
    const items = [photo('a', 1), photo('b', 1), photo('c', 1), photo('d', 1)]
    render(
      <TesseraGallery
        items={items}
        rowHeight={100}
        renderItem={(item, { width, height }) => (
          <img key={item.key} src={item.src} width={width} height={height} data-testid="img" alt="" />
        )}
      />,
    )
    act(() => fireResize(200))
    expect(screen.getAllByTestId('img')).toHaveLength(4)
  })
})

// ─── Layout values ────────────────────────────────────────────────────────────

describe('layout values passed to renderItem', () => {
  it('passes correct width and height', () => {
    const received: { width: number; height: number }[] = []
    render(
      <TesseraGallery
        items={[photo('a', 1)]}
        rowHeight={100}
        renderItem={(item, layout) => {
          received.push({ width: layout.width, height: layout.height })
          return <img key={item.key} src={item.src} alt="" />
        }}
      />,
    )
    act(() => fireResize(100))
    // Single square item in 100px container at rowHeight=100
    expect(received.at(-1)?.height).toBeCloseTo(100)
    expect(received.at(-1)?.width).toBeCloseTo(100)
  })

  it('passes loaded=false for pre-known items before onLoad', () => {
    const loaded: boolean[] = []
    render(
      <TesseraGallery
        items={[photo('a', 1)]}
        rowHeight={100}
        renderItem={(item, layout) => {
          loaded.push(layout.loaded)
          return <img key={item.key} src={item.src} alt="" />
        }}
      />,
    )
    act(() => fireResize(100))
    expect(loaded.at(-1)).toBe(false)
  })
})

// ─── onLoad handler ───────────────────────────────────────────────────────────

describe('onLoad handler', () => {
  it('is passed as third argument to renderItem', () => {
    let receivedOnLoad: unknown
    render(
      <TesseraGallery
        items={[photo('a', 1)]}
        rowHeight={100}
        renderItem={(item, _layout, handlers) => {
          receivedOnLoad = handlers.onLoad
          return <img key={item.key} src={item.src} alt="" />
        }}
      />,
    )
    act(() => fireResize(100))
    expect(typeof receivedOnLoad).toBe('function')
  })

  it('calling onLoad marks item as loaded', () => {
    const loaded: boolean[] = []
    render(
      <TesseraGallery
        items={[photo('a', 1)]}
        rowHeight={100}
        renderItem={(item, layout, handlers) => {
          loaded.push(layout.loaded)
          return (
            <img
              key={item.key}
              src={item.src}
              data-testid="img"
              alt=""
              onLoad={handlers.onLoad}
            />
          )
        }}
      />,
    )
    act(() => fireResize(100))
    expect(loaded.at(-1)).toBe(false)

    // Simulate img.onLoad with naturalWidth/naturalHeight
    const img = screen.getByTestId('img') as HTMLImageElement
    Object.defineProperty(img, 'naturalWidth', { value: 100, configurable: true })
    Object.defineProperty(img, 'naturalHeight', { value: 100, configurable: true })
    act(() => img.dispatchEvent(new Event('load')))

    expect(loaded.at(-1)).toBe(true)
  })
})

// ─── Gap ─────────────────────────────────────────────────────────────────────

describe('gap', () => {
  it('passes gap to layout: item widths + gaps equal containerWidth', () => {
    // 2 square items, 210px container, gap=10 → rowHeight=(210-10)/2=100
    // item widths should each be 100, sum+gap = 100+100+10 = 210
    const widths: number[] = []
    render(
      <TesseraGallery
        items={[photo('a', 1), photo('b', 1)]}
        rowHeight={100}
        gap={10}
        renderItem={(item, { width, height }) => {
          widths.push(width)
          return <img key={item.key} src={item.src} width={width} height={height} alt="" />
        }}
      />,
    )
    act(() => fireResize(210))
    const lastTwo = widths.slice(-2)
    expect(lastTwo[0] + lastTwo[1] + 10).toBeCloseTo(210)
  })
})

// ─── lastRow alignment ────────────────────────────────────────────────────────

describe('lastRow alignment', () => {
  function renderGallery(lastRow: 'left' | 'center' | 'right') {
    const { container } = render(
      <TesseraGallery
        items={[photo('a', 1), photo('b', 1), photo('c', 1)]}
        rowHeight={100}
        lastRow={lastRow}
        renderItem={(item, { width, height }) => (
          <img key={item.key} src={item.src} width={width} height={height} alt="" />
        )}
      />,
    )
    act(() => fireResize(200))
    // Last row is the second div child of the container
    const rows = container.querySelectorAll(':scope > div > div')
    return rows[rows.length - 1] as HTMLElement
  }

  it("'left': last row uses flex-start", () => {
    expect(renderGallery('left').style.justifyContent).toBe('flex-start')
  })

  it("'center': last row uses center", () => {
    expect(renderGallery('center').style.justifyContent).toBe('center')
  })

  it("'right': last row uses flex-end", () => {
    expect(renderGallery('right').style.justifyContent).toBe('flex-end')
  })
})

// ─── virtualization ───────────────────────────────────────────────────────────

describe('virtualization', () => {
  // Setup: 10 square items, rowHeight=100, no gap, container=100px
  // → 10 rows × 100px = 1000px total height
  // OVERSCAN=300, innerHeight=100 → visibleBottom=400 → rows 0–3 visible initially (4 items)

  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { value: 100, configurable: true })
  })

  function makeItems(count: number) {
    return Array.from({ length: count }, (_, i) => photo(`${i}`, 1))
  }

  it('renders all items when virtualize is not set', () => {
    render(
      <TesseraGallery
        items={makeItems(10)}
        rowHeight={100}
        renderItem={(item, { width, height }) => (
          <img key={item.key} src={item.src} width={width} height={height} data-testid="img" alt="" />
        )}
      />,
    )
    act(() => fireResize(100))
    expect(screen.getAllByTestId('img')).toHaveLength(10)
  })

  it('renders only rows within the visible window + overscan', () => {
    // visibleBottom = innerHeight(100) + OVERSCAN(300) = 400 → rows 0–3 visible
    render(
      <TesseraGallery
        items={makeItems(10)}
        rowHeight={100}
        virtualize
        renderItem={(item, { width, height }) => (
          <img key={item.key} src={item.src} width={width} height={height} data-testid="img" alt="" />
        )}
      />,
    )
    act(() => fireResize(100))
    expect(screen.getAllByTestId('img')).toHaveLength(4)
  })

  it('renders a bottom spacer for off-screen rows below', () => {
    // Rows 0–3 visible (400px used), rows 4–9 off-screen → bottom spacer = 600px
    const { container } = render(
      <TesseraGallery
        items={makeItems(10)}
        rowHeight={100}
        virtualize
        renderItem={(item, { width, height }) => (
          <img key={item.key} src={item.src} width={width} height={height} alt="" />
        )}
      />,
    )
    act(() => fireResize(100))
    const outerDiv = container.firstChild as HTMLElement
    const spacers = Array.from(outerDiv.children).filter(
      el => el.children.length === 0,
    ) as HTMLElement[]
    expect(spacers).toHaveLength(1)
    expect(spacers[0].style.height).toBe('600px')
  })

  it('updates visible rows when scrolled', () => {
    const { container } = render(
      <TesseraGallery
        items={makeItems(10)}
        rowHeight={100}
        virtualize
        renderItem={(item, { width, height }) => (
          <img key={item.key} src={item.src} width={width} height={height} data-testid="img" alt="" />
        )}
      />,
    )
    act(() => fireResize(100))
    expect(screen.getAllByTestId('img')).toHaveLength(4)

    // Scroll down 500px: rect.top=-500 → containerTop=500
    // visibleTop=200, visibleBottom=900 → rows 2–8 visible (7 items)
    const outerDiv = container.firstChild as HTMLElement
    outerDiv.getBoundingClientRect = vi.fn().mockReturnValue({ top: -500 })
    act(() => window.dispatchEvent(new Event('scroll')))

    expect(screen.getAllByTestId('img')).toHaveLength(7)
  })

  it('renders top and bottom spacers when scrolled past the first row', () => {
    // After scroll: rows 2–8 visible → top spacer=200px (rows 0–1), bottom spacer=100px (row 9)
    const { container } = render(
      <TesseraGallery
        items={makeItems(10)}
        rowHeight={100}
        virtualize
        renderItem={(item, { width, height }) => (
          <img key={item.key} src={item.src} width={width} height={height} alt="" />
        )}
      />,
    )
    act(() => fireResize(100))
    const outerDiv = container.firstChild as HTMLElement
    outerDiv.getBoundingClientRect = vi.fn().mockReturnValue({ top: -500 })
    act(() => window.dispatchEvent(new Event('scroll')))

    const spacers = Array.from(outerDiv.children).filter(
      el => el.children.length === 0,
    ) as HTMLElement[]
    expect(spacers).toHaveLength(2)
    expect(spacers[0].style.height).toBe('200px')
    expect(spacers[1].style.height).toBe('100px')
  })
})
