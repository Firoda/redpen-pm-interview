/* "Meera is thinking": three soft dots after 400 ms, "Still thinking" after 5 s. Not a spinner. */
import { useEffect, useState } from 'react'
import { INTERVIEWER_NAME } from '@/config/brand'

export function Dots({ className }: { className?: string }) {
  return (
    <span className={'inline-flex items-center gap-1 ' + (className ?? '')} aria-hidden>
      {[0, 200, 400].map((d) => (
        <span key={d} className="h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)] animate-blink" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  )
}

export function ThinkingDots({ since }: { since: number }) {
  const [phase, setPhase] = useState<'hidden' | 'dots' | 'slow'>('hidden')
  useEffect(() => {
    setPhase('hidden')
    const a = setTimeout(() => setPhase('dots'), 400)
    const b = setTimeout(() => setPhase('slow'), 5000)
    return () => { clearTimeout(a); clearTimeout(b) }
  }, [since])
  if (phase === 'hidden') return <div className="h-[46px]" aria-hidden />
  return (
    <div role="status" aria-live="polite" className="animate-fade">
      <div className="mb-1 text-caption text-secondary">{INTERVIEWER_NAME}</div>
      <div className="flex h-[26px] items-center gap-3">
        <Dots />
        <span className="text-footnote text-tertiary">{phase === 'slow' ? 'Still thinking…' : <span className="sr-only">{INTERVIEWER_NAME} is thinking</span>}</span>
      </div>
    </div>
  )
}
