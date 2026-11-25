/* Feature vector per mock (§6.11): the single source for the offline grader, the caps and the scripted interviewer. */
import type { MockSession, Question, TopicId, Turn } from '@/domain/types'
import { LEX } from './lexicon'
import { contentWords, countMatches, hasAny, normalise, sentences, stem, stemSet, wordCount } from '@/domain/text'

export const ANSWER_KINDS: Turn['kind'][] = ['main', 'followup_a']

export function candidateTurns(session: Pick<MockSession, 'turns'>): Turn[] {
  return session.turns.filter((t) => t.role === 'candidate')
}
export function answerTurns(session: Pick<MockSession, 'turns'>): Turn[] {
  return session.turns.filter((t) => t.role === 'candidate' && ANSWER_KINDS.includes(t.kind))
}

export interface SentenceRef { text: string; turnId: string; turnIndex: number; kind: Turn['kind']; followupIndex?: number; order: number }

export function candidateSentences(session: Pick<MockSession, 'turns'>, kinds: Turn['kind'][] = ANSWER_KINDS): SentenceRef[] {
  const out: SentenceRef[] = []
  let order = 0
  for (const t of session.turns) {
    if (t.role !== 'candidate' || !kinds.includes(t.kind)) continue
    for (const s of sentences(t.text)) out.push({ text: s, turnId: t.id, turnIndex: t.index, kind: t.kind, followupIndex: t.followupIndex, order: order++ })
  }
  return out
}

export interface Features {
  topic: TopicId
  totalWords: number // all candidate turns (answers + clarifying questions)
  answerWords: number
  mainWords: number
  mainText: string
  allText: string // answers only, joined
  sentenceCount: number
  avgSentenceWords: number
  longestSentenceWords: number
  fillerCount: number
  fillerRate: number
  hedgeCount: number
  signposts: number
  labelColons: number
  clarifications: number
  assumptions: boolean
  goalStated: boolean
  goalEarly: boolean // goal in the first two sentences of the main answer
  conclusion: boolean
  conclusionInLast: boolean
  userTerms: string[] // distinct normalised user terms
  qualifiedSegment: boolean
  segmentChoice: boolean
  painStated: boolean
  insight: boolean
  solutionBeforeUser: boolean
  prioritisationLang: boolean
  criterion: boolean
  criterionIsPitfall: boolean
  tradeoff: boolean
  recommendation: boolean
  feasibility: boolean
  hypothesisOrder: boolean
  dataCheck: boolean
  metricTerms: boolean
  namedMetric: boolean
  namedMetricInMain: boolean
  guardrail: boolean
  guardrailInMain: boolean
  timeWindow: boolean
  target: boolean
  leadingLagging: boolean
  vanity: boolean
  numbersInMain: number
  numbersTotal: number
  sanity: boolean
  arithmetic: boolean
  sensitivity: boolean
  structureCoverage: number // 0–1 share of expectedStructure beats covered
  beatsCovered: number
  pitfallHits: string[]
  hintRelevance: Partial<Record<'structure' | 'userFocus' | 'prioritisation' | 'metrics' | 'communication', number>>
  shortFollowups: number // follow-up answers flagged short (after the expand prompt)
  idkTurns: number
  hintUsed: boolean
  hintDimension?: Turn['targetDimension']
  variantAsked: boolean
  variantAnswered: boolean
  variantAddressed: boolean
  jargonCount: number
  editedAfterSpeech: boolean
  voiceTurns: number
}

const NUMBER_RE = /(?:₹\s?)?\b\d[\d,]*(?:\.\d+)?\s?(?:%|k|lakh|lakhs|crore|crores|million|mn|billion|bn|cr)?\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|hundred|thousand|million|billion|lakh|crore)\b/gi

export function countNumbers(text: string): number {
  return (text.match(NUMBER_RE) ?? []).length
}

function beatStems(beat: string): string[] {
  return [...stemSet(beat.replace(/\(.*?\)/g, (m) => m))]
}

/** Share of a phrase's content stems present in a stem set. */
export function stemOverlap(phrase: string, have: Set<string>): { hit: number; of: number } {
  const ps = [...new Set(contentWords(phrase).map(stem))].filter((s) => s.length >= 2)
  let hit = 0
  for (const p of ps) if (have.has(p)) hit++
  return { hit, of: ps.length }
}

