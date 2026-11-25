/* Sparkline: last 8 scores on a fixed 1–5 domain (never auto-scaled), no axes.
 * Line in secondary ink, last point as a dot in that score's colour. Spec: MASTER_PLAN §2.3, doc 01 §5.18. */
import { fmtScore, scoreVar } from '../score'

const clamp = (s: number) => Math.max(1, Math.min(5, s))

export function Sparkline({ values, width = 80, height = 24, max = 8, className }: {
  values: number[]; width?: number; height?: number; max?: number; className?: string
}) {
  const v = values.slice(-max)
  const pad = 3
  const x = (i: number) => (v.length <= 1 ? width - pad : pad + (i * (width - 2 * pad)) / (v.length - 1))
  const y = (s: number) => pad + ((5 - clamp(s)) / 4) * (height - 2 * pad)
  const label = v.length ? `Last ${v.length} scores: ${v.map((s) => fmtScore(s)).join(', ')}` : 'No scores yet'

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className={className}>
      {v.length === 0 ? (
        <line x1={pad} x2={width - pad} y1={height / 2} y2={height / 2} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="2 3" />
      ) : (
        <>
          {v.length > 1 ? (
            <path
              d={v.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s).toFixed(1)}`).join(' ')}
              fill="none"
              stroke="var(--text-secondary)"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          <circle cx={x(v.length - 1)} cy={y(v[v.length - 1])} r={2.75} fill={scoreVar(v[v.length - 1])} />
        </>
      )}
    </svg>
  )
}
