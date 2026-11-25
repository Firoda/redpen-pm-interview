/* Weekly ring: one ring, accent on a subtle track, fills clockwise from 12 o'clock over 400 ms once.
 * Spec: MASTER_PLAN §2.3 (Weekly ring), doc 01 §5.19. Reduced motion is handled globally. */
import { useEffect, useState, type ReactNode } from 'react'

export function Ring({ value, goal, size = 64, stroke = 6, children, label }: {
  value: number; goal: number; size?: number; stroke?: number; children?: ReactNode; label?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const target = goal > 0 ? Math.max(0, Math.min(1, value / goal)) : 0
  const [shown, setShown] = useState(0)

  useEffect(() => {
    // two frames so the empty ring paints first and the fill transitions in
    let a = 0, b = 0
    a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setShown(target)) })
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b) }
  }, [target])

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label ?? `${value} of ${goal}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-subtle)" strokeWidth={stroke} />
        {shown > 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - shown)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset 400ms var(--ease-enter)' }}
          />
        ) : null}
      </svg>
      {children ? <div className="absolute inset-0 flex items-center justify-center">{children}</div> : null}
    </div>
  )
}
