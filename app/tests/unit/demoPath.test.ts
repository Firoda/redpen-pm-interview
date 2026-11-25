import { describe, expect, it } from 'vitest'
import { DEMO_101_ANSWERS, DEMO_102_RETRY_ANSWERS, MET_101, MET_102 } from '../fixtures/questions'
import { playAll, fastAI } from '../helpers/sim'
import { checkReportInvariants } from '@/domain/rubric/postprocess'
import { normalise } from '@/domain/text'

describe('demo beat 3–4: met-101 quick with the fee variant', () => {
  it('asks a follow-up that quotes her words, then the variant, then closes', async () => {
    const { session, results } = await playAll(MET_101, DEMO_101_ANSWERS, { variant: { axis: 'constraint', value: 'there is now a ₹2 fee on every split' } })
    const f1 = results[0].interviewerTurn
    expect(f1.kind).toBe('followup_q')
    expect(f1.text).toContain('"the main metric is number of splits created per day"')
    expect(f1.text).toContain('How would you catch splits that get created but never paid back?')
    const f2 = results[1].interviewerTurn
    expect(f2.isVariant).toBe(true)
    expect(f2.text).toBe("Let's change one thing: there is now a ₹2 fee on every split. What changes in how you measure success?")
    expect(results[2].done).toBe(true)
    expect(results[2].interviewerTurn.kind).toBe('close')
    expect(session.counted).toBe(true)
    expect(session.status).toBe('completed')
  })

  it('grades strictly: 2/3/2/2/3 = 2.3 with fixes metrics, structure, prioritisation', async () => {
    const { session } = await playAll(MET_101, DEMO_101_ANSWERS, { variant: { axis: 'constraint', value: 'there is now a ₹2 fee on every split' } })
    const g = await fastAI().gradeMock({ session, question: MET_101, quality: 'fast' })
    const scores = Object.fromEntries(g.dimensionScores.map((d) => [d.dimension, d.score]))
    expect(scores).toEqual({ structure: 2, userFocus: 3, prioritisation: 2, metrics: 2, communication: 3 })
    expect(g.overall).toBe(2.3)
    expect(g.fixes.map((f) => f.dimension)).toEqual(['metrics', 'structure', 'prioritisation'])
    expect(g.fixes.map((f) => f.issueTag)).toEqual(['no_guardrail', 'no_goal', 'no_criterion'])
    expect(g.fixes[0].quote).toBe('If those go up, the feature is working.')
    expect(g.fixes[1].quote).toBe("I'd look at engagement first.")
    expect(normalise(g.fixes[2].quote)).toContain(normalise("because it's the easiest to move now"))
    expect(new Set(g.fixes.map((f) => normalise(f.quote))).size).toBe(3)
    expect(checkReportInvariants(g, session)).toEqual([])
    expect(g.counted).toBe(true)
    expect(g.grader).toBe('offline')
  })
})

describe('demo beat 7: met-102 retry with the guardrail fix', () => {
  it('probes the focus dimension and grades 4/3/4/4/4 = 3.9', async () => {
    const { session, results } = await playAll(MET_102, DEMO_102_RETRY_ANSWERS, { retryOf: 'ORIG', targetDimension: 'metrics' })
    expect(results[0].interviewerTurn.targetDimension).toBe('metrics')
    expect(results[0].interviewerTurn.text).toContain('If reorders rise 20% but basket size falls 5%, do you ship?')
    expect(session.counted).toBe(true)
    const g = await fastAI().gradeMock({ session, question: MET_102, quality: 'fast' })
    const scores = Object.fromEntries(g.dimensionScores.map((d) => [d.dimension, d.score]))
    expect(scores).toEqual({ structure: 4, userFocus: 3, prioritisation: 4, metrics: 4, communication: 4 })
    expect(g.overall).toBe(3.9)
    expect(g.fixes.map((f) => f.dimension)).toEqual(['userFocus', 'metrics', 'structure'])
    expect(g.fixes.map((f) => f.issueTag)).toEqual(['generic_user', 'vague_metric', 'no_clarify'])
    expect(new Set(g.fixes.map((f) => normalise(f.quote))).size).toBe(3)
    expect(checkReportInvariants(g, session)).toEqual([])
  })
})
