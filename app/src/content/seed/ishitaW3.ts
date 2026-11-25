/* Seed B: "Ishita, week 3" (MASTER_PLAN section 8.5).
   All timestamps are computed from `now`. Topic stats are NOT computed here; the engine recomputes them.
   Question ids are the library ids (pd-004, rca-004, gst-003 ...), which differ from the working names in 8.5. */
import type {
  AnalyticsEvent, DimensionId, DimensionScore, Feedback, Fix, InputMode, MockSession, Profile, Retry, Score, TopicId, Turn,
} from '@/domain/types'
import { CURATED_QUESTIONS } from '../questions'
import type { SeedBundle } from './types'
import { RAW, type RawMock } from './ishitaRaw'

/** Wtp price is pinned to this value for the demo; Profile.wtp is left empty because it is not yet shown.
    CONTRACT-REQUEST: the seed loader should store this price (meta key 'wtpPriceInr') and weekly goal below in settings. */
export const SEED_WTP_PRICE_INR = 199 as const
export const SEED_WEEKLY_GOAL = 3

const HOUR = 3_600_000
const DAY = 24 * HOUR
const ORDER: DimensionId[] = ['structure', 'userFocus', 'prioritisation', 'metrics', 'communication']
const WEIGHTS: Record<TopicId, number[]> = {
  product_design: [0.2, 0.3, 0.25, 0.1, 0.15],
  rca: [0.3, 0.1, 0.2, 0.25, 0.15],
  metrics: [0.2, 0.15, 0.15, 0.35, 0.15],
  guesstimate: [0.35, 0.05, 0.1, 0.35, 0.15],
  strategy: [0.25, 0.15, 0.25, 0.15, 0.2],
  tech: [0.25, 0.15, 0.15, 0.1, 0.35],
}
const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
const sentencesOf = (s: string) => s.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean)

function localDateString(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function weekStartOf(now: number): number {
  const d = new Date(now)
  const sinceMonday = (d.getDay() + 6) % 7
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - sinceMonday).getTime()
}

/** Start time of each mock, following the section 8.5 timestamp rule. */
function startTimes(now: number): Record<number, number> {
  const ws = weekStartOf(now)
  const out: Record<number, number> = {}
  const clampable: { n: number; d: number; desired: number }[] = []
  for (const m of RAW) {
    if (m.day === 'W1') out[m.n] = now - Math.min(50 * HOUR, 0.8 * (now - ws))
    else if (m.day === 'W2') out[m.n] = now - Math.min(26 * HOUR, 0.5 * (now - ws))
    else if (m.day === 'H20') out[m.n] = now - 20 * HOUR
    else if (m.day === 8) out[m.n] = now - 8 * DAY
    else {
      const desired = now - m.day * DAY
      if (desired >= ws - 6 * HOUR) clampable.push({ n: m.n, d: m.day, desired })
      else out[m.n] = desired
    }
  }
  clampable.sort((a, b) => b.d - a.d) // earliest first
  clampable.forEach((c, i) => {
    const k = clampable.length - 1 - i
    out[c.n] = Math.min(c.desired, ws - 6 * HOUR - 3 * HOUR * k)
  })
  return out
}

const qOf = (id: string) => {
  const q = CURATED_QUESTIONS.find((x) => x.id === id)
  if (!q) throw new Error(`seed references unknown question ${id}`)
  return q
}

interface Built { raw: RawMock; session: MockSession; feedback?: Feedback; lastCandidateId: Record<string, string> }

