/* Scoring maths (§7.6–7.7): EWMA topic scores, delta14, status, weakest topic with hysteresis, recurring
   mistakes, self-vs-scored and uplift. Pure. */
import type { DimensionId, Feedback, IssueTag, MockSession, Profile, Retry, TopicId, TopicStat, TopicStatus } from '@/domain/types'
import { DIMENSIONS, TOPICS } from '@/domain/types'
import { tagLabel } from '@/domain/rubric/tags'

export const ALPHA = 0.5
const DAY = 86_400_000

export function ewma(values: number[], alpha = ALPHA): number | undefined {
  let e: number | undefined
  for (const x of values) e = e === undefined ? x : alpha * x + (1 - alpha) * e
  return e
}

/** EWMA series: value after each observation. */
export function ewmaSeries(values: number[], alpha = ALPHA): number[] {
  const out: number[] = []
  let e: number | undefined
  for (const x of values) { e = e === undefined ? x : alpha * x + (1 - alpha) * e; out.push(e) }
  return out
}

export interface ScoredMock {
  mockId: string
  topic: TopicId
  at: number // completion time
  overall: number
  scores: Record<DimensionId, number>
  isRetry: boolean
}

/** Counted, non-superseded reports joined with their sessions, ordered by completion time. */
export function scoredMocks(sessions: MockSession[], feedback: Feedback[]): ScoredMock[] {
  const byId = new Map(sessions.map((s) => [s.id, s]))
  const out: ScoredMock[] = []
  for (const f of feedback) {
    if (!f.counted || f.supersededBy) continue
    const s = byId.get(f.mockId)
    if (!s || !s.counted) continue
    out.push({
      mockId: f.mockId,
      topic: f.topic,
      at: s.endedAt ?? f.generatedAt,
      overall: f.overall,
      scores: Object.fromEntries(f.dimensionScores.map((d) => [d.dimension, d.score])) as Record<DimensionId, number>,
      isRetry: !!s.retryOf,
    })
  }
  return out.sort((a, b) => a.at - b.at)
}

export function topicStatus(stat: Pick<TopicStat, 'countedMocks' | 'score' | 'dimScore' | 'history'>, now: number): TopicStatus {
  if (stat.countedMocks === 0 || stat.score === undefined) return 'not_started'
  if (stat.countedMocks === 1 || stat.score < 3.0) return 'building'
  const recent = stat.history.filter((h) => h.at >= now - 30 * DAY).length
  const last2 = stat.history.slice(-2)
  const dimsOk = DIMENSIONS.every((d) => (stat.dimScore[d] ?? 0) >= 3.0)
  if (recent >= 3 && stat.score >= 3.8 && last2.length === 2 && last2.every((h) => h.score >= 3.5) && dimsOk) return 'consistent'
  return 'getting_there'
}

export function computeTopicStat(topic: TopicId, mocks: ScoredMock[], now: number): TopicStat {
  const ms = mocks.filter((m) => m.topic === topic).sort((a, b) => a.at - b.at)
  const series = ewmaSeries(ms.map((m) => m.overall))
  const history = ms.map((m, i) => ({ mockId: m.mockId, at: m.at, score: m.overall, isRetry: m.isRetry, ewma: series[i] }))
  const score = ewma(ms.map((m) => m.overall))
  const dimScore: Partial<Record<DimensionId, number>> = {}
  if (ms.length) for (const d of DIMENSIONS) dimScore[d] = ewma(ms.map((m) => m.scores[d]))
  let delta14: number | undefined
  const cutoff = now - 14 * DAY
  const older = ms.filter((m) => m.at <= cutoff)
  if (older.length && score !== undefined) {
    const then = ewma(older.map((m) => m.overall))!
    delta14 = score - then
  }
  const base: TopicStat = {
    topic, countedMocks: ms.length, lastPractisedAt: ms.length ? ms[ms.length - 1].at : undefined, score, dimScore, history, delta14,
    status: 'not_started', updatedAt: now,
  }
  base.status = topicStatus(base, now)
  return base
}

export function computeAllTopicStats(sessions: MockSession[], feedback: Feedback[], now: number): TopicStat[] {
  const mocks = scoredMocks(sessions, feedback)
  return TOPICS.map((t) => computeTopicStat(t, mocks, now))
}

