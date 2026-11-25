/* Raw authored content for the "Ishita, week 3" seed (MASTER_PLAN section 8.5).
   Timestamps, ids and events are computed in ishitaW3.ts. Illustrative practice transcripts. */
import type { DimensionId, IssueTag, TopicId } from '@/domain/types'

export interface RawFix { d: DimensionId; tag: IssueTag; at: 'm' | 'a1' | 'a2' | 'a3'; quote: string; issue: string; instruction: string; pattern?: string }
export interface RawFollowUp { q: string; a?: string; variant?: { axis: 'user' | 'market' | 'constraint'; value: string } }
export interface RawMock {
  n: number // 1..17 (S-number)
  qid: string
  topic: TopicId
  day: number | 'W1' | 'W2' | 'H20'
  len: 'quick' | 'standard'
  modes: ('text' | 'voice')[] // mode per candidate turn, in order: main, a1, a2, a3
  entry: 'onboarding' | 'practice' | 'home_next_up' | 'nudge' | 'library' | 'retry'
  scores: [number, number, number, number, number]
  overall: number
  main: string
  fu: RawFollowUp[]
  verdict: string
  reasons: [string, string, string, string, string]
  fixes: RawFix[] // rank order
  strength?: { text: string; quote: string; at: 'm' | 'a1' | 'a2' | 'a3' }
  rating?: number
  ratingTags?: ('too_lenient' | 'too_harsh' | 'not_specific' | 'misquoted' | 'wrong_topic')[]
  state: 'reviewed' | 'unread' | 'practice' | 'abandoned'
}

