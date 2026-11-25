import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import { db, getSettings, updateSettings } from '@/services/db/db'
import { Clock } from '@/services/clock'
import { configureScriptedAI } from '@/ai'
import * as api from '@/engine/api'
import { getHomeView, getProgressView, getReportView } from '@/engine/selectors'
import { CURATED_QUESTIONS } from '@/content/questions'
import { DEMO_ANSWERS } from '@/content/fixtures'

const HOUR = 3_600_000
const BASE = new Date(2026, 10, 25, 10, 0, 0).getTime() // Wednesday 10:00
const at = (ms: number) => api.setClockOffset(BASE + ms - Date.now())
const names = async () => (await db.events.toArray()).map((e) => e.name)

async function play(mockId: string, answers: string[]) {
  for (const a of answers) { const r = await api.submitAnswer(mockId, a, 'text'); if (r.done) return r }
  throw new Error('mock did not close')
}

beforeAll(async () => {
  configureScriptedAI({ turnLatencyMs: [0, 0] })
  await api.boot()
  await at(0)
})

describe('engine: fresh user → demo loop', () => {
  let mockId = ''
  let feedbackId = ''

  it('boot seeds the curated library and default settings', async () => {
    expect(await db.questions.where('source').equals('curated').count()).toBe(CURATED_QUESTIONS.length)
    expect((await getSettings()).ai.mode).toBe('scripted')
  })

  it('onboarding freezes the original self-ratings; Home falls back to a recommended pseudo-nudge', async () => {
    await api.saveProfile({ firstName: 'Asha', selfRatings: { metrics: 4, strategy: 2 }, onboardingStep: 3 })
    await api.completeOnboarding()
    const p = (await db.profile.get('me'))!
    expect(p.originalSelfRatings).toEqual({ metrics: 4, strategy: 2 })
    const h = await getHomeView()
    expect(h.nextUp?.id.startsWith('rec:')).toBe(true)
    expect(h.nextUp?.cta.payload.topic).toBe('strategy')
    expect(await names()).toContain('onboarding_completed')
  })

  it('demo mode pins met-101 with the ₹2 fee variant; the mock closes and is counted', async () => {
    await updateSettings((s) => ({ ...s, demo: { ...s.demo, enabled: true, minScoringMs: 0 } }))
    expect((await api.recommendQuestion('metrics')).id).toBe('met-101')
    const s = await api.startMock({ topic: 'metrics', length: 'quick', mode: 'text', entryPoint: 'home_next_up' })
    mockId = s.id
    expect(s.variant?.value).toContain('₹2 fee')
    expect(s.turns.map((t) => t.kind)).toEqual(['intro', 'question'])
    const r = await play(mockId, DEMO_ANSWERS['met-101'])
    expect(r.session.status).toBe('completed')
    expect(r.session.counted).toBe(true)
    expect(r.session.turns.filter((t) => t.kind === 'followup_q').map((t) => t.followupIndex)).toEqual([1, 2])
    expect(await names()).toEqual(expect.arrayContaining(['mock_started', 'first_question_shown', 'turn_submitted', 'mock_completed']))
  })

  it('grades through the stages and writes feedback + topic stats', async () => {
    const stages: string[] = []
    const fb = await api.gradeMock(mockId, (s) => stages.push(s))
    feedbackId = fb.id
    expect(stages).toEqual(['reading', 'scoring', 'writing_fixes', 'done'])
    expect(fb.overall).toBe(2.3)
    expect(fb.fixes).toHaveLength(3)
    expect((await db.mockSessions.get(mockId))?.feedbackId).toBe(fb.id)
    expect((await db.topicStats.get('metrics'))?.score).toBeCloseTo(2.3, 6)
    // idempotent
    expect((await api.gradeMock(mockId)).id).toBe(fb.id)
    expect((await getReportView(fb.id))?.isFirstReport).toBe(true)
    expect(await names()).toContain('feedback_generated')
  })

  it('unread feedback nudge after 10 minutes; reviewing resolves it and fills the ring', async () => {
    await at(11 * 60_000)
    let h = await getHomeView()
    expect(h.nextUp?.type).toBe('unread_feedback')
    expect(h.nextUp?.cta.payload.feedbackId).toBe(feedbackId)
    await api.markFeedbackOpened(feedbackId, 'nudge')
    await api.markFixesViewed(feedbackId)
    const ev = (await db.events.where('name').equals('fixes_viewed').toArray())[0]
    expect(ev.props.firstEver).toBe(true)
    h = await getHomeView()
    expect(h.weekly.reviewed).toBe(1)
    expect(h.nextUp?.type).not.toBe('unread_feedback')
  })

  it('retry_fix nudge appears between 2 h and 72 h after the report', async () => {
    await at(3 * HOUR)
    const h = await getHomeView()
    const n = [h.nextUp, h.banner].find((x) => x?.type === 'retry_fix')
    expect(n).toBeTruthy()
    expect(n!.cta.payload.feedbackId).toBe(feedbackId)
    expect(n!.cta.payload.fixId).toBeTruthy()
  })

  it('retry: quick, same question, uplift recorded, retry nudge resolved', async () => {
    const fb = (await db.feedback.get(feedbackId))!
    const s = await api.startRetry(feedbackId, fb.fixes[0].id, 'text')
    expect(s.length).toBe('quick')
    expect(s.questionId).toBe('met-101')
    expect(s.retryOf).toBe(mockId)
    const r = await play(s.id, DEMO_ANSWERS['met-102'].map((a) => a.replace(/Reorder|reorder/g, 'split')))
    expect(r.done).toBe(true)
    await api.gradeMock(s.id)
    const cmp = await api.getRetryComparison(s.id)
    expect(cmp?.completedAt).toBeTruthy()
    expect(cmp?.within72h).toBe(true)
    expect(typeof cmp?.uplift).toBe('number')
    expect(await names()).toEqual(expect.arrayContaining(['question_reattempted', 'retry_completed']))
    expect((await db.nudges.where('type').equals('retry_fix').toArray()).every((n) => n.status !== 'active')).toBe(true)
  })

  it('starting a new mock abandons the one in progress; stale mocks expire after 24 h', async () => {
    const a = await api.startMock({ topic: 'strategy', length: 'standard', mode: 'text', entryPoint: 'practice' })
    const b = await api.startMock({ topic: 'rca', length: 'quick', mode: 'text', entryPoint: 'practice' })
    expect((await db.mockSessions.get(a.id))?.status).toBe('abandoned')
    expect((await getHomeView()).inProgress?.id).toBe(b.id)
    await at(28 * HOUR)
    expect((await db.mockSessions.get(b.id))?.status).toBe('abandoned')
    const ev = (await db.events.where('name').equals('mock_abandoned').toArray()).map((e) => e.props.reason)
    expect(ev).toEqual(expect.arrayContaining(['replaced', 'timeout']))
  })

  it('ending early after main + one follow-up gives a practice-only report', async () => {
    const s = await api.startMock({ topic: 'rca', questionId: 'rca-001', length: 'standard', mode: 'text', entryPoint: 'practice' })
    await api.submitAnswer(s.id, DEMO_ANSWERS['rca-001'][0], 'text')
    await api.submitAnswer(s.id, DEMO_ANSWERS['rca-001'][1], 'text')
    const end = await api.endMockEarly(s.id)
    expect(end).toEqual({ status: 'ended_early', canGrade: true })
    const fb = await api.gradeMock(s.id)
    expect(fb.counted).toBe(false)
    expect((await getReportView(fb.id))?.isPracticeOnly).toBe(true)
    expect((await getProgressView()).totals.counted).toBe(2)
  })

  it('mode switches are recorded', async () => {
    const s = await api.startMock({ topic: 'tech', length: 'quick', mode: 'voice', entryPoint: 'practice' })
    await api.recordModeSwitch(s.id, 'text', 'mic_error')
    expect((await db.mockSessions.get(s.id))?.modeHistory.map((m) => m.mode)).toEqual(['voice', 'text'])
    const ev = (await db.events.where('name').equals('mode_switched').toArray()).at(-1)!
    expect(ev.props).toMatchObject({ from: 'voice', to: 'text', reason: 'mic_error' })
    await api.discardMock(s.id)
  })

  it('WTP price is one of 99/199/299 and is stable', async () => {
    const p1 = await api.markWtpShown()
    expect([99, 199, 299]).toContain(p1)
    expect(await api.markWtpShown()).toBe(p1)
    await api.answerWtp('yes_lower', 99)
    expect((await db.profile.get('me'))?.wtp).toMatchObject({ priceInr: p1, answer: 'yes_lower', statedPrice: 99 })
  })
})