function buildMock(raw: RawMock, start: number): Built {
  const q = qOf(raw.qid)
  const mockId = `seed-m${pad(raw.n)}`
  const planned = raw.len === 'quick' ? 2 : 3
  const turns: Turn[] = []
  let clock = start
  const idOf = (i: number) => `${mockId}:${i}`
  const pushI = (kind: Turn['kind'], text: string, extra: Partial<Turn> = {}) => {
    clock += 1500
    const i = turns.length
    turns.push({ id: idOf(i), index: i, role: 'interviewer', kind, text, words: words(text), flags: [], startedAt: clock, submittedAt: clock, generatedBy: 'fixture', latencyMs: 1500, ...extra })
  }
  const pushC = (kind: Turn['kind'], text: string, mode: InputMode, extra: Partial<Turn> = {}) => {
    clock += 2000
    const startedAt = clock
    const w = words(text)
    clock += 8000 + w * (mode === 'voice' ? 450 : 1100)
    const i = turns.length
    turns.push({ id: idOf(i), index: i, role: 'candidate', kind, text, words: w, flags: [], startedAt, submittedAt: clock, inputMode: mode, ...extra })
  }
  const lengthWord = raw.len === 'quick' ? 'quick mock: one question and two follow-ups' : 'standard mock: one question and three follow-ups'
  pushI('intro', `Hi Ishita, I'm Meera. This is a ${lengthWord}. I won't give feedback during the mock, that comes at the end. Take your time.`)
  pushI('question', q.context.setup ? `${q.context.setup} ${q.prompt}` : q.prompt)
  const variantSeed = q.followUpSeeds.find((s) => s.isVariantSlot)
  pushC('main', raw.main, raw.modes[0])
  raw.fu.forEach((f, idx) => {
    const fi = idx + 1
    const seed = q.followUpSeeds.find((s) => !s.isVariantSlot && s.text === f.q)
    pushI('followup_q', f.q, {
      followupIndex: fi, isVariant: !!f.variant, move: f.variant ? 'ask_variant' : 'ask_followup',
      seedId: f.variant ? variantSeed?.id : seed?.id, targetDimension: f.variant ? variantSeed?.probes : seed?.probes,
    })
    if (f.a) pushC('followup_a', f.a, raw.modes[fi] ?? raw.modes[0], { followupIndex: fi })
  })
  const answered = raw.fu.filter((f) => f.a).length
  const abandoned = raw.state === 'abandoned'
  const endedEarly = raw.state === 'practice'
  const closeText = endedEarly
    ? "Okay, we'll stop there. Your feedback will be ready shortly, but this one is marked practice only."
    : "That's time. Thanks, Ishita. Your feedback will be ready in under two minutes."
  if (!abandoned) pushI('close', closeText)
  const lastAt = turns[turns.length - 1].submittedAt
  const endedAt = abandoned ? lastAt + DAY : lastAt

  // mode history
  const modeHistory: MockSession['modeHistory'] = []
  const cand = turns.filter((t) => t.role === 'candidate')
  cand.forEach((t, i) => {
    if (i === 0) modeHistory.push({ mode: t.inputMode!, fromTurn: 0, at: start })
    else if (t.inputMode !== cand[i - 1].inputMode) modeHistory.push({ mode: t.inputMode!, fromTurn: t.index, at: t.startedAt })
  })

  const retry = raw.n === 5
  const nudgeIds: Record<number, string> = { 5: 'seed-n01', 11: 'seed-n02', 13: 'seed-n03' }
  const counted = raw.state === 'reviewed' || raw.state === 'unread'
  const fbId = abandoned ? undefined : `seed-f${pad(raw.n)}`
  const session: MockSession = {
    id: mockId,
    questionId: q.id,
    questionSnapshot: { prompt: q.prompt, topic: q.topic, subtype: q.subtype, difficulty: q.difficulty, source: 'curated', ...(q.context.setup ? { setup: q.context.setup } : {}) },
    topic: raw.topic,
    length: raw.len,
    followupsPlanned: planned,
    ...(raw.fu.some((f) => f.variant) ? { variant: { axis: raw.fu.find((f) => f.variant)!.variant!.axis, value: raw.fu.find((f) => f.variant)!.variant!.value, atFollowup: raw.fu.findIndex((f) => f.variant) + 1 } } : {}),
    modeHistory,
    turns,
    machine: {
      state: abandoned ? 'awaiting_answer' : 'done',
      slot: { kind: 'followup', index: abandoned ? 1 : endedEarly ? 1 : planned },
      followupsAsked: raw.fu.length, clarifications: 0, hintUsed: false, idkStreak: 0, expandAsked: false,
    },
    status: abandoned ? 'abandoned' : endedEarly ? 'ended_early' : 'completed',
    counted,
    startedAt: start,
    endedAt,
    lastActivityAt: lastAt,
    entryPoint: raw.entry,
    ...(nudgeIds[raw.n] ? { nudgeId: nudgeIds[raw.n] } : {}),
    ...(retry ? { retryOf: 'seed-m02', retryFixId: 'seed-f02-fix1', targetDimension: 'userFocus' as DimensionId, focusText: RAW[1].fixes[0].instruction } : {}),
    provider: 'scripted',
    ...(fbId ? { feedbackId: fbId } : {}),
    source: 'seed',
  }
  void answered
  if (!fbId) return { raw, session, lastCandidateId: {} }

  // feedback
  const turnFor = (at: 'm' | 'a1' | 'a2' | 'a3'): Turn => {
    if (at === 'm') return turns.find((t) => t.kind === 'main')!
    const n = Number(at.slice(1))
    const t = turns.find((x) => x.kind === 'followup_a' && x.followupIndex === n)
    if (!t) throw new Error(`${mockId}: no turn ${at}`)
    return t
  }
  const w = WEIGHTS[raw.topic]
  const fixes: Fix[] = raw.fixes.map((f, i) => ({
    id: `${fbId}-fix${i + 1}`, rank: (i + 1) as 1 | 2 | 3, dimension: f.d, issueTag: f.tag, quote: f.quote, turnId: turnFor(f.at).id,
    issue: f.issue, instruction: f.instruction, ...(f.pattern ? { pattern: f.pattern } : {}), source: 'fixture',
  }))
  const candidateTurns = turns.filter((t) => t.role === 'candidate')
  const autoQuote = (d: DimensionId): { quote: string; turnId: string } => {
    const re: Record<DimensionId, RegExp> = {
      structure: /^(first|let me|i'll|okay|the goal|i'd decide|when)/i,
      userFocus: /(user|flyer|student|learner|organiser|shopper|customer|investor|segment|families)/i,
      prioritisation: /(first|because|instead|drop|rather|criteria|pick|choose|chose)/i,
      metrics: /(metric|rate|percent|measure|track|number|success|crore|lakh|%)/i,
      communication: /./,
    }
    const pool = candidateTurns.flatMap((t) => sentencesOf(t.text).map((s) => ({ s, t })))
      .filter(({ s }) => words(s) >= 5 && words(s) <= 25)
    const pick = d === 'communication' ? [...pool].reverse().find(() => true) : pool.find(({ s }) => re[d].test(s))
    const c = pick ?? pool[0]
    return { quote: c.s, turnId: c.t.id }
  }
  const capped = raw.state === 'practice'
  const dimensionScores: DimensionScore[] = ORDER.map((d, i) => {
    const fix = fixes.find((f) => f.dimension === d)
    const score = raw.scores[i] as Score
    const evidence = fix ? [{ quote: fix.quote, turnId: fix.turnId }] : score >= 4 ? [autoQuote(d)] : []
    return { dimension: d, score, rawScore: (capped && d === 'structure' ? 4 : score) as Score, reason: raw.reasons[i], evidence, weight: w[i] }
  })
  const generatedAt = endedAt + 45_000
  const openedAt = raw.state === 'unread' ? undefined : generatedAt + (raw.state === 'practice' ? HOUR : 3 * 60_000 + raw.n * 20_000)
  const fixesViewedAt = raw.state === 'reviewed' && openedAt ? openedAt + 25_000 : undefined
  const ratedAt = fixesViewedAt && raw.rating ? fixesViewedAt + 40_000 : undefined
  const strength = raw.strength ? { text: raw.strength.text, quote: raw.strength.quote, turnId: turnFor(raw.strength.at).id } : undefined
  const feedback: Feedback = {
    id: fbId, mockId, topic: raw.topic, questionId: q.id, counted, grader: 'fixture', promptVersion: 'seed-1',
    dimensionScores, overall: raw.overall, verdict: raw.verdict, fixes,
    ...(strength ? { strength } : {}),
    capsApplied: capped ? [{ cap: 'C1', dimension: 'structure', from: 4, to: 3 }] : [],
    quoteRepairs: 0, quotesDropped: 0, confidence: capped ? 'low' : 'medium', latencyMs: 3800 + raw.n * 130, attempts: 1,
    generatedAt, ...(openedAt ? { openedAt } : {}), ...(fixesViewedAt ? { fixesViewedAt } : {}),
    ...(ratedAt ? { rating: raw.rating as Score, ratedAt } : {}),
    ...(ratedAt && raw.ratingTags ? { ratingTags: raw.ratingTags } : {}),
    source: 'seed',
  }
  return { raw, session, feedback, lastCandidateId: {} }
}

