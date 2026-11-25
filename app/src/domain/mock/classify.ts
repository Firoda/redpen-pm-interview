/* Code pre-checks on a candidate turn (§4.5 behaviour table). The scripted interviewer and the engine both use
   this; a live model may word the reply, but code decides which moves are allowed. */
import type { MockSession, Question, TurnFlag } from '@/domain/types'
import { LEX } from '@/domain/rubric/lexicon'
import { contentWords, normalise, stemSet, wordCount } from '@/domain/text'

export type CandidateKind = 'empty' | 'clarify' | 'idk' | 'hint_request' | 'answer_request' | 'score_request' | 'injection' | 'off_topic' | 'answer'

export interface Classification { kind: CandidateKind; flags: TurnFlag[]; words: number }

const DOMAIN = [LEX.metricTerm, LEX.prioritisation, LEX.goal].flat()

export function questionCorpus(question: Pick<Question, 'prompt' | 'context' | 'expectedStructure' | 'coverage' | 'tags'> | null, session?: Pick<MockSession, 'turns' | 'variant' | 'questionSnapshot'>): string {
  const parts: string[] = []
  if (question) {
    parts.push(question.prompt, question.context.setup ?? '', ...(question.context.hiddenFacts ?? []), question.context.caseText ?? '', ...(question.expectedStructure ?? []), ...(question.coverage ?? []), ...(question.tags ?? []))
  }
  if (session) {
    parts.push(session.questionSnapshot.prompt, session.variant?.value ?? '')
    for (const t of session.turns) if (t.role === 'interviewer' && t.kind !== 'intro') parts.push(t.text)
  }
  return parts.join(' ')
}

function isIdk(text: string, words: number): boolean {
  if (words >= 25 || !LEX.idk.test(text)) return false
  const rest = text.replace(new RegExp(LEX.idk.source, 'gi'), ' ')
  return contentWords(rest).length < 6
}

export interface ClassifyCtx {
  session: Pick<MockSession, 'turns' | 'variant' | 'questionSnapshot' | 'machine'>
  question: Pick<Question, 'prompt' | 'context' | 'expectedStructure' | 'coverage' | 'tags'> | null
}

export function classifyCandidateTurn(text: string, ctx: ClassifyCtx): Classification {
  const t = text.trim()
  const words = wordCount(t)
  const flags: TurnFlag[] = []
  if (!t) return { kind: 'empty', flags, words }
  const mainAnswered = ctx.session.machine.slot.kind === 'followup'
  if (LEX.injection.test(t)) {
    flags.push('injection')
    if (words < 25) return { kind: 'injection', flags, words }
  }
  if (words < 30 && LEX.scoreRequest.test(t)) return { kind: 'score_request', flags, words }
  if (words < 30 && LEX.answerRequest.test(t)) return { kind: 'answer_request', flags, words }
  if (words < 30 && LEX.hint.test(t)) return { kind: 'hint_request', flags, words }
  if (isIdk(t, words)) { flags.push('idk'); return { kind: 'idk', flags, words } }
  const endsQ = /\?\s*["')\]]*\s*$/.test(t)
  if (endsQ && ((!mainAnswered && words <= 40) || (mainAnswered && words <= 25))) return { kind: 'clarify', flags, words }

  // Off-topic: a non-trivial answer that shares no content word with the question and uses no PM vocabulary.
  if (words >= 8) {
    const corpus = stemSet(questionCorpus(ctx.question, ctx.session))
    const mine = stemSet(t)
    let overlap = 0
    mine.forEach((s) => { if (corpus.has(s)) overlap++ })
    const domain = DOMAIN.some((p) => p.test(t)) || new RegExp(LEX.userTerm.source, 'i').test(t)
    if (overlap === 0 && !domain) { flags.push('off_topic'); return { kind: 'off_topic', flags, words } }
  }
  if (words < 15) flags.push('short')
  return { kind: 'answer', flags, words }
}

/** How many interviewer redirects have been said in the current slot (second off-topic proceeds). */
export function redirectsInSlot(session: Pick<MockSession, 'turns' | 'machine'>): number {
  const slotStart = lastSlotStartIndex(session)
  return session.turns.filter((t) => t.index > slotStart && t.role === 'interviewer' && t.kind === 'redirect').length
}

/** Index of the interviewer turn that opened the current slot (question turn or the latest follow-up). */
export function lastSlotStartIndex(session: Pick<MockSession, 'turns'>): number {
  for (let i = session.turns.length - 1; i >= 0; i--) {
    const t = session.turns[i]
    if (t.role === 'interviewer' && (t.kind === 'question' || t.kind === 'followup_q')) return t.index
  }
  return -1
}

/** The question text currently on the table (main prompt, or the latest follow-up without its quoted lead-in). */
export function currentAsk(session: Pick<MockSession, 'turns' | 'questionSnapshot'>): string {
  for (let i = session.turns.length - 1; i >= 0; i--) {
    const t = session.turns[i]
    if (t.role === 'interviewer' && t.kind === 'followup_q') return t.text.replace(/^You said "[^"]*"\.\s*/, '')
    if (t.role === 'interviewer' && t.kind === 'question') return session.questionSnapshot.prompt
  }
  return session.questionSnapshot.prompt
}

export function normalisedEquals(a: string, b: string): boolean {
  return normalise(a) === normalise(b)
}
