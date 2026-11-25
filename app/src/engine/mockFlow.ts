/* The turn loop, independent of storage so tests can drive it: create a session, then for each candidate turn
   classify → plan (code) → template or AI (with scripted fallback and reconciliation) → advance the machine. */
import type { InterviewAI } from '@/ai/types'
import type {
  DimensionId, EntryPoint, InputMode, MockLength, MockSession, Question, Turn, TurnResult, VariantAxis,
} from '@/domain/types'
import { classifyCandidateTurn } from '@/domain/mock/classify'
import {
  appendCandidateTurn, appendInterviewerTurn, decisionToLine, evaluateCompletion, planTurn, reconcileDecision, relabelCandidateTurn,
  type Completion, type Plan,
} from '@/domain/mock/machine'
import { closeLine, EXPAND_LINE, introLine, questionLine } from '@/domain/mock/templates'
import { validateInterviewerLine } from '@/domain/rubric/validator'

export const FOLLOWUPS: Record<MockLength, number> = { quick: 2, standard: 3 }

export interface CreateSessionOpts {
  id: string
  question: Question
  length: MockLength
  mode: InputMode
  entryPoint: EntryPoint
  now: number
  firstName?: string
  variant?: { axis: VariantAxis; value: string } | null
  nudgeId?: string
  retryOf?: string
  retryFixId?: string
  targetDimension?: DimensionId
  focusText?: string
  provider: MockSession['provider']
}

export function createSession(o: CreateSessionOpts): MockSession {
  const followupsPlanned = FOLLOWUPS[o.length]
  const q = o.question
  const base: MockSession = {
    id: o.id,
    questionId: q.id,
    questionSnapshot: { prompt: q.prompt, topic: q.topic, subtype: q.subtype, difficulty: q.difficulty, source: q.source, setup: q.context.setup },
    topic: q.topic,
    length: o.length,
    followupsPlanned,
    variant: o.variant && followupsPlanned >= 2 ? { axis: o.variant.axis, value: o.variant.value, atFollowup: 2 } : undefined,
    modeHistory: [{ mode: o.mode, fromTurn: 0, at: o.now }],
    turns: [],
    machine: { state: 'awaiting_answer', slot: { kind: 'main' }, followupsAsked: 0, clarifications: 0, hintUsed: false, idkStreak: 0, expandAsked: false },
    status: 'in_progress',
    counted: false,
    startedAt: o.now,
    lastActivityAt: o.now,
    entryPoint: o.entryPoint,
    nudgeId: o.nudgeId,
    retryOf: o.retryOf,
    retryFixId: o.retryFixId,
    targetDimension: o.targetDimension,
    focusText: o.focusText,
    provider: o.provider,
    source: 'user',
  }
  const intro: Turn = {
    id: `${o.id}:0`, index: 0, role: 'interviewer', kind: 'intro', text: introLine({ firstName: o.firstName, length: o.length, followups: followupsPlanned, isRetry: !!o.retryOf, focusText: o.focusText }),
    generatedBy: 'template', words: 0, flags: [], startedAt: o.now, submittedAt: o.now,
  }
  intro.words = intro.text.split(/\s+/).length
  const qt: Turn = {
    id: `${o.id}:1`, index: 1, role: 'interviewer', kind: 'question', text: questionLine(q.prompt, q.context.setup),
    generatedBy: 'library', words: 0, flags: [], startedAt: o.now, submittedAt: o.now,
  }
  qt.words = qt.text.split(/\s+/).length
  return { ...base, turns: [intro, qt] }
}

export interface TurnEvent { name: 'turn_submitted' | 'followup_asked' | 'clarification_asked' | 'llm_fallback'; props: Record<string, unknown> }

export interface RunTurnResult {
  session: MockSession
  candidateTurn: Turn
  interviewerTurn: Turn
  plan: Plan
  done: boolean
  completion: Completion
  events: TurnEvent[]
}