export function buildIshitaW3(now: number): SeedBundle {
  const starts = startTimes(now)
  const built = RAW.map((r) => buildMock(r, starts[r.n]))
  const sessions = built.map((b) => b.session)
  const feedback = built.flatMap((b) => (b.feedback ? [b.feedback] : []))
  const byN = (n: number) => built.find((b) => b.raw.n === n)!

  const s2 = byN(2), s5 = byN(5)
  const retries: Retry[] = [{
    id: 'seed-r01', originalMockId: s2.session.id, newMockId: s5.session.id, fixId: 'seed-f02-fix1', targetDimension: 'userFocus',
    sameQuestion: true, within72h: s5.session.startedAt - s2.session.startedAt <= 72 * HOUR,
    startedAt: s5.session.startedAt, completedAt: s5.session.endedAt, before: 2, after: 3, uplift: 1, overallBefore: 2.5, overallAfter: 3.1,
  }]

  // ---- events ----
  const evs: Omit<AnalyticsEvent, 'id'>[] = []
  const ev = (name: string, ts: number, props: Record<string, unknown>, mockId?: string) =>
    evs.push({ name, ts, props, source: 'seed', ...(mockId ? { mockId } : {}) })
  const first = byN(1).session.startedAt
  ev('app_opened', first - 6 * 60_000, { first: true, daysSinceLastOpen: 0, provider: 'scripted', hasKey: false })
  ev('onboarding_completed', first - 60_000, { ratedCount: 6, mode: 'text', skipped: false, durationMs: 52_000 })

  for (const b of built) {
    const { session: s, feedback: f, raw } = b
    const q = qOf(s.questionId)
    ev('mock_started', s.startedAt, {
      mockId: s.id, questionId: s.questionId, topic: s.topic, subtype: q.subtype, difficulty: q.difficulty, source: 'curated',
      mode: s.modeHistory[0].mode, length: s.length, followupsPlanned: s.followupsPlanned, ...(s.variant ? { variantAxis: s.variant.axis } : {}),
      entryPoint: s.entryPoint, ...(s.nudgeId ? { nudgeId: s.nudgeId } : {}), ...(s.retryOf ? { retryOf: s.retryOf } : {}),
      isFirstMock: raw.n === 1, provider: 'scripted',
    }, s.id)
    ev('first_question_shown', s.startedAt + 4000, { mockId: s.id, msSinceStartClick: 900, msSinceAppOpen: raw.n === 1 ? 60_000 : 3_000 }, s.id)
    if (s.retryOf) ev('question_reattempted', s.startedAt, {
      originalMockId: s.retryOf, newMockId: s.id, questionId: s.questionId, fixId: s.retryFixId, targetDimension: s.targetDimension,
      hoursSinceOriginal: Math.round((s.startedAt - byN(2).session.startedAt) / HOUR), within72h: retries[0].within72h, sameQuestion: true, entryPoint: 'nudge',
    }, s.id)
    let prevMode: InputMode | undefined
    for (const t of s.turns) {
      if (t.role === 'candidate') {
        if (prevMode && t.inputMode !== prevMode) ev('mode_switched', t.startedAt, { mockId: s.id, from: prevMode, to: t.inputMode, turnIndex: t.index, reason: 'user' }, s.id)
        prevMode = t.inputMode
        ev('turn_submitted', t.submittedAt, { mockId: s.id, turnIndex: t.index, kind: t.kind, mode: t.inputMode, words: t.words, durationMs: t.submittedAt - t.startedAt, expansionRequested: false, flags: [] }, s.id)
      } else if (t.kind === 'followup_q') {
        ev('followup_asked', t.submittedAt, { mockId: s.id, index: t.followupIndex, move: t.move, targetDimension: t.targetDimension, isVariant: !!t.isVariant, ...(t.isVariant && s.variant ? { variantAxis: s.variant.axis } : {}), seedId: t.seedId, generatedBy: 'fixture', latencyMs: t.latencyMs }, s.id)
      }
    }
    const candWords = s.turns.filter((t) => t.role === 'candidate').reduce((a, t) => a + t.words, 0)
    const talk = s.turns.filter((t) => t.role === 'candidate').reduce((a, t) => a + (t.submittedAt - t.startedAt), 0)
    if (s.status === 'abandoned') {
      ev('mock_abandoned', s.endedAt!, { mockId: s.id, atSlot: 'followup_1', durationMs: s.lastActivityAt - s.startedAt, reason: 'idle', gapSeconds: 86_400 }, s.id)
      continue
    }
    if (s.status === 'ended_early') ev('mock_ended_early', s.endedAt!, { mockId: s.id, atSlot: 'followup_1', durationMs: s.endedAt! - s.startedAt, reason: 'user' }, s.id)
    else ev('mock_completed', s.endedAt!, {
      mockId: s.id, topic: s.topic, questionId: s.questionId, followupsAnswered: s.followupsPlanned, followupsPlanned: s.followupsPlanned, totalWords: candWords,
      candidateTalkMs: talk, durationMs: s.endedAt! - s.startedAt, dominantMode: s.modeHistory.length > 1 ? 'text' : s.modeHistory[0].mode, modeSwitches: s.modeHistory.length - 1,
      clarifications: 0, isRetry: !!s.retryOf, lowEffort: false,
    }, s.id)
    if (!f) continue
    ev('feedback_generation_started', s.endedAt! + 1000, { mockId: s.id, provider: 'scripted', model: 'fixture' }, s.id)
    ev('feedback_generated', f.generatedAt, {
      mockId: s.id, feedbackId: f.id, grader: 'fixture', latencyMs: f.latencyMs, attempts: 1, repairCalls: 0, quotesRepaired: 0, quotesDropped: 0,
      capsApplied: f.capsApplied, flatline: false, overall: f.overall, scores: Object.fromEntries(f.dimensionScores.map((d) => [d.dimension, d.score])),
    }, s.id)
    if (f.openedAt) ev('feedback_opened', f.openedAt, { mockId: s.id, feedbackId: f.id, msSinceReady: f.openedAt - f.generatedAt, entryPoint: raw.n % 3 === 0 ? 'home' : 'auto', counted: f.counted }, s.id)
    if (f.fixesViewedAt) ev('feedback_fixes_viewed', f.fixesViewedAt, { mockId: s.id, feedbackId: f.id, dwellMs: 25_000, msSinceOpened: 25_000, firstEver: raw.n === 1 }, s.id)
    if (f.ratedAt) ev('feedback_rated', f.ratedAt, { mockId: s.id, feedbackId: f.id, rating: f.rating, tags: f.ratingTags ?? [], hasComment: false, isUpdate: false, grader: 'fixture' }, s.id)
    if (s.retryOf) {
      ev('retry_completed', f.generatedAt + 500, { originalMockId: s.retryOf, newMockId: s.id, targetDimension: 'userFocus', before: 2, after: 3, uplift: 1, overallBefore: 2.5, overallAfter: 3.1, within72h: retries[0].within72h }, s.id)
    }
  }

  // nudges: 6 sent, 3 acted
  const nudge = (id: string, type: string, key: string, sentAt: number, extra: Record<string, unknown>, act?: { at: number; action: string }) => {
    ev('nudge_sent', sentAt, { nudgeId: id, type, key, placement: 'next_up', ...extra })
    if (act) ev('nudge_acted', act.at, { nudgeId: id, type, action: act.action, msSinceSent: act.at - sentAt })
  }
  nudge('seed-n01', 'retry_fix', `retry_fix:${byN(2).feedback!.id}`, byN(5).session.startedAt - 20 * HOUR, { topic: 'product_design' }, { at: byN(5).session.startedAt, action: 'start_retry' })
  nudge('seed-n02', 'neglected_topic', 'neglected_topic:rca', byN(11).session.startedAt - 30 * HOUR, { topic: 'rca', daysSinceTopic: 9 }, { at: byN(11).session.startedAt, action: 'start_mock' })
  nudge('seed-n03', 'weekly_goal', 'weekly_goal:w2', byN(13).session.startedAt - 22 * HOUR, { placement: 'banner' }, { at: byN(13).session.startedAt, action: 'start_mock' })
  nudge('seed-n04', 'resume_mock', `resume_mock:${byN(8).session.id}`, byN(8).session.lastActivityAt + 2 * HOUR, { topic: 'rca' })
  nudge('seed-n05', 'neglected_topic', 'neglected_topic:strategy', byN(12).session.startedAt - 10 * HOUR, { topic: 'strategy', daysSinceTopic: 6 })
  nudge('seed-n06', 'interview_countdown', 'interview_countdown:14', now - 3 * DAY, { placement: 'banner' })

  // tracker_viewed x5
  const counted = (until: number) => built.filter((b) => b.session.counted && b.session.endedAt! <= until).length
  ;[byN(7), byN(10), byN(11), byN(13), byN(16)].forEach((b, i) => {
    const ts = b.session.endedAt! + HOUR
    ev('tracker_viewed', ts, { view: 'overview', countedMocks: counted(ts), entryPoint: i % 2 === 0 ? 'nav' : 'home' })
  })

  evs.sort((a, b) => a.ts - b.ts)
  const events: AnalyticsEvent[] = evs.map((e, i) => ({ id: `seed-e${pad(i + 1, 4)}`, ...e }))

  const profile: Profile = {
    id: 'me',
    firstName: 'Ishita',
    interviewDate: localDateString(now + 12 * DAY),
    selfRatings: { product_design: 3, rca: 3, metrics: 4, guesstimate: 3, strategy: 2, tech: 3 },
    originalSelfRatings: { product_design: 3, rca: 3, metrics: 4, guesstimate: 3, strategy: 2, tech: 3 },
    preferredMode: 'text',
    createdAt: first - 6 * 60_000,
    onboardingStep: 4,
    onboardingCompletedAt: first - 60_000,
    isDemo: true,
  }
  return { profile, sessions, feedback, retries, events }
}
