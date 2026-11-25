/* Shared domain types — the contract every module builds against.
   Spec: docs/MASTER_PLAN.md §7.2, §8.2, §6.4. Pure types, no runtime imports. */

export type ULID = string
export type Epoch = number // ms, from the app clock (services/clock)

export type TopicId = 'product_design' | 'rca' | 'metrics' | 'guesstimate' | 'strategy' | 'tech'
export type DimensionId = 'structure' | 'userFocus' | 'prioritisation' | 'metrics' | 'communication'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type VariantAxis = 'user' | 'market' | 'constraint'
export type Score = 1 | 2 | 3 | 4 | 5
export type InputMode = 'voice' | 'text'

export const TOPICS: TopicId[] = ['product_design', 'rca', 'metrics', 'guesstimate', 'strategy', 'tech']
export const DIMENSIONS: DimensionId[] = ['structure', 'userFocus', 'prioritisation', 'metrics', 'communication']

export const TOPIC_LABEL: Record<TopicId, string> = {
  product_design: 'Product design',
  rca: 'Root cause analysis',
  metrics: 'Metrics',
  guesstimate: 'Guesstimates',
  strategy: 'Strategy',
  tech: 'Tech concepts',
}
export const TOPIC_SHORT: Record<TopicId, string> = {
  product_design: 'Design', rca: 'RCA', metrics: 'Metrics', guesstimate: 'Guesstimate', strategy: 'Strategy', tech: 'Tech',
}
export const DIMENSION_LABEL: Record<DimensionId, string> = {
  structure: 'Structure',
  userFocus: 'User focus',
  prioritisation: 'Prioritisation',
  metrics: 'Metrics',
  communication: 'Communication',
}
export const SCORE_LABEL: Record<Score, string> = { 1: 'Missing', 2: 'Weak', 3: 'Mixed', 4: 'Strong', 5: 'Exceptional' }

export type IssueTag =
  | 'no_clarify' | 'no_goal' | 'no_data_check' | 'no_summary' | 'ignored_variant'
  | 'solution_first' | 'generic_user' | 'no_segment_choice'
  | 'feature_list' | 'no_criterion' | 'no_tradeoff' | 'no_recommendation' | 'no_hypothesis_order' | 'infeasible_plan'
  | 'no_metric' | 'vague_metric' | 'no_guardrail' | 'unstated_assumption' | 'math_error' | 'no_sanity_check'
  | 'rambling' | 'jargon' | 'dodged_followup'

/* ---------------- content ---------------- */

export interface FollowUpSeed {
  id: string
  probes: DimensionId
  text: string // may contain "{variant}" when isVariantSlot
  triggerIf?: { missingAny?: string[]; presentAny?: string[]; minWords?: number }
  isVariantSlot?: boolean
}

export interface Question {
  id: string // 'pd-001' curated; 'up-<ulid>' uploads
  topic: TopicId
  subtype: string
  difficulty: Difficulty
  timeboxMin: number
  prompt: string
  context: {
    setup?: string
    hiddenFacts: string[]
    caseText?: string
    referenceAnswer?: { low: number; high: number; unit: string; note: string }
  }
  coverage: string[]
  expectedStructure: string[]
  rubricHints: Partial<Record<DimensionId, string>>
  commonPitfalls: string[]
  followUpSeeds: FollowUpSeed[]
  variants: Partial<Record<VariantAxis, string[]>>
  tags: string[]
  source: 'curated' | 'upload'
  uploadId?: string
  contentVersion: number
  retired?: boolean
}

/* ---------------- profile & settings ---------------- */

export type NudgeType = 'resume_mock' | 'unread_feedback' | 'retry_fix' | 'neglected_topic' | 'weekly_goal' | 'interview_countdown'
export type EntryPoint = 'onboarding' | 'home_next_up' | 'nudge' | 'practice' | 'library' | 'retry' | 'progress'

export interface Profile {
  id: 'me'
  firstName?: string
  interviewDate?: string | null
  selfRatings: Partial<Record<TopicId, Score>>
  originalSelfRatings?: Partial<Record<TopicId, Score>>
  preferredMode: InputMode
  createdAt: Epoch
  onboardingStep: 1 | 2 | 3 | 4
  onboardingCompletedAt?: Epoch
  isDemo: boolean
  wtp?: { shownAt: Epoch; priceInr: 99 | 199 | 299; answer?: 'yes' | 'yes_lower' | 'no' | 'unsure'; statedPrice?: number }
  jdInterest?: { text: string; at: Epoch }
}

