/* Fires once when the fixes section has been ≥ 50% visible (or fills half the viewport) for ≥ 2 s.
 * This is what makes a mock "reviewed" — the North Star unit. */
import { useEffect, useRef, type RefObject } from 'react'

const fired = new Set<string>() // survives StrictMode double effects and remounts

export function useFixesViewed(ref: RefObject<HTMLElement | null>, feedbackId: string | null, alreadyViewed: boolean, onViewed: () => void) {
  const cb = useRef(onViewed)
  cb.current = onViewed
  useEffect(() => {
    const el = ref.current
    if (!el || !feedbackId || alreadyViewed || fired.has(feedbackId)) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const thresholds = Array.from({ length: 21 }, (_, i) => i / 20)
    const io = new IntersectionObserver(([e]) => {
      const visible = e.isIntersecting && (e.intersectionRatio >= 0.5 || e.intersectionRect.height >= window.innerHeight * 0.5)
      if (visible && !timer) {
        timer = setTimeout(() => {
          if (fired.has(feedbackId)) return
          fired.add(feedbackId)
          cb.current()
          io.disconnect()
        }, 2000)
      } else if (!visible && timer) {
        clearTimeout(timer)
        timer = null
      }
    }, { threshold: thresholds })
    io.observe(el)
    return () => { io.disconnect(); if (timer) clearTimeout(timer) }
  }, [ref, feedbackId, alreadyViewed])
}
