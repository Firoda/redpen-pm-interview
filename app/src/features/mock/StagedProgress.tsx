/* Three honest stages with a status glyph: pending ring → rotating arc → check. No percentages. */
import { Check } from 'lucide-react'
import { cx } from '@/ui'

export type StageState = 'pending' | 'active' | 'done'

function Glyph({ state }: { state: StageState }) {
  if (state === 'done') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--text-primary)] text-[var(--bg-surface)] animate-pop" aria-hidden>
        <Check size={12} strokeWidth={3} />
      </span>
    )
  }
  if (state === 'active') {
    return (
      <span className="relative h-5 w-5" aria-hidden>
        <span className="absolute inset-0 rounded-full shadow-[inset_0_0_0_2px_var(--border)]" />
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--accent)]" style={{ animationDuration: '1.1s' }} />
      </span>
    )
  }
  return <span className="h-5 w-5 rounded-full shadow-[inset_0_0_0_1.5px_var(--border-strong)]" aria-hidden />
}

export function StagedProgress({ labels, active, allDone, className }: { labels: string[]; active: number; allDone: boolean; className?: string }) {
  return (
    <ol className={cx('flex flex-col gap-4', className)} aria-live="polite">
      {labels.map((l, i) => {
        const state: StageState = allDone || i < active ? 'done' : i === active ? 'active' : 'pending'
        return (
          <li key={l} className="flex items-center gap-3">
            <Glyph state={state} />
            <span className={cx('text-body transition-colors duration-200', state === 'pending' ? 'text-tertiary' : 'text-primary')}>
              {l}
            </span>
            <span className="sr-only">{state === 'done' ? 'done' : state === 'active' ? 'in progress' : 'waiting'}</span>
          </li>
        )
      })}
    </ol>
  )
}
