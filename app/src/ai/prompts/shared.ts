/* Shared prompt material for the live AI calls (BUILD_PROMPT_STRUCTURE.md Part B, MASTER_PLAN.md §6–7).
 * Pure functions and constant text only: no network, no React, no Date.now(). Owner: LIVE_AI agent. */
import type { DimensionId, IssueTag, MockSession, Question, TopicId, Turn } from '@/domain/types'
import { DIMENSIONS, DIMENSION_LABEL, TOPIC_LABEL } from '@/domain/types'

/* ---------------- tags and escaping ---------------- */

const OUR_TAGS = /<(\/?)\s*(candidate_turn|interviewer_turn|transcript|state|case_material|question_card|session|instruction)\b/gi

/** Neutralise anything in user-supplied text that looks like one of our own tags, so a candidate cannot
 *  close <candidate_turn> early and write "instructions" outside it. Only the '<' of our tag names is changed,
 *  so quotes stay copyable for the grader. */
export function escapeTagText(s: string): string {
  return s.replace(OUR_TAGS, (_m, slash: string, name: string) => `‹${slash}${name}`)
}

export function wordCount(s: string): number {
  const t = s.trim()
  return t ? t.split(/\s+/).length : 0
}

/** Pasted or very long answers: the model sees the first 300 and last 1,500 words (MASTER_PLAN §4.5). */
export function truncateLong(text: string): { text: string; truncated: boolean } {
  const words = text.trim().split(/\s+/)
  if (words.length <= 2500) return { text, truncated: false }
  const omitted = words.length - 1800
  return {
    text: `${words.slice(0, 300).join(' ')} […${omitted} words omitted…] ${words.slice(-1500).join(' ')}`,
    truncated: true,
  }
}

/** The transcript in tags. Candidate turns carry their input mode; interviewer turns carry nothing else. */
export function renderTranscript(turns: Turn[]): string {
  const lines = turns.map((t) => {
    if (t.role === 'interviewer') {
      return `<interviewer_turn id="${t.id}">${escapeTagText(t.text)}</interviewer_turn>`
    }
    const { text, truncated } = truncateLong(t.text)
    const mode = t.inputMode ?? 'text'
    return `<candidate_turn id="${t.id}" mode="${mode}"${truncated ? ' truncated="true"' : ''}>${escapeTagText(text)}</candidate_turn>`
  })
  return `<transcript>\n${lines.join('\n')}\n</transcript>`
}

/** Session turns plus the just-submitted answer if the engine has not appended it yet. */
export function turnsWithLast(session: MockSession, last?: Turn): Turn[] {
  if (!last || session.turns.some((t) => t.id === last.id)) return session.turns
  return [...session.turns, last]
}

export function topicDisplay(q: Pick<Question, 'topic' | 'subtype'>): string {
  return `${TOPIC_LABEL[q.topic]} / ${q.subtype.replace(/_/g, ' ')}`
}

export function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/* ---------------- coverage areas (MASTER_PLAN §6.3) ---------------- */

export const COVERAGE_AREAS: Record<TopicId, Record<string, string>> = {
  product_design: {
    goal: 'the business or user goal and the constraints, stated before ideas',
    users: 'user segments named, and one chosen with a reason',
    pains: 'specific pain points of the chosen user',
    criterion: 'an explicit criterion used to prioritise',
    solutions: 'several solutions, and one picked',
    success_metric: 'a success metric and a guardrail',
    risks: 'risks and trade-offs of the chosen solution',
  },
  rca: {
    definition: 'how the metric is defined and over what time window',
    data_check: 'whether the drop is real (tracking, logging, seasonality)',
    scope: 'scope of the drop: platform, geography, cohort',
    internal_external: 'internal causes (releases, pricing) versus external ones (competition, events)',
    hypotheses: 'hypotheses, ordered by likelihood and ease of checking',
    verify: 'how each hypothesis would be verified with data',
    fix: 'the fix and how to prevent a repeat',
  },
  metrics: {
    goal: 'what the product or feature is for, and for whom',
    north_star: 'one north-star metric tied to that goal',
    inputs: 'input metrics that drive the north star',
    guardrail: 'a guardrail or counter-metric for harm',
    tradeoff: 'what to do when metrics disagree',
    target: 'a target and where it comes from',
  },
  guesstimate: {
    scope: 'what exactly is being estimated, and in what units',
    approach: 'top-down or bottom-up approach stated before the maths',
    assumptions: 'assumptions stated with numbers',
    arithmetic: 'arithmetic done correctly, with units',
    sanity_check: 'a sanity check of the result',
    sensitivity: 'which assumption moves the answer most',
  },
  strategy: {
    company_goal: 'the company goal behind the question',
    market: 'the market and the customer need',
    competition: 'competition and the right to win',
    options: 'several strategic options',
    recommendation: 'a recommendation chosen on stated criteria',
    feasibility: 'feasibility and risks of the recommendation',
  },
  tech: {
    explanation: 'a plain explanation of the concept',
    components: 'the key components and how they fit',
    tradeoffs: 'the main trade-offs',
    scale: 'what breaks at scale',
    pm_use: 'how a PM would use this in a decision',
  },
}

