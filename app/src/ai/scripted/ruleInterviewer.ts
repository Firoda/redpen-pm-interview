/* Rule-based interviewer (§6.11): Meera without a model. Seeds whose triggerIf matches, preferring the dimension
   with the weakest heuristic evidence (retry focus first), prefixed with a short phrase the candidate actually said. */
import type { DimensionId, FollowUpSeed, MockSession, Question, TurnContext, TurnDecision } from '@/domain/types'
import { DIMENSIONS } from '@/domain/types'
import { classifyCandidateTurn, currentAsk } from '@/domain/mock/classify'
import { planTurn, type Plan } from '@/domain/mock/machine'
import {
  ANSWER_REQUEST_LINE, ASSUME_LINE, closeLine, EXPAND_LINE, genericSeeds, HINT_LINES, HINT_USED_LINE, injectionLine,
  MOVE_ON_PREFIX, NO_MORE_CLARIFY_LINE, REFRAME_LINE, redirectLine, SCORE_REQUEST_LINE,
} from '@/domain/mock/templates'
import { extractFeatures } from '@/domain/rubric/features'
import { scoreDimensions } from '@/domain/rubric/offlineGrader'
import { fitQuote } from '@/domain/rubric/quotes'
import { LEX } from '@/domain/rubric/lexicon'
import { TOPIC_WEIGHTS } from '@/domain/rubric/weights'
import { contentWords, hasAny, normalise, phraseIn, sentences, stem, stripEndPunct, wordCount } from '@/domain/text'

const MAX_WORDS = 45

/* ---------------- evidence ---------------- */

/** Dimensions ordered by weighted weakness of the evidence so far (weakest first). */
export function weakestDimensions(session: MockSession, question: Question): DimensionId[] {
  const f = extractFeatures(session, question)
  const s = scoreDimensions(f)
  const w = TOPIC_WEIGHTS[session.topic]
  return [...DIMENSIONS].sort((a, b) => (w[b] * (4 - s[b].score)) - (w[a] * (4 - s[a].score)) || w[b] - w[a])
}

function answersText(session: MockSession): string {
  return session.turns.filter((t) => t.role === 'candidate' && (t.kind === 'main' || t.kind === 'followup_a')).map((t) => t.text).join(' ')
}

export function seedMatches(seed: FollowUpSeed, session: MockSession, lastWords: number): { match: boolean; triggered: boolean } {
  const tr = seed.triggerIf
  if (!tr) return { match: true, triggered: false }
  const text = normalise(answersText(session))
  if (tr.missingAny?.length && tr.missingAny.some((p) => phraseIn(text, p))) return { match: false, triggered: false }
  if (tr.presentAny?.length && !tr.presentAny.some((p) => phraseIn(text, p))) return { match: false, triggered: false }
  if (tr.minWords != null && lastWords < tr.minWords) return { match: false, triggered: false }
  return { match: true, triggered: !!(tr.missingAny?.length || tr.presentAny?.length) }
}

function usedSeedIds(session: MockSession): Set<string> {
  return new Set(session.turns.filter((t) => t.role === 'interviewer' && t.seedId).map((t) => t.seedId as string))
}

function focusNeedsProbe(session: MockSession): DimensionId | undefined {
  const focus = session.targetDimension
  if (!focus) return undefined
  const probed = session.turns.some((t) => t.role === 'interviewer' && t.kind === 'followup_q' && t.targetDimension === focus)
  return probed ? undefined : focus
}

/** Demo mode: follow the question's authored seed order (after the retry focus probe) so prepared
 *  ghost-fill answers always match the follow-up Meera asks. Set from settings.demo.enabled. */
let authoringOrder = false
export function setScriptedAuthoringOrder(on: boolean) { authoringOrder = on }

export function chooseSeed(session: MockSession, question: Question, lastWords: number): FollowUpSeed {
  const used = usedSeedIds(session)
  const order = weakestDimensions(session, question)
  const focus = focusNeedsProbe(session)
  const rank = (d: DimensionId) => (focus === d ? -1 : order.indexOf(d))
  const own = (question.followUpSeeds ?? []).filter((s) => !s.isVariantSlot && !used.has(s.id))
  const scored = own
    .map((s, i) => ({ s, i, m: seedMatches(s, session, lastWords) }))
    .filter((x) => x.m.match)
    .sort((a, b) => {
      // focus dimension first; then triggered seeds (they react to a gap in this answer); then weakest dimension; then authoring order
      const fa = a.s.probes === focus ? 0 : 1, fb = b.s.probes === focus ? 0 : 1
      if (fa !== fb) return fa - fb
      if (authoringOrder) return a.i - b.i
      if (a.m.triggered !== b.m.triggered) return a.m.triggered ? -1 : 1
      return rank(a.s.probes) - rank(b.s.probes) || a.i - b.i
    })
  if (scored.length) return scored[0].s
  const gen = genericSeeds(session.topic).filter((s) => !s.isVariantSlot && !used.has(s.id))
  const g = gen.sort((a, b) => rank(a.probes) - rank(b.probes))[0]
  return g ?? genericSeeds(session.topic)[4]
}