export const RAW: RawMock[] = [
  { n: 1, qid: 'met-101', topic: 'metrics', day: 21, len: 'quick', modes: ['text', 'voice', 'text'], entry: 'onboarding', scores: [2, 3, 2, 2, 3], overall: 2.3, state: 'reviewed', rating: 5,
    main: "I'd look at engagement first. The main metric is number of splits created per day, and I'd also track DAU of the feature and how many users try it at least once in their first week. If those go up, the feature is working. On top of that I'd look at NPS for the app and maybe app store ratings, to see if people like it.",
    fu: [
      { q: 'You said the main metric is "number of splits created per day". How would you catch splits that get created but never paid back?', a: "Fair point. I'd also track how many splits actually get settled, maybe a settlement rate within a week, and how many reminders people have to send before a friend pays." },
      { q: "Let's change one thing: there is now a ₹2 fee on every split. What changes in how you measure success?", a: "Then revenue from fees becomes the main metric, because it's the easiest to move now and the business cares about it. I'd still keep splits created as a secondary number, and watch whether people stop using the feature after the fee comes in.", variant: { axis: 'constraint', value: 'there is now a ₹2 fee on every split' } },
    ],
    verdict: "A fair list of metrics, but no goal, no guardrail, and a north star picked for convenience.",
    reasons: ["Opened with a metric category and never said what the feature is for.", "Brought in the friend who has to pay back, but never separated the payer's goal from the friend's.", "Chose the main metric because it is easy to move, which is a reason to distrust it.", "No counter-metric until pushed, and app-wide NPS says nothing about this feature.", "Short and clear, but no signposting and no closing summary."],
    fixes: [
      { d: 'metrics', tag: 'no_guardrail', at: 'm', quote: "If those go up, the feature is working.", issue: "Volume can rise while money is never paid back, so this number can look good while the feature fails.", instruction: "Before you finish, name one counter-metric that would tell you the feature is doing harm.", pattern: "Success = [action] per [user] per [week]; guardrail = [harm]." },
      { d: 'structure', tag: 'no_goal', at: 'm', quote: "I'd look at engagement first.", issue: "Starting from a metric category skips what the feature is for, so nothing after it is anchored.", instruction: "Open with the feature's goal in one sentence, then derive each metric from it.", pattern: "Goal, north star, inputs, guardrail." },
      { d: 'prioritisation', tag: 'no_criterion', at: 'a2', quote: "because it's the easiest to move now", issue: "Easy to move is a reason to distrust a metric, not to choose it.", instruction: "Pick the metric closest to the user's goal and say why it beats the alternatives." },
    ],
    strength: { text: "Took the pushback and added settlement without getting defensive.", quote: "I'd also track how many splits actually get settled", at: 'a1' } },

  { n: 2, qid: 'pd-004', topic: 'product_design', day: 20, len: 'standard', modes: ['text', 'text', 'text', 'text'], entry: 'practice', scores: [3, 2, 2, 3, 3], overall: 2.5, state: 'reviewed', rating: 4,
    main: "I'd build a checklist app that walks first-time flyers through every step: packing, getting to the airport, check-in, security and boarding. It sends reminders at each stage and has a map of the terminal. I'd add a chat helper for questions and a section on baggage rules. The goal is to make flying less scary so people book again. I'd measure it by how many users complete the checklist.",
    fu: [
      { q: "Which first-time flyer are you designing for, and what scares them most?", a: "Probably young people from smaller towns flying for a job interview or college. They are nervous about security checks and missing the gate, I think. Maybe older people too, but I'd start with the young ones because they download apps more." },
      { q: "You've listed several ideas. Which one do you build first and what do you drop?", a: "I'd build the reminders first. The terminal map and chat helper can come later, and I'd drop the baggage section for now. It's a lot to build, so I'd keep it small." },
      { q: "How would you know it worked six months from now?", a: "I'd look at downloads and how many people finish the checklist. If lots of people finish it, then it is working well and they will probably fly again." },
    ],
    verdict: "A tidy feature set built before choosing who it is for; the choices are not reasoned.",
    reasons: ["A recognisable journey, but it jumps to features after one line on the goal.", "Names young flyers from smaller towns, but pains are guessed and the choice rests on who downloads apps.", "Picks reminders first with no criterion, and drops items without saying why.", "Checklist completion is related to the goal but has no guardrail or time window.", "Readable and in order, but no closing recommendation."],
    fixes: [
      { d: 'userFocus', tag: 'solution_first', at: 'm', quote: "I'd build a checklist app", issue: "Names a solution before choosing which first-time flyer it serves.", instruction: "Choose one flyer and one moment that scares them, then say what you would build for that moment.", pattern: "User, moment of fear, then solution." },
      { d: 'prioritisation', tag: 'no_criterion', at: 'a2', quote: "The terminal map and chat helper can come later", issue: "Ideas are deferred with no stated reason for the order.", instruction: "State one criterion, such as impact on second bookings against effort, and apply it to each idea." },
      { d: 'structure', tag: 'no_summary', at: 'a3', quote: "they will probably fly again", issue: "The answer ends on a hope, not a recommendation.", instruction: "Close with the one thing you would build, for whom, and the number that tells you it worked." },
    ] },

  { n: 3, qid: 'rca-001', topic: 'rca', day: 19, len: 'standard', modes: ['voice', 'voice', 'voice', 'voice'], entry: 'practice', scores: [3, 3, 3, 3, 3], overall: 3.0, state: 'reviewed', rating: 4,
    main: "Okay, so orders in Bengaluru are down fifteen percent week over week. I'd start by looking at the funnel and see where users are dropping, from app open to menu to cart to payment. Then I'd split by platform, Android and iOS, and by app version. After that I'd check weather, competitors and restaurant availability. Once I find the cause, I'd fix it and monitor the numbers.",
    fu: [
      { q: "Of the hypotheses you listed, which do you check first, and why that order?", a: "I'd check the app version first, then restaurant availability, weather and competitors, roughly in that order. A release is a common reason for a sudden drop, so that comes first." },
      { q: "Say sessions are flat but orders fell. Where in the funnel do you look, and what would you expect to see?", a: "Then the problem is after the menu, so I'd look at cart and checkout. I'd expect fewer people reaching payment, or more payment failures. I'd compare payment success rate to last week." },
      { q: "You've found it. What do you tell your VP in two sentences, and what happens today?", a: "I'd tell the VP that a release broke payments for some users and that we are rolling it back today. Then we'd watch orders recover over the next day or two and add an alert for payment drops." },
    ],
    verdict: "Sound narrowing by funnel and platform, but it never checks the drop is real before chasing causes.",
    reasons: ["Funnel then platform then external is a workable order, but it starts at causes, not at whether the data is real.", "Mentions users dropping in the funnel; no cohort or city-level view of who is affected.", "Gives an order for hypotheses and a reason for the first one only.", "Uses the funnel and payment success rate as evidence, but recovery is judged loosely.", "Clear and calm; the VP summary is two sentences with an action."],
    fixes: [
      { d: 'structure', tag: 'no_data_check', at: 'm', quote: "I'd start by looking at the funnel and see where users are dropping", issue: "Goes straight to causes without checking the drop is real and not a tracking change.", instruction: "Before any cut, confirm the metric definition and rule out a logging or dashboard change.", pattern: "Define, validate, scope, decompose, hypothesise." },
      { d: 'metrics', tag: 'vague_metric', at: 'a3', quote: "watch orders recover over the next day or two", issue: "Recovery is described loosely, with no number or baseline that defines fixed.", instruction: "Name the exact metric and threshold that tells you the fix worked, for example payment success back to last week's level." },
      { d: 'prioritisation', tag: 'no_hypothesis_order', at: 'a1', quote: "then restaurant availability, weather and competitors, roughly in that order", issue: "The order is stated, but not by likelihood or how quickly each can be checked.", instruction: "Rank hypotheses by likelihood times ease of checking, and say why the cheap one goes first." },
    ] },

  { n: 4, qid: 'gst-003', topic: 'guesstimate', day: 17, len: 'quick', modes: ['text', 'text', 'text'], entry: 'library', scores: [4, 3, 3, 3, 3], overall: 3.4, state: 'reviewed', rating: 5,
    main: "I'll estimate public charging points for 2030. Bengaluru has about 1.3 crore vehicles, roughly 70 percent two-wheelers. If 20 percent are electric by 2030 that is 26 lakh EVs. About 40 percent of owners charge in public, so about 10 lakh vehicles need public charging. One point can serve about 40 vehicles, so I get roughly 26,000 charging points.",
    fu: [
      { q: "Which single assumption moves your answer the most? What if it's off by half?", a: "The 20 percent EV share. If it is only 10 percent, the answer halves to about 13,000. The share of people charging in public matters too, but the EV share swings it most." },
      { q: "How would you cross-check that number from another side?", a: "I could compare it to petrol pumps. Bengaluru has a few hundred pumps, each with several nozzles, so 26,000 points looks high but chargers are slower than nozzles, so it might be fine." },
    ],
    verdict: "Clean decomposition and correct arithmetic; the cross-check is hand-waved and no range is given.",
    reasons: ["States the approach and builds it step by step in a sensible order.", "Splits two-wheelers from the rest, but does not separate fleets or cars where charging behaviour differs.", "Finds the biggest driver when asked, but did not volunteer it.", "Assumptions are stated with numbers and the arithmetic is right; the sanity check is vague and there is no final range.", "Narrates the steps; ends on a number with no summary line."],
    fixes: [
      { d: 'metrics', tag: 'no_sanity_check', at: 'a2', quote: "so 26,000 points looks high but chargers are slower than nozzles, so it might be fine", issue: "The cross-check ends with 'might be fine' instead of a number you compare against.", instruction: "Compute the petrol-pump equivalent explicitly and say whether your answer is within a factor of two of it." },
      { d: 'communication', tag: 'rambling', at: 'a1', quote: "The share of people charging in public matters too, but the EV share swings it most.", issue: "The answer hedges across two drivers before naming the one that matters.", instruction: "Lead with the single biggest assumption, then give one line on the effect of being wrong." },
      { d: 'prioritisation', tag: 'no_criterion', at: 'm', quote: "One point can serve about 40 vehicles", issue: "A key ratio is stated without saying why it is the right one to rely on.", instruction: "Say which two assumptions you trust least and spend your effort checking those." },
    ] },

  { n: 5, qid: 'pd-004', topic: 'product_design', day: 16, len: 'quick', modes: ['text', 'text', 'text'], entry: 'nudge', scores: [3, 3, 3, 4, 3], overall: 3.1, state: 'reviewed', rating: 4,
    main: "Let me pick the user first: a first-time flyer from a smaller town travelling with a parent, because they depend on someone else to explain airport steps. Their biggest fear is missing the gate or messing up check-in. I'd build a single screen that shows what to do next, in order, with their gate and time. Success is the share of such trips with a second booking within six months, and I'd watch support contacts per trip as a guardrail.",
    fu: [
      { q: "You've listed ideas. Which one do you build first and what do you drop?", a: "The next-step screen first, because it hits the biggest fear for the least work. I'd drop the terminal map, since it helps only after they reach the airport and is expensive to maintain." },
      { q: "What is the riskiest assumption in your design, and how would you test it cheaply?", a: "That people will open the app at the airport. I'd test it by sending a plain WhatsApp message with the next steps to 50 travellers and see how many follow it." },
    ],
    verdict: "A named user with a specific fear and a real metric with a guardrail; the choice of segment is not yet defended.",
    reasons: ["Picks a user, builds a flow and closes with a metric, but the steps are quickly passed over.", "Names a first-time flyer travelling with a parent and the fear of missing the gate, but picks the segment without comparing others.", "Uses a criterion of impact against effort, applied once, and drops the map.", "Metric has an action, population and window, with support contacts as a guardrail.", "Clear and well ordered; the close lacks a summary line."],
    fixes: [
      { d: 'userFocus', tag: 'solution_first', at: 'm', quote: "I'd build a single screen that shows what to do next, in order", issue: "The solution arrives before the pains are laid out along the journey.", instruction: "List the moments in the airport journey, pick the scariest, then name the screen for that moment.", pattern: "Journey, worst moment, then feature." },
      { d: 'prioritisation', tag: 'no_tradeoff', at: 'a1', quote: "I'd drop the terminal map, since it helps only after they reach the airport", issue: "A drop is stated but the risk of dropping it is not.", instruction: "Name the main risk of your pick and what you would watch to know you chose wrong." },
      { d: 'structure', tag: 'no_summary', at: 'a2', quote: "I'd test it by sending a plain WhatsApp message with the next steps to 50 travellers", issue: "Ends on a test detail with no closing recommendation.", instruction: "Finish with one sentence: who you serve, what you build, how you will know." },
    ] },

  { n: 6, qid: 'str-002', topic: 'strategy', day: 15, len: 'standard', modes: ['text', 'text', 'text', 'text'], entry: 'practice', scores: [3, 3, 2, 3, 3], overall: 2.8, state: 'reviewed', rating: 3, ratingTags: ['too_harsh'],
    main: "I think a UPI app should launch credit for students because it is a big market with four crore students and few options. We can offer small limits of around five thousand rupees and charge interest. Students will use it for fees, books and food, and it will increase usage of the app. We can grow it fast through college campuses and cashback.",
    fu: [
      { q: "Pick one: launch, pilot, or skip. Why?", a: "I'd launch to all students in the top ten cities straight away, because waiting lets competitors catch up. We can fix problems as we go." },
      { q: "What default rate would make you stop?", a: "Probably anything above five percent. We would then tighten the limits and tell the partner bank to review. I'd also use phone usage data to pick safer students." },
      { q: "Who is the student who benefits here, and who could be harmed?", a: "Students with no card benefit the most because they can pay for emergencies. Students who overspend could be harmed, but we will show reminders, so I think it is fine." },
    ],
    verdict: "Confident and readable, but it recommends a full launch without the economics, rules or risk to back it.",
    reasons: ["States a view then reasons for it, but the structure skips economics and regulation.", "Separates students with no card from overspenders when asked, but not at the start.", "Chooses to launch everywhere with no feasibility check on risk, regulation or the partner's appetite.", "Offers a five percent stop rule, though without any link to margin or acquisition cost.", "Direct and easy to follow."],
    fixes: [
      { d: 'prioritisation', tag: 'infeasible_plan', at: 'a1', quote: "I'd launch to all students in the top ten cities straight away", issue: "A full launch ignores that most students are under 21 and the lender carries the risk.", instruction: "Check feasibility before committing: consent rules for young borrowers, the partner's risk limit, and a smaller pilot design." },
      { d: 'structure', tag: 'no_goal', at: 'm', quote: "I think a UPI app should launch credit for students because it is a big market", issue: "Jumps to a yes without stating what the company is trying to achieve.", instruction: "State the objective and the decision criteria first, then compare launch, pilot and skip against them." },
      { d: 'communication', tag: 'dodged_followup', at: 'a3', quote: "but we will show reminders, so I think it is fine", issue: "Waves away the harm the question asked about.", instruction: "Answer the harm directly: who is hurt, how often, and what limit or check prevents it." },
    ] },

  { n: 7, qid: 'pd-005', topic: 'product_design', day: 14, len: 'standard', modes: ['text', 'text', 'voice', 'voice'], entry: 'practice', scores: [4, 3, 3, 3, 4], overall: 3.4, state: 'reviewed', rating: 4,
    main: "Let me start with the goal: more sign-ups making a first investment within seven days. The funnel loses most people at KYC and at choosing a fund. I'd improve onboarding with auto-filled PAN checks, a short quiz that suggests two starter funds, and a reassurance screen about safety. Then I'd measure sign-up to first investment in seven days, and watch early redemptions.",
    fu: [
      { q: "Where in the funnel would you start, and why there?", a: "At fund choice, because people who pass KYC have already shown intent. I'd build the quiz that suggests two starter funds, since choice overload is what stops them." },
      { q: "You can ship one change this quarter. Which one?", a: "The starter-fund quiz, and not the safety screen, because it addresses the larger drop. The PAN checks are valuable but need work with a partner." },
      { q: "Who is the first-time investor here, and is a nervous beginner the same as a switcher?", a: "They are different. A beginner fears losing money and needs a simple choice. A switcher wants speed and low fees. I'd design for beginners first because they are the bigger group." },
    ],
    verdict: "Strong flow from goal to funnel to one change; the user is described by behaviour, not by who they are.",
    reasons: ["Goal, funnel, fix, metric in order, signposted.", "Distinguishes beginners from switchers late and only when asked.", "Chooses one change with a reason, though alternatives are compared briefly.", "Has a seven-day metric with a redemption guardrail but no target.", "Concise and organised."],
    fixes: [
      { d: 'userFocus', tag: 'solution_first', at: 'm', quote: "I'd improve onboarding with auto-filled PAN checks, a short quiz that suggests two starter funds", issue: "Lists solutions before saying which type of first-time investor they are for.", instruction: "Name the investor and the fear that stops them before listing any change.", pattern: "Who, what stops them, then fix." },
      { d: 'prioritisation', tag: 'no_tradeoff', at: 'a2', quote: "The PAN checks are valuable but need work with a partner.", issue: "Feasibility is mentioned but the cost of waiting is not.", instruction: "Say what you lose by dropping the PAN checks and what would make you revisit it." },
      { d: 'metrics', tag: 'no_guardrail', at: 'm', quote: "and watch early redemptions", issue: "The guardrail is named with no threshold or direction.", instruction: "Give the redemption level that would make you pause the change and the target for the main metric." },
    ] },

  { n: 8, qid: 'rca-004', topic: 'rca', day: 13, len: 'standard', modes: ['text'], entry: 'practice', scores: [0, 0, 0, 0, 0], overall: 0, state: 'abandoned',
    main: "Ride cancellations are up 20 percent in one city. I would first check if the data is correct, then see whether riders or drivers are cancelling more. After that I would look at timing and areas of the city.",
    fu: [{ q: "Which cancellations rose, driver or rider? How would you check?" }],
    verdict: '', reasons: ['', '', '', '', ''], fixes: [] },

  { n: 9, qid: 'tec-002', topic: 'tech', day: 12, len: 'quick', modes: ['text', 'text', 'text'], entry: 'practice', scores: [4, 4, 3, 3, 3], overall: 3.4, state: 'reviewed', rating: 4,
    main: "When I scan the QR, my UPI app reads the shop's virtual address and amount. I enter my UPI PIN, which is checked by my bank. The app sends the request to NPCI's switch, which asks my bank to debit ₹200 and the shop's bank to credit it. Both banks confirm to NPCI, and NPCI sends the result back to both apps, so the shop sees a success message within seconds.",
    fu: [
      { q: "Money left my account but the shop didn't get it. What happened, and what does the system do?", a: "That's probably a timeout between the switch and the shop's bank. The debit went through but the credit confirmation didn't come back, so the transaction sits as pending, and it is reconciled with an idempotent retry or a reversal to my account." },
      { q: "As the PM, which technical metric would you watch daily, and why?", a: "Transaction success rate by bank, because one weak bank can drag the numbers for all users. I'd also look at the latency of the switch response and the share of transactions left pending beyond a few minutes." },
    ],
    verdict: "Accurate flow in the right order; the explanation leans on terms a shop owner would not follow.",
    reasons: ["Actors first, then an ordered sequence, then failure handling.", "Understands the customer and shop owner moments, but does not name who is confused by pending.", "Gives failures but not which to fix first.", "Names success rate by bank and latency, with no targets.", "Uses terms like idempotent retry and switch without explaining them."],
    fixes: [
      { d: 'communication', tag: 'jargon', at: 'a1', quote: "it is reconciled with an idempotent retry or a reversal to my account", issue: "Uses terms a shop owner would not follow.", instruction: "Replace idempotent and reconciled with a plain sentence about what happens to the money and how long it takes." },
      { d: 'prioritisation', tag: 'no_tradeoff', at: 'a2', quote: "I'd also look at the latency of the switch response and the share of transactions left pending", issue: "Three metrics are listed without ranking them.", instruction: "Pick the one number you check first and say what you would do when it moves." },
      { d: 'metrics', tag: 'vague_metric', at: 'a2', quote: "the share of transactions left pending beyond a few minutes", issue: "A few minutes is not a threshold you could monitor.", instruction: "Define pending with a number of minutes and a target rate, so an alert can fire." },
    ] },

  { n: 10, qid: 'gst-001', topic: 'guesstimate', day: 10, len: 'quick', modes: ['voice', 'voice', 'voice'], entry: 'practice', scores: [4, 3, 4, 3, 4], overall: 3.6, state: 'reviewed', rating: 5,
    main: "I'll size this from the demand side. Bengaluru has around one and a half crore people. About 60 lakh are working adults or students who would buy tea outside. Say 35 percent buy tea from a stall on a weekday, so around 21 lakh people, and they average about 1.5 cups. That gives roughly 30 lakh cups a day.",
    fu: [
      { q: "How would you sanity-check that number from the supply side?", a: "From supply, I'd guess Bengaluru has around 30,000 roadside stalls. At about 100 cups a day, that is also about 30 lakh cups, so the two approaches line up." },
      { q: "Which single assumption moves your answer the most?", a: "The 35 percent who buy from a stall. If it is 20 percent the answer falls to about 18 lakh, so I'd try to check this with a quick survey outside offices." },
    ],
    verdict: "Clear approach and decisive prioritisation; the supply-side check is too convenient and no range is stated.",
    reasons: ["States the approach and moves step by step in order.", "Segments people who buy outside but not by commuters versus students.", "Focuses on the stall share as the biggest driver.", "Assumptions are numbered and arithmetic is right, but the check lands exactly on the first answer and no range is given.", "Speaks cleanly and narrates the working."],
    fixes: [
      { d: 'metrics', tag: 'no_sanity_check', at: 'a1', quote: "so the two approaches line up", issue: "The cross-check matches exactly, which suggests the stall numbers were reverse-engineered.", instruction: "Choose the supply inputs independently, then state how far apart the two answers are and what range you report." },
      { d: 'userFocus', tag: 'generic_user', at: 'm', quote: "About 60 lakh are working adults or students who would buy tea outside.", issue: "One block of people is assumed to behave the same.", instruction: "Split working adults, students and others, with a different rate for each." },
      { d: 'structure', tag: 'no_summary', at: 'a2', quote: "so I'd try to check this with a quick survey outside offices", issue: "Ends on a next step with no final number.", instruction: "Finish by restating the final range and the one assumption that drives it." },
    ] },

  { n: 11, qid: 'rca-004', topic: 'rca', day: 9, len: 'standard', modes: ['text', 'text', 'text', 'text'], entry: 'nudge', scores: [4, 3, 4, 3, 4], overall: 3.7, state: 'reviewed', rating: 4,
    main: "First I'll confirm which cancellations rose, driver or rider, and check the data and tagging are unchanged. Then I'll scope it: which areas, times and app versions. I'll separate internal causes, such as a release or incentive change, from external causes like rain or a strike. Then I'll rank hypotheses by how likely and how easy to check, and verify with data before fixing.",
    fu: [
      { q: "Which cancellations rose, driver or rider? How would you check?", a: "I'd use the cancellation reason and who initiated it. If drivers cancel after accepting, it is probably something on the driver side, like trip details or pay." },
      { q: "You have several hypotheses. Which two do you check first and why?", a: "A recent driver app release or pilot, because it is quick to check in the flag logs, and an incentive change, because it directly affects driver behaviour. External causes come after those." },
      { q: "What cut of the data would separate a pilot effect from a market effect?", a: "Compare drivers exposed to the pilot flag with those not exposed in the same city and hours. If cancellations rise only in the exposed group, it is the pilot." },
    ],
    verdict: "Well-ordered investigation with sensible hypothesis ranking; never says what number would show the fix worked.",
    reasons: ["Clarify, scope, internal versus external, rank, verify, in order.", "Splits drivers from riders but not by driver cohort such as new or part-time drivers.", "Ranks by likelihood and ease of checking and justifies both.", "Uses reason codes and a flag cut, but gives no cancellation level that defines recovery.", "Answers directly and keeps each point short."],
    fixes: [
      { d: 'metrics', tag: 'no_guardrail', at: 'm', quote: "verify with data before fixing", issue: "Verification is mentioned but not what you would watch while fixing, for example rider wait times.", instruction: "Name the metric that defines recovery and a guardrail that makes sure the fix does not harm trips." },
      { d: 'userFocus', tag: 'generic_user', at: 'a1', quote: "it is probably something on the driver side, like trip details or pay", issue: "Treats all drivers as one group.", instruction: "Cut by driver cohort, such as new, part-time and full-time, and say which you expect to move." },
      { d: 'structure', tag: 'no_summary', at: 'a3', quote: "If cancellations rise only in the exposed group, it is the pilot.", issue: "Ends on the test with no statement of what you would do next.", instruction: "Close with the conclusion you would give the city head and today's action." },
    ] },

  { n: 12, qid: 'met-102', topic: 'metrics', day: 8, len: 'quick', modes: ['text', 'text', 'text'], entry: 'practice', scores: [3, 2, 2, 2, 2], overall: 2.2, state: 'reviewed', rating: 4,
    main: "Reorder is meant to make repeat shopping faster. I'd track how many people tap Reorder, the number of reorders per day, and the share of orders that use it. We'll also look at app rating and DAU. Overall, we'll know it worked if reorders go up and more customers use the app each week after launch.",
    fu: [
      { q: 'You said "we\'ll know it worked if reorders go up". What would tell you Reorder is hurting something?', a: "I guess basket size could drop, so I'd keep an eye on it. But mostly I think people will like the convenience and order more often, so it should be fine." },
      { q: "Which shoppers is this for, and who might it hurt?", a: "It's for busy people who buy the same things every week. I don't really see who it would hurt, maybe people who like browsing, but that's a small group." },
    ],
    verdict: "A list of usage numbers with no goal behind them and no counter-metric; success is whatever goes up.",
    reasons: ["States the purpose in one line, then lists metrics without tying them to it.", "Describes busy shoppers generically and dismisses who could be hurt.", "Lists four numbers and never picks one as the north star.", "Counts taps and reorders as success; basket size is mentioned only when asked, with no threshold.", "Clear sentences, but hedged answers to both follow-ups."],
    fixes: [
      { d: 'metrics', tag: 'no_guardrail', at: 'm', quote: "we'll know it worked if reorders go up", issue: "Reorders can rise while baskets shrink, so success defined as 'goes up' hides harm.", instruction: "Name one guardrail before you finish.", pattern: "Success = [action] per [user] per [week]; guardrail = [harm]." },
      { d: 'userFocus', tag: 'generic_user', at: 'a2', quote: "It's for busy people who buy the same things every week.", issue: "A broad group is described with no difference between regulars and occasional shoppers.", instruction: "Name the shopper type that gains most and one type that could lose, and tie each to a metric." },
      { d: 'prioritisation', tag: 'feature_list', at: 'm', quote: "I'd track how many people tap Reorder, the number of reorders per day, and the share of orders that use it", issue: "Three usage numbers are listed with no choice among them.", instruction: "Pick one north star and say why it beats the other two." },
    ],
    strength: { text: "Considered basket size once asked.", quote: "I guess basket size could drop, so I'd keep an eye on it.", at: 'a1' } },

  { n: 13, qid: 'pd-006', topic: 'product_design', day: 6, len: 'standard', modes: ['text', 'text', 'text', 'text'], entry: 'nudge', scores: [4, 3, 4, 4, 4], overall: 3.7, state: 'reviewed', rating: 5,
    main: "The goal is weekly active groups of students cooking together. The user I'll pick is the organiser who usually shops and fronts the money, because if she drops out the group dies. Her pains are chasing money, unequal contributions and forgotten items. I'd build one shared list with a one-tap settle-up by UPI. I'd drop recipes and meal planning for now. Success is groups with a shared purchase and settle-up in three days, and I'd watch members who leave.",
    fu: [
      { q: "In a group of five, who is your main user and why?", a: "The organiser, because she carries the cost and the effort. The other four mainly need to see what they owe and pay quickly, so they come second." },
      { q: "Which one feature do you ship first and what do you leave out?", a: "The shared list with settle-up. I'd leave out recipes, because they do not solve the money problem, and they are a content effort I can't sustain." },
      { q: "How would you measure that groups keep using it?", a: "Weekly active groups that complete a shopping run with settle-up inside three days, and the share still active after four weeks. I'd watch members leaving a group as the harm signal." },
    ],
    verdict: "Clear user, clear cuts and a defined metric; the user's pains come from assumption, not research.",
    reasons: ["Goal, user, pains, solution, drop, metric in a signposted order.", "Picks the organiser for a reason tied to the goal; pains are asserted without evidence.", "Chooses one feature and drops two with a reason.", "Metric has action, population and window, with a harm signal.", "Concise and ends with the metric."],
    fixes: [
      { d: 'userFocus', tag: 'solution_first', at: 'm', quote: "I'd build one shared list with a one-tap settle-up by UPI.", issue: "States the solution straight after naming pains, with no check that they are real.", instruction: "Add one cheap way to test the pain, such as asking five organisers what they chase most." },
      { d: 'prioritisation', tag: 'no_tradeoff', at: 'a2', quote: "they are a content effort I can't sustain", issue: "Names the cost of recipes but not the risk of leaving them out.", instruction: "State what you could lose by skipping recipes and what you would watch to find out." },
      { d: 'structure', tag: 'no_summary', at: 'a3', quote: "I'd watch members leaving a group as the harm signal.", issue: "Ends on a guardrail with no overall recommendation.", instruction: "Close with a single sentence that restates user, feature and success number." },
    ],
    strength: { text: "Chose the organiser for a reason tied to the goal.", quote: "because if she drops out the group dies", at: 'm' } },

  { n: 14, qid: 'pd-007', topic: 'product_design', day: 5, len: 'standard', modes: ['text', 'text'], entry: 'practice', scores: [3, 2, 2, 2, 3], overall: 2.4, state: 'practice',
    main: "I'd design a smart alarm for students with a sleep tracker, a nice sound and a quiz that you must answer to turn it off. It could also connect to the timetable and wake you earlier for early classes. Students like gadgets so I think they will like it.",
    fu: [{ q: "Which students are you designing for, and what goes wrong for them today?", a: "College students who are busy and tired. Today they just oversleep and miss class because the alarm is not smart enough. I think a smarter alarm will fix that." }],
    verdict: "A set of features aimed at 'students' with no chosen user and no way to tell if it works.",
    reasons: ["Features in a row, not a plan; capped because the answer was too short.", "Students are described only as busy and tired.", "No choice among ideas and no criterion.", "No success measure at all.", "Plain wording, but little to follow."],
    fixes: [
      { d: 'userFocus', tag: 'generic_user', at: 'a1', quote: "College students who are busy and tired.", issue: "The user is a broad group with generic pains.", instruction: "Pick one type of student, such as hostel residents with 8 am classes, and name what exactly goes wrong in their mornings." },
      { d: 'prioritisation', tag: 'feature_list', at: 'm', quote: "a sleep tracker, a nice sound and a quiz that you must answer to turn it off", issue: "Three ideas are offered without picking one.", instruction: "Choose one feature, state the reason, and say what you would not build." },
      { d: 'structure', tag: 'no_goal', at: 'm', quote: "I'd design a smart alarm for students with a sleep tracker", issue: "Starts building before saying what success looks like.", instruction: "State the goal and who it is for before any feature." },
    ] },

  { n: 15, qid: 'gst-002', topic: 'guesstimate', day: 'W1', len: 'quick', modes: ['text', 'text', 'text'], entry: 'home_next_up', scores: [5, 4, 4, 4, 4], overall: 4.4, state: 'reviewed', rating: 5,
    main: "I'll define revenue as gross sales and estimate it as customers per day times spend times working days. The college has about 3,000 students and 150 staff. Say 60 percent of students and 80 percent of staff use the canteen, which is about 1,900 people. Students average ₹55 and staff ₹80, so about ₹1.1 lakh a day. Over 250 working days that is about ₹2.8 crore a year.",
    fu: [
      { q: "Check your footfall against how many people the canteen can serve in an hour.", a: "About 1,900 people over a four-hour window is around 470 an hour. With six counters each serving about 80 people, that is feasible, though lunch peaks at about twice the average, so it will be tight." },
      { q: "Which assumption matters most, and how would you pin it down?", a: "The 60 percent of students who use the canteen. I'd count the queue at lunch on two days. If it is only 40 percent, revenue drops to about ₹2 crore, so my range is ₹2 to 3 crore." },
    ],
    verdict: "Defined terms, correct arithmetic and a stated range; some inputs, such as spend by segment, are not explained.",
    reasons: ["Defines revenue and states the formula before any number.", "Splits students from staff with different spend.", "Spends the time on the biggest driver, the usage rate.", "Arithmetic is right, with a capacity check and a range.", "Narrates steps and ends with a range."],
    fixes: [
      { d: 'metrics', tag: 'unstated_assumption', at: 'm', quote: "Students average ₹55 and staff ₹80", issue: "Average spend is stated as a fact with no basis.", instruction: "Say where the ₹55 comes from, for example one tea, one snack and one meal a week, so it can be challenged." },
      { d: 'communication', tag: 'rambling', at: 'a1', quote: "though lunch peaks at about twice the average, so it will be tight", issue: "Adds a caveat that dilutes the finding.", instruction: "State the capacity result in one line, then give the peak caveat as a second line." },
      { d: 'prioritisation', tag: 'no_criterion', at: 'a2', quote: "I'd count the queue at lunch on two days", issue: "A check is proposed without comparing it to other options.", instruction: "Say why this check is the cheapest and most informative." },
    ],
    strength: { text: "Defined revenue before computing anything.", quote: "I'll define revenue as gross sales", at: 'm' } },

  { n: 16, qid: 'str-001', topic: 'strategy', day: 'W2', len: 'standard', modes: ['text', 'text', 'text', 'text'], entry: 'practice', scores: [4, 3, 3, 3, 4], overall: 3.5, state: 'reviewed', rating: 4,
    main: "I'd decide on three criteria: unit economics, customer need and competition. Tier-2 cities have lower order density and AOV, but lower rent and labour. Customers there may not need 10 minutes, and kiranas are loyal. I'd recommend a pilot in one city with a 30-minute promise instead of launching everywhere. I'd review it after three months.",
    fu: [
      { q: "Bottom line: launch, don't, or something else? Commit to one.", a: "A pilot in Indore, with fewer stores and a 30-minute promise. If the unit economics work, I would expand to Coimbatore, and if not I would stop." },
      { q: "If you pilot, what numbers at month 3 make you expand or shut it down?", a: "Orders per store per day above a break-even level, and contribution margin per order close to positive. If we are far below both, I'd shut it." },
      { q: "Does a family in Indore actually need groceries in 10 minutes? What's your evidence?", a: "I don't think most do. Families plan weekly shopping, and urgent needs are small. I'd check this with order timing data from the pilot, and I'd talk to a few dozen families." },
    ],
    verdict: "A committed pilot recommendation with criteria; thresholds are vague and the downside of failing is not discussed.",
    reasons: ["Criteria, analysis, recommendation, review point.", "Questions the need for 10 minutes but does not segment customers by need.", "Chooses a pilot but does not weigh it against waiting or a different format.", "Names the metrics but not the break-even numbers.", "Direct, committed and brief."],
    fixes: [
      { d: 'prioritisation', tag: 'no_tradeoff', at: 'a1', quote: "A pilot in Indore, with fewer stores and a 30-minute promise.", issue: "The pilot is chosen with no cost or risk compared to launching or waiting.", instruction: "Name what the pilot costs and the main way it could mislead you, then say how you would limit that." },
      { d: 'userFocus', tag: 'no_segment_choice', at: 'a3', quote: "Families plan weekly shopping, and urgent needs are small.", issue: "Treats all families as one group.", instruction: "Split planned shoppers from urgent-need shoppers, and say which one the pilot targets." },
      { d: 'metrics', tag: 'vague_metric', at: 'a2', quote: "Orders per store per day above a break-even level", issue: "Break-even is a label, not a number.", instruction: "State the break-even orders per store per day, with the assumed AOV and cost per order." },
    ] },

  { n: 17, qid: 'rca-005', topic: 'rca', day: 'H20', len: 'standard', modes: ['voice', 'voice', 'voice', 'voice'], entry: 'home_next_up', scores: [3, 3, 4, 4, 4], overall: 3.6, state: 'unread',
    main: "Weekly active learners fell ten percent this month. First I'd clarify the definition, learners who finish at least one lesson in a week. Then I'd split by new, returning and reactivated learners, by platform and by class. Then I'd see if marketing or notifications changed. The most likely is a change in reminders or a release, because they affect many users quickly, so I'd check those first and then content or exams.",
    fu: [
      { q: "Which learners account for the drop? How would you find out?", a: "I'd compare the weekly cohorts by how they came back. If the drop is among learners who lapsed and were reactivated by reminders, then a reminder problem is likely. If it is across new users, it is acquisition." },
      { q: "What would you expect to see in the reminder funnel if the channel broke?", a: "Sent messages would look normal, but delivered and opened would drop sharply, and so would lesson starts from reminder links. I'd check delivery rates for each channel by day." },
      { q: "You found it. What do you tell the head of product in two sentences?", a: "Reminder delivery fell, so reactivated learners stopped coming back, and that explains most of the drop. We are fixing the channel today and I'd track delivery and weekly active learners until they recover." },
    ],
    verdict: "Methodical and well prioritised, with good use of cohort and channel evidence; the data check is missing.",
    reasons: ["Definition, split, causes, ranked, verified, but never rules out a tracking change.", "Splits learners by how they came back, though not by class or school type.", "Ranks reminders and releases first with a reason.", "Uses delivery and open rates as evidence and names a recovery metric.", "Clear two-sentence close with an action."],
    fixes: [
      { d: 'structure', tag: 'no_data_check', at: 'm', quote: "First I'd clarify the definition, learners who finish at least one lesson in a week.", issue: "Defines the metric but never checks that the drop is real and not a tracking change.", instruction: "Add one step to confirm the numbers with an independent source before searching for causes." },
      { d: 'userFocus', tag: 'generic_user', at: 'a1', quote: "If it is across new users, it is acquisition.", issue: "Treats new users as one group.", instruction: "Split new learners by channel and class before blaming acquisition." },
      { d: 'metrics', tag: 'no_guardrail', at: 'a3', quote: "I'd track delivery and weekly active learners until they recover", issue: "Recovery is tracked but nothing guards against harm from the fix, such as message fatigue.", instruction: "Name a guardrail, such as unsubscribe rate, to watch while reminders are restored." },
    ] },
]