export function coverageLines(q: Question): string {
  const known = COVERAGE_AREAS[q.topic]
  const ids = q.coverage.length ? q.coverage : Object.keys(known)
  return ids.map((id) => `- ${id}: ${known[id] ?? id.replace(/_/g, ' ')}`).join('\n')
}

/* ---------------- rubric (MASTER_PLAN §7.4) ---------------- */

export const TOPIC_WEIGHTS: Record<TopicId, Record<DimensionId, number>> = {
  product_design: { structure: 0.2, userFocus: 0.3, prioritisation: 0.25, metrics: 0.1, communication: 0.15 },
  rca: { structure: 0.3, userFocus: 0.1, prioritisation: 0.2, metrics: 0.25, communication: 0.15 },
  metrics: { structure: 0.2, userFocus: 0.15, prioritisation: 0.15, metrics: 0.35, communication: 0.15 },
  guesstimate: { structure: 0.35, userFocus: 0.05, prioritisation: 0.1, metrics: 0.35, communication: 0.15 },
  strategy: { structure: 0.25, userFocus: 0.15, prioritisation: 0.25, metrics: 0.15, communication: 0.2 },
  tech: { structure: 0.25, userFocus: 0.15, prioritisation: 0.15, metrics: 0.1, communication: 0.35 },
}

const ANCHORS: Record<DimensionId | 'numbers', { question: string; levels: [string, string, string, string, string] }> = {
  structure: {
    question: 'Can the interviewer follow the approach, and is it the right one?',
    levels: [
      'No discernible approach; jumps between ideas.',
      'Some steps, out of order or missing a key stage; a framework is named but not used.',
      'A recognisable approach, mostly followed; one stage thin; weak transitions.',
      'Signposted up front, followed end to end, adapted to this question; ends with a conclusion.',
      'Chooses where to go deep, re-plans cleanly when the variant changes the facts, synthesises crisply.',
    ],
  },
  userFocus: {
    question: 'Does the candidate know who they are solving for and what that user needs?',
    levels: [
      'No user named, or "everyone".',
      'Generic user; pains asserted; no segment chosen.',
      'Two or more segments, one picked; plausible pains; some solutions linked to pains.',
      "A segment picked for a stated reason tied to the goal; specific pains from the user's context; notices secondary stakeholders.",
      'A non-obvious insight about behaviour that reshapes the solution, plus a cheap way to validate it.',
    ],
  },
  prioritisation: {
    question: 'Does the candidate make choices, with criteria, and say what they will not do?',
    levels: [
      'Lists everything; no choice.',
      'A choice with no criterion, or a criterion named and not applied.',
      'An explicit criterion applied to pick one option; trade-offs mentioned briefly.',
      'Compares 2–3 options on stated criteria, picks one, names what is dropped and why, addresses the main risk.',
      'Sequencing tied to the company goal and constraints; re-prioritises correctly when the variant changes a constraint.',
    ],
  },
  metrics: {
    question: 'Can the candidate define success precisely and guard against harm?',
    levels: [
      'No metric.',
      'A vanity or vague metric not tied to the goal.',
      'A relevant primary metric; no guardrail; loose definition.',
      'Primary metric precisely defined (action, population, time window), tied to the goal, with a guardrail and a direction or target.',
      'Adds leading versus lagging logic, how it is tested, and the threshold that would change a decision.',
    ],
  },
  numbers: {
    question: 'Numbers & maths: are the numbers built, checked and stated with units?',
    levels: [
      'No numbers, or one unexplained final number.',
      'Numbers present but assumptions unstated, or an arithmetic or unit error that changes the answer.',
      'Assumptions stated with numbers, arithmetic correct, no sanity check.',
      'As 3, plus a sanity check and a final range with units.',
      'Triangulates two approaches and names the most sensitive assumption with its effect.',
    ],
  },
  communication: {
    question: 'Is it clear, concise and responsive?',
    levels: [
      'Hard to follow; does not answer the question.',
      'The point is buried in filler or hedging; follow-ups dodged.',
      'Clear enough; some rambling; no summary.',
      'Concise and signposted; answers follow-ups directly; summarises.',
      'Leads with the answer, adapts depth, handles pushback without defensiveness.',
    ],
  },
}