describe('engine: uploads', () => {
  it('paste → preview with duplicates unticked → save with generic seeds → delete', async () => {
    const met101 = CURATED_QUESTIONS.find((q) => q.id === 'met-101')!
    const text = `1. ${met101.prompt}\n2. Estimate the number of ATMs in Pune.\n3. How would you improve Google Maps for auto-rickshaw drivers?`
    const pv = await api.previewPaste(text)
    expect(pv.questions).toHaveLength(3)
    expect(pv.questions[0].duplicateOf).toBe('met-101')
    expect(pv.questions[0].include).toBe(false)
    expect(pv.questions[1].topic).toBe('guesstimate')
    const up = await api.saveUpload(pv)
    expect(up.questionIds).toHaveLength(2)
    const q = (await db.questions.get(up.questionIds[0]))!
    expect(q.source).toBe('upload')
    expect(q.followUpSeeds.length).toBeGreaterThanOrEqual(3)
    const s = await api.startMock({ topic: q.topic, questionId: q.id, length: 'quick', mode: 'text', entryPoint: 'library' })
    expect(s.questionSnapshot.prompt).toBe(q.prompt)
    await api.discardMock(s.id)
    await api.deleteUpload(up.id)
    expect(await db.questions.get(up.questionIds[0])).toBeUndefined()
    await expect(api.previewPaste('   ')).rejects.toThrow('Paste some text first.')
  })
})

