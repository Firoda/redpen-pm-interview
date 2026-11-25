import type { DimensionId, IssueTag } from '@/domain/types'

/** Issue-tag taxonomy (§7.5). */
export const ISSUE_TAGS: Record<IssueTag, { dimension: DimensionId; label: string }> = {
  no_clarify: { dimension: 'structure', label: 'Starts without clarifying the question' },
  no_goal: { dimension: 'structure', label: "Doesn't state the goal first" },
  no_data_check: { dimension: 'structure', label: "Doesn't check the data is real" },
  no_summary: { dimension: 'structure', label: 'No closing summary or recommendation' },
  ignored_variant: { dimension: 'structure', label: "Didn't adapt when the case changed" },
  solution_first: { dimension: 'userFocus', label: 'Jumps to a solution before choosing a user' },
  generic_user: { dimension: 'userFocus', label: 'User described too generically' },
  no_segment_choice: { dimension: 'userFocus', label: 'Lists segments without picking one' },
  feature_list: { dimension: 'prioritisation', label: 'Lists ideas without choosing' },
  no_criterion: { dimension: 'prioritisation', label: 'Chooses without a stated criterion' },
  no_tradeoff: { dimension: 'prioritisation', label: 'No trade-off or risk named' },
  no_recommendation: { dimension: 'prioritisation', label: 'Never commits to a recommendation' },
  no_hypothesis_order: { dimension: 'prioritisation', label: 'Hypotheses not ordered' },
  infeasible_plan: { dimension: 'prioritisation', label: 'Recommendation ignores feasibility' },
  no_metric: { dimension: 'metrics', label: 'No success metric' },
  vague_metric: { dimension: 'metrics', label: 'Metric too vague to measure' },
  no_guardrail: { dimension: 'metrics', label: 'No guardrail metric' },
  unstated_assumption: { dimension: 'metrics', label: 'Assumptions not stated' },
  math_error: { dimension: 'metrics', label: 'Arithmetic or unit error' },
  no_sanity_check: { dimension: 'metrics', label: 'No sanity check on the number' },
  rambling: { dimension: 'communication', label: 'Rambles; point buried' },
  jargon: { dimension: 'communication', label: "Jargon the listener wouldn't follow" },
  dodged_followup: { dimension: 'communication', label: "Didn't answer the follow-up asked" },
}

export const ALL_ISSUE_TAGS = Object.keys(ISSUE_TAGS) as IssueTag[]

export function isIssueTag(s: string): s is IssueTag {
  return Object.prototype.hasOwnProperty.call(ISSUE_TAGS, s)
}

export function tagLabel(tag: IssueTag): string {
  return ISSUE_TAGS[tag]?.label ?? tag
}

/** Default tag for a dimension when a fix needs one and nothing more specific applies. */
export const DEFAULT_TAG: Record<DimensionId, IssueTag> = {
  structure: 'no_summary',
  userFocus: 'generic_user',
  prioritisation: 'no_criterion',
  metrics: 'no_guardrail',
  communication: 'rambling',
}
