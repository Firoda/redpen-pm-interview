/* Offline grader (§6.11): deterministic heuristic scoring from the feature vector. Strict by construction:
   a 4 needs every behaviour in the anchor to be visible in the transcript, a 5 needs more than that. */
import type { RawGrade } from '@/ai/types'
import type { DimensionId, GradeInput, IssueTag, MockSession, Question, TopicId } from '@/domain/types'
import { DIMENSIONS } from '@/domain/types'
import { hasAny, stripEndPunct, trimWords, wordCount } from '@/domain/text'
import { LEX } from './lexicon'
import { type Features, extractFeatures } from './features'
import { answerSentences, fitQuote } from './quotes'
import { pickTemplate, TAG_SHORT } from './fixTemplates'
import { capsFromFeatures, applyCaps } from './caps'
import { orderDimensionsForFixes, weightedOverall } from './weights'

type Scores = Record<DimensionId, number>
type Sent = { text: string; turnId: string; kind: string; followupIndex?: number }

const APPROACH = /\b(top[- ]down|bottom[- ]up|my approach|i('| wi)ll (start|break|split|segment|estimate)|break (it|this) (down|into)|split (it|this|by)|segment(ed)? by|let me (structure|break))\b/i
const METRICISH = /\b(metric|measure|count|volume|nps|rating|revenue|rate|success|number)\b/i

/* ---------------- dimension scoring ---------------- */

export interface DimScore { score: number; notes: string[] }

export function scoreDimensions(f: Features): Record<DimensionId, DimScore> {
  const out = {} as Record<DimensionId, DimScore>
  const metricPitfall = f.pitfallHits.some((p) => METRICISH.test(p))
  const otherPitfalls = f.pitfallHits.filter((p) => !METRICISH.test(p))

  // Structure
  {
    const notes: string[] = []
    let pts = 0
    const substantive = f.mainWords >= 35 && (f.beatsCovered >= 1 || f.structureCoverage === 0)
    if (substantive) pts++; else notes.push('thin_main')
    const signposted = f.signposts >= 2 || f.labelColons >= 2 || APPROACH.test(f.mainText)
    if (signposted) pts++; else notes.push('no_signposts')
    const framing = f.clarifications > 0 || f.assumptions || f.goalEarly || (f.topic === 'rca' && f.dataCheck) || (f.topic === 'guesstimate' && APPROACH.test(f.mainText))
    if (framing) pts++; else notes.push('no_framing')
    const closing = (f.conclusionInLast || f.conclusion || f.recommendation) && (f.structureCoverage >= 0.5 || (f.structureCoverage === 0 && f.sentenceCount >= 5))
    if (closing) pts++; else notes.push('no_closing')
    let score = Math.min(4, 1 + pts)
    if (score === 4 && f.variantAsked && f.variantAddressed && f.structureCoverage >= 0.8 && (f.clarifications > 0 || f.assumptions)) score = 5
    out.structure = { score, notes }
  }

  // User focus
  {
    const notes: string[] = []
    let pts = 0
    const named = f.userTerms.length > 0
    if (named) pts++; else notes.push('no_user')
    if (f.qualifiedSegment || f.userTerms.length >= 2) pts++; else notes.push('generic')
    if (f.painStated || f.segmentChoice) pts++; else notes.push('no_pain_or_choice')
    let score = 1 + pts
    if (score >= 4 && !(f.segmentChoice && f.painStated && (f.userTerms.length >= 2 || f.qualifiedSegment) && (f.criterion || f.goalStated))) { score = 3; notes.push('not_hire_bar') }
    if (score === 4 && f.insight && f.userTerms.length >= 2) score = 5
    if (f.solutionBeforeUser && f.topic === 'product_design') { score = Math.min(score, 2); notes.push('solution_first') }
    out.userFocus = { score, notes }
  }

  // Prioritisation
  {
    const notes: string[] = []
    let pts = 0
    const choice = f.prioritisationLang || f.hypothesisOrder
    if (choice) pts++; else notes.push('no_choice')
    if (f.criterion) pts++; else notes.push(f.criterionIsPitfall ? 'pitfall_criterion' : 'no_criterion')
    if (f.tradeoff) pts++; else notes.push('no_tradeoff')
    let score = 1 + pts
    const commit = f.recommendation || f.segmentChoice || /\b(north[- ]star|main metric|primary metric)\b/i.test(f.allText)
    if (score >= 4 && !commit) { score = 3; notes.push('no_commit') }
    if (f.topic === 'rca' && !f.hypothesisOrder && score > 3) { score = 3; notes.push('no_order') }
    if (f.topic === 'strategy' && !f.feasibility && score > 3) { score = 3; notes.push('no_feasibility') }
    if (score === 4 && f.variantAsked && f.variantAddressed && f.recommendation && f.feasibility) score = 5
    if (otherPitfalls.length && score > 1) { score -= 1; notes.push('pitfall') }
    out.prioritisation = { score, notes }
  }

  // Metrics / Numbers & maths
  {
    const notes: string[] = []
    let score: number
    if (f.topic === 'guesstimate') {
      let pts = 0
      if (f.numbersInMain >= 3) pts++; else notes.push('few_numbers')
      if (f.assumptions || /\b\d+(\.\d+)?\s?% of\b/i.test(f.allText)) pts++; else notes.push('no_assumptions')
      if (f.arithmetic) pts++; else notes.push('no_arithmetic')
      if (f.sanity) pts++; else notes.push('no_sanity')
      score = Math.min(4, 1 + pts)
      if (score === 4 && !(f.sanity && f.arithmetic && f.numbersTotal >= 5)) score = 3
      if (score === 4 && f.sensitivity) score = 5
    } else {
      let pts = 0
      if (f.metricTerms) pts++; else notes.push('no_metric')
      if (f.namedMetric) pts++; else notes.push('vague')
      if (f.guardrail) pts++; else notes.push('no_guardrail')
      if (f.timeWindow || f.target) pts++; else notes.push('no_window')
      score = Math.min(4, 1 + pts)
      if (score >= 4 && !(f.guardrailInMain && f.namedMetric && (f.timeWindow || f.target))) { score = 3; notes.push(f.guardrailInMain ? 'loose' : 'guardrail_late') }
      if (score === 4 && f.leadingLagging && f.target) score = 5
      if ((f.vanity || metricPitfall) && score > 1) { score -= 1; notes.push(f.vanity ? 'vanity' : 'pitfall') }
    }
    out.metrics = { score, notes }
  }

  // Communication
  {
    const notes: string[] = []
    let pts = 0
    const responsive = f.shortFollowups === 0 && f.idkTurns === 0
    if (responsive) pts++; else notes.push('dodged')
    const concise = f.avgSentenceWords <= 28 && f.fillerRate < 0.03 && f.answerWords <= 900
    if (concise) pts++; else notes.push('rambling')
    if (f.signposts >= 2 || f.labelColons >= 2 || f.conclusion) pts++; else notes.push('no_signposts')
    if (f.conclusionInLast || f.recommendation) pts++; else notes.push('no_summary')
    let score = Math.min(4, 1 + pts)
    if (score === 4 && !(concise && responsive)) score = 3
    if (f.topic === 'tech' && f.jargonCount >= 4 && score > 3) { score = 3; notes.push('jargon') }
    if (score === 4 && f.hedgeCount === 0 && f.conclusionInLast && (f.signposts >= 2 || f.labelColons >= 2) && f.totalWords >= 180 && hasAny(f.mainText.split(/[.!?]/)[0] ?? '', LEX.recommendation.concat(LEX.goal))) score = 5
    out.communication = { score, notes }
  }

  // Small credit for hitting the question's own rubric hint, never above 3.
  for (const d of DIMENSIONS) {
    const rel = f.hintRelevance[d] ?? 0
    if (rel >= 0.5 && out[d].score === 2) out[d].score = 3
  }
  return out
}

/* ---------------- issue tags ---------------- */

export function pickTag(d: DimensionId, f: Features, notes: string[]): IssueTag {
  switch (d) {
    case 'structure':
      if (f.variantAsked && f.variantAnswered && !f.variantAddressed) return 'ignored_variant'
      if (f.topic === 'rca' && !f.dataCheck) return 'no_data_check'
      if (!f.goalStated && f.topic !== 'guesstimate' && f.topic !== 'tech') return 'no_goal'
      if (f.clarifications === 0 && !f.assumptions && (f.topic === 'product_design' || f.topic === 'strategy' || f.topic === 'guesstimate' || f.topic === 'rca')) return 'no_clarify'
      return 'no_summary'
    case 'userFocus':
      if (f.solutionBeforeUser) return 'solution_first'
      if (f.userTerms.length >= 2 && !f.segmentChoice) return 'no_segment_choice'
      return 'generic_user'
    case 'prioritisation':
      if (!f.prioritisationLang && !f.hypothesisOrder) return f.sentenceCount >= 4 ? 'feature_list' : 'no_recommendation'
      if (!f.criterion) return 'no_criterion'
      if (f.topic === 'rca' && !f.hypothesisOrder) return 'no_hypothesis_order'
      if (!f.tradeoff) return 'no_tradeoff'
      if (f.topic === 'strategy' && !f.feasibility) return 'infeasible_plan'
      if (!f.recommendation) return 'no_recommendation'
      return 'no_tradeoff'
    case 'metrics':
      if (f.topic === 'guesstimate') {
        if (f.numbersInMain < 3 || (!f.assumptions && !/\b\d+(\.\d+)?\s?% of\b/i.test(f.allText))) return 'unstated_assumption'
        if (!f.sanity) return 'no_sanity_check'
        return 'unstated_assumption'
      }
      if (!f.metricTerms) return 'no_metric'
      if (!f.guardrailInMain) return 'no_guardrail'
      return 'vague_metric'
    case 'communication':
      if (f.shortFollowups > 0 || f.idkTurns > 0) return 'dodged_followup'
      if (f.topic === 'tech' && f.jargonCount >= 3) return 'jargon'
      return 'rambling'
  }
}

/* ---------------- quote selection ---------------- */

const USER_RE = () => new RegExp(LEX.userTerm.source, 'i')

function goodSentences(session: Pick<MockSession, 'turns'>): Sent[] {
  return answerSentences(session).filter((s) => wordCount(s.text) >= 4)
}

function firstMain(ss: Sent[]): Sent[] { return ss.filter((s) => s.kind === 'main').slice(0, 1) }
function lastOfLastTurn(ss: Sent[]): Sent[] {
  if (!ss.length) return []
  const lastTurn = ss[ss.length - 1].turnId
  const inTurn = ss.filter((s) => s.turnId === lastTurn)
  return inTurn.slice(-1)
}

/** Candidate sentences for a fix quote, most relevant first, plus the clause focus regex. */
/** Tags whose quote rule names one specific sentence: keep it even if another fix already quotes that turn. */
const STRICT_QUOTE_TAGS: IssueTag[] = ['no_goal', 'no_clarify', 'no_data_check', 'no_summary', 'ignored_variant', 'solution_first', 'dodged_followup']

export function quoteCandidates(tag: IssueTag, session: Pick<MockSession, 'turns' | 'variant'>, f: Features): { list: Sent[]; focus?: RegExp } {
  const ss = goodSentences(session)
  const main = ss.filter((s) => s.kind === 'main')
  const by = (re: RegExp) => ss.filter((s) => re.test(s.text))
  const uniq = (...lists: Sent[][]) => { const seen = new Set<string>(); const out: Sent[] = []; for (const l of lists) for (const s of l) { const k = s.turnId + '|' + s.text; if (!seen.has(k)) { seen.add(k); out.push(s) } } return out }
  const longest = [...ss].sort((a, b) => wordCount(b.text) - wordCount(a.text))
  const numbersDesc = [...ss].sort((a, b) => (b.text.match(/\d/g)?.length ?? 0) - (a.text.match(/\d/g)?.length ?? 0))
  switch (tag) {
    case 'no_goal': case 'no_clarify': case 'no_data_check':
      return { list: uniq(firstMain(ss), main, ss) }
    case 'no_summary':
      return { list: uniq(lastOfLastTurn(ss), [...ss].reverse()) }
    case 'ignored_variant': {
      const v = session.variant?.atFollowup
      return { list: uniq(ss.filter((s) => s.kind === 'followup_a' && s.followupIndex === v), ss) }
    }
    case 'solution_first':
      return { list: uniq(by(LEX.solutionPhrase), firstMain(ss), ss), focus: LEX.solutionPhrase }
    case 'generic_user': case 'no_segment_choice':
      return { list: uniq(ss.filter((s) => USER_RE().test(s.text)), firstMain(ss), ss), focus: USER_RE() }
    case 'feature_list':
      return { list: uniq([...ss].sort((a, b) => (b.text.split(/,| and /).length) - (a.text.split(/,| and /).length)), ss) }
    case 'no_criterion': {
      const crit = ss.filter((s) => /\bbecause\b|\bsince\b/i.test(s.text))
      const choice = ss.filter((s) => hasAny(s.text, LEX.prioritisation))
      return { list: uniq(crit, choice, firstMain(ss), ss), focus: crit.length ? /\bbecause\b|\bsince\b/i : /\b(main|primary|pick|choose|first)\b/i }
    }
    case 'no_tradeoff': case 'no_recommendation': case 'infeasible_plan':
      return { list: uniq(ss.filter((s) => hasAny(s.text, LEX.recommendation)), ss.filter((s) => hasAny(s.text, LEX.prioritisation)), lastOfLastTurn(ss), ss), focus: /\b(recommend|ship|launch|go with|pick|choose|main|first)\b/i }
    case 'no_hypothesis_order':
      return { list: uniq(by(/\b(hypothes|could be|might be|maybe|possibly|reasons?)\b/i), longest), focus: /\b(hypothes|could be|might be|maybe|possibly|reasons?)\b/i }
    case 'no_metric':
      return { list: uniq(by(/\b(success|measure|know|working|worked|go(es)? up)\b/i), main.slice(-1), ss), focus: /\b(success|measure|know|working|worked|go(es)? up)\b/i }
    case 'vague_metric':
      return { list: uniq(ss.filter((s) => /\b(north[- ]star|main metric|primary metric|key metric)\b/i.test(s.text)), ss.filter((s) => hasAny(s.text, LEX.namedMetric)), ss), focus: /\b(north[- ]star|metric|share of|rate|per)\b/i }
    case 'no_guardrail':
      return { list: uniq(by(/\b(success|working|worked|go(es)? up|know)\b/i), main.filter((s) => hasAny(s.text, LEX.namedMetric)), main.slice(-1), ss), focus: /\b(success|working|worked|go(es)? up|know|metric)\b/i }
    case 'unstated_assumption': case 'math_error':
      return { list: uniq(numbersDesc, ss), focus: /\d/ }
    case 'no_sanity_check':
      return { list: uniq([...ss].reverse().filter((s) => /\d/.test(s.text)), lastOfLastTurn(ss), ss), focus: /\d/ }
    case 'rambling':
      return { list: uniq([...ss].sort((a, b) => ((b.text.match(LEX.fillers)?.length ?? 0) - (a.text.match(LEX.fillers)?.length ?? 0)) || (wordCount(b.text) - wordCount(a.text))), ss) }
    case 'jargon':
      return { list: uniq([...ss].sort((a, b) => (b.text.match(LEX.jargonAcronym)?.length ?? 0) - (a.text.match(LEX.jargonAcronym)?.length ?? 0)), ss) }
    case 'dodged_followup': {
      const shortTurns = session.turns.filter((t) => t.role === 'candidate' && t.kind === 'followup_a' && (t.flags.includes('short') || t.flags.includes('idk')))
      const fromShort = ss.filter((s) => shortTurns.some((t) => t.id === s.turnId))
      return { list: uniq(fromShort, ss.filter((s) => s.kind === 'followup_a'), ss) }
    }
  }
}

export function pickQuote(tag: IssueTag, session: Pick<MockSession, 'turns' | 'variant'>, f: Features, usedTurnIds: Set<string> = new Set()): { quote: string; turnId: string } | null {
  const { list, focus } = quoteCandidates(tag, session, f)
  const pool = list.length ? list : answerSentences(session)
  if (!pool.length) {
    const t = session.turns.find((x) => x.role === 'candidate' && x.text.trim())
    return t ? { quote: stripEndPunct(trimWords(t.text, 25)), turnId: t.id } : null
  }
  const pick = STRICT_QUOTE_TAGS.includes(tag) ? pool[0] : pool.find((s) => !usedTurnIds.has(s.turnId)) ?? pool[0]
  return { quote: fitQuote(pick.text, focus), turnId: pick.turnId }
}

/* ---------------- reasons, strength, verdict ---------------- */

function frag(s: string | undefined, max = 8): string {
  if (!s) return ''
  let t = stripEndPunct(s)
  if (wordCount(t) > max) {
    const cut = t.split(/\s(?:and|but|so|which|to see|on top of)\s/i)[0]
    if (wordCount(cut) >= 3) t = cut
  }
  return stripEndPunct(trimWords(t, max))
}

function sentenceMatching(f: Features, session: Pick<MockSession, 'turns'>, re: RegExp | RegExp[]): Sent | undefined {
  const ss = goodSentences(session)
  const res = Array.isArray(re) ? re : [re]
  return ss.find((s) => res.some((r) => r.test(s.text)))
}

export function reasonFor(d: DimensionId, score: number, notes: string[], f: Features, session: Pick<MockSession, 'turns'>): string {
  const ss = goodSentences(session)
  const first = ss.find((s) => s.kind === 'main')
  switch (d) {
    case 'structure': {
      if (score >= 4) return 'Signposted the approach, followed it through and closed with a conclusion.'
      const gaps: string[] = []
      if (!f.goalStated && f.topic !== 'guesstimate') gaps.push('never said what the product or feature is for')
      if (notes.includes('no_signposts')) gaps.push('the steps were not signposted')
      if (notes.includes('no_closing')) gaps.push('it ended without a conclusion')
      if (f.variantAsked && !f.variantAddressed) gaps.push('the changed constraint was not picked up')
      if (score === 3) return `A recognisable approach, but ${gaps.slice(0, 2).join(' and ') || 'one stage stays thin'}.`
      if (score === 2 && first) return `Opened with "${frag(first.text)}" and ${gaps[0] ?? 'skipped a key stage'}.`
      return 'No discernible approach; points arrive in no particular order.'
    }
    case 'userFocus': {
      const terms = f.userTerms.slice(0, 3)
      if (score >= 4) return 'Picks a segment for a stated reason and names a specific need, with secondary stakeholders in view.'
      if (score === 3) return `Mentions ${terms.join(' and ') || 'the user'}, but ${f.segmentChoice ? 'the specific pain stays general' : 'never picks one segment and says why'}.`
      if (score === 2) return notes.includes('solution_first') ? 'A solution comes before any user is chosen, so the need it serves is unclear.' : `Users appear only as ${terms.length ? `"${terms[0]}"` : 'a generic group'}; no segment is chosen and no specific pain is named.`
      return 'No user or segment is named.'
    }
    case 'prioritisation': {
      if (score >= 4) return 'Picks one option on a stated criterion and names the main risk of that choice.'
      if (notes.includes('pitfall_criterion')) {
        const s = sentenceMatching(f, session, /\bbecause\b|\bsince\b/i)
        return s ? `Chose the main option ${frag(fitQuote(s.text, /\bbecause\b|\bsince\b/i), 9)}, which is not a reason tied to the goal.` : 'The reason given for the choice is convenience, not the goal.'
      }
      if (score === 3) return notes.includes('no_tradeoff') ? 'Applies a criterion to make a choice, but no trade-off or risk is named.' : 'Makes a reasoned choice but never commits to a clear recommendation.'
      if (score === 2) return 'Makes a choice but gives no criterion that ties it to the goal.'
      return 'Lists options without choosing any.'
    }
    case 'metrics': {
      if (f.topic === 'guesstimate') {
        if (score >= 4) return 'Assumptions stated with numbers, clean arithmetic, and a sanity check on the result.'
        if (score === 3) return notes.includes('no_sanity') ? 'Assumptions and arithmetic are visible, but the final number is never sanity-checked.' : 'Numbers are shown, but the working has gaps.'
        if (score === 2) return 'Numbers appear without the assumptions behind them, so the estimate cannot be checked.'
        return 'Almost no numbers are shown.'
      }
      const named = sentenceMatching(f, session, LEX.namedMetric)
      if (score >= 4) return 'Defines a primary metric with a time window and pairs it with a guardrail.'
      if (score === 3) return `A relevant metric${named ? ` ("${frag(fitQuote(named.text, /\b(metric|rate|share|per|north)\b/i), 8)}")` : ''}, but ${notes.includes('guardrail_late') || notes.includes('no_guardrail') ? 'no counter-metric in the main answer' : 'the definition has no population or time window'}.`
      if (score === 2) {
        if (notes.includes('vanity')) return 'Leans on app-wide signals that say little about this feature, and no guardrail appears in the main answer.'
        return 'Metrics are named loosely and not tied to the goal.'
      }
      return 'No metric is named.'
    }
    case 'communication': {
      if (score >= 4) return 'Concise and signposted; answers follow-ups directly and lands a conclusion.'
      if (score === 3) {
        const gaps: string[] = []
        if (notes.includes('no_signposts')) gaps.push('no signposting')
        if (notes.includes('no_summary')) gaps.push('no closing summary')
        if (notes.includes('dodged')) gaps.push('one follow-up got a thin answer')
        if (notes.includes('rambling')) gaps.push('some long sentences')
        if (notes.includes('jargon')) gaps.push('unexplained jargon')
        return `Clear enough, but ${gaps.slice(0, 2).join(' and ') || 'it lacks a summary'}.`
      }
      if (score === 2) return notes.includes('dodged') ? 'Follow-ups got thin answers, and the main point is hard to find.' : 'The point is buried in long sentences and filler.'
      return 'Hard to follow; does not answer the question.'
    }
  }
}

function evidenceFor(d: DimensionId, f: Features, session: Pick<MockSession, 'turns'>): { quote: string; turnId: string }[] {
  const pickers: Record<DimensionId, { re: RegExp | RegExp[]; focus?: RegExp }> = {
    structure: { re: [LEX.goal[0], /^(first|my approach|north star|goal)/i, LEX.conclusion[0]], focus: /\b(goal|first|approach)\b/i },
    userFocus: { re: USER_RE(), focus: USER_RE() },
    prioritisation: { re: [/\bbecause\b/i, ...LEX.recommendation, ...LEX.prioritisation], focus: /\bbecause\b|\b(main|pick|choose|ship|recommend|first)\b/i },
    metrics: f.topic === 'guesstimate' ? { re: /\d/, focus: /\d/ } : { re: [...LEX.guardrail.slice(0, 2), ...LEX.namedMetric], focus: /\b(metric|rate|share|per|north|guardrail|counter)\b/i },
    communication: { re: [...LEX.conclusion, ...LEX.recommendation], focus: undefined },
  }
  const p = pickers[d]
  const s = sentenceMatching(f, session, p.re) ?? (d === 'structure' || d === 'communication' ? goodSentences(session)[0] : undefined)
  return s ? [{ quote: fitQuote(s.text, p.focus), turnId: s.turnId }] : []
}

const STRENGTH_TEXT: Record<DimensionId, string> = {
  structure: 'Laid out the approach before going into detail.',
  userFocus: 'Grounded the answer in a specific user and their need.',
  prioritisation: 'Made a clear choice and gave a reason for it.',
  metrics: 'Named a concrete, measurable success metric.',
  communication: 'Kept the answers short and direct.',
}

export function strengthFor(scores: Scores, f: Features, session: Pick<MockSession, 'turns'>, topic: TopicId): RawGrade['strength'] {
  // Took pushback well: a follow-up answer that adds to the earlier answer ("also", "I'd add")
  const ss = goodSentences(session)
  const pushback = ss.find((s) => s.kind === 'followup_a' && /\b(i('d| would) also|i('d| would) add|also track|on reflection|good catch|fair point)\b/i.test(s.text))
  const best = [...DIMENSIONS].sort((a, b) => scores[b] - scores[a])[0]
  if (pushback && scores[best] <= 3) {
    return { text: 'Took the pushback and extended the answer without getting defensive.', quote: fitQuote(pushback.text, /\balso\b|\badd\b/i), turnId: pushback.turnId }
  }
  if (scores[best] < 3) return undefined
  const ev = evidenceFor(best, f, session)[0]
  if (!ev || wordCount(ev.quote) < 4) return undefined
  return { text: topic === 'guesstimate' && best === 'metrics' ? 'Showed the working with numbers at each step.' : STRENGTH_TEXT[best], quote: ev.quote, turnId: ev.turnId }
}

export function verdictFor(overall: number, tags: IssueTag[]): string {
  const [a, b, c] = tags.map((t) => TAG_SHORT[t])
  if (overall < 2.5) return `Below the hire bar: ${[a, b].filter(Boolean).join(', ')}${c ? ` and ${c}` : ''}.`
  if (overall < 3.5) return `Borderline: ${a}${b ? ` and ${b}` : ''} hold this answer back.`
  if (overall < 4) return `Close to the hire bar; ${a} is what stands between this and a clear pass.`
  return `At the hire bar; the next step up is fixing ${a}.`
}

/* ---------------- fixes ---------------- */

export function offlineFix(d: DimensionId, session: Pick<MockSession, 'turns' | 'variant' | 'id'>, f: Features, notes: string[], usedTurnIds: Set<string>): RawGrade['fixes'][number] | null {
  const tag = pickTag(d, f, notes)
  const q = pickQuote(tag, session, f, usedTurnIds)
  if (!q) return null
  const tpl = pickTemplate(tag, (session.id ?? '') + ':' + tag)
  return { dimension: d, issueTag: tag, quote: q.quote, turnId: q.turnId, issue: tpl.issue, instruction: tpl.instruction, pattern: tpl.pattern }
}

/* ---------------- entry point ---------------- */

export interface OfflineGradeDetail { raw: RawGrade; features: Features; notes: Record<DimensionId, string[]> }

export function offlineGradeDetailed(input: Pick<GradeInput, 'session' | 'question'>): OfflineGradeDetail {
  const { session, question } = input
  const f = extractFeatures(session, question)
  const dims = scoreDimensions(f)
  const notes = Object.fromEntries(DIMENSIONS.map((d) => [d, dims[d].notes])) as Record<DimensionId, string[]>
  const rawScores = Object.fromEntries(DIMENSIONS.map((d) => [d, dims[d].score])) as Scores
  const capped = applyCaps(rawScores, capsFromFeatures(f)).scores

  const dimensions = DIMENSIONS.map((d) => ({
    dimension: d,
    score: rawScores[d],
    reason: reasonFor(d, capped[d], notes[d], f, session),
    evidence: evidenceFor(d, f, session),
  }))

  const order = orderDimensionsForFixes(session.topic, capped).slice(0, 3)
  const used = new Set<string>()
  const fixes: RawGrade['fixes'] = []
  for (const d of order) {
    const fx = offlineFix(d, session, f, notes[d], used)
    if (fx) { fixes.push(fx); used.add(fx.turnId) }
  }
  const overall = weightedOverall(session.topic, capped)
  const verdict = verdictFor(overall, fixes.map((x) => x.issueTag as IssueTag))
  return {
    raw: {
      dimensions,
      fixes,
      strength: strengthFor(capped, f, session, session.topic),
      verdict,
      confidence: f.totalWords >= 200 && !f.editedAfterSpeech ? 'medium' : 'low',
    },
    features: f,
    notes,
  }
}

export function offlineGrade(input: Pick<GradeInput, 'session' | 'question'>): RawGrade {
  return offlineGradeDetailed(input).raw
}

export type { Question }
