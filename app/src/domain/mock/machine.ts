/* Mock-session state machine (§4.5–4.7). Pure: every function takes the session and returns a new one.
   Code owns slots, counters, completion and which moves are allowed; the AI only words the line. */
import type {
  DimensionId, InputMode, MockSession, Turn, TurnDecision, TurnFlag, TurnKind, TurnMove, TurnResult,
} from '@/domain/types'
import { wordCount } from '@/domain/text'
import { type Classification, redirectsInSlot } from './classify'

export type PlanKind = 'expand' | 'close' | 'clarify' | 'reframe' | 'hint' | 'deflect' | 'redirect' | 'followup' | 'variant'

export interface Plan {
  kind: PlanKind
  fillsSlot: boolean
  candidateKind: TurnKind
  flags: TurnFlag[]
  allowedMoves: TurnMove[]
  nextFollowupIndex?: number
  /** true when code writes the line itself (expand, close): no AI call. */
  templated: boolean
}

export const MOVE_TO_PLAN: Record<TurnMove, PlanKind> = {
  answer_clarification: 'clarify', ask_followup: 'followup', ask_variant: 'variant', ask_expand: 'expand', reframe_idk: 'reframe',
  give_hint: 'hint', deflect: 'deflect', redirect: 'redirect', move_on: 'followup', close: 'close',
}

const PLAN_TO_TURN_KIND: Record<PlanKind, TurnKind> = {
  expand: 'expand_q', close: 'close', clarify: 'clarify_a', reframe: 'reframe', hint: 'hint', deflect: 'deflect', redirect: 'redirect', followup: 'followup_q', variant: 'followup_q',
}

export function isLastSlot(session: Pick<MockSession, 'machine' | 'followupsPlanned'>): boolean {
  const s = session.machine.slot
  if (session.followupsPlanned <= 0) return true
  return s.kind === 'followup' && s.index >= session.followupsPlanned
}

function slotAnswerKind(session: Pick<MockSession, 'machine'>): TurnKind {
  return session.machine.slot.kind === 'main' ? 'main' : 'followup_a'
}

/** Code plan for the candidate turn just classified. `session` is the state before the interviewer replies. */
export function planTurn(session: Pick<MockSession, 'machine' | 'followupsPlanned' | 'variant' | 'turns'>, cls: Classification): Plan {
  const m = session.machine
  const answerKind = slotAnswerKind(session)
  const flags = [...cls.flags]
  const reactive = (kind: PlanKind, move: TurnMove, candidateKind: TurnKind = answerKind): Plan => ({ kind, fillsSlot: false, candidateKind, flags, allowedMoves: [move], templated: false })

  switch (cls.kind) {
    case 'clarify':
      return reactive('clarify', 'answer_clarification', 'clarify_q')
    case 'injection':
    case 'score_request':
    case 'answer_request':
      return reactive('deflect', 'deflect')
    case 'hint_request':
      return m.hintUsed ? reactive('deflect', 'deflect') : reactive('hint', 'give_hint')
    case 'idk':
      if (m.idkStreak === 0) return reactive('reframe', 'reframe_idk')
      break // second IDK in a row: the slot counts as answered
    case 'off_topic':
      if (redirectsInSlot(session) === 0) return reactive('redirect', 'redirect')
      break
    case 'answer':
      if (cls.words < 15 && !m.expandAsked) {
        return { kind: 'expand', fillsSlot: false, candidateKind: answerKind, flags: flags.filter((f) => f !== 'short'), allowedMoves: ['ask_expand'], templated: true }
      }
      break
    case 'empty':
      return reactive('deflect', 'deflect')
  }
  if (isLastSlot(session)) return { kind: 'close', fillsSlot: true, candidateKind: answerKind, flags, allowedMoves: ['close'], templated: true }
  const next = m.followupsAsked + 1
  const variantNow = !!session.variant && session.variant.atFollowup === next
  return {
    kind: variantNow ? 'variant' : 'followup',
    fillsSlot: true,
    candidateKind: answerKind,
    flags,
    allowedMoves: variantNow ? ['ask_variant'] : ['ask_followup', 'move_on'],
    nextFollowupIndex: next,
    templated: false,
  }
}

/** Accept the AI's move when code allows it; a reactive reading of a short turn is accepted if the state permits.
 *  Returns null when the decision must be replaced by the scripted one. */
export function reconcileDecision(session: Pick<MockSession, 'machine' | 'turns'>, plan: Plan, decision: Pick<TurnDecision, 'move'>, candidateWords: number): Plan | null {
  if (plan.allowedMoves.includes(decision.move)) return plan
  if (plan.kind !== 'followup' && plan.kind !== 'close' && plan.kind !== 'variant') return null
  if (candidateWords >= 25) return null
  const m = session.machine
  const ok =
    (decision.move === 'answer_clarification' && m.clarifications < 3) ||
    (decision.move === 'give_hint' && !m.hintUsed) ||
    (decision.move === 'reframe_idk' && m.idkStreak === 0) ||
    (decision.move === 'redirect' && redirectsInSlot(session) === 0) ||
    decision.move === 'deflect'
  if (!ok) return null
  const kind = MOVE_TO_PLAN[decision.move]
  return { kind, fillsSlot: false, candidateKind: kind === 'clarify' ? 'clarify_q' : plan.candidateKind, flags: plan.flags, allowedMoves: [decision.move], templated: false }
}

