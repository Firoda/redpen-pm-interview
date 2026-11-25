/* Rule-based interviewer (§6.11): Meera without a model. Seeds whose triggerIf matches, preferring the dimension
   with the weakest heuristic evidence (retry focus first), prefixed with a short phrase the candidate actually said. */
import type { DimensionId, FollowUpSeed, MockSession, Question, TurnContext, TurnDecision } from '@/domain/types'
import { DIMENSIONS } from '@/domain/types'
import { clarifyingQuestions, classifyCandidateTurn, currentAsk } from '@/domain/mock/classify'
import { MAX_CLARIFICATIONS, planTurn, type Plan } from '@/domain/mock/machine'
import {
  ANSWER_REQUEST_LINE, ASSUME_LINE, closeLine, EXPAND_LINE, genericSeeds, HINT_LINES, HINT_USED_LINE, injectionLine,
  MOVE_ON_PREFIX, NO_MORE_CLARIFY_LINE, REFRAME_LINE, redirectLine, SCORE_REQUEST_LINE,
} from '@/domain/mock/templates'
import { extractFeatures } from '@/domain/rubric/features'
import { MAX_CLARIFY_WORDS } from '@/domain/rubric/validator'
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
/* A real interview is a back-and-forth: the candidate asks about the case and Meera answers like an interviewer
   who knows it. Each message can hold several questions; she answers up to three, from the question's hidden facts
   when one fits, otherwise with an ordinary default for that kind of question. The root cause is never volunteered. */

const SYNONYMS: Record<string, string[]> = {
  goal: ['objective', 'purpose', 'aim', 'why', 'success', 'trying', 'priority'],
  scale: ['users', 'many', 'size', 'big', 'mau', 'dau', 'volume', 'number', 'base'],
  fee: ['charge', 'price', 'cost', 'pay', 'pricing'],
  time: ['when', 'long', 'period', 'window', 'week', 'month', 'launched', 'launch', 'timeline', 'deadline', 'quarter'],
  market: ['city', 'cities', 'geography', 'region', 'country', 'where', 'india', 'metro', 'tier'],
  user: ['who', 'customer', 'segment', 'persona', 'audience', 'target'],
  issue: ['problem', 'complaint', 'known', 'pain', 'complaints'],
  work: ['how', 'flow', 'works'],
  platform: ['android', 'ios', 'web', 'mobile', 'device', 'version', 'release'],
  data: ['data', 'analytics', 'tracking', 'dashboard', 'experiment', 'funnel', 'definition'],
  competitor: ['competition', 'rival', 'competitors', 'campaign'],
  constraint: ['budget', 'team', 'resource', 'engineer', 'constraints', 'limit'],
  revenue: ['money', 'monetise', 'monetize', 'profit', 'commission', 'business'],
}

/** Words that appear in most cases and say little about which fact is meant. */
const GENERIC = new Set(['user', 'users', 'app', 'product', 'customer', 'feature', 'company', 'people', 'week', 'month'].map(stem))

/** The candidate's own words: the stem itself and its synonym expansion. */
interface AskedWord { raw: string; exp: Set<string> }
function askedWords(text: string): AskedWord[] {
  const words = contentWords(text).concat(text.toLowerCase().match(/\b(who|when|where|why|how)\b/g) ?? [])
  return [...new Set(words)].map((w) => ({ raw: stem(w), exp: expandStems(w) }))
}

/** Exact word matches count 2, synonym-only matches 1; a clause scores once per word of the candidate's. */
function matchScore(asked: AskedWord[], clauseText: string): { score: number; words: number } {
  const raw = new Set(contentWords(clauseText).map(stem))
  const exp = expandStems(clauseText)
  let score = 0
  let words = 0
  for (const w of asked) {
    if (w.raw.length >= 2 && raw.has(w.raw)) { score += GENERIC.has(w.raw) ? 1 : 2; words++ }
    else if ([...w.exp].some((x) => x.length >= 2 && exp.has(x))) { score += 1; words++ }
  }
  return { score, words }
}

function expandStems(text: string): Set<string> {
  const out = new Set<string>()
  for (const w of contentWords(text).concat(text.toLowerCase().match(/\b(who|when|where|why|how)\b/g) ?? [])) {
    out.add(stem(w))
    for (const [k, vs] of Object.entries(SYNONYMS)) if (k === w || vs.includes(w)) { out.add(stem(k)); vs.forEach((v) => out.add(stem(v))) }
  }
  return out
}

