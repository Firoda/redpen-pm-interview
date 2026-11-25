/* Dimension row: name · reason · pill + bar (hire-bar tick at 4) · expandable evidence quotes.
 * Five rows, fixed order, never re-sorted. Bars fill once on first reveal, 30 ms apart. */
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { DimensionScore, Feedback } from '@/domain/types'
import { DIMENSION_LABEL } from '@/domain/types'
import { cx, fmtScore, ScorePill, scoreFillClass } from '@/ui'
import { QuoteWell } from './Quote'

export function Bar({ value, delay = 0, muted, animate = true, className }: { value: number; delay?: number; muted?: boolean; animate?: boolean; className?: string }) {
  const pct = Math.max(0, Math.min(1, value / 5)) * 100
  return (
    <div className={cx('relative h-2 w-full overflow-hidden rounded-xs bg-subtle', className)} role="img" aria-label={`${fmtScore(value)} of 5`}>
      <div
        className={cx('h-full rounded-xs', muted ? 'bg-[var(--chart-muted)]' : scoreFillClass(value), animate && 'animate-bar')}
        style={{ width: `${pct}%`, animationDelay: animate ? `${delay}ms` : undefined }}
      />
      <div aria-hidden className="absolute top-0 h-full w-px bg-[var(--text-tertiary)] opacity-60" style={{ left: '80%' }} />
    </div>
  )
}

function capNote(fb: Feedback, d: DimensionScore): string | null {
  const caps = fb.capsApplied.filter((c) => c.dimension === d.dimension)
  if (!caps.length) return null
  const c = caps[caps.length - 1]
  const why = c.cap.replace(/^[A-Z]\d+\s*[:\-–—]?\s*/, '').trim()
  const descriptive = why.includes(' ')
  return `Capped at ${c.to}${descriptive ? `: ${why.charAt(0).toLowerCase()}${why.slice(1)}` : ''}`
}

export function DimensionRow({ d, fb, index }: { d: DimensionScore; fb: Feedback; index: number }) {
  const [open, setOpen] = useState(false)
  const cap = capNote(fb, d)
  const evidence = d.evidence.filter((e) => e.quote && e.quote.trim())
  return (
    <div id={`dim-${d.dimension}`} className="border-b border-border py-4 last:border-b-0">
      <div className="grid grid-cols-[148px_minmax(0,1fr)_200px] items-start gap-x-5 max-[760px]:grid-cols-1 max-[760px]:gap-y-2">
        <div className="pt-px text-headline text-primary">{DIMENSION_LABEL[d.dimension]}</div>
        <div className="min-w-0">
          <p className="text-body text-primary">{d.reason}</p>
          {cap ? <p className="mt-1 text-footnote text-nudge-text">{cap}</p> : null}
          {evidence.length ? (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="mt-1.5 inline-flex items-center gap-1 rounded-sm text-label text-secondary hover:text-primary"
            >
              Evidence
              <ChevronDown size={14} strokeWidth={2} className={cx('transition-transform duration-200 ease-standard', open && 'rotate-180')} />
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-3 pt-px">
          <ScorePill value={d.score} showLabel size="sm" className="shrink-0" />
          <Bar value={d.score} delay={120 + index * 30} className="flex-1" />
        </div>
      </div>
      {open ? (
        <div className="mt-3 flex flex-col gap-3 pl-[168px] animate-rise max-[760px]:pl-0">
          {evidence.map((e, i) => <QuoteWell key={i} text={e.quote} turnId={e.turnId} />)}
        </div>
      ) : null}
    </div>
  )
}
