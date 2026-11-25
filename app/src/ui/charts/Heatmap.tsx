/* Heatmap: rows × columns of 1–5 scores. Cells take the score tint with the numeral centred;
 * empty cells read "–"; the lowest cell is outlined. Spec: doc 01 §5.18. */
import { cx } from '../cx'
import { fmtScore, scoreInkClass, scoreTintClass } from '../score'

export function Heatmap<R extends string, C extends string>({ rows, cols, value, onRowClick, selectedRow, className }: {
  rows: { id: R; label: string }[]
  cols: { id: C; label: string }[]
  value: (row: R, col: C) => number | undefined | null
  onRowClick?: (row: R) => void
  selectedRow?: R
  className?: string
}) {
  let low: { r: R; c: C; v: number } | null = null
  for (const r of rows) for (const c of cols) {
    const v = value(r.id, c.id)
    if (v != null && (low == null || v < low.v)) low = { r: r.id, c: c.id, v }
  }

  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="w-full table-fixed border-separate" style={{ borderSpacing: 4 }}>
        <thead>
          <tr>
            <th className="w-[160px]" />
            {cols.map((c) => (
              <th key={c.id} scope="col" className="px-1 pb-1 text-left text-caption font-medium text-secondary">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row" className="pr-3 text-left">
                {onRowClick ? (
                  <button onClick={() => onRowClick(r.id)} className={cx('rounded-xs text-left text-callout hover:text-primary', selectedRow === r.id ? 'font-medium text-primary' : 'text-secondary')}>
                    {r.label}
                  </button>
                ) : <span className="text-callout text-secondary">{r.label}</span>}
              </th>
              {cols.map((c) => {
                const v = value(r.id, c.id)
                const isLow = low && low.r === r.id && low.c === c.id
                return (
                  <td key={c.id} className="p-0">
                    <div
                      className={cx(
                        'flex h-9 min-w-9 items-center justify-center rounded-sm text-caption font-semibold tabular',
                        v == null ? 'bg-subtle text-tertiary' : cx(scoreTintClass(v), scoreInkClass(v)),
                        isLow && 'shadow-[inset_0_0_0_2px_var(--text-primary)]',
                      )}
                      aria-label={v == null ? `${r.label}, ${c.label}: no data` : `${r.label}, ${c.label}: ${fmtScore(v)}`}
                    >
                      {v == null ? '–' : fmtScore(v)}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