/** "No X" / "Doesn't …" pitfalls describe an omission; they are handled by caps and tags, not by matching. */
function isOmissionPitfall(p: string): boolean {
  return /^\s*(no|doesn'?t|does not|never|skips?|ignores?|forgets?|misses?|without|only)\b/i.test(p)
}

export function extractFeatures(session: Pick<MockSession, 'turns' | 'topic' | 'variant' | 'machine'>, question: Pick<Question, 'expectedStructure' | 'commonPitfalls' | 'rubricHints'> | null): Features {
  const topic = session.topic
  const cand = candidateTurns(session)
  const answers = answerTurns(session)
  const mainTurns = answers.filter((t) => t.kind === 'main')
  const mainText = mainTurns.map((t) => t.text).join(' ')
  const allText = answers.map((t) => t.text).join('\n')
  const lower = allText.toLowerCase()
  const sents = answers.flatMap((t) => sentences(t.text))
  const sentWords = sents.map(wordCount)
  const answerWords = answers.reduce((n, t) => n + wordCount(t.text), 0)
  const totalWords = cand.reduce((n, t) => n + wordCount(t.text), 0)
  const mainSents = sentences(mainText)
  const lastAnswer = answers[answers.length - 1]
  const lastText = lastAnswer?.text ?? ''

  // distinct user types by head noun ("repeat shoppers" and "shopper" are one type)
  const userMatches = (allText.match(LEX.userTerm) ?? []).filter((u) => normalise(u) !== 'people who').map((u) => {
    const ws = normalise(u).split(' ')
    return ws[ws.length - 1].replace(/ies$/, 'y').replace(/(ss)$/, '$1').replace(/([^s])s$/, '$1')
  })
  const userTerms = [...new Set(userMatches)]

  // solution before user: first solution sentence appears before the first sentence with a user term
  let firstSolution = -1, firstUser = -1
  sents.forEach((s, i) => {
    if (firstSolution < 0 && LEX.solutionPhrase.test(s)) firstSolution = i
    if (firstUser < 0 && new RegExp(LEX.userTerm.source, 'i').test(s)) firstUser = i
  })

  const allStems = stemSet(allText)
  const beats = question?.expectedStructure ?? []
  let beatsCovered = 0
  for (const b of beats) {
    const bs = beatStems(b)
    if (!bs.length) continue
    const { hit, of } = stemOverlap(b, allStems)
    if (of > 0 && (hit / of >= 0.4 || hit >= 4)) beatsCovered++
  }
  const structureCoverage = beats.length ? beatsCovered / beats.length : 0

  const pitfallHits: string[] = []
  for (const p of question?.commonPitfalls ?? []) {
    if (isOmissionPitfall(p)) continue
    const { hit, of } = stemOverlap(p, allStems)
    if (of >= 3 && hit >= 3 && hit / of >= 0.6) pitfallHits.push(p)
  }

  const hintRelevance: Features['hintRelevance'] = {}
  for (const [d, hint] of Object.entries(question?.rubricHints ?? {})) {
    if (!hint) continue
    const { hit, of } = stemOverlap(hint, allStems)
    hintRelevance[d as keyof Features['hintRelevance']] = of ? hit / of : 0
  }

  const criterionSentences = sents.filter((s) => hasAny(s, LEX.criterion))
  const criterionIsPitfall = criterionSentences.length > 0 && criterionSentences.every((s) => /\beas(y|iest|ier) to (move|measure|track|grow|get)\b|\bbusiness cares\b|\beveryone (uses|tracks)\b/i.test(s))

  const fillerCount = (allText.match(LEX.fillers) ?? []).length
  const hedgeCount = (allText.match(LEX.hedges) ?? []).length

  const variantAsked = !!session.turns.find((t) => t.role === 'interviewer' && t.isVariant)
  const variantIdx = session.variant?.atFollowup
  const variantAnswers = answers.filter((t) => t.kind === 'followup_a' && variantIdx != null && t.followupIndex === variantIdx)
  const variantText = variantAnswers.map((t) => t.text).join(' ')
  let variantAddressed = false
  if (variantAsked && session.variant && variantText) {
    const vs = stemSet(session.variant.value)
    const as = stemSet(variantText)
    vs.forEach((s) => { if (as.has(s)) variantAddressed = true })
  }

  const acronyms = (allText.match(LEX.jargonAcronym) ?? []).filter((a) => !/^(I|OK|AI|UPI|DAU|WAU|MAU|NPS|AOV|KPI|PM|CEO|VP|US|UK|EV|GMV|CTR|QR|ID|A|B)s?$/.test(a))

  const labelColons = (allText.match(LEX.labelColon) ?? []).length

  return {
    topic,
    totalWords,
    answerWords,
    mainWords: wordCount(mainText),
    mainText,
    allText,
    sentenceCount: sents.length,
    avgSentenceWords: sents.length ? answerWords / sents.length : 0,
    longestSentenceWords: sentWords.length ? Math.max(...sentWords) : 0,
    fillerCount,
    fillerRate: answerWords ? fillerCount / answerWords : 0,
    hedgeCount,
    signposts: countMatches(allText, LEX.signpost),
    labelColons,
    clarifications: cand.filter((t) => t.kind === 'clarify_q').length,
    assumptions: hasAny(lower, LEX.assumption),
    goalStated: hasAny(lower, LEX.goal),
    goalEarly: mainSents.slice(0, 2).some((s) => hasAny(s, LEX.goal)),
    conclusion: hasAny(allText, LEX.conclusion),
    conclusionInLast: hasAny(lastText, LEX.conclusion) || hasAny(mainSents[mainSents.length - 1] ?? '', LEX.conclusion),
    userTerms,
    qualifiedSegment: userTerms.length > 0 && (allText.match(LEX.segmentQualifier) ?? []).some((q) => /\b(shoppers?|users?|customers?|students?|buyers?|riders?|drivers?|merchants?|shops?|sellers?|families|households?|learners?|travell?ers?|members?|subscribers?|parents?|owners?|commuters?|professionals?|cohorts?)\b/i.test(q)),
    segmentChoice: sents.some((s) => hasAny(s, LEX.segmentChoice) && new RegExp(LEX.userTerm.source, 'i').test(s)),
    painStated: hasAny(lower, LEX.pain),
    insight: hasAny(lower, LEX.insight),
    solutionBeforeUser: firstSolution >= 0 && (firstUser < 0 || firstSolution < firstUser),
    prioritisationLang: hasAny(lower, LEX.prioritisation),
    criterion: criterionSentences.length > 0 && !criterionIsPitfall,
    criterionIsPitfall,
    tradeoff: hasAny(lower, LEX.tradeoff),
    recommendation: hasAny(lower, LEX.recommendation),
    feasibility: hasAny(lower, LEX.feasibility),
    hypothesisOrder: hasAny(lower, LEX.hypothesisOrder),
    dataCheck: hasAny(lower, LEX.dataCheck),
    metricTerms: hasAny(lower, LEX.metricTerm),
    namedMetric: hasAny(allText, LEX.namedMetric),
    namedMetricInMain: hasAny(mainText, LEX.namedMetric),
    guardrail: hasAny(lower, LEX.guardrail),
    guardrailInMain: hasAny(mainText.toLowerCase(), LEX.guardrail),
    timeWindow: hasAny(lower, LEX.timeWindow),
    target: hasAny(lower, LEX.target),
    leadingLagging: hasAny(lower, LEX.leadingLagging),
    vanity: hasAny(lower, LEX.vanity),
    numbersInMain: countNumbers(mainText),
    numbersTotal: countNumbers(allText),
    sanity: hasAny(lower, LEX.sanity),
    arithmetic: hasAny(lower, LEX.arithmetic),
    sensitivity: hasAny(lower, LEX.sensitivity),
    structureCoverage,
    beatsCovered,
    pitfallHits,
    hintRelevance,
    shortFollowups: answers.filter((t) => t.kind === 'followup_a' && t.flags.includes('short')).length,
    idkTurns: cand.filter((t) => t.flags.includes('idk')).length,
    hintUsed: !!session.machine?.hintUsed,
    hintDimension: session.machine?.hintDimension,
    variantAsked,
    variantAnswered: variantAnswers.length > 0,
    variantAddressed,
    jargonCount: acronyms.length,
    editedAfterSpeech: cand.some((t) => t.flags.includes('edited_after_speech')),
    voiceTurns: cand.filter((t) => t.inputMode === 'voice').length,
  }
}
