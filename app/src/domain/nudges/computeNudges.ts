/* Nudge engine (§4.4). Pure: computeNudges(state, now) → instances to create and existing ones to close.
   Hygiene: quiet before the first counted mock, 3 new per calendar day, 2 per topic per 7 days, 48 h cooldown
   per key after dismiss, per-type mute, fatigue pause after 3 dismissals in a row. */
import type { Feedback, MockSession, Nudge, NudgeType, Profile, Retry, Settings, TopicId, TopicStat } from '@/domain/types'
import { TOPIC_LABEL } from '@/domain/types'
import { DAY, HOUR, dayStart, daysUntil, localDateKey, weekStart, weekday } from '@/domain/time'
import { round1 } from '@/domain/rubric/weights'

export const PRIORITY: Record<NudgeType, number> = {
  resume_mock: 0, unread_feedback: 1, retry_fix: 2, neglected_topic: 3, weekly_goal: 4, interview_countdown: 4, recommended: 9,
}
const EXEMPT: NudgeType[] = ['resume_mock', 'unread_feedback']
const FATIGUE_TYPES: NudgeType[] = ['neglected_topic', 'weekly_goal', 'interview_countdown']

export type NudgeDraft = Omit<Nudge, 'id' | 'createdAt' | 'status' | 'placement'>

export interface NudgeState {
  profile: Profile | null
  settings: Pick<Settings, 'nudges' | 'mock'>
  sessions: MockSession[]
  feedback: Feedback[]
  retries: Retry[]
  topicStats: TopicStat[]
  nudges: Nudge[]
  weakest: TopicId | null
  /** Reviewed (fixes viewed) counted mocks this week. */
  reviewedThisWeek: number
}

export interface NudgeResult {
  create: NudgeDraft[]
  close: { id: string; status: 'resolved' | 'expired' }[]
}

function topLabel(t: TopicId): string { return t === 'rca' ? 'RCA' : TOPIC_LABEL[t] }
function lcFirst(s: string): string { return s ? s[0].toLowerCase() + s.slice(1) : s }

/** Latest non-superseded feedback per mock. */
function feedbackByMock(feedback: Feedback[]): Map<string, Feedback> {
  const m = new Map<string, Feedback>()
  for (const f of feedback) if (!f.supersededBy) m.set(f.mockId, f)
  return m
}

