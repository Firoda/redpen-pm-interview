import { describe, expect, it } from 'vitest'
import { DEMO_101_ANSWERS, MET_101 } from '../fixtures/questions'
import { playAll } from '../helpers/sim'
import { finalizeGrade, checkReportInvariants } from '@/domain/rubric/postprocess'
import { verifyQuote } from '@/domain/rubric/quotes'
import { round1, weightedOverall, orderDimensionsForFixes } from '@/domain/rubric/weights'
import { validateInterviewerLine } from '@/domain/rubric/validator'
import { ewma, ewmaSeries, weakestTopic } from '@/domain/scoring'
import { reviewedInWeek, nsmSeries } from '@/domain/metrics'
import { weekStart } from '@/domain/time'
import { detectQuestions, findDuplicate, guessTopic } from '@/services/extract/detectQuestions'
import { ResilientInterviewAI } from '@/ai/resilient'
import { LLMError, type InterviewAI } from '@/ai/types'
import type { TopicStat, TurnContext } from '@/domain/types'
import type { RawGrade } from '@/ai/types'

const VARIANT = { axis: 'constraint' as const, value: 'there is now a ₹2 fee on every split' }

describe('weights and rounding', () => {
  it('round1 is half-up and stable on float noise', () => {
    expect(round1(2.25)).toBe(2.3)
    expect(round1(3.15)).toBe(3.2)
    expect(round1(3.475)).toBe(3.5)
    expect(round1(3.95)).toBe(4)
    expect(round1(3.075)).toBe(3.1)
  })
  it('weighted overall uses topic weights', () => {
    expect(weightedOverall('metrics', { structure: 2, userFocus: 3, prioritisation: 2, metrics: 2, communication: 3 })).toBe(2.3)
  })
  it('fix order is by weighted gap, three distinct dimensions', () => {
    const order = orderDimensionsForFixes('metrics', { structure: 2, userFocus: 3, prioritisation: 2, metrics: 2, communication: 3 })
    expect(order.slice(0, 3)).toEqual(['metrics', 'structure', 'prioritisation'])
  })
})

describe('finalizeGrade (code-owned post-processing)', () => {
  it('lowers an inflated LLM grade with caps, drops fabricated quotes, and keeps exactly 3 fixes on 3 dimensions', async () => {
    const { session } = await playAll(MET_101, DEMO_101_ANSWERS, { variant: VARIANT })
    const raw: RawGrade = {
      dimensions: (['structure', 'userFocus', 'prioritisation', 'metrics', 'communication'] as const).map((d) => ({
        dimension: d, score: 5, reason: 'Excellent.', evidence: [{ quote: 'I would build a guardrail around churn', turnId: 'x' }],
      })),
      fixes: [
        { dimension: 'metrics', issueTag: 'no_guardrail', quote: 'a sentence she never said at all', turnId: 'x', issue: 'No guardrail.', instruction: 'Name one guardrail.' },
        { dimension: 'metrics', issueTag: 'vanity_metric', quote: 'If those go up, the feature is working', turnId: 'x', issue: 'Volume is not success.', instruction: 'Measure settlement.' },
      ],
      verdict: 'Great.',
    } as RawGrade
    const g = finalizeGrade(raw, { session, question: MET_101, quality: 'fast' }, { grader: 'llm', model: 'test', promptVersion: 't', latencyMs: 1, attempts: 1 })
    for (const d of g.dimensionScores) expect(d.score).toBeLessThanOrEqual(d.rawScore)
    expect(g.dimensionScores.every((d) => d.score <= 3)).toBe(true) // no verified evidence → C8 at most
    expect(g.quotesDropped).toBeGreaterThan(0)
    expect(g.fixes).toHaveLength(3)
    expect(new Set(g.fixes.map((f) => f.dimension)).size).toBe(3)
    const metricsFix = g.fixes.find((f) => f.dimension === 'metrics')!
    expect(metricsFix.quote).toContain('If those go up, the feature is working')
    expect(checkReportInvariants(g, session)).toEqual([])
  })
})

describe('quote verification', () => {
  it('verified, corrected, repaired, unverified', async () => {
    const { session } = await playAll(MET_101, DEMO_101_ANSWERS, { variant: VARIANT })
    const main = session.turns.find((t) => t.kind === 'main')!
    const f1 = session.turns.find((t) => t.kind === 'followup_a')!
    expect(verifyQuote(session, "I’d look at engagement first", main.id).status).toBe('verified')
    expect(verifyQuote(session, "I'd look at engagement first", f1.id).status).toBe('corrected')
    const rep = verifyQuote(session, "The main metric is number of splits created per day, and I'd also track DAU of feature", main.id)
    expect(rep.status).toBe('repaired')
    if (rep.status === 'repaired') expect(main.text).toContain(rep.quote)
    expect(verifyQuote(session, 'we will win the market with blockchain', main.id).status).toBe('unverified')
    // interviewer text can never be quoted
    const q = session.turns.find((t) => t.kind === 'followup_q')!
    expect(verifyQuote(session, q.text.split(' ').slice(-6).join(' ')).status).toBe('unverified')
  })
})

describe('interviewer line validator', () => {
  const ctx = async () => ({ session: (await playAll(MET_101, DEMO_101_ANSWERS.slice(0, 1), { variant: VARIANT })).session, question: MET_101 } as unknown as TurnContext)
  it('rejects praise, teaching, scores, long and double questions', async () => {
    const c = await ctx()
    expect(validateInterviewerLine('Great answer! What would you measure next?', c).ok).toBe(false)
    expect(validateInterviewerLine('You should mention a guardrail. Which one?', c).ok).toBe(false)
    expect(validateInterviewerLine("That's a 3 out of 5. Go on?", c).ok).toBe(false)
    expect(validateInterviewerLine('What would you measure? And why?', c).ok).toBe(false)
    expect(validateInterviewerLine(Array(50).fill('word').join(' ') + '?', c).ok).toBe(false)
    expect(validateInterviewerLine('You said "the main metric is number of splits created per day". How would you catch splits that never get paid back?', c).ok).toBe(true)
    expect(validateInterviewerLine('You said "we should use blockchain". Why?', c).ok).toBe(false)
  })
})

