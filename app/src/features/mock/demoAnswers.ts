/* Demo ghost-fill: prepared answers per question and slot (index 0 = main, k = follow-up k). */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEMO_ANSWERS } from '@/content/fixtures'

export function getDemoAnswer(questionId: string, slot: number): string | null {
  const list = DEMO_ANSWERS[questionId]
  if (!list || !list.length) return null
  return list[slot] ?? null
}

/** Types `full` into a field at a natural pace (~35 chars/s, short pauses after punctuation). */
export function useGhostTyper(setValue: (v: string) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [typing, setTyping] = useState(false)
  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setTyping(false)
  }, [])
  const start = useCallback((full: string) => {
    stop()
    setTyping(true)
    let i = 0
    const step = () => {
      i = Math.min(full.length, i + 1 + (Math.random() < 0.25 ? 1 : 0))
      setValue(full.slice(0, i))
      if (i >= full.length) { timer.current = null; setTyping(false); return }
      const ch = full[i - 1]
      const delay = /[.,;:?]/.test(ch) ? 140 + Math.random() * 120 : 1000 / 35 + (Math.random() * 18 - 9)
      timer.current = setTimeout(step, delay)
    }
    step()
  }, [setValue, stop])
  useEffect(() => stop, [stop])
  return useMemo(() => ({ start, stop, typing }), [start, stop, typing])
}