export interface RunTurnDeps {
  ai: InterviewAI
  /** Used when the primary AI's move is not allowed this turn or its line fails the validator. */
  fallback: InterviewAI
  now: () => number
  firstName?: string
  /** Write-ahead hook: persist the session after the candidate turn is appended, before any AI call. */
  onCandidate?: (s: MockSession) => Promise<void> | void
  signal?: AbortSignal
}

export async function runTurn(session: MockSession, question: Question, text: string, mode: InputMode, deps: RunTurnDeps, opts: { editedAfterSpeech?: boolean; startedAt?: number } = {}): Promise<RunTurnResult> {
  const events: TurnEvent[] = []
  const cls = classifyCandidateTurn(text, { session, question })
  let plan = planTurn(session, cls)
  const now = deps.now()
  const appended = appendCandidateTurn(session, { text, mode, startedAt: opts.startedAt ?? now, now, editedAfterSpeech: opts.editedAfterSpeech }, plan)
  let s = appended.session
  const candId = appended.turn.id
  await deps.onCandidate?.(s)

  let line: ReturnType<typeof decisionToLine>
  if (plan.templated) {
    line = plan.kind === 'expand'
      ? { say: EXPAND_LINE, move: 'ask_expand', generatedBy: 'template' }
      : { say: closeLine(deps.firstName), move: 'close', generatedBy: 'template' }
  } else {
    const ctx = { session: s, question, lastAnswer: s.turns[s.turns.length - 1] }
    let decision: TurnResult
    try {
      decision = await deps.ai.nextTurn(ctx, deps.signal)
    } catch {
      decision = await deps.fallback.nextTurn(ctx, deps.signal)
    }
    let reconciled = reconcileDecision(s, plan, decision, cls.words)
    const validated = decision.generatedBy === 'scripted' || decision.generatedBy === 'template' ? { ok: true as const } : validateInterviewerLine(decision.say, ctx)
    if (!reconciled || !validated.ok) {
      events.push({ name: 'llm_fallback', props: { task: 'turn', reason: !reconciled ? `move_not_allowed:${decision.move}` : `validator:${(validated as { reason: string }).reason}` } })
      decision = await deps.fallback.nextTurn(ctx, deps.signal)
      reconciled = plan
    }
    if (reconciled !== plan) {
      plan = reconciled
      s = relabelCandidateTurn(s, candId, plan)
    }
    // Merge flags the AI noticed (e.g. injection) into the candidate turn.
    const extra = (decision.flags ?? []).filter((f) => f === 'injection' || f === 'off_topic' || f === 'idk')
    if (extra.length) s = { ...s, turns: s.turns.map((t) => (t.id === candId ? { ...t, flags: [...new Set([...t.flags, ...extra])] } : t)) }
    line = decisionToLine(decision)
  }

  const candTurn = s.turns.find((t) => t.id === candId)!
  events.push({ name: 'turn_submitted', props: { turnIndex: candTurn.index, kind: candTurn.kind, mode, words: candTurn.words, expansionRequested: plan.kind === 'expand', flags: candTurn.flags } })
  if (plan.kind === 'clarify') events.push({ name: 'clarification_asked', props: { index: s.machine.clarifications + 1, answeredFrom: /reasonable assumption/i.test(line.say) ? 'assume' : 'hidden_facts' } })

  const out = appendInterviewerTurn(s, plan, line, deps.now())
  s = out.session
  if (plan.kind === 'followup' || plan.kind === 'variant') {
    events.push({ name: 'followup_asked', props: { index: out.turn.followupIndex, move: line.move, targetDimension: line.targetDimension, isVariant: plan.kind === 'variant', variantAxis: plan.kind === 'variant' ? s.variant?.axis : undefined, seedId: line.seedId, generatedBy: line.generatedBy, latencyMs: line.latencyMs } })
  }
  const completion = evaluateCompletion(s)
  const done = plan.kind === 'close'
  if (done) s = { ...s, status: 'completed', counted: completion.counted, endedAt: deps.now() }
  return { session: s, candidateTurn: candTurn, interviewerTurn: out.turn, plan, done, completion, events }
}