/** What the rules say should be showing right now (before hygiene). */
export function ruleCandidates(state: NudgeState, now: number): NudgeDraft[] {
  const out: NudgeDraft[] = []
  const fb = feedbackByMock(state.feedback)
  const sessions = state.sessions
  const countedSessions = sessions.filter((s) => s.counted)

  // resume_mock
  for (const s of sessions) {
    if (s.status !== 'in_progress' || now - s.lastActivityAt >= 24 * HOUR) continue
    const left = s.followupsPlanned - Math.max(0, s.machine.followupsAsked - (s.machine.slot.kind === 'followup' ? 1 : 0))
    out.push({
      key: `resume_mock:${s.id}`, type: 'resume_mock', topic: s.topic, mockId: s.id,
      title: `Resume your ${topLabel(s.topic)} mock.`,
      body: s.machine.slot.kind === 'main' ? 'Your main answer is still open.' : `${left} follow-up${left === 1 ? '' : 's'} left.`,
      cta: { label: 'Resume', action: 'resume_mock', payload: { mockId: s.id, topic: s.topic } }, priority: PRIORITY.resume_mock,
    })
  }
  // unread_feedback
  for (const s of countedSessions) {
    const f = fb.get(s.id)
    if (!f || f.fixesViewedAt || now - f.generatedAt < 10 * 60_000) continue
    out.push({
      key: `unread_feedback:${f.id}`, type: 'unread_feedback', topic: f.topic, feedbackId: f.id, mockId: s.id,
      title: `Your ${topLabel(f.topic)} feedback is ready.`, body: `${f.fixes.length} fixes waiting.`,
      cta: { label: 'Open feedback', action: 'open_feedback', payload: { feedbackId: f.id, mockId: s.id, topic: f.topic } }, priority: PRIORITY.unread_feedback,
    })
  }
  // retry_fix: the latest counted mock, 2–72 h old, fixes viewed, no retry yet, nothing started since
  const latest = [...countedSessions].sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0]
  if (latest) {
    const f = fb.get(latest.id)
    const age = now - (latest.endedAt ?? latest.startedAt)
    const startedSince = sessions.some((s) => s.id !== latest.id && s.startedAt > (latest.endedAt ?? latest.startedAt))
    const retried = state.retries.some((r) => r.originalMockId === latest.id)
    const fix = f?.fixes.find((x) => x.rank === 1)
    if (f && fix && f.fixesViewedAt && age >= 2 * HOUR && age <= 72 * HOUR && !retried && !startedSince) {
      const hoursLeft = Math.max(1, Math.round((72 * HOUR - age) / HOUR))
      out.push({
        key: `retry_fix:${latest.id}`, type: 'retry_fix', topic: latest.topic, feedbackId: f.id, mockId: latest.id,
        title: `Apply your fix: ${lcFirst(fix.instruction.replace(/\.$/, ''))}.`, body: `${hoursLeft} hours left to retry.`,
        cta: { label: 'Retry with this fix', action: 'start_retry', payload: { feedbackId: f.id, fixId: fix.id, mockId: latest.id, topic: latest.topic, questionId: latest.questionId, length: 'quick' } }, priority: PRIORITY.retry_fix,
      })
    }
  }
  // neglected_topic: lowest-scoring topic with ≥ 1 counted mock and none for ≥ 7 days
  const neglected = state.topicStats.filter((t) => t.countedMocks >= 1 && t.lastPractisedAt !== undefined && now - t.lastPractisedAt >= 7 * DAY && t.score !== undefined)
    .sort((a, b) => a.score! - b.score!)[0]
  if (neglected) {
    const days = Math.floor((now - neglected.lastPractisedAt!) / DAY)
    // open fix: the topic's latest counted report's rank-1 fix, never retried
    const latestOnTopic = countedSessions.filter((s) => s.topic === neglected.topic).sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0]
    const f = latestOnTopic ? fb.get(latestOnTopic.id) : undefined
    const fix = f?.fixes.find((x) => x.rank === 1)
    const open = f && fix && !state.retries.some((r) => r.originalMockId === latestOnTopic!.id)
    out.push({
      key: `neglected_topic:${neglected.topic}`, type: 'neglected_topic', topic: neglected.topic, feedbackId: open ? f!.id : undefined, mockId: open ? latestOnTopic!.id : undefined,
      title: `${topLabel(neglected.topic)} — not practised in ${days} days.`,
      body: `Last score ${round1(neglected.score!).toFixed(1)}.${open ? ` Your open fix: ${fix!.instruction}` : ''}`,
      cta: open
        ? { label: 'Retry with your fix', action: 'start_retry', payload: { feedbackId: f!.id, fixId: fix!.id, mockId: latestOnTopic!.id, topic: neglected.topic, questionId: latestOnTopic!.questionId, length: 'quick' } }
        : { label: 'Start a Quick mock', action: 'start_mock', payload: { topic: neglected.topic, length: 'quick' } },
      priority: PRIORITY.neglected_topic,
    })
  }
  // weekly_goal: Friday–Sunday and reviewed < goal
  const goal = state.settings.mock.weeklyGoal
  if (weekday(now) >= 4 && state.reviewedThisWeek < goal) {
    const n = goal - state.reviewedThisWeek
    const topic = state.weakest ?? 'product_design'
    out.push({
      key: `weekly_goal:${localDateKey(weekStart(now))}`, type: 'weekly_goal', topic: state.weakest ?? undefined,
      title: `${n} more reviewed mock${n === 1 ? '' : 's'} reaches your goal of ${goal} this week.`, body: 'A Quick mock takes about ten minutes.',
      cta: { label: 'Start recommended mock', action: 'start_mock', payload: { topic, length: 'quick' } }, priority: PRIORITY.weekly_goal,
    })
  }
  // interview_countdown: ≤ 7 days out and no reviewed mock today
  const d = daysUntil(state.profile?.interviewDate, now)
  if (d !== null && d >= 0 && d <= 7) {
    const today = dayStart(now)
    const reviewedToday = state.feedback.some((f) => f.counted && f.fixesViewedAt && f.fixesViewedAt >= today)
    if (!reviewedToday) {
      const w = state.weakest
      out.push({
        key: `interview_countdown:${localDateKey(now)}`, type: 'interview_countdown', topic: w ?? undefined,
        title: d === 0 ? 'Your interview is today.' : `Interview in ${d} day${d === 1 ? '' : 's'}.`,
        body: w ? `Your weakest topic is ${topLabel(w)}.` : 'One more mock keeps you sharp.',
        cta: { label: 'Practise weakest', action: 'start_mock', payload: { topic: w ?? 'product_design', length: 'quick' } }, priority: PRIORITY.interview_countdown,
      })
    }
  }
  return out
}