/** Weakest topic (§7.6). `previous` is the currently highlighted topic, for hysteresis. */
export function weakestTopic(stats: TopicStat[], previous?: TopicId | null): TopicId | null {
  const practised = stats.filter((s) => s.countedMocks >= 1 && s.score !== undefined)
  let eligible = practised.filter((s) => s.countedMocks >= 2)
  if (!eligible.length) eligible = practised
  if (!eligible.length) return null
  const minDim = (s: TopicStat) => Math.min(...DIMENSIONS.map((d) => s.dimScore[d] ?? 5))
  const sorted = [...eligible].sort((a, b) => {
    const da = a.score!, db = b.score!
    if (Math.abs(da - db) > 0.1 + 1e-9) return da - db
    const ma = minDim(a), mb = minDim(b)
    if (ma !== mb) return ma - mb
    return (a.lastPractisedAt ?? 0) - (b.lastPractisedAt ?? 0)
  })
  const candidate = sorted[0]
  if (previous && previous !== candidate.topic) {
    const prev = eligible.find((s) => s.topic === previous)
    if (prev && prev.score! - candidate.score! < 0.2 - 1e-9) return previous
  }
  return candidate.topic
}

export interface RecurringMistake { tag: IssueTag; label: string; count: number; of: number; latestQuote: string; latestIssue?: string; dimension: DimensionId; lastMockId: string }

/** Rank-1 fix tags over counted reports in the last 30 days; count ≥ 2, max 5 (§7.6). */
export function recurringMistakes(sessions: MockSession[], feedback: Feedback[], now: number): RecurringMistake[] {
  const byId = new Map(sessions.map((s) => [s.id, s]))
  const recent = feedback
    .filter((f) => f.counted && !f.supersededBy && byId.get(f.mockId)?.counted && (byId.get(f.mockId)!.endedAt ?? f.generatedAt) >= now - 30 * DAY)
    .sort((a, b) => b.generatedAt - a.generatedAt)
  const N = recent.length
  const counts = new Map<IssueTag, RecurringMistake>()
  for (const f of recent) {
    const top = f.fixes.find((x) => x.rank === 1) ?? f.fixes[0]
    if (!top) continue
    const cur = counts.get(top.issueTag)
    if (cur) cur.count++
    else counts.set(top.issueTag, { tag: top.issueTag, label: tagLabel(top.issueTag), count: 1, of: N, latestQuote: top.quote, latestIssue: top.issue, dimension: top.dimension, lastMockId: f.mockId })
  }
  return [...counts.values()].filter((r) => r.count >= 2).sort((a, b) => b.count - a.count).slice(0, 5)
}

export function selfVsScored(profile: Profile | null | undefined, stats: TopicStat[]): { topic: TopicId; self: number; scored: number; gap: number }[] {
  if (!profile) return []
  const ratings = profile.originalSelfRatings ?? profile.selfRatings
  const out: { topic: TopicId; self: number; scored: number; gap: number }[] = []
  for (const s of stats) {
    const self = ratings?.[s.topic]
    if (self == null || s.score === undefined || s.countedMocks < 1) continue
    out.push({ topic: s.topic, self, scored: s.score, gap: s.score - self })
  }
  return out.sort((a, b) => a.gap - b.gap)
}

/** Uplift on the target dimension; only when both mocks are counted. */
export function computeUplift(original: Feedback | undefined, retry: Feedback | undefined, target: DimensionId | undefined): Pick<Retry, 'before' | 'after' | 'uplift' | 'overallBefore' | 'overallAfter'> {
  if (!original || !retry) return {}
  const out: Pick<Retry, 'before' | 'after' | 'uplift' | 'overallBefore' | 'overallAfter'> = { overallBefore: original.overall, overallAfter: retry.overall }
  if (target) {
    const b = original.dimensionScores.find((d) => d.dimension === target)?.score
    const a = retry.dimensionScores.find((d) => d.dimension === target)?.score
    out.before = b
    out.after = a
    if (original.counted && retry.counted && a != null && b != null) out.uplift = a - b
  }
  return out
}

/** GAME goal 3: change in the weakest topic's score over 14 days from t0. */
export function improvementSince(mocks: ScoredMock[], topic: TopicId, t0: number, includeRetries = false): number | undefined {
  const ms = mocks.filter((m) => m.topic === topic && (includeRetries || !m.isRetry))
  const at = (t: number) => ewma(ms.filter((m) => m.at <= t).map((m) => m.overall))
  const a = at(t0), b = at(t0 + 14 * DAY)
  return a !== undefined && b !== undefined ? b - a : undefined
}
