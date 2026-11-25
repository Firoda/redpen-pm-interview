/* Score display components. Always show the numeral; colour is never the only cue.
 * Scale is diverging orange → sand → teal (not a traffic light). Spec: MASTER_PLAN §2.2. */
import type { Score } from '@/domain/types'
import { SCORE_LABEL } from '@/domain/types'
import { cx } from './cx'

export const roundScore = (x: number): Score => Math.min(5, Math.max(1, Math.floor(x + 0.5))) as Score
export const fmtScore = (x: number | undefined | null) => (x == null ? '—' : (Math.floor(x * 10 + 0.5) / 10).toFixed(1))

const fill: Record<Score, string> = { 1: 'bg-score-1', 2: 'bg-score-2', 3: 'bg-score-3', 4: 'bg-score-4', 5: 'bg-score-5' }
const tint: Record<Score, string> = { 1: 'bg-score-1-tint', 2: 'bg-score-2-tint', 3: 'bg-score-3-tint', 4: 'bg-score-4-tint', 5: 'bg-score-5-tint' }
const ink: Record<Score, string> = { 1: 'text-score-1-text', 2: 'text-score-2-text', 3: 'text-score-3-text', 4: 'text-score-4-text', 5: 'text-score-5-text' }

export const scoreFillClass = (x: number) => fill[roundScore(x)]
export const scoreTintClass = (x: number) => tint[roundScore(x)]
export const scoreInkClass = (x: number) => ink[roundScore(x)]
export const scoreVar = (x: number) => `var(--score-${roundScore(x)})`

/** Compact pill: "3.4" or "3 Mixed". */
export function ScorePill({ value, showLabel, size = 'md', className }: { value: number; showLabel?: boolean; size?: 'sm' | 'md'; className?: string }) {
  const r = roundScore(value)
  const isInt = Number.isInteger(value)
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full font-semibold tabular',
        size === 'sm' ? 'h-5 px-1.5 text-caption' : 'h-6 px-2 text-label',
        tint[r], ink[r], className,
      )}
    >
      {isInt ? value : fmtScore(value)}
      {showLabel ? <span className="font-medium opacity-90">{SCORE_LABEL[r]}</span> : null}
    </span>
  )
}

/** Horizontal bar on a fixed 1–5 domain, with an optional hire-bar tick at 4. */
export function ScoreBar({ value, animate = true, hireBar = true, className }: { value: number; animate?: boolean; hireBar?: boolean; className?: string }) {
  const pct = Math.max(0, Math.min(1, value / 5)) * 100
  return (
    <div className={cx('relative h-2 w-full overflow-hidden rounded-xs bg-subtle', className)} role="img" aria-label={`Score ${fmtScore(value)} of 5`}>
      <div className={cx('h-full rounded-xs', fill[roundScore(value)], animate && 'animate-bar')} style={{ width: `${pct}%` }} />
      {hireBar ? <div aria-hidden className="absolute top-0 h-full w-px bg-[var(--text-tertiary)] opacity-50" style={{ left: '80%' }} /> : null}
    </div>
  )
}

/** Five dots — for dense lists. */
export function ScoreDots({ value }: { value: number }) {
  const r = roundScore(value)
  return (
    <span className="inline-flex gap-0.5" aria-label={`${r} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cx('h-1.5 w-1.5 rounded-full', i <= r ? fill[r] : 'bg-subtle shadow-[inset_0_0_0_1px_var(--border)]')} />
      ))}
    </span>
  )
}
