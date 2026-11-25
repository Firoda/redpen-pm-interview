import { describe, expect, it } from 'vitest'
import { CURATED_QUESTIONS } from '@/content/questions'
import { clarifyingQuestions, isClarifying } from '@/domain/mock/classify'
import { validateInterviewerLine, MAX_CLARIFY_WORDS } from '@/domain/rubric/validator'
import { wordCount } from '@/domain/text'
import { newSession, say } from '../helpers/sim'

const q = (id: string) => CURATED_QUESTIONS.find((x) => x.id === id)!

describe('clarifying back-and-forth', () => {
  it('spots questions with and without question marks, and leaves answers alone', () => {
    expect(isClarifying('who are the target users and is this only for india', false)).toBe(true)
    expect(isClarifying("I'll assume we're talking about metros only, is that okay?", false)).toBe(true)
    expect(isClarifying('Before I start, a few questions. What is the goal? What is the timeline?', false)).toBe(true)
    expect(isClarifying("So what's the goal here? I think it's to grow repeat orders among elderly users living alone. I'd start by segmenting them into those who order themselves and those whose kids order for them, then pick the first group.", false)).toBe(false)
    expect(isClarifying('Is the settlement rate going up? That is what I would watch first.', true)).toBe(false)
    expect(clarifyingQuestions('Before I start, a few questions. What is the goal here? And what is the timeline?')).toEqual(['What is the goal here?', 'And what is the timeline?'])
  })

  it('answers several questions in one reply, from the facts', async () => {
    const pd = q('pd-001')
    const r = await say(newSession(pd), pd, 'Before I start, a few questions. What is the goal here? Who is placing the orders, the elderly person or their family? And what is the timeline?')
    expect(r.interviewerTurn.kind).toBe('clarify_a')
    const t = r.interviewerTurn.text
    expect(t).toContain('repeat orders')
    expect(t).toContain('children')
    expect(t).toMatch(/one quarter/)
    expect(wordCount(t)).toBeLessThanOrEqual(MAX_CLARIFY_WORDS)
    expect(t).not.toMatch(/if asked|reveal only|unless the candidate/i)
    expect(validateInterviewerLine(t, { session: { ...r.session, turns: r.session.turns.slice(0, -1) }, question: pd, lastAnswer: r.candidateTurn }, { maxWords: MAX_CLARIFY_WORDS })).toEqual({ ok: true })
    expect(r.session.machine.slot).toEqual({ kind: 'main' })
  })

  it('confirms a stated assumption and never hands over the root cause early', async () => {
    const rca = q('rca-001')
    let s = newSession(rca)
    const a = await say(s, rca, 'Can I assume Bengaluru only, other cities are fine?')
    expect(a.interviewerTurn.text).toMatch(/Bengaluru only|go with that/i)
    s = a.session
    const b = await say(s, rca, 'What is the root cause?')
    expect(b.interviewerTurn.text).not.toMatch(/SDK|bank/i)
    s = b.session
    const c = await say(s, rca, 'Is it a payment failure for a specific bank UPI handle after the Android release?')
    expect(c.interviewerTurn.text).toMatch(/SDK/)
    expect(c.interviewerTurn.text).not.toMatch(/Root cause:/)
  })

  it('has an ordinary answer when the case has no fact for it', async () => {
    const pd = q('pd-001')
    const r = await say(newSession(pd), pd, 'Is it mostly Android users?')
    expect(r.interviewerTurn.text).toBe('Mobile app first, mostly Android users.')
  })
})
