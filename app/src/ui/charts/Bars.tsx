/* Vertical bars for a short series (e.g. weekly reviewed mocks). The highlighted bar is accent,
 * the rest muted. Value sits above each bar; label below. */
import { cx } from '../cx'

export function Bars({ data, height = 120, className }: {
  data: { key: string; label: string; value: number; highlight?: boolean }[]; height?: number; className?: string
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className={cx('flex items-end gap-2', className)} role="img" aria-label={data.map((d) => `${d.label}: ${d.value}`).join(', ')}>
      {data.map((d) => (
        <div key={d.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span className={cx('text-caption tabular', d.highlight ? 'text-primary' : 'text-tertiary')}>{d.value}</span>
          <div className="flex w-full items-end justify-center" style={{ height }}>
            <div
              className={cx('w-full max-w-7 rounded-t-xs', d.highlight ? 'bg-accent' : 'bg-[var(--chart-muted)]')}
              style={{ height: d.value > 0 ? `${Math.max(3, (d.value / max) * 100)}%` : 2, opacity: d.value > 0 ? 1 : 0.6 }}
            />
          </div>
          <span className={cx('truncate text-caption', d.highlight ? 'text-primary' : 'text-tertiary')}>{d.label}</span>
        </div>
      ))}
    </div>
  )
}
