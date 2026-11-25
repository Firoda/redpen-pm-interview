/* Word-by-word reveal for Meera's newest line (25 ms per word, CSS only). Static text when not animating. */
import { memo } from 'react'

export const RevealText = memo(function RevealText({ text, animate, msPerWord = 25, delay = 0 }: { text: string; animate: boolean; msPerWord?: number; delay?: number }) {
  if (!animate) return <>{text}</>
  const parts = text.split(/(\s+)/)
  let w = 0
  return (
    <>
      {parts.map((p, i) =>
        /^\s+$/.test(p) || p === ''
          ? p
          : <span key={i} className="animate-word" style={{ animationDelay: `${delay + w++ * msPerWord}ms` }}>{p}</span>,
      )}
    </>
  )
})

/** Milliseconds a reveal takes, so callers can wait for it or chain the next line. */
export const revealDuration = (text: string, msPerWord = 25) => text.trim().split(/\s+/).length * msPerWord + 180
