/* The candidate's own words: serif italic in a --bg-subtle well with the one neutral left rule. */
import { CornerDownRight } from 'lucide-react'
import { cx } from '@/ui'
import { jumpToTurn } from './jump'

export function QuoteWell({ text, turnId, className, label }: { text: string; turnId?: string; className?: string; label?: string }) {
  return (
    <figure className={cx('m-0', className)}>
      {label ? <figcaption className="mb-1.5 text-caption text-tertiary">{label}</figcaption> : null}
      <blockquote className="m-0 rounded-r-md border-l-2 border-[var(--border-strong)] bg-subtle py-2.5 pl-4 pr-4">
        <p className="quote text-primary">“{text.trim()}”</p>
      </blockquote>
      {turnId ? (
        <button
          type="button"
          onClick={() => jumpToTurn(turnId)}
          className="mt-1.5 inline-flex items-center gap-1 rounded-sm text-label text-accent hover:underline hover:underline-offset-2"
        >
          <CornerDownRight size={13} strokeWidth={2} />
          Jump to answer
        </button>
      ) : null}
    </figure>
  )
}
