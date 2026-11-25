import type { DimensionId, Score, TopicId } from '@/domain/types'

/** Behavioural 1–5 anchors (§7.4). Used by the report UI ("what a 4 looks like") and by prompts. */
export const ANCHORS: Record<DimensionId, Record<Score, string>> = {
  structure: {
    1: 'No discernible approach; jumps between ideas',
    2: 'Some steps, out of order or missing a key stage; a framework is named but not used',
    3: 'A recognisable approach, mostly followed; one stage thin; weak transitions',
    4: 'Signposted up front, followed end to end, adapted to this question; ends with a conclusion',
    5: 'Chooses where to go deep, re-plans cleanly when the variant changes the facts, synthesises crisply',
  },
  userFocus: {
    1: 'No user named, or "everyone"',
    2: 'Generic user; pains asserted; no segment chosen',
    3: 'Two or more segments, one picked; plausible pains; some solutions linked to pains',
    4: "A segment picked for a stated reason tied to the goal; specific pains from the user's context; notices secondary stakeholders",
    5: 'A non-obvious insight about behaviour that reshapes the solution, plus a cheap way to validate it',
  },
  prioritisation: {
    1: 'Lists everything; no choice',
    2: 'A choice with no criterion, or a criterion named and not applied',
    3: 'An explicit criterion applied to pick one option; trade-offs mentioned briefly',
    4: 'Compares 2–3 options on stated criteria, picks one, names what is dropped and why, addresses the main risk',
    5: 'Sequencing tied to the company goal and constraints; re-prioritises correctly when the variant changes a constraint',
  },
  metrics: {
    1: 'No metric',
    2: 'A vanity or vague metric not tied to the goal',
    3: 'A relevant primary metric; no guardrail; loose definition',
    4: 'Primary metric precisely defined (action, population, time window), tied to the goal, with a guardrail and a direction or target',
    5: 'Adds leading vs lagging logic, how it is tested, and the threshold that would change a decision',
  },
  communication: {
    1: 'Hard to follow; does not answer the question',
    2: 'The point is buried in filler or hedging; follow-ups dodged',
    3: 'Clear enough; some rambling; no summary',
    4: 'Concise and signposted; answers follow-ups directly; summarises',
    5: 'Leads with the answer, adapts depth, handles pushback without defensiveness',
  },
}

export const NUMBERS_ANCHORS: Record<Score, string> = {
  1: 'No numbers, or one unexplained final number',
  2: 'Numbers present but assumptions unstated, or an arithmetic or unit error that changes the answer',
  3: 'Assumptions stated with numbers, arithmetic correct, no sanity check',
  4: 'As 3, plus a sanity check and a final range with units',
  5: 'Triangulates two approaches and names the most sensitive assumption with its effect',
}

export function anchorFor(topic: TopicId, d: DimensionId, s: Score): string {
  if (d === 'metrics' && topic === 'guesstimate') return NUMBERS_ANCHORS[s]
  return ANCHORS[d][s]
}

/** Topic reading of each dimension (§7.4). */
export const TOPIC_READING: Record<DimensionId, Record<TopicId, string>> = {
  structure: { product_design: 'Clarifies first, clear flow', rca: 'Validate → scope → decompose → hypothesise', metrics: 'Goal → north star → inputs → guardrails', guesstimate: 'Approach stated before the maths', strategy: 'Framework fits the question', tech: 'Logical order of explanation' },
  userFocus: { product_design: 'A named, specific user and pain', rca: 'Which users or cohorts are affected', metrics: 'Whose value the metric captures', guesstimate: 'Segmenting where rates really differ', strategy: 'The customer need behind the market', tech: 'Explains for the stakeholder in front of them' },
  prioritisation: { product_design: 'Picks one and defends it', rca: 'Orders hypotheses by likelihood × ease of checking', metrics: 'Chooses one north star and justifies it', guesstimate: 'Spends effort on the biggest driver', strategy: 'Commits to an option; feasibility', tech: 'Picks the right trade-off' },
  metrics: { product_design: 'Success measure and guardrail', rca: 'Uses data cuts as evidence', metrics: 'Counter-metric, targets', guesstimate: 'Sanity check, numeric hygiene', strategy: 'How success or failure is measured', tech: 'Measurable impact (latency, cost)' },
  communication: { product_design: 'Concise, signposted', rca: 'Concise, signposted', metrics: 'Concise, signposted', guesstimate: 'Shows working aloud', strategy: 'Concise, signposted', tech: 'Jargon-free' },
}