function stillValid(n: Nudge, candidates: NudgeDraft[]): boolean {
  return candidates.some((c) => c.key === n.key)
}

export function computeNudges(state: NudgeState, now: number): NudgeResult {
  const candidates = ruleCandidates(state, now)
  const close: NudgeResult['close'] = []
  const active = state.nudges.filter((n) => n.status === 'active')

  // Close active instances whose condition has gone.
  for (const n of active) {
    if (stillValid(n, candidates)) continue
    const expired = (n.type === 'retry_fix' || n.type === 'weekly_goal' || n.type === 'interview_countdown') && !state.retries.some((r) => r.originalMockId === n.mockId)
    close.push({ id: n.id, status: expired ? 'expired' : 'resolved' })
  }

  const hasCounted = state.sessions.some((s) => s.counted)
  const muted = state.settings.nudges.muted
  const mutedTypes = new Set(state.settings.nudges.mutedTypes)
  const today = dayStart(now)
  let createdToday = state.nudges.filter((n) => n.createdAt >= today && n.type !== 'resume_mock').length
  const decided = [...state.nudges].filter((n) => n.status === 'dismissed' || n.status === 'acted').sort((a, b) => (b.dismissedAt ?? b.actedAt ?? 0) - (a.dismissedAt ?? a.actedAt ?? 0))
  const last3 = decided.slice(0, 3)
  const fatigued = last3.length === 3 && last3.every((n) => n.status === 'dismissed') && now - (last3[0].dismissedAt ?? 0) < 7 * DAY
  const topicCount = (t?: TopicId) => (t ? state.nudges.filter((n) => n.topic === t && n.createdAt >= now - 7 * DAY && n.type !== 'resume_mock' && n.type !== 'unread_feedback').length : 0)
  const topicNew = new Map<string, number>()

  const create: NudgeDraft[] = []
  for (const c of [...candidates].sort((a, b) => a.priority - b.priority)) {
    const exempt = EXEMPT.includes(c.type)
    if (active.some((n) => n.key === c.key)) continue // already showing
    if (!hasCounted && c.type !== 'resume_mock') continue
    if (muted && c.type !== 'resume_mock') continue
    if (mutedTypes.has(c.type)) continue
    const sameKey = state.nudges.filter((n) => n.key === c.key)
    if (sameKey.some((n) => n.status === 'dismissed' && now - (n.dismissedAt ?? n.createdAt) < 48 * HOUR)) continue
    // A per-entity key that was already acted on, resolved or expired never comes back.
    if (sameKey.some((n) => n.status === 'acted' || n.status === 'resolved' || n.status === 'expired')) {
      if (c.type !== 'neglected_topic') continue
      const lastPractised = state.topicStats.find((t) => t.topic === c.topic)?.lastPractisedAt ?? 0
      if (sameKey.some((n) => (n.status !== 'dismissed') && n.createdAt >= lastPractised)) continue
    }
    if (fatigued && FATIGUE_TYPES.includes(c.type)) continue
    if (!exempt && c.type !== 'resume_mock') {
      if (createdToday >= 3) continue
      const tc = topicCount(c.topic) + (topicNew.get(c.topic ?? '') ?? 0)
      if (c.topic && tc >= 2) continue
    }
    create.push(c)
    if (c.type !== 'resume_mock') createdToday++
    if (c.topic) topicNew.set(c.topic, (topicNew.get(c.topic) ?? 0) + 1)
  }
  return { create, close }
}

/** Placement: top active by priority → next_up, the next one → banner. */
export function selectSlots(nudges: Nudge[], settings: Pick<Settings, 'nudges'>): { nextUp: Nudge | null; banner: Nudge | null } {
  const mutedTypes = new Set(settings.nudges.mutedTypes)
  const active = nudges
    .filter((n) => n.status === 'active' && !mutedTypes.has(n.type) && (!settings.nudges.muted || n.type === 'resume_mock'))
    .sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt)
  const nextUp = active[0] ? { ...active[0], placement: 'next_up' as const } : null
  // The banner adds a second, different reason to act; never two of the same kind.
  const second = active.slice(1).find((n) => n.type !== active[0].type)
  const banner = second ? { ...second, placement: 'banner' as const } : null
  return { nextUp, banner }
}
