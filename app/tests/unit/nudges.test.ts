import { describe, expect, it } from 'vitest'
import { computeNudges, selectSlots, type NudgeState } from '@/domain/nudges/computeNudges'
import type { Feedback, MockSession, Nudge, TopicStat } from '@/domain/types'

const DAY = 86_400_000
const HOUR = 3_600_000
const NOW = new Date(2026, 10, 25, 15, 0, 0).getTime() // Wednesday
const iso = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

const session = (id: string, endedAt: number, counted = true): MockSession =>
  ({ id, topic: 'metrics', questionId: 'met-101', status: 'completed', counted, startedAt: endedAt - HOUR, endedAt, lastActivityAt: endedAt, turns: [], machine: { slot: { kind: 'main' } } }) as unknown as MockSession
const feedback = (mockId: string, at: number, viewed = true): Feedback =>
  ({ id: `f-${mockId}`, mockId, topic: 'metrics', counted: true, generatedAt: at, fixesViewedAt: viewed ? at + 60_000 : undefined, fixes: [{ id: 'fx1', rank: 1, instruction: 'Name one guardrail before you finish.', dimension: 'metrics' }] }) as unknown as Feedback
const stat = (lastPractisedAt: number): TopicStat => ({ topic: 'metrics', countedMocks: 1, lastPractisedAt, score: 2.3, dimScore: {}, history: [], status: 'building', updatedAt: NOW })
const nudge = (p: Partial<Nudge>): Nudge => ({ id: Math.random().toString(36), key: 'k', type: 'weekly_goal', title: '', body: '', cta: { label: '', action: 'start_mock', payload: {} }, priority: 4, placement: 'banner', status: 'expired', createdAt: NOW - 30 * DAY, ...p })

function state(p: Partial<NudgeState> = {}): NudgeState {
  const ended = NOW - 8 * DAY
  return {
    profile: { id: 'me', selfRatings: {}, preferredMode: 'text', createdAt: NOW - 30 * DAY, onboardingStep: 4, isDemo: false, interviewDate: iso(NOW + 3 * DAY) },
    settings: { nudges: { muted: false, mutedTypes: [] }, mock: { defaultLength: 'quick', weeklyGoal: 3 } },
    sessions: [session('m1', ended)], feedback: [feedback('m1', ended)], retries: [], topicStats: [stat(ended)], nudges: [], weakest: 'metrics', reviewedThisWeek: 0,
    ...p,
  }
}

describe('nudge engine hygiene', () => {
  it('is quiet before the first counted mock', () => {
    const s = state({ sessions: [session('m1', NOW - 8 * DAY, false)], topicStats: [] })
    expect(computeNudges(s, NOW).create).toEqual([])
  })

  it('creates neglected_topic (with the open fix) and interview_countdown; per-type mute works', () => {
    const r = computeNudges(state(), NOW)
    expect(r.create.map((c) => c.type)).toEqual(['neglected_topic', 'interview_countdown'])
    expect(r.create[0].cta).toMatchObject({ label: 'Retry with your fix', action: 'start_retry' })
    expect(r.create[0].cta.payload).toMatchObject({ topic: 'metrics', mockId: 'm1', questionId: 'met-101', fixId: 'fx1', length: 'quick' })
    const muted = computeNudges(state({ settings: { nudges: { muted: false, mutedTypes: ['interview_countdown'] }, mock: { defaultLength: 'quick', weeklyGoal: 3 } } }), NOW)
    expect(muted.create.map((c) => c.type)).toEqual(['neglected_topic'])
  })

  it('48 h cooldown after a dismiss', () => {
    const dismissed = (h: number) => nudge({ key: 'neglected_topic:metrics', type: 'neglected_topic', topic: 'metrics', status: 'dismissed', createdAt: NOW - h * HOUR, dismissedAt: NOW - h * HOUR })
    expect(computeNudges(state({ nudges: [dismissed(10)] }), NOW).create.map((c) => c.type)).not.toContain('neglected_topic')
    expect(computeNudges(state({ nudges: [dismissed(50)] }), NOW).create.map((c) => c.type)).toContain('neglected_topic')
  })

  it('caps new nudges at 3 per day, but unread feedback is exempt', () => {
    const today = Array.from({ length: 3 }, (_, i) => nudge({ key: `x${i}`, createdAt: NOW - HOUR }))
    const fresh = NOW - 20 * 60_000
    const s = state({ nudges: today, sessions: [session('m1', NOW - 8 * DAY), session('m2', fresh)], feedback: [feedback('m1', NOW - 8 * DAY), feedback('m2', fresh, false)] })
    expect(computeNudges(s, NOW).create.map((c) => c.type)).toEqual(['unread_feedback'])
  })

  it('closes an active nudge whose condition is gone', () => {
    const active = nudge({ key: 'unread_feedback:gone', type: 'unread_feedback', status: 'active', createdAt: NOW - HOUR })
    expect(computeNudges(state({ nudges: [active] }), NOW).close).toEqual([{ id: active.id, status: 'resolved' }])
  })

  it('slots: highest priority to Next-up, the next to the banner; global mute keeps only resume', () => {
    const a = nudge({ id: 'a', type: 'neglected_topic', priority: 3, status: 'active' })
    const b = nudge({ id: 'b', type: 'unread_feedback', priority: 1, status: 'active' })
    const c = nudge({ id: 'c', type: 'resume_mock', priority: 0, status: 'active' })
    expect(selectSlots([a, b], { nudges: { muted: false, mutedTypes: [] } })).toMatchObject({ nextUp: { id: 'b' }, banner: { id: 'a' } })
    expect(selectSlots([a, b, c], { nudges: { muted: true, mutedTypes: [] } })).toMatchObject({ nextUp: { id: 'c' }, banner: null })
  })
})
