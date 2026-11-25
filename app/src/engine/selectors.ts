/* ENGINE SELECTORS — async read models for screens. Use inside `useLiveQuery(() => getHomeView())`
 * so views refresh when Dexie tables change. Owner: ENGINE agent implements; screens consume. */
import type {
  DimensionId, Feedback, IssueTag, MockSession, Nudge, Profile, Question, Retry, Settings, TopicId, TopicStat, TopicStatus,
} from '@/domain/types'

const TODO = (n: string): never => { throw new Error(`selectors.${n} not implemented yet`) }

export interface HomeView {
  profile: Profile | null
  nextUp: Nudge | null // always present once onboarded (falls back to a "recommended" pseudo-nudge with status 'active')
  banner: Nudge | null // at most one secondary nudge
  weekly: { reviewed: number; goal: number; weekStart: number } // North Star unit: reviewed mocks this week
  inProgress: MockSession | null // resumable mock (< 24h)
  topics: { topic: TopicId; score?: number; status: TopicStatus; countedMocks: number; lastPractisedAt?: number; isWeakest: boolean; spark: number[] }[]
  recent: { mock: MockSession; feedback?: Feedback }[] // last 5 ended mocks
  interviewInDays: number | null
  showWtp: boolean // true after the 5th counted mock if WTP not yet answered
}
export async function getHomeView(): Promise<HomeView> { return TODO('getHomeView') }

export interface ProgressView {
  topics: (TopicStat & { label: string; isWeakest: boolean; selfRating?: number })[]
  weakest: TopicId | null
  recurring: { tag: IssueTag; label: string; count: number; of: number; latestQuote: string; dimension: DimensionId }[]
  heatmap: Record<TopicId, Partial<Record<DimensionId, number>>>
  totals: { counted: number; reviewed: number; retries: number; avgUplift: number | null }
  selfVsScored: { topic: TopicId; self: number; scored: number; gap: number }[]
}
export async function getProgressView(): Promise<ProgressView> { return TODO('getProgressView') }

export interface ReportView {
  feedback: Feedback
  mock: MockSession
  question: Question | null
  retry: (Retry & { targetDimension: DimensionId }) | null // when this report is for a retry mock
  retryOf: { feedback: Feedback; mock: MockSession } | null
  selfRating?: number
  isFirstReport: boolean // first counted report → show "you rated yourself X, you scored Y"
  isPracticeOnly: boolean
}
export async function getReportView(feedbackId: string): Promise<ReportView | null> { return TODO('getReportView') }

export interface MetricsView {
  nsm: { thisWeek: number; lastWeek: number; series: { weekStart: number; value: number }[] }
  inputs: { weeklyActive: boolean; reviewedPerWeek: number; secondMockWithin7d: boolean | null; trustRate: number | null }
  game: {
    feedbackReadRate: number | null; trustScore: number | null; fixAppliedRate: number | null; fixUplift: number | null
    completionRate: number | null; mocksPerWeek: number; secondMockRate: number | null; timeToFirstQuestionMs: number | null
    trackerViews: number; nudgeConversion: number | null; weakTopicFollowThrough: number | null; wtpAnswer: string | null
  }
  funnel: { started: number; completed: number; opened: number; fixesViewed: number; rated: number; retried: number }
  events: { name: string; ts: number; props: Record<string, unknown> }[] // latest 200
  graderSplit: { llm: number; offline: number; fixture: number }
}
export async function getMetricsView(): Promise<MetricsView> { return TODO('getMetricsView') }

export async function getSettingsView(): Promise<Settings> { return TODO('getSettingsView') }