const TOPIC_READING: Record<TopicId, Record<DimensionId, string>> = {
  product_design: { structure: 'Clarifies first, clear flow', userFocus: 'A named, specific user and pain', prioritisation: 'Picks one and defends it', metrics: 'Success measure and guardrail', communication: 'Concise, signposted' },
  rca: { structure: 'Validate → scope → decompose → hypothesise', userFocus: 'Which users or cohorts are affected', prioritisation: 'Orders hypotheses by likelihood × ease of checking', metrics: 'Uses data cuts as evidence', communication: 'Concise, signposted' },
  metrics: { structure: 'Goal → north star → inputs → guardrails', userFocus: 'Whose value the metric captures', prioritisation: 'Chooses one north star and justifies it', metrics: 'Counter-metric, targets', communication: 'Concise, signposted' },
  guesstimate: { structure: 'Approach stated before the maths', userFocus: 'Segmenting where rates really differ', prioritisation: 'Spends effort on the biggest driver', metrics: 'Numbers & maths: sanity check, numeric hygiene', communication: 'Shows working aloud' },
  strategy: { structure: 'Framework fits the question', userFocus: 'The customer need behind the market', prioritisation: 'Commits to an option; feasibility', metrics: 'How success or failure is measured', communication: 'Concise, signposted' },
  tech: { structure: 'Logical order of explanation', userFocus: 'Explains for the stakeholder in front of them', prioritisation: 'Picks the right trade-off', metrics: 'Measurable impact (latency, cost)', communication: 'Jargon-free' },
}

export function anchorsText(topic: TopicId): string {
  return DIMENSIONS.map((d) => {
    const key = d === 'metrics' && topic === 'guesstimate' ? 'numbers' : d
    const a = ANCHORS[key]
    const head = d === 'metrics' && topic === 'guesstimate' ? `metrics (read as "Numbers & maths" for guesstimates)` : d
    return `${head} — ${a.question}\n${a.levels.map((l, i) => `  ${i + 1}: ${l}`).join('\n')}`
  }).join('\n\n')
}

export function topicReadingText(topic: TopicId): string {
  const w = TOPIC_WEIGHTS[topic]
  return DIMENSIONS.map((d) => `- ${d} (${DIMENSION_LABEL[d]}, weight ${w[d].toFixed(2)}): ${TOPIC_READING[topic][d]}`).join('\n')
}

/* ---------------- issue tags (MASTER_PLAN §7.5) ---------------- */

export const ISSUE_TAGS: { tag: IssueTag; home: DimensionId; label: string }[] = [
  { tag: 'no_clarify', home: 'structure', label: 'Starts without clarifying the question' },
  { tag: 'no_goal', home: 'structure', label: "Doesn't state the goal first" },
  { tag: 'no_data_check', home: 'structure', label: "Doesn't check the data is real" },
  { tag: 'no_summary', home: 'structure', label: 'No closing summary or recommendation' },
  { tag: 'ignored_variant', home: 'structure', label: "Didn't adapt when the case changed" },
  { tag: 'solution_first', home: 'userFocus', label: 'Jumps to a solution before choosing a user' },
  { tag: 'generic_user', home: 'userFocus', label: 'User described too generically' },
  { tag: 'no_segment_choice', home: 'userFocus', label: 'Lists segments without picking one' },
  { tag: 'feature_list', home: 'prioritisation', label: 'Lists ideas without choosing' },
  { tag: 'no_criterion', home: 'prioritisation', label: 'Chooses without a stated criterion' },
  { tag: 'no_tradeoff', home: 'prioritisation', label: 'No trade-off or risk named' },
  { tag: 'no_recommendation', home: 'prioritisation', label: 'Never commits to a recommendation' },
  { tag: 'no_hypothesis_order', home: 'prioritisation', label: 'Hypotheses not ordered' },
  { tag: 'infeasible_plan', home: 'prioritisation', label: 'Recommendation ignores feasibility' },
  { tag: 'no_metric', home: 'metrics', label: 'No success metric' },
  { tag: 'vague_metric', home: 'metrics', label: 'Metric too vague to measure' },
  { tag: 'no_guardrail', home: 'metrics', label: 'No guardrail metric' },
  { tag: 'unstated_assumption', home: 'metrics', label: 'Assumptions not stated' },
  { tag: 'math_error', home: 'metrics', label: 'Arithmetic or unit error' },
  { tag: 'no_sanity_check', home: 'metrics', label: 'No sanity check on the number' },
  { tag: 'rambling', home: 'communication', label: 'Rambles; point buried' },
  { tag: 'jargon', home: 'communication', label: "Jargon the listener wouldn't follow" },
  { tag: 'dodged_followup', home: 'communication', label: "Didn't answer the follow-up asked" },
]

export const ISSUE_TAG_IDS = ISSUE_TAGS.map((t) => t.tag) as [IssueTag, ...IssueTag[]]
export const ISSUE_TAG_HOME: Record<IssueTag, DimensionId> = Object.fromEntries(ISSUE_TAGS.map((t) => [t.tag, t.home])) as Record<IssueTag, DimensionId>

export function issueTagsText(): string {
  return DIMENSIONS.map((d) => `${d}:\n${ISSUE_TAGS.filter((t) => t.home === d).map((t) => `  - ${t.tag}: ${t.label}`).join('\n')}`).join('\n')
}

/* ---------------- quote helpers (same normalisation as MASTER_PLAN §6.6) ---------------- */

export function normaliseForQuote(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/[^\p{L}\p{N}%₹\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function quoteInCandidateTurns(quote: string, turns: Turn[]): boolean {
  const q = normaliseForQuote(quote)
  if (!q) return false
  return turns.some((t) => t.role === 'candidate' && normaliseForQuote(t.text).includes(q))
}
