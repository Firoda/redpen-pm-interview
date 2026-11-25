/* Before/after bars for a retry: previous (muted) and new (score colour) per dimension, with a signed delta.
 * Spec: MASTER_PLAN §2.3, doc 01 §5.18. */
import { cx } from '../cx'
import { fmtScore, scoreFillClass } from '../score'

export interface BeforeAfterRow { key: string; label: string; before?: number | null; after: number; highlight?: boolean }

function Delta({ d }: { d: number }) {
  const r = Math.round(d * 10) / 10
  const cls = r > 0 ? 'text-positive' : r < 0 ? 'text-score-1-text' : 'text-tertiary'
  const txt = r > 0 ? `+${fmtScore(r)}` : r < 0 ? `−${fmtScore(-r)}` : '0'
  return <span className={cx('w-10 text-right text-label tabular', cls)}>{txt}</span>
}

export function BeforeAfter({ rows, className }: { rows: BeforeAfterRow[]; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-3', className)}>
      {rows.map((r) => (
        <div key={r.key} className={cx('grid grid-cols-[140px_1fr_auto_auto] items-center gap-4 rounded-md px-3 py-2', r.highlight && 'bg-subtle')}>
          <span className={cx('text-callout', r.highlight ? 'font-semibold text-primary' : 'text-secondary')}>{r.label}</span>
          <div className="flex flex-col gap-1">
            <div className="h-1.5 rounded-xs bg-subtle">
              {r.before != null ? <div className="h-full rounded-xs bg-[var(--chart-muted)]" style={{ width: `${(r.before / 5) * 100}%` }} /> : null}
            </div>
            <div className="h-1.5 rounded-xs bg-subtle">
              <div className={cx('h-full rounded-xs animate-bar', scoreFillClass(r.after))} style={{ width: `${(r.after / 5) * 100}%` }} />
            </div>
          </div>
          <span className="text-footnote text-secondary tabular">
            {r.before != null ? `${fmtScore(r.before)} → ` : ''}<span className="font-semibold text-primary">{fmtScore(r.after)}</span>
          </span>
          {r.before != null ? <Delta d={r.after - r.before} /> : <span className="w-10" />}
        </div>
      ))}
    </div>
  )
}
