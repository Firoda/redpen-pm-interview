import { describe, expect, it } from 'vitest'
import { buildIshitaW3 } from './ishitaW3'
import { buildFresh } from './fresh'
import type { DimensionId } from '@/domain/types'

const ORDER: DimensionId[] = ['structure', 'userFocus', 'prioritisation', 'metrics', 'communication']
const W: Record<string, number[]> = {
  product_design: [0.2, 0.3, 0.25, 0.1, 0.15], rca: [0.3, 0.1, 0.2, 0.25, 0.15], metrics: [0.2, 0.15, 0.15, 0.35, 0.15],
  guesstimate: [0.35, 0.05, 0.1, 0.35, 0.15], strategy: [0.25, 0.15, 0.25, 0.15, 0.2], tech: [0.25, 0.15, 0.15, 0.1, 0.35],
}
const round1 = (x: number) => Math.floor(x * 10 + 0.5) / 10
const HOUR = 3_600_000, DAY = 24 * HOUR

// Several clocks: a Thursday afternoon, a Sunday night, and a Monday morning.
const NOWS = [new Date(2026, 10, 26, 15, 0).getTime(), new Date(2026, 10, 29, 23, 0).getTime(), new Date(2026, 10, 23, 9, 0).getTime()]

function weekStart(now: number) {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime()
}