export function makeTurn(session: Pick<MockSession, 'id' | 'turns'>, t: Omit<Turn, 'id' | 'index' | 'words'> & { words?: number }): Turn {
  const index = session.turns.length
  return { ...t, id: `${session.id}:${index}`, index, words: t.words ?? wordCount(t.text) }
}

export interface CandidateInput { text: string; mode: InputMode; startedAt: number; now: number; editedAfterSpeech?: boolean }

/** Append the candidate turn (write-ahead, before any AI call). */
export function appendCandidateTurn(session: MockSession, input: CandidateInput, plan: Plan): { session: MockSession; turn: Turn } {
  const flags = [...plan.flags]
  if (input.editedAfterSpeech && !flags.includes('edited_after_speech')) flags.push('edited_after_speech')
  if (wordCount(input.text) > 2500 && !flags.includes('truncated')) flags.push('truncated')
  const slot = session.machine.slot
  const turn = makeTurn(session, {
    role: 'candidate',
    kind: plan.candidateKind,
    text: input.text.trim(),
    followupIndex: slot.kind === 'followup' ? slot.index : undefined,
    inputMode: input.mode,
    flags,
    startedAt: input.startedAt,
    submittedAt: input.now,
  })
  const idkStreak = flags.includes('idk') ? session.machine.idkStreak : 0
  const next: MockSession = {
    ...session,
    turns: [...session.turns, turn],
    machine: { ...session.machine, state: plan.templated ? session.machine.state : 'interviewer_turn', idkStreak },
    lastActivityAt: input.now,
  }
  return { session: next, turn }
}

/** Re-label the candidate turn when the reconciled plan differs from the first plan. */
export function relabelCandidateTurn(session: MockSession, turnId: string, plan: Plan): MockSession {
  return { ...session, turns: session.turns.map((t) => (t.id === turnId ? { ...t, kind: plan.candidateKind, flags: plan.flags.concat(t.flags.filter((f) => f === 'edited_after_speech' || f === 'truncated')).filter((f, i, a) => a.indexOf(f) === i) } : t)) }
}

export interface InterviewerLine {
  say: string
  move: TurnMove
  targetDimension?: DimensionId
  seedId?: string
  isVariant?: boolean
  generatedBy: NonNullable<Turn['generatedBy']>
  latencyMs?: number
}

/** Append the interviewer turn and advance the machine according to the plan. */
export function appendInterviewerTurn(session: MockSession, plan: Plan, line: InterviewerLine, now: number): { session: MockSession; turn: Turn } {
  const m = { ...session.machine }
  let followupIndex: number | undefined
  switch (plan.kind) {
    case 'expand': m.expandAsked = true; break
    case 'clarify': if (m.clarifications < 3) m.clarifications += 1; break
    case 'reframe': m.idkStreak += 1; break
    case 'hint': m.hintUsed = true; m.hintDimension = line.targetDimension ?? 'structure'; break
    case 'followup':
    case 'variant':
      m.followupsAsked += 1
      followupIndex = m.followupsAsked
      m.slot = { kind: 'followup', index: m.followupsAsked }
      m.expandAsked = false
      m.idkStreak = 0
      break
    case 'close': m.idkStreak = 0; break
  }
  m.state = plan.kind === 'close' ? 'done' : 'awaiting_answer'
  const turn = makeTurn(session, {
    role: 'interviewer',
    kind: PLAN_TO_TURN_KIND[plan.kind],
    text: line.say.trim(),
    followupIndex,
    isVariant: plan.kind === 'variant' ? true : undefined,
    seedId: line.seedId,
    move: line.move,
    targetDimension: line.targetDimension,
    generatedBy: line.generatedBy,
    flags: [],
    startedAt: now,
    submittedAt: now,
    latencyMs: line.latencyMs,
  })
  return { session: { ...session, turns: [...session.turns, turn], machine: m, lastActivityAt: now }, turn }
}

/* ---------------- completion (§4.7) ---------------- */

export interface Completion {
  closed: boolean
  mainAnswered: boolean
  followupsAnswered: number
  totalWords: number
  counted: boolean
  thin: boolean
  canGradeEarly: boolean
}

export const MIN_COUNTED_WORDS = 120

export function evaluateCompletion(session: Pick<MockSession, 'turns' | 'machine' | 'followupsPlanned'>): Completion {
  const cand = session.turns.filter((t) => t.role === 'candidate')
  const closed = session.machine.state === 'done' && session.turns.some((t) => t.role === 'interviewer' && t.kind === 'close')
  const mainAnswered = cand.some((t) => t.kind === 'main')
  const answeredIdx = new Set(cand.filter((t) => t.kind === 'followup_a' && t.followupIndex != null).map((t) => t.followupIndex as number))
  const followupsAnswered = closed ? session.followupsPlanned : answeredIdx.size
  const totalWords = cand.reduce((n, t) => n + wordCount(t.text), 0)
  const counted = closed && mainAnswered && followupsAnswered >= session.followupsPlanned && totalWords >= MIN_COUNTED_WORDS
  return { closed, mainAnswered, followupsAnswered, totalWords, counted, thin: closed && totalWords < MIN_COUNTED_WORDS, canGradeEarly: mainAnswered && answeredIdx.size >= 1 }
}

export function decisionToLine(d: TurnResult): InterviewerLine {
  return { say: d.say, move: d.move, targetDimension: d.targetDimension, seedId: d.seedId, isVariant: d.isVariant, generatedBy: d.generatedBy === 'template' ? 'template' : d.generatedBy, latencyMs: d.latencyMs }
}
