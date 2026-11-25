import type { Question } from '@/domain/types'

/** Test copies of the two demo questions (MASTER_PLAN §7.8), independent of src/content. */
export const MET_101: Question = {
  id: 'met-101',
  topic: 'metrics',
  subtype: 'define_success',
  difficulty: 'medium',
  timeboxMin: 10,
  prompt: "How would you measure the success of a 'Split the bill' feature in a UPI payments app?",
  context: {
    setup: "You're the PM for payments at a large UPI app.",
    hiddenFacts: [
      'Goal if asked: make group expenses easier so friends keep their shared spending inside our app.',
      'How it works if asked: one person pays the merchant, then sends split requests to friends in the app.',
      'Scale if asked (illustrative): 40 million monthly active users; the feature launched to 10% of them four weeks ago.',
      'Known issue if asked: about a third of split requests are still unpaid after 7 days.',
      'There is no fee today.',
    ],
  },
  coverage: ['goal', 'north_star', 'inputs', 'guardrail', 'tradeoff'],
  expectedStructure: [
    'State what the feature is for, and for whom (the payer and the friend who owes)',
    'One north-star metric tied to that goal (for example, splits fully settled within 7 days per active user)',
    'Two or three input metrics along the funnel (created, sent, opened, paid)',
    'A guardrail or counter-metric (unpaid requests, reminder spam, drop in ordinary payments)',
    'How you would read a conflict between metrics, and a target',
  ],
  rubricHints: {
    structure: 'Goal first, then metrics derived from it; not a list of metric names.',
    userFocus: "Separates the payer's goal (get money back) from the friend's experience (being asked to pay).",
    prioritisation: 'Chooses one north star and says why it beats the alternatives.',
    metrics: 'Settlement, not creation, is the outcome; names a guardrail and a time window.',
    communication: 'Signposted and ends with a one-line summary.',
  },
  commonPitfalls: ['Counts splits created (volume) as success', 'App-level NPS for a single feature', 'No counter-metric', 'Picks a metric because it is easy to move'],
  followUpSeeds: [
    { id: 'met-101-f1', probes: 'metrics', triggerIf: { missingAny: ['settle', 'paid back', 'repay', 'unpaid', 'guardrail', 'counter'] }, text: 'How would you catch splits that get created but never paid back?' },
    { id: 'met-101-f2', probes: 'prioritisation', text: 'If you could report only one number to your CEO for this feature, which would it be, and why?' },
    { id: 'met-101-f3', probes: 'userFocus', triggerIf: { missingAny: ['friend', 'payer', 'receiver', 'group'] }, text: 'There are two people in every split. Whose success are you measuring?' },
    { id: 'met-101-f4', probes: 'structure', isVariantSlot: true, text: "Let's change one thing: {variant}. What changes in how you measure success?" },
    { id: 'met-101-f5', probes: 'metrics', text: 'What target would you set for the first quarter, and where would it come from?' },
  ],
  variants: {
    constraint: ['there is now a ₹2 fee on every split', 'you can add only one new event to the analytics pipeline'],
    user: ['the users are flatmates splitting rent every month, not friends splitting dinners'],
    market: ['the feature is for small shops splitting supplier bills, not consumers'],
  },
  tags: ['india', 'fintech', 'upi'],
  source: 'curated',
  contentVersion: 1,
}

export const MET_102: Question = {
  id: 'met-102',
  topic: 'metrics',
  subtype: 'define_success',
  difficulty: 'medium',
  timeboxMin: 10,
  prompt: "How would you measure the success of a 'Reorder' button in a grocery delivery app?",
  context: {
    setup: "You're the PM for repeat shoppers at a grocery delivery app.",
    hiddenFacts: [
      'Goal if asked: save repeat shoppers time on their regular basket.',
      'Scale if asked (illustrative): 55% of orders come from repeat shoppers.',
      'Basket if asked: the average basket has 14 items.',
      'Concern if asked: the category team worries one-tap reorder shrinks baskets and discovery.',
    ],
  },
  coverage: ['goal', 'north_star', 'inputs', 'guardrail', 'tradeoff', 'target'],
  expectedStructure: [
    'State the goal: save repeat shoppers time on their regular basket',
    'One north-star metric, such as the share of repeat orders placed through Reorder',
    'Input metrics such as Reorder taps per repeat shopper and time to checkout',
    'A guardrail on basket size and new-item discovery',
    'A target and how you would set it',
  ],
  rubricHints: {
    metrics: 'Names a guardrail on basket size or discovery and a time window.',
    prioritisation: 'Decides whether to ship when the guardrail moves the wrong way.',
  },
  commonPitfalls: ['Counts reorder taps as success', 'Ignores basket size', 'No counter-metric'],
  followUpSeeds: [
    { id: 'met-102-f1', probes: 'metrics', text: 'If reorders rise 20% but basket size falls 5%, do you ship?' },
    { id: 'met-102-f2', probes: 'metrics', text: 'How would you set the target for your north star in the first quarter?' },
    { id: 'met-102-f3', probes: 'prioritisation', text: 'Which single number tells you Reorder is working?' },
    { id: 'met-102-f4', probes: 'userFocus', text: 'Which shoppers is this for, and who might it hurt?' },
    { id: 'met-102-f5', probes: 'structure', isVariantSlot: true, text: "Let's change one thing: {variant}. What changes in how you measure success?" },
  ],
  variants: { constraint: ['the Reorder button can show only five items'], user: ['the shoppers are first-time users with one past order'] },
  tags: ['india', 'commerce'],
  source: 'curated',
  contentVersion: 1,
}

export const DEMO_101_ANSWERS = [
  "I'd look at engagement first. The main metric is number of splits created per day, and I'd also track DAU of the feature and how many users try it at least once in their first week. If those go up, the feature is working. On top of that I'd look at NPS for the app and maybe app store ratings, to see if people like it.",
  "Fair point. I'd also track how many splits actually get settled, maybe a settlement rate within a week, and how many reminders people have to send before a friend pays.",
  "Then revenue from fees becomes the main metric, because it's the easiest to move now and the business cares about it. I'd still keep splits created as a secondary number, and watch whether people stop using the feature after the fee comes in.",
]

export const DEMO_102_RETRY_ANSWERS = [
  'The goal of Reorder is to save repeat shoppers time on their weekly basket. North star: share of repeat orders placed through Reorder. Inputs: Reorder taps per repeat shopper and time from app open to checkout. Counter-metric: basket size and new-item discovery, because one-tap reorder could shrink baskets.',
  "I'd ship only if net revenue per repeat shopper is flat or up over four weeks. If it dips, I'd test an 'add something new' row inside the reorder flow to protect discovery before rolling out further to all cities.",
  "I'd baseline it from the beta cohort for two weeks, then set the target from the best-performing category, and review it after four weeks with the guardrail next to it so nobody celebrates one number alone.",
]