describe.each(NOWS)('Ishita week 3 seed (now=%i)', (now) => {
  const b = buildIshitaW3(now)

  it('counts match section 8.5', () => {
    expect(b.sessions.length).toBe(17)
    const counted = b.sessions.filter((s) => s.counted)
    expect(counted.length).toBe(15)
    expect(b.sessions.filter((s) => s.status === 'abandoned').length).toBe(1)
    expect(b.sessions.filter((s) => s.status === 'ended_early' && !s.counted).length).toBe(1)
    const fbs = b.feedback.filter((f) => f.counted)
    expect(fbs.length).toBe(15)
    expect(fbs.filter((f) => f.fixesViewedAt).length).toBe(14)
    expect(fbs.filter((f) => !f.openedAt).length).toBe(1)
    const rated = b.feedback.filter((f) => f.rating)
    expect(rated.length).toBe(14)
    expect(rated.filter((f) => f.rating! >= 4).length).toBe(13)
    expect(b.retries.length).toBe(1)
    expect(b.profile.firstName).toBe('Ishita')
    expect(b.profile.selfRatings).toEqual({ product_design: 3, rca: 3, metrics: 4, guesstimate: 3, strategy: 2, tech: 3 })
    expect(b.profile.isDemo).toBe(true)
    expect(b.profile.wtp).toBeUndefined()
  })

  it('has the specified scores, overalls and rank-1 fixes', () => {
    const spec: Record<string, [number, string, string]> = {
      'seed-m01': [2.3, 'metrics', 'no_guardrail'], 'seed-m02': [2.5, 'userFocus', 'solution_first'], 'seed-m03': [3.0, 'structure', 'no_data_check'],
      'seed-m04': [3.4, 'metrics', 'no_sanity_check'], 'seed-m05': [3.1, 'userFocus', 'solution_first'], 'seed-m06': [2.8, 'prioritisation', 'infeasible_plan'],
      'seed-m07': [3.4, 'userFocus', 'solution_first'], 'seed-m09': [3.4, 'communication', 'jargon'], 'seed-m10': [3.6, 'metrics', 'no_sanity_check'],
      'seed-m11': [3.7, 'metrics', 'no_guardrail'], 'seed-m12': [2.2, 'metrics', 'no_guardrail'], 'seed-m13': [3.7, 'userFocus', 'solution_first'],
      'seed-m14': [2.4, 'userFocus', 'generic_user'], 'seed-m15': [4.4, 'metrics', 'unstated_assumption'], 'seed-m16': [3.5, 'prioritisation', 'no_tradeoff'],
      'seed-m17': [3.6, 'structure', 'no_data_check'],
    }
    for (const [mockId, [overall, dim, tag]] of Object.entries(spec)) {
      const f = b.feedback.find((x) => x.mockId === mockId)!
      expect(f.overall, mockId).toBe(overall)
      expect(f.fixes[0].dimension, mockId).toBe(dim)
      expect(f.fixes[0].issueTag, mockId).toBe(tag)
    }
    const f12 = b.feedback.find((x) => x.mockId === 'seed-m12')!
    expect(f12.fixes[0].quote).toBe("we'll know it worked if reorders go up")
    expect(f12.fixes[0].instruction).toBe('Name one guardrail before you finish.')
    const f01 = b.feedback.find((x) => x.mockId === 'seed-m01')!
    expect(f01.fixes[0].quote).toBe('If those go up, the feature is working.')
    expect(b.feedback.find((x) => x.mockId === 'seed-m02')!.fixes[0].quote).toBe("I'd build a checklist app")
  })

  it('every feedback has 5 dims in order, correct overall, 3 fixes on 3 distinct dimensions in rule order', () => {
    for (const f of b.feedback) {
      expect(f.dimensionScores.map((d) => d.dimension)).toEqual(ORDER)
      const w = W[f.topic]
      expect(f.dimensionScores.map((d) => d.weight)).toEqual(w)
      expect(f.overall).toBe(round1(f.dimensionScores.reduce((a, d, i) => a + w[i] * d.score, 0)))
      expect(f.fixes.length).toBe(3)
      expect(new Set(f.fixes.map((x) => x.dimension)).size).toBe(3)
      // expected order by weighted gap
      const rows = f.dimensionScores.map((d, i) => ({ d: d.dimension, gap: w[i] * Math.max(0, 4 - d.score), w: w[i], s: d.score, i }))
      const below = rows.filter((r) => r.gap > 0).sort((a, c) => c.gap - a.gap || c.w - a.w || a.s - c.s || a.i - c.i)
      const rest = rows.filter((r) => r.gap === 0).sort((a, c) => a.s - c.s || c.w - a.w || a.i - c.i)
      const expected = [...below, ...rest].slice(0, 3).map((r) => r.d)
      expect(f.fixes.map((x) => x.dimension), f.mockId).toEqual(expected)
      expect(f.fixes.map((x) => x.rank)).toEqual([1, 2, 3])
    }
  })

  it('quotes are verbatim substrings of the referenced candidate turn, 4-25 words', () => {
    for (const f of b.feedback) {
      const s = b.sessions.find((x) => x.id === f.mockId)!
      const check = (quote: string, turnId: string) => {
        const t = s.turns.find((x) => x.id === turnId)
        expect(t, `${f.mockId} turn ${turnId}`).toBeTruthy()
        expect(t!.role).toBe('candidate')
        expect(t!.text.includes(quote), `${f.mockId}: "${quote}"`).toBe(true)
      }
      for (const fix of f.fixes) {
        check(fix.quote, fix.turnId)
        const n = fix.quote.trim().split(/\s+/).length
        expect(n, fix.quote).toBeGreaterThanOrEqual(4)
        expect(n, fix.quote).toBeLessThanOrEqual(25)
        expect(fix.issue.split(/\s+/).length).toBeLessThanOrEqual(20)
        expect(fix.instruction.split(/\s+/).length).toBeLessThanOrEqual(30)
      }
      for (const d of f.dimensionScores) {
        for (const e of d.evidence) check(e.quote, e.turnId)
        if (d.score >= 4) expect(d.evidence.length, `${f.mockId} ${d.dimension}`).toBeGreaterThan(0)
      }
      if (f.strength) check(f.strength.quote, f.strength.turnId)
    }
  })

  it('timestamps follow the week rule', () => {
    const ws = weekStart(now)
    const byId = (id: string) => b.sessions.find((s) => s.id === id)!
    expect(byId('seed-m12').startedAt).toBe(now - 8 * DAY)
    expect(byId('seed-m17').startedAt).toBe(now - 20 * HOUR)
    const thisWeek = b.sessions.filter((s) => s.startedAt >= ws).map((s) => s.id).sort()
    expect(thisWeek.filter((id) => !['seed-m15', 'seed-m16', 'seed-m17'].includes(id))).toEqual([])
    // the weekly ring: 2 of 3 reviewed this week
    const reviewedThisWeek = b.feedback.filter((f) => f.counted && f.fixesViewedAt && f.fixesViewedAt >= ws)
    expect(reviewedThisWeek.map((f) => f.mockId).sort()).toEqual(['seed-m15', 'seed-m16'])
    for (const f of b.feedback) for (const t of [f.generatedAt, f.openedAt, f.fixesViewedAt, f.ratedAt]) if (t) expect(t).toBeLessThanOrEqual(now)
    for (const e of b.events) expect(e.ts).toBeLessThanOrEqual(now)
  })

  it('retry, events and ids are consistent', () => {
    const r = b.retries[0]
    expect(r.originalMockId).toBe('seed-m02')
    expect(r.newMockId).toBe('seed-m05')
    expect(r.uplift).toBe(1)
    expect(b.sessions.find((s) => s.id === 'seed-m05')!.retryOf).toBe('seed-m02')
    const names = (n: string) => b.events.filter((e) => e.name === n).length
    expect(names('mock_started')).toBe(17)
    expect(names('mock_completed')).toBe(15)
    expect(names('feedback_opened')).toBe(15)
    expect(names('feedback_fixes_viewed')).toBe(14)
    expect(names('feedback_rated')).toBe(14)
    expect(names('nudge_sent')).toBe(6)
    expect(names('nudge_acted')).toBe(3)
    expect(names('tracker_viewed')).toBe(5)
    expect(names('question_reattempted')).toBe(1)
    expect(names('retry_completed')).toBe(1)
    expect(b.events.every((e) => e.source === 'seed')).toBe(true)
    expect(new Set(b.events.map((e) => e.id)).size).toBe(b.events.length)
    expect(b.events.length).toBeGreaterThan(150)
    expect(b.sessions.every((s) => s.source === 'seed')).toBe(true)
    for (const s of b.sessions) for (const t of s.turns) expect(t.id).toBe(`${s.id}:${t.index}`)
  })

  it('profile interview date is today + 12', () => {
    const d = new Date(now + 12 * DAY)
    const p = (n: number) => String(n).padStart(2, '0')
    expect(b.profile.interviewDate).toBe(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`)
  })
})

describe('fresh seed', () => {
  it('has no onboarding and no data', () => {
    const f = buildFresh(1_000)
    expect(f.profile.onboardingCompletedAt).toBeUndefined()
    expect([f.sessions, f.feedback, f.retries, f.events].every((a) => a.length === 0)).toBe(true)
  })
})