describe('engine: data and clock', () => {
  it('setClockOffset persists to settings', async () => {
    await api.setClockOffset(5 * HOUR)
    expect((await getSettings()).demo.clockOffsetMs).toBe(5 * HOUR)
    expect(Clock.offset()).toBe(5 * HOUR)
  })

  it('export (no key) → reset (keeps curated) → import restores', async () => {
    const before = { sessions: await db.mockSessions.count(), feedback: await db.feedback.count() }
    const blob = await api.exportData()
    const json = await blob.text()
    const data = JSON.parse(json)
    expect(data.app).toBe('redpen')
    expect(json).not.toMatch(/sk-ant|anthropicKey/)
    await api.resetAll()
    expect(await db.mockSessions.count()).toBe(0)
    expect(await db.profile.count()).toBe(0)
    expect(await db.questions.where('source').equals('curated').count()).toBe(CURATED_QUESTIONS.length)
    expect(Clock.offset()).toBe(0)
    await api.importData(new File([json], 'backup.json', { type: 'application/json' }))
    expect(await db.mockSessions.count()).toBe(before.sessions)
    expect(await db.feedback.count()).toBe(before.feedback)
    expect((await db.topicStats.get('metrics'))?.countedMocks).toBe(2)
    await expect(api.importData(new File(['{"app":"other"}'], 'x.json'))).rejects.toThrow("isn't a Redpen backup")
    await expect(api.importData(new File([JSON.stringify({ app: 'redpen', schemaVersion: 99 })], 'x.json'))).rejects.toThrow('newer version')
  })

  it('loadSeed fresh clears user data; ishita_w3 loads the demo profile', async () => {
    await api.loadSeed('fresh')
    expect(await db.mockSessions.count()).toBe(0)
    await api.loadSeed('ishita_w3')
    expect((await db.profile.get('me'))?.isDemo).toBe(true)
    expect((await getSettings()).mock.weeklyGoal).toBe(3)
    expect(await db.mockSessions.count()).toBe(17)
  })
})
