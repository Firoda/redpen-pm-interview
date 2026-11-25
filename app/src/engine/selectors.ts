/* ENGINE SELECTORS — async read models for screens. Use inside `useLiveQuery(() => getHomeView())`
 * so views refresh when Dexie tables change. Read-only: selectors never write. */
import type {
  AnalyticsEvent, DimensionId, Feedback, IssueTag, MockSession, Nudge, Profile, Question, Retry, Settings, TopicId, TopicStat, TopicStatus,
} from '@/domain/types'
import { TOPICS, TOPIC_LABEL } from '@/domain/types'
import { db, getSettings } from '@/services/db/db'
import { Clock } from '@/services/clock'
import { selectSlots, PRIORITY } from '@/domain/nudges/computeNudges'
import { recurringMistakes, selfVsScored } from '@/domain/scoring'
import { computeFunnel, computeGame, graderSplit, nsmSeries, reviewedInWeek, reviewedMocks, FIXES_VIEWED_NAMES } from '@/domain/metrics'
import { HOUR, daysUntil, weekStart } from '@/domain/time'
import { round1 } from '@/domain/rubric/weights'

export interface HomeView {
  profile: Profile | null
  nextUp: Nudge | null // always present once onboarded (falls back to a "recommended" pseudo-nudge, id 'rec:<topic>', never stored)
  banner: Nudge | null // at most one secondary nudge
  weekly: { reviewed: number; goal: number; weekStart: number } // North Star unit: reviewed mocks this week
  inProgress: MockSession | null // resumable mock (< 24h)
  topics: { topic: TopicId; score?: number; status: TopicStatus; countedMocks: number; lastPractisedAt?: number; isWeakest: boolean; spark: number[] }[]
  recent: { mock: MockSession; feedback?: Feedback }[] // last 5 ended mocks
  interviewInDays: number | null
  showWtp: boolean // true after the 5th counted mock if WTP not yet answered
}

const latestFeedbackByMock = (feedback: Feedback[]) => {
  const m = new Map<string, Feedback>()
  for (const f of [...feedback].sort((a, b) => a.generatedAt - b.generatedAt)) if (!f.supersededBy) m.set(f.mockId, f)
  return m
}

const fixesViewedEvents = (): Promise<AnalyticsEvent[]> => db.events.where('name').anyOf([...FIXES_VIEWED_NAMES]).toArray()

const emptyStat = (topic: TopicId, now: number): TopicStat => ({ topic, countedMocks: 0, dimScore: {}, history: [], status: 'not_started', updatedAt: now })

async function weakestMeta(): Promise<TopicId | null> {
  return ((await db.meta.get('weakestTopic'))?.value as TopicId | null | undefined) ?? null
}

/** Home's fallback when no rule fires: the weakest topic, else the lowest self-rated, else Product Design. */
function recommendedNudge(profile: Profile, stats: TopicStat[], weakest: TopicId | null, settings: Settings, hasCounted: boolean, now: number): Nudge {
  let topic: TopicId = weakest ?? 'product_design'
  if (!weakest) {
    const rated = TOPICS.filter((t) => profile.selfRatings[t] != null).sort((a, b) => (profile.selfRatings[a]! - profile.selfRatings[b]!) || TOPICS.indexOf(a) - TOPICS.indexOf(b))
    const untried = rated.filter((t) => !(stats.find((s) => s.topic === t)?.countedMocks))
    topic = untried[0] ?? rated[0] ?? topic
  }
  const stat = stats.find((s) => s.topic === topic)
  const label = TOPIC_LABEL[topic]
  const title = hasCounted ? `Practise ${label} next.` : `Start with ${label}.`
  const body = hasCounted && stat?.score !== undefined
    ? `It's your weakest topic right now at ${round1(stat.score).toFixed(1)}.`
    : profile.selfRatings[topic] != null ? `You rated yourself lowest here. A first mock shows where you really stand.` : 'A first mock shows where you really stand.'
  return {
    id: `rec:${topic}`, key: `recommended:${topic}`, type: 'recommended', topic, title, body,
    cta: { label: 'Start mock', action: 'start_mock', payload: { topic, length: settings.mock.defaultLength, mode: profile.preferredMode } },
    priority: PRIORITY.recommended, placement: 'next_up', status: 'active', createdAt: now,
  }
}

export async function getHomeView(): Promise<HomeView> {
  const now = Clock.now()
  const [profile, settings, sessions, feedback, statsRows, nudges, events, weakest] = await Promise.all([
    db.profile.get('me'), getSettings(), db.mockSessions.toArray(), db.feedback.toArray(), db.topicStats.toArray(),
    db.nudges.where('status').equals('active').toArray(), fixesViewedEvents(), weakestMeta(),
  ])
  const p = profile ?? null
  const stats = TOPICS.map((t) => statsRows.find((s) => s.topic === t) ?? emptyStat(t, now))
  const counted = sessions.filter((s) => s.counted)
  const fb = latestFeedbackByMock(feedback)
  let { nextUp, banner } = selectSlots(nudges, settings)
  if (!nextUp && p?.onboardingCompletedAt) nextUp = recommendedNudge(p, stats, weakest, settings, counted.length > 0, now)
  const inProgress = sessions.filter((s) => s.status === 'in_progress' && now - s.lastActivityAt < 24 * HOUR).sort((a, b) => b.lastActivityAt - a.lastActivityAt)[0] ?? null
  const recent = sessions
    .filter((s) => s.status !== 'in_progress' && s.status !== 'abandoned')
    .sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))
    .slice(0, 5)
    .map((mock) => ({ mock, feedback: (mock.feedbackId ? feedback.find((f) => f.id === mock.feedbackId && !f.supersededBy) : undefined) ?? fb.get(mock.id) }))
  return {
    profile: p,
    nextUp,
    banner,
    weekly: { reviewed: reviewedInWeek(reviewedMocks(sessions, feedback, events), now), goal: settings.mock.weeklyGoal, weekStart: weekStart(now) },
    inProgress,
    topics: stats.map((s) => ({
      topic: s.topic, score: s.score, status: s.status, countedMocks: s.countedMocks, lastPractisedAt: s.lastPractisedAt, isWeakest: s.topic === weakest,
      spark: s.history.slice(-6).map((h) => h.ewma ?? h.score),
    })),
    recent,
    interviewInDays: daysUntil(p?.interviewDate, now),
    showWtp: counted.length >= 5 && !p?.wtp?.answer,
  }
}