interface FactClause { label: string; body: string; spoken: string; gated: boolean }

const META = /\s*\((?:reveal|only|if)[^)]*\)|\s+if asked\b|\s*,?\s*(?:unless|if|only if) the candidate (?:asks|narrows[^;:.]*)/gi

/** Hidden facts split into labelled clauses ("Platform split if asked: …. App version if asked: …" → two). */
export function factClauses(question: Pick<Question, 'context'>): FactClause[] {
  const raw = [...(question.context.hiddenFacts ?? [])]
  if (question.context.caseText) raw.push(...sentences(question.context.caseText).slice(0, 40))
  const out: FactClause[] = []
  for (const fact of raw) {
    const pieces = fact.split(/(?<=\.)\s+(?=[A-Z][^.:;]{0,45}:)|(?<=;)\s+(?=[A-Za-z][^.:;]{0,45}:)/)
    for (const piece of pieces) {
      // Notes to the grader ("the candidate should …") are never said out loud.
      if (/\bthe candidate (?:should|must|needs to|is expected to)\b|\b(?:ideal|strong) answer\b/i.test(piece)) continue
      const gated = /reveal only|only if the candidate|narrows to it/i.test(piece)
      const m = piece.match(/^([^:]{1,60}):\s*(.+)$/)
      const label = m ? m[1].replace(META, '').trim() : ''
      const body = (m ? m[2] : piece).trim()
      out.push({ label, body, spoken: formatFact(piece), gated })
    }
  }
  return out
}

/** A fact as Meera would say it: card-style labels and "if asked" notes removed, one sentence, capitalised. */
export function formatFact(fact: string): string {
  let f = fact.trim().replace(META, '').replace(/\s{2,}/g, ' ').replace(/\s+([:;,.])/g, '$1').trim()
  f = f.replace(/^([^:]{1,40}):\s*/, (_m, label: string) => `${label.trim()}: `)
  f = f[0].toUpperCase() + f.slice(1)
  if (wordCount(f) > 30) f = f.split(/\s+/).slice(0, 30).join(' ').replace(/[,;:]$/, '')
  return /[.!?]$/.test(f) ? f : f + '.'
}

