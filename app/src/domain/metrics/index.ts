/* NSM + GAME metrics (§9.3), computed locally. Pure. Weeks start Monday 00:00 on the app clock (device zone).
   A Reviewed Mock = a counted mock whose fixes were viewed, attributed to the week of the fixes view. */
import type { AnalyticsEvent, Feedback, MockSession, Nudge, Profile, Retry, TopicId } from '@/domain/types'
import { DAY, weekStart } from '@/domain/time'

/** Seed data uses 'feedback_fixes_viewed'; the app writes 'fixes_viewed'. Treat both as the same event. */
export const FIXES_VIEWED_NAMES = new Set(['fixes_viewed', 'feedback_fixes_viewed'])
export function canonicalEventName(name: string): string {
  return name === 'feedback_fixes_viewed' ? 'fixes_viewed' : name
}

export interface ReviewedMock { mockId: string; at: number }

/** Reviewed mocks from the feedback table (fixesViewedAt on a counted, non-superseded report), unioned with
 *  fixes-viewed events for counted mocks, de-duplicated by mockId (first view wins). */
export function reviewedMocks(sessions: MockSession[], feedback: Feedback[], events: AnalyticsEvent[] = []): ReviewedMock[] {
  const counted = new Set(sessions.filter((s) => s.counted).map((s) => s.id))
  const first = new Map<string, number>()
  for (const f of feedback) {
    if (!f.counted || !f.fixesViewedAt || !counted.has(f.mockId)) continue
    const cur = first.get(f.mockId)
    if (cur === undefined || f.fixesViewedAt < cur) first.set(f.mockId, f.fixesViewedAt)
  }
  for (const e of events) {
    if (!FIXES_VIEWED_NAMES.has(e.name)) continue
    const id = e.mockId ?? (e.props?.mockId as string | undefined)
    if (!id || !counted.has(id)) continue
    const cur = first.get(id)
    if (cur === undefined || e.ts < cur) first.set(id, e.ts)
  }
  return [...first.entries()].map(([mockId, at]) => ({ mockId, at })).sort((a, b) => a.at - b.at)
}

export function reviewedInWeek(reviewed: ReviewedMock[], anyTimeInWeek: number): number {
  const ws = weekStart(anyTimeInWeek)
  const we = weekStart(ws + 8 * DAY)
  return reviewed.filter((r) => r.at >= ws && r.at < we).length
}

export function nsmSeries(reviewed: ReviewedMock[], now: number, weeks = 8): { weekStart: number; value: number }[] {
  const out: { weekStart: number; value: number }[] = []
  let ws = weekStart(now)
  for (let i = 0; i < weeks; i++) {
    out.unshift({ weekStart: ws, value: reviewedInWeek(reviewed, ws) })
    ws = weekStart(ws - DAY)
  }
  return out
}

const ratio = (n: number, d: number): number | null => (d > 0 ? n / d : null)

export interface GameInput {
  now: number
  profile: Profile | null
  sessions: MockSession[]
  feedback: Feedback[]
  retries: Retry[]
  nudges: Nudge[]
  events: AnalyticsEvent[]
}

export function computeGame(i: GameInput) {
  const { now, sessions, feedback, retries, events } = i
  const fbLatest = new Map<string, Feedback>()
  for (const f of feedback) if (!f.supersededBy) fbLatest.set(f.mockId, f)
  const counted = sessions.filter((s) => s.counted)
  const reviewed = reviewedMocks(sessions, feedback, events)
  const reviewedIds = new Set(reviewed.map((r) => r.mockId))
  const rated = [...fbLatest.values()].filter((f) => f.rating != null)
  const trustScore = ratio(rated.filter((f) => (f.rating ?? 0) >= 4).length, rated.length)

  const appliedWithin72 = counted.filter((s) => retries.some((r) => r.originalMockId === s.id && r.within72h)).length
  const uplifts = retries.filter((r) => r.sameQuestion && typeof r.uplift === 'number').map((r) => r.uplift as number)
  const started = sessions.length
  const ws = weekStart(now)
  const thisWeekCounted = counted.filter((s) => (s.endedAt ?? 0) >= ws).length

  const countedSorted = [...counted].sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0))
  const secondMockWithin7d = countedSorted.length >= 2 ? (countedSorted[1].endedAt ?? 0) - (countedSorted[0].endedAt ?? 0) <= 7 * DAY : countedSorted.length === 1 && now - (countedSorted[0].endedAt ?? 0) > 7 * DAY ? false : null

  const fq = events.filter((e) => e.name === 'first_question_shown').map((e) => Number(e.props?.msSinceStartClick)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  const median = fq.length ? fq[Math.floor((fq.length - 1) / 2)] : null

  const sent = events.filter((e) => e.name === 'nudge_sent')
  const acted = events.filter((e) => e.name === 'nudge_acted')
  const nudgeConversion = ratio(new Set(acted.map((e) => e.props?.nudgeId)).size, new Set(sent.map((e) => e.props?.nudgeId)).size)

  const startedEvents = events.filter((e) => e.name === 'mock_started')
  const onWeakest = startedEvents.filter((e) => e.props?.onWeakest === true).length
  const weakTopicFollowThrough = ratio(onWeakest, startedEvents.filter((e) => e.props?.onWeakest !== undefined).length)

  return {
    feedbackReadRate: ratio(counted.filter((s) => reviewedIds.has(s.id)).length, counted.length),
    trustScore,
    fixAppliedRate: ratio(appliedWithin72, counted.length),
    fixUplift: uplifts.length ? uplifts.reduce((a, b) => a + b, 0) / uplifts.length : null,
    completionRate: ratio(counted.length, started),
    mocksPerWeek: thisWeekCounted,
    secondMockRate: secondMockWithin7d === null ? null : secondMockWithin7d ? 1 : 0,
    timeToFirstQuestionMs: median,
    trackerViews: events.filter((e) => e.name === 'tracker_viewed').length,
    nudgeConversion,
    weakTopicFollowThrough,
    wtpAnswer: i.profile?.wtp?.answer ?? null,
    _secondMockWithin7d: secondMockWithin7d,
    _reviewed: reviewed,
  }
}

export function computeFunnel(sessions: MockSession[], feedback: Feedback[], retries: Retry[], events: AnalyticsEvent[] = []) {
  const counted = new Set(sessions.filter((s) => s.counted).map((s) => s.id))
  const fb = feedback.filter((f) => !f.supersededBy && counted.has(f.mockId))
  const reviewed = reviewedMocks(sessions, feedback, events)
  return {
    started: sessions.length,
    completed: counted.size,
    opened: fb.filter((f) => f.openedAt).length,
    fixesViewed: reviewed.length,
    rated: fb.filter((f) => f.rating != null).length,
    retried: retries.length,
  }
}

export function graderSplit(feedback: Feedback[]) {
  const out = { llm: 0, offline: 0, fixture: 0 }
  for (const f of feedback) if (!f.supersededBy) out[f.grader]++
  return out
}

export function isWeakestStart(topic: TopicId, weakest: TopicId | null): boolean {
  return weakest !== null && topic === weakest
}