export interface ProgressView {
  topics: (TopicStat & { label: string; isWeakest: boolean; selfRating?: number })[]
  weakest: TopicId | null
  recurring: { tag: IssueTag; label: string; count: number; of: number; latestQuote: string; latestIssue?: string; dimension: DimensionId; lastMockId?: string }[]
  heatmap: Record<TopicId, Partial<Record<DimensionId, number>>>
  totals: { counted: number; reviewed: number; retries: number; avgUplift: number | null }
  selfVsScored: { topic: TopicId; self: number; scored: number; gap: number }[]
}

export async function getProgressView(): Promise<ProgressView> {
  const now = Clock.now()
  const [profile, sessions, feedback, retries, statsRows, events, weakest] = await Promise.all([
    db.profile.get('me'), db.mockSessions.toArray(), db.feedback.toArray(), db.retries.toArray(), db.topicStats.toArray(), fixesViewedEvents(), weakestMeta(),
  ])
  const stats = TOPICS.map((t) => statsRows.find((s) => s.topic === t) ?? emptyStat(t, now))
  const heatmap = Object.fromEntries(stats.map((s) => [s.topic, { ...s.dimScore }])) as Record<TopicId, Partial<Record<DimensionId, number>>>
  const done = retries.filter((r) => r.completedAt && typeof r.uplift === 'number')
  return {
    topics: stats.map((s) => ({ ...s, label: TOPIC_LABEL[s.topic], isWeakest: s.topic === weakest, selfRating: (profile?.originalSelfRatings ?? profile?.selfRatings)?.[s.topic] })),
    weakest,
    recurring: recurringMistakes(sessions, feedback, now),
    heatmap,
    totals: {
      counted: sessions.filter((s) => s.counted).length,
      reviewed: reviewedMocks(sessions, feedback, events).length,
      retries: retries.filter((r) => r.completedAt).length,
      avgUplift: done.length ? done.reduce((n, r) => n + (r.uplift as number), 0) / done.length : null,
    },
    selfVsScored: selfVsScored(profile ?? null, stats),
  }
}

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

export async function getReportView(feedbackId: string): Promise<ReportView | null> {
  const feedback = await db.feedback.get(feedbackId)
  if (!feedback) return null
  const mock = await db.mockSessions.get(feedback.mockId)
  if (!mock) return null
  const [question, retryRow, profile, allCounted] = await Promise.all([
    db.questions.get(mock.questionId), db.retries.where('newMockId').equals(mock.id).first(), db.profile.get('me'),
    db.feedback.filter((f) => f.counted && !f.supersededBy).toArray(),
  ])
  let retryOf: ReportView['retryOf'] = null
  if (mock.retryOf) {
    const om = await db.mockSessions.get(mock.retryOf)
    const of = om ? (await db.feedback.where('mockId').equals(om.id).toArray()).filter((f) => !f.supersededBy).sort((a, b) => a.generatedAt - b.generatedAt).pop() : undefined
    if (om && of) retryOf = { feedback: of, mock: om }
  }
  const firstCounted = allCounted.sort((a, b) => a.generatedAt - b.generatedAt)[0]
  return {
    feedback, mock, question: question ?? null,
    retry: retryRow?.targetDimension ? (retryRow as Retry & { targetDimension: DimensionId }) : null,
    retryOf,
    selfRating: (profile?.originalSelfRatings ?? profile?.selfRatings)?.[mock.topic],
    isFirstReport: feedback.counted && firstCounted?.id === feedback.id,
    isPracticeOnly: !feedback.counted,
  }
}

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

export async function getMetricsView(): Promise<MetricsView> {
  const now = Clock.now()
  const [profile, sessions, feedback, retries, nudges, events] = await Promise.all([
    db.profile.get('me'), db.mockSessions.toArray(), db.feedback.toArray(), db.retries.toArray(), db.nudges.toArray(), db.events.toArray(),
  ])
  const { _secondMockWithin7d, _reviewed, ...game } = computeGame({ now, profile: profile ?? null, sessions, feedback, retries, nudges, events })
  const series = nsmSeries(_reviewed, now, 8)
  const ws = weekStart(now)
  const thisWeek = series[series.length - 1]?.value ?? 0
  return {
    nsm: { thisWeek, lastWeek: series[series.length - 2]?.value ?? 0, series },
    inputs: {
      weeklyActive: sessions.some((s) => s.counted && (s.endedAt ?? 0) >= ws),
      reviewedPerWeek: thisWeek,
      secondMockWithin7d: _secondMockWithin7d,
      trustRate: game.trustScore,
    },
    game,
    funnel: computeFunnel(sessions, feedback, retries, events),
    events: [...events].sort((a, b) => b.ts - a.ts).slice(0, 200).map((e) => ({ name: e.name, ts: e.ts, props: e.props ?? {} })),
    graderSplit: graderSplit(feedback),
  }
}

export async function getSettingsView(): Promise<Settings> {
  return getSettings()
}
