import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import { db, updateSettings } from '@/services/db/db'
import { Clock } from '@/services/clock'
import { configureScriptedAI } from '@/ai'
import { boot, gradeMock, loadSeed, markFixesViewed, startRetry, submitAnswer } from '@/engine/api'
import { getHomeView, getMetricsView, getProgressView, getReportView } from '@/engine/selectors'
import { DEMO_ANSWERS } from '@/content/fixtures'
import { round1 } from '@/domain/rubric/weights'
import type { TopicId } from '@/domain/types'

const DAY = 86_400_000
// Wednesday 25 Nov 2026, 15:00 local time.
const NOW = new Date(2026, 10, 25, 15, 0, 0).getTime()

beforeAll(async () => {
  configureScriptedAI({ turnLatencyMs: [0, 0] })
  await boot()
  Clock.setOffset(NOW - Date.now())
  await loadSeed('ishita_w3')
  await updateSettings((s) => ({ ...s, demo: { ...s.demo, minScoringMs: 0, clockOffsetMs: Clock.offset() } }))
})

const score = async (t: TopicId) => (await db.topicStats.get(t))!

describe('Seed B (Ishita, week 3): §8.5 derived values', () => {
  it('topic scores', async () => {
    expect((await score('metrics')).score).toBeCloseTo(2.25, 6)
    expect((await score('strategy')).score).toBeCloseTo(3.15, 6)
    expect((await score('product_design')).score).toBeCloseTo(3.4, 6)
    expect((await score('tech')).score).toBeCloseTo(3.4, 6)
    expect((await score('rca')).score).toBeCloseTo(3.475, 6)
    expect((await score('guesstimate')).score).toBeCloseTo(3.95, 6)
    expect(round1((await score('metrics')).score!)).toBe(2.3)
    expect(round1((await score('strategy')).score!)).toBe(3.2)
    expect(round1((await score('rca')).score!)).toBe(3.5)
    expect(round1((await score('guesstimate')).score!)).toBe(4.0)
  })

  it('weakest topic is Metrics, last practised 8 days ago', async () => {
    const p = await getProgressView()
    expect(p.weakest).toBe('metrics')
    const m = p.topics.find((t) => t.topic === 'metrics')!
    expect(Math.round((Clock.now() - m.lastPractisedAt!) / DAY)).toBe(8)
  })

  it('statuses', async () => {
    const p = await getProgressView()
    const st = Object.fromEntries(p.topics.map((t) => [t.topic, t.status]))
    expect(st).toEqual({ metrics: 'building', strategy: 'getting_there', product_design: 'getting_there', rca: 'getting_there', guesstimate: 'consistent', tech: 'building' })
  })

  it('product design trend', async () => {
    const pd = await score('product_design')
    expect(pd.history.map((h) => h.score)).toEqual([2.5, 3.1, 3.4, 3.7])
    expect(pd.history.map((h) => round1(h.ewma!))).toEqual([2.5, 2.8, 3.1, 3.4])
  })

  it('recurring mistakes (of 15 mocks)', async () => {
    const p = await getProgressView()
    expect(p.recurring.map((r) => [r.tag, r.count, r.of])).toEqual([
      ['solution_first', 4, 15], ['no_guardrail', 3, 15], ['no_data_check', 2, 15], ['no_sanity_check', 2, 15],
    ])
  })

  it('self-rated vs scored', async () => {
    const p = await getProgressView()
    const over = [...p.selfVsScored].sort((a, b) => a.gap - b.gap)[0] // gap = scored − self
    const under = [...p.selfVsScored].sort((a, b) => b.gap - a.gap)[0]
    expect(over.topic).toBe('metrics')
    expect(over.self).toBe(4)
    expect(round1(over.scored)).toBe(2.3)
    expect(under.topic).toBe('strategy')
    expect(under.self).toBe(2)
    expect(round1(under.scored)).toBe(3.2)
  })

  it('home: ring 2 of 3, Next-up unread RCA feedback, banner neglected metrics with the open fix', async () => {
    const h = await getHomeView()
    expect(h.weekly).toMatchObject({ reviewed: 2, goal: 3 })
    expect(h.nextUp?.type).toBe('unread_feedback')
    expect(h.nextUp?.title).toBe('Your RCA feedback is ready.')
    expect(h.banner?.key).toBe('neglected_topic:metrics')
    expect(h.banner?.body).toContain('Name one guardrail before you finish.')
    expect(h.banner?.cta.label).toBe('Retry with your fix')
    expect(h.interviewInDays).toBe(12)
    expect(h.showWtp).toBe(true)
    expect(h.topics.find((t) => t.isWeakest)?.topic).toBe('metrics')
  })

  it('metrics: 14 reviewed all time, trust 13 of 14, 15 counted', async () => {
    const m = await getMetricsView()
    expect(m.funnel.fixesViewed).toBe(14)
    expect(m.funnel.completed).toBe(15)
    expect(m.game.trustScore).toBeCloseTo(13 / 14, 6)
    expect(m.nsm.thisWeek).toBe(2)
    const p = await getProgressView()
    expect(p.totals).toMatchObject({ counted: 15, reviewed: 14 })
    expect((await db.profile.get('me'))?.wtp).toBeUndefined()
    expect((await db.meta.get('wtpPriceInr'))?.value).toBe(199)
  })

  it('demo retry of S12: uplift metrics 2 → 4, overall 2.2 → 3.9, Metrics 3.075 and still weakest, ring 3 of 3', async () => {
    const s12 = (await db.mockSessions.where('questionId').equals('met-102').toArray()).find((s) => s.counted)!
    const fb = (await db.feedback.where('mockId').equals(s12.id).first())!
    expect(fb.overall).toBe(2.2)
    const fix = fb.fixes.find((f) => f.rank === 1)!
    expect(fix.dimension).toBe('metrics')
    const retry = await startRetry(fb.id, fix.id, 'text')
    expect(retry.length).toBe('quick')
    expect(retry.retryOf).toBe(s12.id)
    let done = false
    for (const a of DEMO_ANSWERS['met-102']) {
      const r = await submitAnswer(retry.id, a, 'text')
      if (r.done) { done = true; break }
    }
    expect(done).toBe(true)
    const stages: string[] = []
    const g = await gradeMock(retry.id, (s) => stages.push(s), { forceOffline: true })
    expect(stages[0]).toBe('reading')
    expect(stages[stages.length - 1]).toBe('done')
    expect(g.overall).toBe(3.9)
    const r = await getReportView(g.id)
    expect(r?.retry).toMatchObject({ targetDimension: 'metrics', before: 2, after: 4, uplift: 2, overallBefore: 2.2, overallAfter: 3.9 })
    expect(r?.retryOf?.mock.id).toBe(s12.id)
    expect((await score('metrics')).score).toBeCloseTo(3.075, 6)
    expect((await getProgressView()).weakest).toBe('metrics')
    await markFixesViewed(g.id)
    const h = await getHomeView()
    expect(h.weekly.reviewed).toBe(3)
    expect((await getMetricsView()).funnel.fixesViewed).toBe(15)
  }, 30_000)
})