export type AiMode = 'scripted' | 'live'
export type GraderQuality = 'fast' | 'thorough' | 'max'

export interface Settings {
  id: 'settings'
  ai: {
    mode: AiMode // 'live' uses Claude (user key or /api proxy) with per-call fallback to scripted
    keyStorage: 'session' | 'local'
    useProxy: boolean // call /api/claude (Vercel function with server-side key) instead of a browser key
    graderQuality: GraderQuality
  }
  voice: { lang: 'en-IN' | 'en-US' | 'en-GB'; ttsEnabled: boolean; voiceURI?: string; rate: number; autoSend: boolean }
  nudges: { muted: boolean; mutedTypes: NudgeType[] }
  mock: { defaultLength: MockLength; weeklyGoal: number }
  theme: 'light' | 'dark' | 'system'
  demo: { enabled: boolean; clockOffsetMs: number; showEventLog: boolean; minScoringMs: number }
}

/* ---------------- mocks ---------------- */

export type MockLength = 'quick' | 'standard'
export type MockStatus = 'in_progress' | 'completed' | 'ended_early' | 'abandoned' | 'error'
export type Slot = { kind: 'main' } | { kind: 'followup'; index: number }

export type TurnKind =
  | 'intro' | 'question' | 'clarify_q' | 'clarify_a' | 'main' | 'followup_q' | 'followup_a'
  | 'expand_q' | 'reframe' | 'hint' | 'deflect' | 'redirect' | 'close'

export type TurnMove =
  | 'answer_clarification' | 'ask_followup' | 'ask_variant' | 'ask_expand' | 'reframe_idk' | 'give_hint'
  | 'deflect' | 'redirect' | 'move_on' | 'close'

export type TurnFlag = 'short' | 'idk' | 'off_topic' | 'injection' | 'edited_after_speech' | 'truncated'

export interface Turn {
  id: string // `${mockId}:${index}`
  index: number
  role: 'interviewer' | 'candidate'
  kind: TurnKind
  text: string
  followupIndex?: number
  isVariant?: boolean
  seedId?: string
  move?: TurnMove
  targetDimension?: DimensionId
  inputMode?: InputMode
  generatedBy?: 'llm' | 'scripted' | 'fixture' | 'template' | 'library'
  words: number
  flags: TurnFlag[]
  startedAt: Epoch
  submittedAt: Epoch
  latencyMs?: number
}

export interface MockSession {
  id: ULID
  questionId: string
  questionSnapshot: Pick<Question, 'prompt' | 'topic' | 'subtype' | 'difficulty' | 'source'> & { setup?: string }
  topic: TopicId
  length: MockLength
  followupsPlanned: number // quick 2, standard 3
  variant?: { axis: VariantAxis; value: string; atFollowup: number }
  modeHistory: { mode: InputMode; fromTurn: number; at: Epoch }[]
  turns: Turn[]
  machine: {
    state: 'ready' | 'awaiting_answer' | 'interviewer_turn' | 'done'
    slot: Slot
    followupsAsked: number
    clarifications: number
    hintUsed: boolean
    hintDimension?: DimensionId
    idkStreak: number
    expandAsked: boolean
  }
  status: MockStatus
  counted: boolean
  startedAt: Epoch
  endedAt?: Epoch
  lastActivityAt: Epoch
  entryPoint: EntryPoint
  nudgeId?: ULID
  retryOf?: ULID
  retryFixId?: string
  targetDimension?: DimensionId
  focusText?: string
  provider: 'scripted' | 'anthropic'
  feedbackId?: ULID
  source: 'user' | 'seed'
}

/* ---------------- feedback ---------------- */

export interface DimensionScore {
  dimension: DimensionId
  score: Score
  rawScore: Score
  reason: string
  evidence: { quote: string; turnId: string }[]
  weight: number
}

export interface Fix {
  id: string
  rank: 1 | 2 | 3
  dimension: DimensionId
  issueTag: IssueTag
  quote: string
  turnId: string
  issue: string
  instruction: string
  pattern?: string
  source: 'llm' | 'offline' | 'fixture' | 'repaired'
}

