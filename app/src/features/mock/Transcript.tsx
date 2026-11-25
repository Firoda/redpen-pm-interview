/* Interview transcript (not chat bubbles). Interviewer: plain text in --text-interviewer with a small
 * "Meera" label. Candidate: --bg-subtle block, radius 12, full column width. Used in the room and the report. */
import type { MockSession, Turn, VariantAxis } from '@/domain/types'
import { INTERVIEWER_NAME } from '@/config/brand'
import { cx, Tag } from '@/ui'
import { fmtClock, sortedTurns } from './lib'
import { RevealText } from './RevealText'

const AXIS_LABEL: Record<VariantAxis, string> = { user: 'user', market: 'market', constraint: 'constraint' }

export function turnTags(t: Turn, s: MockSession): string[] {
  const tags: string[] = []
  if (t.role === 'interviewer') {
    if (t.kind === 'followup_q' && t.followupIndex != null) tags.push(`Follow-up ${t.followupIndex}`)
    else if (t.kind === 'followup_q') {
      const n = s.turns.filter((x) => x.kind === 'followup_q' && x.index <= t.index).length
      tags.push(`Follow-up ${n}`)
    }
    if (t.isVariant) tags.push(`Variant · ${s.variant ? AXIS_LABEL[s.variant.axis] : 'case'} changed`)
    if (t.kind === 'clarify_a') tags.push('Clarification')
  } else {
    if (t.inputMode === 'voice') tags.push('Spoken')
    if (t.kind === 'clarify_q') tags.push('Clarifying question')
  }
  return tags
}

export function TurnBlock({ turn, session, reveal = false, revealDelay = 0, dim = false, compact = false, pending = false }: {
  turn: Turn
  session: MockSession
  reveal?: boolean
  revealDelay?: number
  dim?: boolean
  compact?: boolean
  pending?: boolean
}) {
  const isMeera = turn.role === 'interviewer'
  const at = (isMeera ? turn.startedAt : turn.submittedAt) - session.startedAt
  const tags = turnTags(turn, session)
  return (
    <div
      id={`turn-${turn.id}`}
      data-turn-id={turn.id}
      className={cx('transition-opacity duration-200', dim && 'opacity-60')}
    >
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={cx('text-caption', isMeera ? 'text-secondary' : 'text-primary')} style={{ fontWeight: 600 }}>
          {isMeera ? INTERVIEWER_NAME : 'You'}
        </span>
        {!pending ? <span className="text-caption tabular text-tertiary">{fmtClock(at)}</span> : null}
        {tags.map((t) => <Tag key={t} className="whitespace-nowrap">{t}</Tag>)}
      </div>
      {isMeera ? (
        <p className={cx('whitespace-pre-wrap text-interviewer', compact ? 'text-body' : 'text-reading')}>
          <RevealText text={turn.text} animate={reveal} delay={revealDelay} />
        </p>
      ) : (
        <div
          data-candidate-block
          className={cx(
            'whitespace-pre-wrap rounded-lg bg-subtle text-primary transition-colors duration-300',
            compact ? 'px-3 py-2 text-body' : 'px-4 py-3 text-reading',
            pending && 'animate-rise',
          )}
        >
          {turn.text}
        </div>
      )}
    </div>
  )
}

export function ModeSwitchLine({ mode, at }: { mode: 'text' | 'voice'; at: number }) {
  return (
    <div className="flex items-center gap-3 text-caption text-tertiary" role="note">
      <span className="h-px flex-1 bg-border" />
      <span>Switched to {mode} · <span className="tabular">{fmtClock(at)}</span></span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

/** Turns interleaved with "Switched to voice · 06:20" lines. */
export function buildTimeline(s: MockSession) {
  const turns = sortedTurns(s)
  type Item = { kind: 'turn'; turn: Turn } | { kind: 'switch'; mode: 'text' | 'voice'; at: number; key: string }
  const items: Item[] = []
  const switches = s.modeHistory.slice(1) // the first entry is the starting mode
  let si = 0
  for (const t of turns) {
    while (si < switches.length && switches[si].fromTurn <= t.index) {
      const sw = switches[si]
      items.push({ kind: 'switch', mode: sw.mode, at: sw.at - s.startedAt, key: `sw-${si}` })
      si++
    }
    items.push({ kind: 'turn', turn: t })
  }
  while (si < switches.length) {
    const sw = switches[si]
    items.push({ kind: 'switch', mode: sw.mode, at: sw.at - s.startedAt, key: `sw-${si}` })
    si++
  }
  return items
}