const ASSUMPTION_RE = /\b(?:can|could|may|shall) (?:i|we) assume\b|\b(?:i'?ll|i will|let me|let'?s|i'?m going to|i am going to) assume\b|\bis it (?:ok|okay|fine|safe|reasonable) (?:to|if) (?:i |we )?assume\b|\bassuming\b|\bfair to assume\b/i

const FALLBACKS: { re: RegExp; say: string | ((q: Question) => string) }[] = [
  { re: /\b(goal|objective|purpose|aim|priority|why (?:are|do|is) we|trying to)\b/i, say: 'The goal is yours to set. Pick the one you think matters most and tell me why.' },
  { re: /\b(how (?:many|big|large)|scale|size|volume|mau|dau|user base)\b/i, say: (q) => q.topic === 'guesstimate' ? "That's part of the estimate. Use your own number and say how you got it." : 'Assume a large consumer app in India, tens of millions of monthly users.' },
  { re: /\b(where|india|city|cities|geograph|region|country|market|metro|tier)\b/i, say: 'India. Start with the big metros.' },
  { re: /\b(when|timeline|deadline|how long|time ?frame|quarter|launch date)\b/i, say: 'Assume one quarter.' },
  { re: /\b(budget|team|resource|engineer|constraint|limit)\b/i, say: 'No hard constraints. Use your judgment on team and budget.' },
  { re: /\b(android|ios|web|mobile|platform|device|desktop)\b/i, say: 'Mobile app first, mostly Android users.' },
  { re: /\b(data|analytics|track|dashboard|experiment|a\/b|logs?)\b/i, say: 'Assume you have the usual product analytics and can run experiments.' },
  { re: /\b(competitor|competition|rival|market share)\b/i, say: 'Assume the usual competitors in this space, nothing unusual right now.' },
  { re: /\b(revenue|money|monetis|monetiz|business model|profit|pricing|price|fee)\b/i, say: 'Assume the usual business model for this kind of product. State it as you go.' },
  { re: /\b(who|user|users|customer|segment|persona|audience|target)\b/i, say: 'Your call. Pick the user group you think matters most.' },
]

const OPEN_LINES = [
  ASSUME_LINE,
  "That's open. Assume what you think is most likely and say it out loud.",
  'Not specified. Pick a sensible assumption and go with it.',
]

function given(session: MockSession): Set<string> {
  const out = new Set<string>()
  for (const t of session.turns) if (t.role === 'interviewer' && t.kind === 'clarify_a') out.add(normalise(t.text))
  return out
}

function answerOne(q: string, question: Question, clauses: FactClause[], said: Set<string>, used: Set<string>, nth: number): string {
  const asked = askedWords(q)
  // Names the candidate uses ("Bengaluru", "UPI", "Android") are strong evidence of which fact they mean.
  const named = new Set((q.match(/\b[A-Z][A-Za-z0-9]+\b/g) ?? []).map((w) => stem(w.toLowerCase())).filter((w) => w.length >= 3))
  const isAssumption = ASSUMPTION_RE.test(q)
  const wasSaid = (c: FactClause) => [...said].some((x) => x.includes(normalise(c.spoken)))
  let best: { c: FactClause; score: number } | null = null
  let tied = false
  for (const c of clauses) {
    if (used.has(c.spoken)) continue
    const label = matchScore(asked, c.label)
    const body = matchScore(asked, c.body)
    // The root cause comes out only when the candidate has narrowed to it in their own words.
    if (c.gated && body.words < 3) continue
    const raw = new Set(contentWords(`${c.label} ${c.body}`).map(stem))
    let score = label.score * 2 + body.score + [...named].filter((n) => raw.has(n)).length * 2
    // Once they have narrowed to the root cause, confirming it is the moment that matters.
    if (c.gated) score += 4
    if (wasSaid(c)) score -= 2
    if (!best || score > best.score) { best = { c, score }; tied = false }
    else if (score === best.score) tied = true
  }
  // Two facts fit an assumption equally well: it isn't clearly about either, so confirm it.
  if (isAssumption && tied) best = null
  // An assumption to confirm needs a clearly related fact before Meera corrects it; otherwise she confirms.
  if (best && best.score >= (isAssumption ? 3 : 2)) {
    used.add(best.c.spoken)
    const line = best.c.gated ? `Yes. ${formatFact(best.c.body)}` : best.c.spoken
    return wasSaid(best.c) ? `As I said, ${line[0].toLowerCase()}${line.slice(1)}` : line
  }
  if (/\b(root cause|what(?:'s| is) (?:causing|the cause|wrong)|why (?:did|is) it (?:drop|fall))\b/i.test(q)) return "That's what I'd like you to find out."
  if (isAssumption) return 'Yes, go with that.'
  for (const f of FALLBACKS) if (f.re.test(q)) return typeof f.say === 'string' ? f.say : f.say(question)
  return OPEN_LINES[nth % OPEN_LINES.length]
}

export function answerClarification(session: MockSession, question: Question, asked: string): string {
  if (session.machine.clarifications >= MAX_CLARIFICATIONS) return NO_MORE_CLARIFY_LINE
  const qs = clarifyingQuestions(asked)
  const units = (qs.length ? qs : [asked]).slice(0, 3)
  const clauses = factClauses(question)
  const said = given(session)
  const used = new Set<string>()
  const parts: string[] = []
  let open = 0
  units.forEach((q) => {
    const a = answerOne(q, question, clauses, said, used, session.machine.clarifications)
    if (OPEN_LINES.includes(a)) open++
    else if (!parts.includes(a)) parts.push(a)
  })
  // Questions with no answer in the case share one line instead of a stack of "make an assumption".
  if (open) parts.push(parts.length ? (units.length - open > 0 ? 'The rest is open. Assume what you think is most likely and say it.' : OPEN_LINES[0]) : OPEN_LINES[session.machine.clarifications % OPEN_LINES.length])
  if (qs.length > 3) parts.push("Let's start with those.")
  let out = parts.join(' ')
  while (wordCount(out) > MAX_CLARIFY_WORDS && parts.length > 1) { parts.pop(); out = parts.join(' ') }
  return out
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
