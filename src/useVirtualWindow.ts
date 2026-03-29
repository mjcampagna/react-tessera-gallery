import { useEffect, useRef, useState } from 'react'

/**
 * Tracks the visible pixel range within a gallery container relative to its
 * top edge. Returns `{ top, bottom }` where both values are in container-local
 * coordinates (i.e. scroll-adjusted relative to the container's top).
 *
 * When `enabled` is false, no scroll listener is attached and the hook returns
 * null. The hook is always called (Rules of Hooks), but does nothing.
 *
 * When `scrollContainerRef` is provided, the scroll listener is attached to
 * that element instead of `window`. Use this when the gallery lives inside a
 * scrollable div rather than the page itself.
 */
export function useVirtualWindow(
  containerRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  scrollContainerRef?: React.RefObject<HTMLElement | null>,
): { top: number; bottom: number } | null {
  const [range, setRange] = useState<{ top: number; bottom: number } | null>(null)
  const rafIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return

    const update = () => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()

      const sc = scrollContainerRef?.current
      if (sc) {
        const scRect = sc.getBoundingClientRect()
        const containerTop = 0 - (rect.top - scRect.top)
        setRange({ top: containerTop, bottom: containerTop + sc.clientHeight })
      } else {
        const containerTop = 0 - rect.top
        setRange({ top: containerTop, bottom: containerTop + window.innerHeight })
      }
    }

    const handleScroll = () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = requestAnimationFrame(() => {
        update()
        rafIdRef.current = null
      })
    }

    // Initial measurement
    update()

    const target = scrollContainerRef?.current ?? window
    target.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      target.removeEventListener('scroll', handleScroll)
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current)
    }
  }, [enabled, containerRef, scrollContainerRef])

  return enabled ? range : null
}