export type RatingTag = 'too_lenient' | 'too_harsh' | 'not_specific' | 'misquoted' | 'wrong_topic'

export interface Feedback {
  id: ULID
  mockId: ULID
  topic: TopicId
  questionId: string
  counted: boolean
  grader: 'llm' | 'offline' | 'fixture'
  model?: string
  promptVersion: string
  dimensionScores: DimensionScore[] // exactly 5, fixed order
  overall: number
  verdict: string
  fixes: Fix[] // exactly 3
  strength?: { text: string; quote: string; turnId: string }
  capsApplied: { cap: string; dimension: DimensionId; from: number; to: number }[]
  quoteRepairs: number
  quotesDropped: number
  confidence: 'low' | 'medium' | 'high'
  latencyMs: number
  attempts: number
  generatedAt: Epoch
  openedAt?: Epoch
  fixesViewedAt?: Epoch
  rating?: Score
  ratingTags?: RatingTag[]
  ratingComment?: string
  ratedAt?: Epoch
  supersededBy?: ULID
  source: 'user' | 'seed'
}

export interface Retry {
  id: ULID
  originalMockId: ULID
  newMockId: ULID
  fixId?: string
  targetDimension?: DimensionId
  sameQuestion: boolean
  within72h: boolean
  startedAt: Epoch
  completedAt?: Epoch
  before?: number
  after?: number
  uplift?: number
  overallBefore?: number
  overallAfter?: number
}

export type TopicStatus = 'not_started' | 'building' | 'getting_there' | 'consistent'

export interface TopicStat {
  topic: TopicId
  countedMocks: number
  lastPractisedAt?: Epoch
  score?: number // unrounded EWMA
  dimScore: Partial<Record<DimensionId, number>>
  history: { mockId: ULID; at: Epoch; score: number; isRetry: boolean }[]
  delta14?: number
  status: TopicStatus
  updatedAt: Epoch
}

export interface UserUpload {
  id: ULID
  fileName: string
  fileType: 'pdf' | 'docx' | 'txt' | 'md' | 'paste'
  bytes: number
  pages?: number
  questionIds: string[]
  createdAt: Epoch
  warnings: string[]
}

export interface Nudge {
  id: ULID
  key: string // 'neglected_topic:metrics', 'unread_feedback:<feedbackId>'
  type: NudgeType
  topic?: TopicId
  feedbackId?: ULID
  mockId?: ULID
  title: string
  body: string
  cta: { label: string; action: 'start_mock' | 'open_feedback' | 'start_retry' | 'resume_mock'; payload: Record<string, string> }
  priority: number
  placement: 'next_up' | 'banner'
  status: 'active' | 'acted' | 'dismissed' | 'resolved' | 'expired'
  createdAt: Epoch
  actedAt?: Epoch
  dismissedAt?: Epoch
  resolvedAt?: Epoch
}

export interface AnalyticsEvent {
  id: ULID
  name: string
  ts: Epoch
  mockId?: ULID
  props: Record<string, unknown>
  source: 'user' | 'seed'
}

export interface MetaRow { key: string; value: unknown }

/* ---------------- AI turn & grade I/O (MASTER_PLAN §6.4) ---------------- */

export interface TurnDecision {
  move: TurnMove
  say: string // ≤ 45 words, no praise, no teaching
  targetDimension?: DimensionId
  seedId?: string
  isVariant?: boolean
  countsAsFollowup: boolean // true when this interviewer line fills the next follow-up slot
  flags?: TurnFlag[] // flags for the candidate turn just received
}

export interface TurnResult extends TurnDecision {
  generatedBy: 'llm' | 'scripted' | 'fixture' | 'template'
  latencyMs: number
}

export interface TurnContext {
  session: MockSession
  question: Question
  lastAnswer: Turn // the candidate turn just submitted
}

export interface GradeInput {
  session: MockSession
  question: Question
  quality: GraderQuality
}

export type GradeResult = Omit<Feedback, 'id' | 'mockId' | 'openedAt' | 'fixesViewedAt' | 'rating' | 'ratingTags' | 'ratingComment' | 'ratedAt' | 'supersededBy' | 'source'>