/* ---------------- quoting the candidate ---------------- */

const DIM_LEX: Record<DimensionId, RegExp[]> = {
  structure: [/\b(first|goal|approach|start)\b/i],
  userFocus: [new RegExp(LEX.userTerm.source, 'i')],
  prioritisation: LEX.prioritisation,
  metrics: [...LEX.metricTerm, ...LEX.guardrail.slice(0, 2)],
  communication: [/\b(so|overall|summary)\b/i],
}

/** The most claim-like phrase of the answer, ≤ 12 words, copied exactly (§6.11). */
export function claimFragment(answer: string, probes?: DimensionId): string | null {
  const ss = sentences(answer).filter((s) => wordCount(s) >= 3)
  if (!ss.length) return null
  let best = { s: '', score: -1 }
  for (const s of ss) {
    let score = 0
    if (/\b(main|primary|north[- ]star|key)\b/i.test(s)) score += 3
    if (/\bbecause\b/i.test(s)) score += 2
    if (/\b(we should|i('d| would)? ?recommend)\b/i.test(s)) score += 2
    if (/\b(i would|i'?d)\b/i.test(s)) score += 1
    if (/\bfirst\b/i.test(s)) score += 1
    if (probes && hasAny(s, DIM_LEX[probes])) score += 2
    if (/^(fair point|okay|ok|yes|no|sure|right)\b/i.test(s) && wordCount(s) < 5) score -= 3
    if (score > best.score) best = { s, score }
  }
  const focus = /\b(main|primary|north[- ]star|key|because|recommend|should|i'?d|i would|first)\b/i
  let frag = fitQuote(best.s, focus, 12, 3)
  // drop a leading "Label:" so the quote reads as speech
  const colon = frag.match(/^[A-Za-z][\w'\- ]{0,24}:\s+(.*)$/)
  if (colon && wordCount(colon[1]) >= 3) frag = colon[1]
  frag = stripEndPunct(frag.replace(/["“”]/g, '')).trim().replace(/[\s.,;:!?…]+$/, '')
  // never end a quote on a dangling connector ("…is flat or")
  const WEAK = /\s+(or|and|but|the|a|an|of|to|with|is|are|for|if|per|on|in|at|by|from|that|so|than|as)$/i
  for (let i = 0; i < 4 && WEAK.test(frag); i++) frag = frag.replace(WEAK, '')
  if (wordCount(frag) < 3) return null
  if (!/^(I\b|I'|[A-Z]{2,})/.test(frag)) frag = frag[0].toLowerCase() + frag.slice(1)
  return frag
}

function withQuote(fragment: string | null, text: string): string {
  if (!fragment) return text
  const line = `You said "${fragment}". ${text}`
  return wordCount(line) <= MAX_WORDS ? line : text
}

/* ---------------- clarifications ---------------- */

const SYNONYMS: Record<string, string[]> = {
  goal: ['objective', 'purpose', 'aim', 'why', 'success', 'trying'],
  scale: ['users', 'many', 'size', 'big', 'mau', 'dau', 'volume', 'number'],
  fee: ['charge', 'price', 'cost', 'pay', 'pricing'],
  time: ['when', 'long', 'period', 'window', 'week', 'month', 'launched', 'launch'],
  market: ['city', 'geography', 'region', 'country', 'where', 'india'],
  user: ['who', 'customer', 'segment', 'persona'],
  issue: ['problem', 'complaint', 'known', 'pain'],
  work: ['how', 'flow', 'works'],
}

function expandStems(text: string): Set<string> {
  const out = new Set<string>()
  for (const w of contentWords(text).concat(text.toLowerCase().match(/\b(who|when|where|why|how)\b/g) ?? [])) {
    out.add(stem(w))
    for (const [k, vs] of Object.entries(SYNONYMS)) if (k === w || vs.includes(w)) { out.add(stem(k)); vs.forEach((v) => out.add(stem(v))) }
  }
  return out
}

export function formatFact(fact: string): string {
  let f = fact.trim().replace(/^(.{1,40}?)\s+if asked(\s*\([^)]*\))?\s*:\s*/i, (_m, label: string, paren?: string) => `${label}${paren ?? ''}: `)
  f = f[0].toUpperCase() + f.slice(1)
  if (wordCount(f) > MAX_WORDS) f = f.split(/\s+/).slice(0, MAX_WORDS).join(' ')
  return /[.!?]$/.test(f) ? f : f + '.'
}

export function answerClarification(session: MockSession, question: Question, asked: string): string {
  if (session.machine.clarifications >= 3) return NO_MORE_CLARIFY_LINE
  const facts = [...(question.context.hiddenFacts ?? [])]
  if (question.context.caseText) facts.push(...sentences(question.context.caseText).slice(0, 40))
  const given = new Set(session.turns.filter((t) => t.role === 'interviewer' && t.kind === 'clarify_a').map((t) => normalise(t.text)))
  const want = expandStems(asked)
  let best = { fact: '', score: 0 }
  for (const fact of facts) {
    const have = expandStems(fact)
    let score = 0
    want.forEach((s) => { if (s.length >= 2 && have.has(s)) score++ })
    if (given.has(normalise(formatFact(fact)))) score -= 2
    if (score > best.score) best = { fact, score }
  }
  return best.score >= 1 ? formatFact(best.fact) : ASSUME_LINE
}

/* ---------------- the decision ---------------- */

export function scriptedDecision(ctx: TurnContext): TurnDecision & { plan: Plan } {
  const { session, question, lastAnswer } = ctx
  const cls = classifyCandidateTurn(lastAnswer.text, { session, question })
  // The plan is computed on the state before the interviewer replies (the candidate turn is already appended).
  const plan = planTurn(session, cls)
  const flags = plan.flags
  const base = { flags, countsAsFollowup: plan.fillsSlot && (plan.kind === 'followup' || plan.kind === 'variant'), plan }
  switch (plan.kind) {
    case 'expand':
      return { ...base, move: 'ask_expand', say: EXPAND_LINE }
    case 'close':
      return { ...base, move: 'close', say: closeLine() }
    case 'clarify':
      return { ...base, move: 'answer_clarification', say: answerClarification(session, question, lastAnswer.text) }
    case 'reframe':
      return { ...base, move: 'reframe_idk', say: REFRAME_LINE }
    case 'hint': {
      const d = weakestDimensions(session, question)[0]
      return { ...base, move: 'give_hint', say: HINT_LINES[d], targetDimension: d }
    }
    case 'redirect':
      return { ...base, move: 'redirect', say: redirectLine(currentAsk(session)) }
    case 'deflect': {
      const say = cls.kind === 'injection' ? injectionLine(currentAsk(session))
        : cls.kind === 'score_request' ? SCORE_REQUEST_LINE
        : cls.kind === 'answer_request' ? ANSWER_REQUEST_LINE
        : cls.kind === 'hint_request' ? HINT_USED_LINE
        : `Take your time. ${currentAsk(session)}`
      return { ...base, move: 'deflect', say: wordCount(say) <= MAX_WORDS ? say : say.split(/\s+/).slice(0, MAX_WORDS).join(' ') }
    }
    case 'variant': {
      const seed = (question.followUpSeeds ?? []).find((s) => s.isVariantSlot) ?? genericSeeds(session.topic).find((s) => s.isVariantSlot)!
      const value = session.variant?.value ?? ''
      const text = seed.text.includes('{variant}') ? seed.text.replace('{variant}', value) : `Let's change one thing: ${value}. ${seed.text}`
      return { ...base, move: 'ask_variant', say: text, targetDimension: seed.probes ?? 'structure', seedId: seed.id, isVariant: true }
    }
    case 'followup': {
      const seed = chooseSeed(session, question, wordCount(lastAnswer.text))
      const movingOn = cls.kind === 'idk' || cls.kind === 'off_topic'
      const say = movingOn ? `${MOVE_ON_PREFIX} ${seed.text}` : withQuote(claimFragment(lastAnswer.text, seed.probes), seed.text)
      return { ...base, move: movingOn ? 'move_on' : 'ask_followup', say, targetDimension: seed.probes, seedId: seed.id }
    }
  }
}
