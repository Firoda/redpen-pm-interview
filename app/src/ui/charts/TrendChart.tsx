/* Trend chart for one topic: y fixed 1–5 with integer gridlines, dashed "Hire bar" at 4, up to 20 mocks
 * evenly spaced by order, accent line with 6 px points and retries as diamonds. Hover or arrow keys show a
 * tooltip (date, score pill, question). A visually hidden table carries the data for screen readers.
 * Spec: MASTER_PLAN §2.3 (Trend chart), doc 01 §5.18. */
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { cx } from '../cx'
import { ScorePill, fmtScore } from '../score'

// CONTRACT-REQUEST: TopicStat.history has no per-point EWMA, so the line joins mock scores. Add `ewma` to history
// points if the spec's "line = topic score (EWMA)" is wanted; this component would draw it as the line.
export interface TrendPoint { id: string; at: number; score: number; isRetry?: boolean; title?: string }

const M = { top: 14, right: 64, bottom: 28, left: 28 }
const clamp = (s: number) => Math.max(1, Math.min(5, s))
const fmtDate = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth)
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

export function TrendChart({ points, height = 240, hireBar = 4, className, label = 'Score trend' }: {
  points: TrendPoint[]; height?: number; hireBar?: number; className?: string; label?: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const pts = points.slice(-20)
  const iw = Math.max(0, width - M.left - M.right)
  const ih = height - M.top - M.bottom
  const x = (i: number) => M.left + (pts.length <= 1 ? iw / 2 : (i * iw) / (pts.length - 1))
  const y = (s: number) => M.top + ((5 - clamp(s)) / 4) * ih

  // x labels: first, last and a few evenly between, never crowding
  const maxLabels = Math.max(2, Math.floor(iw / 72))
  const step = Math.max(1, Math.ceil(pts.length / maxLabels))
  const xLabels = pts.map((p, i) => ({ i, p })).filter(({ i }) => i === 0 || i === pts.length - 1 || (i % step === 0 && pts.length - 1 - i >= step / 2))

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    if (!pts.length) return
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - rect.left
    let best = 0
    for (let i = 1; i < pts.length; i++) if (Math.abs(x(i) - mx) < Math.abs(x(best) - mx)) best = i
    setActive(best)
  }
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!pts.length) return
    if (e.key === 'ArrowRight') { e.preventDefault(); setActive((a) => Math.min(pts.length - 1, (a ?? -1) + 1)) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); setActive((a) => Math.max(0, (a ?? pts.length) - 1)) }
    if (e.key === 'Escape') setActive(null)
  }

  const a = active != null ? pts[active] : null
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ')

  return (
    <div ref={ref} className={cx('relative w-full select-none', className)} style={{ height }}>
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${label}. ${pts.length} mocks. Use the arrow keys to read each point.`}
          tabIndex={0}
          onMouseMove={onMove}
          onMouseLeave={() => setActive(null)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          className="block rounded-md focus-visible:outline-2"
        >
          {/* gridlines + y labels */}
          {[1, 2, 3, 4, 5].map((s) => (
            <g key={s}>
              <line x1={M.left} x2={M.left + iw} y1={y(s)} y2={y(s)} stroke="var(--border)" strokeWidth={1} />
              <text x={M.left - 10} y={y(s)} dy="0.32em" textAnchor="end" fontSize={12} fill="var(--text-tertiary)">{s}</text>
            </g>
          ))}
          {/* hire bar */}
          <line x1={M.left} x2={M.left + iw} y1={y(hireBar)} y2={y(hireBar)} stroke="var(--text-tertiary)" strokeWidth={1} strokeDasharray="4 4" />
          <text x={M.left + iw + 8} y={y(hireBar)} dy="0.32em" fontSize={12} fontWeight={500} fill="var(--text-tertiary)">Hire bar</text>

          {/* x labels */}
          {xLabels.map(({ i, p }) => (
            <text key={p.id} x={x(i)} y={height - 8} textAnchor={pts.length === 1 ? 'middle' : i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'} fontSize={12} fill="var(--text-tertiary)">
              {fmtDate(p.at)}
            </text>
          ))}

          {/* hover guide */}
          {a ? <line x1={x(active!)} x2={x(active!)} y1={M.top} y2={M.top + ih} stroke="var(--border-strong)" strokeWidth={1} /> : null}

          <g className="animate-fade">
            {pts.length > 1 ? <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
            {pts.map((p, i) => {
              const cx_ = x(i), cy = y(p.score), on = i === active
              return p.isRetry ? (
                <rect
                  key={p.id}
                  x={cx_ - (on ? 5.5 : 4.5)} y={cy - (on ? 5.5 : 4.5)} width={on ? 11 : 9} height={on ? 11 : 9}
                  transform={`rotate(45 ${cx_} ${cy})`}
                  fill="var(--accent)" stroke="var(--bg-surface)" strokeWidth={2}
                />
              ) : (
                <circle key={p.id} cx={cx_} cy={cy} r={on ? 5 : 3.75} fill="var(--accent)" stroke="var(--bg-surface)" strokeWidth={2} />
              )
            })}
          </g>
        </svg>
      ) : null}

      {a && active != null ? (
        <div
          className="pointer-events-none absolute z-10 w-[232px] rounded-md bg-elevated px-3 py-2.5 shadow-2 animate-fade"
          style={{
            left: Math.min(Math.max(x(active) - 116, 0), Math.max(0, width - 232)),
            top: Math.max(0, y(a.score) - 14),
            transform: 'translateY(-100%)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-caption text-secondary">{fmtDate(a.at)}{a.isRetry ? ' · Retry' : ''}</span>
            <ScorePill value={a.score} size="sm" />
          </div>
          {a.title ? <div className="mt-1 line-clamp-2 text-footnote text-primary">{a.title}</div> : null}
        </div>
      ) : null}

      <table className="sr-only">
        <caption>{label}</caption>
        <thead><tr><th>Date</th><th>Score</th><th>Question</th><th>Retry</th></tr></thead>
        <tbody>
          {pts.map((p) => (
            <tr key={p.id}><td>{fmtDate(p.at)}</td><td>{fmtScore(p.score)}</td><td>{p.title ?? ''}</td><td>{p.isRetry ? 'Yes' : 'No'}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
