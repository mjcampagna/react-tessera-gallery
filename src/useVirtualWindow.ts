import { useEffect, useRef, useState } from 'react'

/**
 * Tracks the visible pixel range within a gallery container relative to its
 * top edge. Returns `{ top, bottom }` where both values are in container-local
 * coordinates (i.e. scroll-adjusted relative to the container's top).
 *
 * When `enabled` is false, no scroll listener is attached and the hook returns
 * null. The hook is always called (Rules of Hooks), but does nothing.
 */
export function useVirtualWindow(
  containerRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
): { top: number; bottom: number } | null {
  const [range, setRange] = useState<{ top: number; bottom: number } | null>(null)
  const rafIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return

    const update = () => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      // Convert viewport-relative rect to container-local coordinates
      const containerTop = 0 - rect.top
      setRange({
        top: containerTop,
        bottom: containerTop + viewportHeight,
      })
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

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current)
    }
  }, [enabled, containerRef])

  return enabled ? range : null
}
