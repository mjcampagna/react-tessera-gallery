import { useEffect, useRef, useState } from 'react'

import type { ScrollContainerRef } from './types'

export function resolveScrollEl(ref: ScrollContainerRef | undefined): HTMLElement | null {
  if (ref == null) return null
  if ('current' in ref) return ref.current
  return ref
}

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
 *
 * **Requirement:** `scrollContainerRef.current` must be populated when the
 * gallery first mounts. The effect resolves the scroll target once at setup
 * time; if `.current` is null then (e.g. a conditionally rendered ancestor),
 * the listener permanently binds to `window` and scroll events on the
 * container will not update the virtual range.
 */
export function useVirtualWindow(
  containerRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  scrollContainerRef?: ScrollContainerRef,
): { top: number; bottom: number } | null {
  const [range, setRange] = useState<{ top: number; bottom: number } | null>(null)
  const rafIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return

    const update = () => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()

      const sc = resolveScrollEl(scrollContainerRef)
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

    const target = resolveScrollEl(scrollContainerRef) ?? window
    target.addEventListener('scroll', handleScroll, { passive: true })

    let ro: ResizeObserver | null = null
    if (target !== window) {
      ro = new ResizeObserver(update)
      ro.observe(target as HTMLElement)
    } else {
      window.addEventListener('resize', handleScroll, { passive: true })
    }

    return () => {
      target.removeEventListener('scroll', handleScroll)
      if (target === window) window.removeEventListener('resize', handleScroll)
      ro?.disconnect()
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current)
    }
  }, [enabled, containerRef, scrollContainerRef])

  return enabled ? range : null
}
