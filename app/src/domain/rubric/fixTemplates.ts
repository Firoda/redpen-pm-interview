import type { IssueTag } from '@/domain/types'

export interface FixTemplate { issue: string; instruction: string; pattern?: string }

/** Three rotating templates per issue tag (§6.11). issue ≤ 20 words, instruction ≤ 30 words, imperative,
 *  names the kind of thing to add, never the paragraph. No softeners, no praise. */
export const FIX_TEMPLATES: Record<IssueTag, FixTemplate[]> = {
  no_clarify: [
    { issue: 'You started answering before pinning down the scope, so every later choice rests on a guess.', instruction: 'Ask one or two clarifying questions first, or state your assumptions about scope and user out loud before you start.', pattern: 'Before I start: I assume [scope], [user], [goal].' },
    { issue: 'Jumping straight in skips the part interviewers use to see how you frame an ambiguous problem.', instruction: 'Spend the first 30 seconds confirming the goal and constraints, then say which assumption you are making.', pattern: 'Clarify → state assumptions → approach.' },
    { issue: 'Without a clarified scope, the interviewer cannot tell whether your answer fits the problem asked.', instruction: 'Open with one question about the goal or the user, then restate the problem in one line.' },
  ],
  no_goal: [
    { issue: 'Starting from metrics or features skips what the product is for, so nothing after it is anchored.', instruction: 'Open with the goal in one sentence, then derive every later point from it.', pattern: 'Goal → north star → inputs → guardrail.' },
    { issue: 'Without a stated goal, the interviewer cannot judge whether your choices serve the business or the user.', instruction: 'Say what success means for the user and the business before you list anything.', pattern: 'This exists so that [user] can [outcome].' },
    { issue: 'The answer has no anchor, so each idea reads as a separate guess.', instruction: 'State the objective first and refer back to it when you make each choice.' },
  ],
  no_data_check: [
    { issue: 'You went to causes before checking the drop is real, which is the first thing interviewers look for.', instruction: 'Before any hypothesis, check whether tracking, definitions or a reporting change explain the movement.', pattern: 'Is it real? → scope → internal vs external → hypotheses.' },
    { issue: 'Skipping the data check risks a long investigation into a logging bug.', instruction: 'Spend one line confirming the metric definition, time window and instrumentation before diagnosing.' },
    { issue: 'Hypotheses without a data sanity step look like guessing rather than diagnosis.', instruction: 'Open by asking how the metric is measured and whether anything in the pipeline changed.' },
  ],
  no_summary: [
    { issue: 'The answer ends on a detail, so the interviewer has to assemble your conclusion for you.', instruction: 'Close with one line that restates your recommendation and the main reason for it.', pattern: 'So: [recommendation], because [reason], watching [risk].' },
    { issue: 'No closing line means your strongest point is not the last thing the interviewer hears.', instruction: 'End every answer with a two-sentence summary: what you would do and how you would know it worked.' },
    { issue: 'Without a wrap-up, the structure you built is hard to see at the end.', instruction: 'Finish by naming your choice, the metric that proves it, and the one risk you would watch.' },
  ],
  ignored_variant: [
    { issue: 'The case changed, but the answer did not say what changes as a result.', instruction: 'When the interviewer changes a fact, say explicitly which part of your answer moves and which stays.', pattern: 'With [change], [X] changes because [reason]; [Y] stays.' },
    { issue: 'Repeating the earlier plan after a twist suggests you did not re-plan.', instruction: 'Restate the new constraint in your first sentence, then adjust your choice and your metric to it.' },
    { issue: 'The twist is a test of re-prioritising; the answer did not use it.', instruction: 'Name the one decision the new fact overturns and what you would do instead.' },
  ],
  solution_first: [
    { issue: 'You proposed a solution before saying who it is for, so the idea cannot be judged against a need.', instruction: 'Name the user segment and their main pain before any feature, then tie each feature to that pain.', pattern: 'For [segment], who struggle with [pain], I would [solution].' },
    { issue: 'Leading with a build makes the answer feel like a feature list rather than a user problem.', instruction: 'Pick one user, describe a moment they struggle, and only then propose what to build.' },
    { issue: 'Solutions come before users, so the interviewer cannot see why this solution matters.', instruction: 'Hold the solution until you have chosen a segment and stated the pain you are solving.' },
  ],
  generic_user: [
    { issue: 'The user is named only broadly, so the needs and the solution stay generic.', instruction: 'Narrow to one segment with a concrete trait, and say why that segment matters most for the goal.', pattern: '[Segment] who [behaviour], because [reason tied to goal].' },
    { issue: 'A broad user group hides that different users want different things.', instruction: 'Split the users into two or three segments, pick one, and name a specific pain for it.' },
    { issue: 'Without a specific segment, the answer cannot show who gains most and who might lose.', instruction: 'Say which users benefit most and which secondary group could be hurt.' },
  ],
  no_segment_choice: [
    { issue: 'You listed several user groups but never chose one, so the rest of the answer has no focus.', instruction: 'After listing segments, pick one with a stated reason and design for that segment only.', pattern: 'I will focus on [segment] because [size / pain / fit with goal].' },
    { issue: 'Listing segments without choosing reads as coverage rather than judgement.', instruction: 'Choose the segment with the sharpest pain or biggest impact, and say what you set aside.' },
    { issue: 'The answer treats all segments as equal, which spreads it thin.', instruction: 'Commit to one segment out loud and state the criterion you used to pick it.' },
  ],
  feature_list: [
    { issue: 'You listed ideas without choosing one, so the interviewer cannot see your judgement.', instruction: 'Compare your top two or three options on one criterion and commit to a single pick.', pattern: 'Options: A, B, C. On [criterion], I pick B and drop A.' },
    { issue: 'A long list without a pick looks like brainstorming, not product thinking.', instruction: 'Cut the list to one option, say why it wins, and name what you would not build.' },
    { issue: 'Every idea gets equal weight, so none of them is defended.', instruction: 'Rank your ideas by impact against effort and spend your time on the top one.' },
  ],
  no_criterion: [
    { issue: 'You made a choice without a criterion that ties it to the goal, so it cannot be defended.', instruction: 'Pick using one criterion linked to the goal and say why your choice beats the alternatives.', pattern: 'I chose [X] over [Y] because, on [criterion], it wins.' },
    { issue: 'The reason given for the choice is about convenience, not about the user or the goal.', instruction: 'Choose the option closest to the user outcome and state the criterion out loud.' },
    { issue: 'Without a stated criterion, the choice looks arbitrary.', instruction: 'Name the criterion first, then apply it to two options before you commit.' },
  ],
  no_tradeoff: [
    { issue: 'The answer names no trade-off or risk, so the recommendation looks untested.', instruction: 'Name the main downside of your choice and how you would detect or limit it.', pattern: 'The risk is [X]; I would watch [signal] and [mitigation].' },
    { issue: 'Every choice has a cost; leaving it unsaid suggests it was not considered.', instruction: 'Say what you give up with your choice and why it is worth it.' },
    { issue: 'Without a risk named, the interviewer has to supply the counter-argument.', instruction: 'Add one line on what could go wrong and the condition under which you would change course.' },
  ],
  no_recommendation: [
    { issue: 'The answer explores options but never commits, which is the main thing a PM is asked to do.', instruction: 'End with a clear recommendation, the reason, and the first step you would take.', pattern: 'I recommend [X], because [reason]; first step: [action].' },
    { issue: 'Without a decision, the analysis has no conclusion for the interviewer to evaluate.', instruction: 'Commit to one option even under uncertainty, and say what evidence would change your mind.' },
    { issue: 'Hedging between options reads as indecision.', instruction: 'Pick one path, state the condition for revisiting it, and stop.' },
  ],
  no_hypothesis_order: [
    { issue: 'Hypotheses are listed but not ordered, so the investigation has no plan.', instruction: 'Order hypotheses by likelihood and ease of checking, and say which you would check first.', pattern: 'Check first: [most likely, cheapest]; then [next].' },
    { issue: 'Treating all causes as equal wastes time on unlikely ones.', instruction: 'Rank your top three causes and name the data cut that confirms or rules out the first.' },
    { issue: 'Without an order, the interviewer cannot see how you would spend the first hour.', instruction: 'Say which hypothesis you test first and what result would send you to the next.' },
  ],
  infeasible_plan: [
    { issue: 'The recommendation ignores what it would take to execute, so it is hard to believe.', instruction: 'Add one line on cost, team or regulatory constraints, and how your plan fits them.', pattern: 'Feasible because [capability]; constrained by [limit]; so start with [scope].' },
    { issue: 'A strategy without feasibility reads as a wish.', instruction: 'Check your recommendation against capabilities and unit economics before committing to it.' },
    { issue: 'The plan skips the constraints that decide whether it can ship.', instruction: 'Name the biggest execution risk and a smaller first step that tests it.' },
  ],
  no_metric: [
    { issue: 'No success metric was named, so there is no way to tell whether the idea worked.', instruction: 'Name one primary metric with the action, the population and a time window.', pattern: 'Success = [action] per [user] per [week].' },
    { issue: 'Without a measure of success, the answer cannot be evaluated or improved.', instruction: 'Before you finish, say the one number you would track and the direction you want it to move.' },
    { issue: 'The answer describes what to do but not how you would know it worked.', instruction: 'Add a success metric tied to the goal and one guardrail against harm.' },
  ],
  vague_metric: [
    { issue: 'The metric has no population or time window, so two people would measure it differently.', instruction: 'Define the metric precisely: the action, who is counted, and over what time window.', pattern: '[Action] by [population] within [time window].' },
    { issue: 'A loosely defined metric cannot be tracked or argued about.', instruction: 'Rewrite your metric so an analyst could compute it without asking you a question.' },
    { issue: 'The metric names a topic rather than a number.', instruction: 'Turn it into a rate or count with a denominator and a time window, and give a target direction.' },
  ],
  no_guardrail: [
    { issue: 'Without a counter-metric, your main number can rise while the feature is doing harm.', instruction: 'Before you finish, name one counter-metric that would tell you the feature is doing harm.', pattern: 'Success = [action] per [user] per [week]; guardrail = [harm].' },
    { issue: 'A single success metric invites gaming; nothing checks the cost.', instruction: 'Pair your primary metric with a guardrail on the most likely side effect.' },
    { issue: 'The answer never says what must not get worse.', instruction: 'Name one metric that must stay flat while your main metric rises, and say why.' },
  ],
  unstated_assumption: [
    { issue: 'Numbers appear without the assumptions behind them, so the estimate cannot be checked.', instruction: 'Say each assumption out loud with its value before you use it.', pattern: 'Assume [quantity] = [value] because [reason].' },
    { issue: 'Hidden assumptions make the final number impossible to challenge or adjust.', instruction: 'Write down your key assumptions first, then do the arithmetic step by step.' },
    { issue: 'The interviewer cannot see which input drives the answer.', instruction: 'State each driver with its value and source, then flag the one you are least sure of.' },
  ],
  math_error: [
    { issue: 'An arithmetic or unit slip changes the final answer.', instruction: 'Say each multiplication out loud with units and round only at the end.', pattern: '[a] × [b] = [c] [unit].' },
    { issue: 'The units do not line up, so the result is off by a factor.', instruction: 'Carry units through every step and check the final unit matches the question.' },
    { issue: 'A calculation step does not follow from the numbers given.', instruction: 'Recompute the step slowly and compare it with a quick order-of-magnitude check.' },
  ],
  no_sanity_check: [
    { issue: 'The final number is not checked against anything, so a big error would go unnoticed.', instruction: 'Close with a sanity check against a known figure or a second approach, and give a range.', pattern: 'Cross-check: [other method] gives [x]; range [low–high].' },
    { issue: 'Without a sanity check, the interviewer cannot tell if the estimate is plausible.', instruction: 'Compare your answer with one real-world anchor and say whether it holds.' },
    { issue: 'A single point estimate hides how uncertain it is.', instruction: 'Give a range, and name the assumption that moves it most.' },
  ],
  rambling: [
    { issue: 'The main point is buried in long sentences, so the interviewer has to dig for it.', instruction: 'Lead with your answer in one sentence, then give at most three supporting points.', pattern: 'Answer → three reasons → one-line summary.' },
    { issue: 'Long, unsignposted sentences make the reasoning hard to follow.', instruction: 'Signpost your points out loud, keep each to one sentence, and cut filler words.' },
    { issue: 'The answer circles before reaching the point.', instruction: 'Say your conclusion first and stop once the reasons are given.' },
  ],
  jargon: [
    { issue: 'Technical terms are used without explanation, which loses a non-technical listener.', instruction: 'Explain each technical term in plain words the first time, as you would to a business stakeholder.', pattern: '[Term] means [plain explanation], which matters because [impact].' },
    { issue: 'Acronyms stand in for reasoning, so the explanation feels memorised.', instruction: 'Replace acronyms with what the component does, and keep one example per idea.' },
    { issue: 'The explanation is pitched at engineers rather than the person asking.', instruction: 'Pick the level of the listener, and use one analogy for the hardest concept.' },
  ],
  dodged_followup: [
    { issue: 'A follow-up got a one-line answer, so the probe the interviewer cared about went unanswered.', instruction: 'Answer the follow-up directly in your first sentence, then give one reason or example.', pattern: 'Direct answer → reason → what it changes.' },
    { issue: 'Short or deflected follow-up answers read as avoiding the hard part.', instruction: 'When pushed, restate the question in your own words and answer it head-on.' },
    { issue: 'The answer to the follow-up did not engage with what was asked.', instruction: 'Take the interviewer’s exact question, answer yes or no first, then explain.' },
  ],
}

/** Short phrase per tag for verdict lines ("no guardrail", …). */
export const TAG_SHORT: Record<IssueTag, string> = {
  no_clarify: 'no clarifying step', no_goal: 'no stated goal', no_data_check: 'no data check', no_summary: 'no closing summary',
  ignored_variant: 'no re-plan when the case changed', solution_first: 'solutions before users', generic_user: 'a generic user',
  no_segment_choice: 'no segment chosen', feature_list: 'a list without a pick', no_criterion: 'a choice without a criterion',
  no_tradeoff: 'no trade-off named', no_recommendation: 'no recommendation', no_hypothesis_order: 'unordered hypotheses',
  infeasible_plan: 'no feasibility check', no_metric: 'no success metric', vague_metric: 'a loosely defined metric',
  no_guardrail: 'no guardrail', unstated_assumption: 'unstated assumptions', math_error: 'an arithmetic slip',
  no_sanity_check: 'no sanity check', rambling: 'a buried main point', jargon: 'unexplained jargon', dodged_followup: 'a dodged follow-up',
}

export function pickTemplate(tag: IssueTag, seed: string): FixTemplate {
  const list = FIX_TEMPLATES[tag]
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return list[h % list.length]
}