describe('scoring', () => {
  it('EWMA α = 0.5', () => {
    expect(ewma([2.5, 3.1, 3.4, 3.7])).toBeCloseTo(3.4, 9)
    expect(ewmaSeries([2.5, 3.1, 3.4, 3.7]).map(round1)).toEqual([2.5, 2.8, 3.1, 3.4])
  })
  it('weakest topic with 0.2 hysteresis and min-2 eligibility', () => {
    const st = (topic: TopicStat['topic'], score: number, n = 2): TopicStat => ({ topic, score, countedMocks: n, dimScore: {}, history: [], status: 'building', updatedAt: 0 })
    expect(weakestTopic([st('metrics', 2.5), st('strategy', 3.0)])).toBe('metrics')
    expect(weakestTopic([st('metrics', 2.5, 1), st('strategy', 3.0)])).toBe('strategy') // 1 mock is not eligible when others are
    expect(weakestTopic([st('metrics', 3.05), st('strategy', 2.9)], 'metrics')).toBe('metrics') // within 0.2: keep
    expect(weakestTopic([st('metrics', 3.3), st('strategy', 2.9)], 'metrics')).toBe('strategy')
  })
})

describe('NSM week boundaries (Monday 00:00 local)', () => {
  it('counts a review at Sunday 23:59 in the old week and Monday 00:00 in the new one', () => {
    const mon = new Date(2026, 10, 23, 0, 0, 0).getTime()
    expect(weekStart(mon + 5 * 3_600_000)).toBe(mon)
    const reviewed = [{ mockId: 'a', at: mon - 60_000 }, { mockId: 'b', at: mon }, { mockId: 'c', at: mon + 6 * 86_400_000 }]
    expect(reviewedInWeek(reviewed, mon + 1000)).toBe(2)
    expect(reviewedInWeek(reviewed, mon - 1000)).toBe(1)
    const s = nsmSeries(reviewed, mon + 3 * 86_400_000, 3)
    expect(s.map((x) => x.value)).toEqual([0, 1, 2])
  })
})

describe('upload question detection', () => {
  it('numbered lists, wrapped lines, topics and duplicates', () => {
    const text = `PM interview questions\n\n1. How would you measure the success of Instagram Reels\nfor creators in India?\n2. Estimate the number of petrol pumps in Mumbai.\n3) Design a product for elderly people to book doctor appointments.\n\nNotes: be structured.`
    const qs = detectQuestions(text)
    expect(qs.map((q) => q.topic)).toEqual(['metrics', 'guesstimate', 'product_design'])
    expect(qs[0].prompt).toBe('How would you measure the success of Instagram Reels for creators in India?')
    expect(findDuplicate('How would you measure the success of Instagram Reels for creators in India', [{ id: 'x', prompt: qs[0].prompt }])).toBe('x')
    expect(guessTopic('Daily active users dropped 12% last week, find the root cause')).toBe('rca')
  })
  it('case blocks keep their case text', () => {
    const text = `Case 1: Swiggy Genie\nSwiggy Genie pick-up orders fell 18% in Pune after a pricing change.\nWhat would you investigate first?\n\nCase 2: Market entry\nShould Zepto launch in Tier-2 cities?`
    const qs = detectQuestions(text)
    expect(qs).toHaveLength(2)
    expect(qs[0].caseText).toContain('fell 18% in Pune')
  })
})

describe('ResilientInterviewAI', () => {
  const ctx = {} as TurnContext
  const ok = { say: 'fallback', move: 'ask_followup' } as never
  const fallback = { id: 'scripted', nextTurn: async () => ok, gradeMock: async () => ({ overall: 1 }) as never } as unknown as InterviewAI
  const events: string[] = []
  const track = (n: string, p: Record<string, unknown>) => { events.push(`${n}:${p.status ?? p.reason ?? p.errorType}`) }

  it('retries once on a retryable error, then succeeds', async () => {
    let calls = 0
    const primary = { id: 'anthropic', nextTurn: async () => { if (calls++ === 0) throw new LLMError('overloaded', 'busy'); return { say: 'live' } }, gradeMock: async () => ({}) } as unknown as InterviewAI
    const r = new ResilientInterviewAI(primary, fallback, { retryDelayMs: 0, track, turnTimeoutMs: 10_000 })
    expect(await r.nextTurn(ctx)).toEqual({ say: 'live' })
    expect(calls).toBe(2)
  })
  it('falls back on timeout and on non-retryable errors; breaker opens after 3 failures', async () => {
    events.length = 0
    let t = 0
    const slow = { id: 'anthropic', nextTurn: () => new Promise(() => {}), gradeMock: async () => { throw new LLMError('auth', 'bad key') } } as unknown as InterviewAI
    const r = new ResilientInterviewAI(slow, fallback, { retryDelayMs: 0, track, turnTimeoutMs: 20, now: () => t })
    expect(await r.nextTurn(ctx)).toBe(ok)
    expect(events).toContain('llm_fallback:timeout')
    await r.gradeMock({} as never)
    await r.gradeMock({} as never)
    expect(r.breakerOpen).toBe(true)
    events.length = 0
    expect(await r.nextTurn(ctx)).toBe(ok)
    expect(events).toEqual(['llm_fallback:circuit_open'])
    t = 300_001
    expect(r.breakerOpen).toBe(false)
  })
})
