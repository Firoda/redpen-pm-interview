/* ENGINE API — the single facade screens call for anything that writes state or needs the AI.
 * Reads for display should use dexie-react-hooks `useLiveQuery` with the selectors in engine/selectors.ts
 * or directly on `db` tables for simple lists. Signatures are a contract; new parameters are optional. */
import type {
  DimensionId, EntryPoint, Feedback, InputMode, MockLength, MockSession, Nudge, Profile, Question, Retry, Score,
  RatingTag, TopicId, TopicStat, Turn, UserUpload, VariantAxis,
} from '@/domain/types'
import { TOPICS } from '@/domain/types'
import { db, DEFAULT_SETTINGS, getSettings, updateSettings } from '@/services/db/db'
import { Clock } from '@/services/clock'
import { newId } from '@/services/id'
import { Analytics, type EventName } from '@/services/analytics'
import { KeyStore } from '@/services/keyStore'
import { getInterviewAI, getScriptedAI, testLiveConnection } from '@/ai'
import { CONTENT_VERSION } from '@/content/questions'
import { evaluateCompletion } from '@/domain/mock/machine'
import { DEMO_PINS, pickQuestion, pickVariant } from '@/domain/mock/pickQuestion'
import { uploadSeeds } from '@/domain/mock/templates'
import { computeNudges } from '@/domain/nudges/computeNudges'
import { computeUplift } from '@/domain/scoring'
import { reviewedMocks, reviewedInWeek } from '@/domain/metrics'
import { dayStart, daysUntil } from '@/domain/time'
import { clearUserTables, defaultProfile, getMeta, getProfile, getQuestionForSession, recomputeTopicStats, setMeta } from '@/services/db/repositories'
import { seedCuratedQuestions, seedNudgeRows } from '@/services/db/seedLoader'
import { createSession, runTurn } from './mockFlow'

const HOUR = 3_600_000
const track = (name: EventName, props: Record<string, unknown> = {}, mockId?: string) => Analytics.track(name, props, { mockId })

/* ---------- boot ---------- */
let bootPromise: Promise<void> | null = null

/** Idempotent. Seeds curated questions, default settings, applies clock offset, expires stale mocks, evaluates nudges. */
export function boot(opts: { sampleData?: boolean } = {}): Promise<void> {
  return (bootPromise ??= doBoot(opts).catch((e) => { bootPromise = null; throw e }))
}

/** Browser flag: this visitor has already been shown the sample data (or chose to start fresh). */
const SAMPLE_FLAG = 'redpen.sampleShown'
function sampleShown(): boolean {
  try { return typeof window !== 'undefined' && window.localStorage.getItem(SAMPLE_FLAG) === '1' } catch { return true }
}
function markSampleShown(): void {
  try { window.localStorage.setItem(SAMPLE_FLAG, '1') } catch { /* storage blocked */ }
}

async function doBoot(opts: { sampleData?: boolean }): Promise<void> {
  await seedCuratedQuestions()
  if (!(await db.settings.get('settings'))) await db.settings.put(DEFAULT_SETTINGS)
  // A first-time visitor lands on a lived-in app (Ishita, three weeks in) instead of an empty one.
  if (opts.sampleData && !sampleShown() && !(await getProfile()) && (await db.mockSessions.count()) === 0) {
    markSampleShown()
    await loadSeed('ishita_w3')
  }
  const settings = await getSettings()
  Clock.setOffset(settings.demo.clockOffsetMs ?? 0)
  await expireStaleMocks()
  if ((await db.topicStats.count()) === 0 && (await db.feedback.count()) > 0) await recomputeTopicStats(Clock.now())
  await evaluateNudges()
}

async function expireStaleMocks(): Promise<void> {
  const now = Clock.now()
  const stale = (await db.mockSessions.where('status').equals('in_progress').toArray()).filter((s) => now - s.lastActivityAt >= 24 * HOUR)
  for (const s of stale) {
    await db.mockSessions.put({ ...s, status: 'abandoned', endedAt: now, machine: { ...s.machine, state: 'done' } })
    await track('mock_abandoned', { mockId: s.id, reason: 'timeout', atSlot: slotLabel(s), durationMs: s.lastActivityAt - s.startedAt }, s.id)
  }
}

function slotLabel(s: MockSession): string {
  return s.machine.slot.kind === 'main' ? 'main' : `followup_${s.machine.slot.index}`
}

/* ---------- onboarding / profile ---------- */
export async function saveProfile(patch: Partial<Profile>): Promise<Profile> {
  const cur = (await getProfile()) ?? defaultProfile(Clock.now())
  const next: Profile = { ...cur, ...patch, id: 'me', selfRatings: { ...cur.selfRatings, ...(patch.selfRatings ?? {}) } }
  await db.profile.put(next)
  if (patch.onboardingStep && patch.onboardingStep > cur.onboardingStep) {
    await track('onboarding_step_completed', { step: cur.onboardingStep, ratedCount: Object.keys(next.selfRatings).length, mode: next.preferredMode })
  }
  return next
}

export async function completeOnboarding(): Promise<void> {
  const now = Clock.now()
  const cur = (await getProfile()) ?? defaultProfile(now)
  if (cur.onboardingCompletedAt) return
  const next: Profile = { ...cur, onboardingStep: 4, onboardingCompletedAt: now, originalSelfRatings: cur.originalSelfRatings ?? { ...cur.selfRatings } }
  await db.profile.put(next)
  await track('onboarding_completed', { ratedCount: Object.keys(next.selfRatings).length, mode: next.preferredMode, durationMs: now - cur.createdAt, daysOut: daysUntil(next.interviewDate, now) })
}

/* ---------- questions ---------- */
/** Recommended next question for a topic (difficulty ladder by topic score, avoids recently seen). */
export async function recommendQuestion(topic: TopicId): Promise<Question> {
  const settings = await getSettings()
  const pin = DEMO_PINS[topic]
  if (settings.demo.enabled && pin) {
    const q = await db.questions.get(pin.questionId)
    if (q) return q
  }
  const [questions, sessions, stat] = await Promise.all([db.questions.where('topic').equals(topic).toArray(), db.mockSessions.toArray(), db.topicStats.get(topic)])
  const q = pickQuestion(questions, sessions, topic, stat?.score, Clock.now())
  if (!q) throw new Error('No questions are available for this topic yet.')
  return q
}

/* ---------- mock lifecycle ---------- */
export interface StartMockOptions {
  topic: TopicId
  questionId?: string // default: recommendQuestion(topic)
  length: MockLength
  mode: InputMode
  entryPoint: EntryPoint
  nudgeId?: string
  retryOf?: string // original mockId
  fixId?: string
  /** Case variant. Omitted: Standard → "Surprise me", Quick → none (demo mode pins met-101 to the fee variant). null → none. */
  variant?: { axis: VariantAxis; value: string } | null
  /** Optional: when the user pressed Start (app clock), for time-to-first-question. */
  clickedAt?: number
}

interface InternalStart extends StartMockOptions { targetDimension?: DimensionId; focusText?: string }

async function createMock(opts: InternalStart): Promise<MockSession> {
  const now = Clock.now()
  const settings = await getSettings()
  const question = opts.questionId ? await db.questions.get(opts.questionId) : await recommendQuestion(opts.topic)
  if (!question) throw new Error('That question is no longer in your library.')
  const profile = await getProfile()
  const previous = await db.mockSessions.where('questionId').equals(question.id).toArray()

  let variant: { axis: VariantAxis; value: string } | null = null
  if (opts.variant !== undefined) variant = opts.variant
  else if (opts.retryOf) variant = null
  else {
    const pin = DEMO_PINS[question.topic]
    if (settings.demo.enabled && pin?.questionId === question.id && pin.variant) {
      const value = question.variants?.[pin.variant.axis]?.[pin.variant.index]
      variant = value ? { axis: pin.variant.axis, value } : null
    } else if (opts.length === 'standard') variant = pickVariant(question, previous)
  }

  // Only one live mock at a time: anything else in progress is abandoned.
  for (const s of await db.mockSessions.where('status').equals('in_progress').toArray()) {
    await db.mockSessions.put({ ...s, status: 'abandoned', endedAt: now, machine: { ...s.machine, state: 'done' } })
    await track('mock_abandoned', { mockId: s.id, reason: 'replaced', atSlot: slotLabel(s) }, s.id)
  }

  const session = createSession({
    id: newId(), question, length: opts.length, mode: opts.mode, entryPoint: opts.entryPoint, now, firstName: profile?.firstName,
    variant, nudgeId: opts.nudgeId, retryOf: opts.retryOf, retryFixId: opts.fixId, targetDimension: opts.targetDimension, focusText: opts.focusText,
    provider: settings.ai.mode === 'live' ? 'anthropic' : 'scripted',
  })
  await db.mockSessions.put(session)
  const weakest = (await getMeta<TopicId | null>('weakestTopic')) ?? null
  const isFirstMock = previous.length === 0 && (await db.mockSessions.count()) === 1
  await track('mock_started', {
    mockId: session.id, questionId: question.id, topic: question.topic, subtype: question.subtype, difficulty: question.difficulty, source: question.source,
    mode: opts.mode, length: opts.length, followupsPlanned: session.followupsPlanned, variantAxis: session.variant?.axis, entryPoint: opts.entryPoint,
    nudgeId: opts.nudgeId, retryOf: opts.retryOf, isFirstMock, provider: session.provider, onWeakest: weakest !== null ? question.topic === weakest : undefined,
  }, session.id)
  await track('first_question_shown', { mockId: session.id, msSinceStartClick: opts.clickedAt ? Math.max(0, Clock.now() - opts.clickedAt) : Math.max(0, Clock.now() - now) }, session.id)
  return session
}

/** Creates the session with the interviewer intro + question turns already appended. Fires mock_started. */
export async function startMock(opts: StartMockOptions): Promise<MockSession> {
  return createMock(opts)
}

export interface SubmitResult {
  session: MockSession
  interviewerTurn?: Turn // the interviewer's reply (follow-up, clarification answer, expand ask, close…)
  done: boolean // true when the closing line was said and the mock is completed (counted or not)
}

const inflight = new Map<string, Promise<unknown>>()

/** Appends the candidate turn, asks the AI for the next move, appends the interviewer turn. Never throws for AI
 *  failures (falls back to scripted). Throws only on storage failure. Calls for the same mock are serialised. */
export async function submitAnswer(mockId: string, text: string, mode: InputMode, opts?: { editedAfterSpeech?: boolean; startedAt?: number }): Promise<SubmitResult> {
  const prev = inflight.get(mockId) ?? Promise.resolve()
  const p = prev.catch(() => undefined).then(() => doSubmit(mockId, text, mode, opts))
  inflight.set(mockId, p)
  try { return await p } finally { if (inflight.get(mockId) === p) inflight.delete(mockId) }
}

async function doSubmit(mockId: string, text: string, mode: InputMode, opts?: { editedAfterSpeech?: boolean; startedAt?: number }): Promise<SubmitResult> {
  let session = await db.mockSessions.get(mockId)
  if (!session) throw new Error('This mock could not be found.')
  if (session.status !== 'in_progress' || session.machine.state === 'done') return { session, done: session.machine.state === 'done' }
  if (!text.trim()) return { session, done: false }
  const last = session.modeHistory[session.modeHistory.length - 1]
  if (last?.mode !== mode) session = { ...session, modeHistory: [...session.modeHistory, { mode, fromTurn: session.turns.length, at: Clock.now() }] }
  const question = await getQuestionForSession(session)
  const settings = await getSettings()
  const profile = await getProfile()
  const ai = await getInterviewAI(settings)
  const res = await runTurn(session, question, text, mode, {
    ai, fallback: getScriptedAI(), now: () => Clock.now(), firstName: profile?.firstName,
    onCandidate: async (s) => { await db.mockSessions.put(s) },
  }, opts)
  await db.mockSessions.put(res.session)
  for (const e of res.events) await track(e.name, { mockId, ...e.props }, mockId)
  if (res.done) {
    const c = res.completion
    const cand = res.session.turns.filter((t) => t.role === 'candidate')
    const talkMs = cand.reduce((n, t) => n + Math.max(0, t.submittedAt - t.startedAt), 0)
    if (c.counted) {
      await track('mock_completed', {
        mockId, topic: res.session.topic, questionId: res.session.questionId, followupsAnswered: c.followupsAnswered, followupsPlanned: res.session.followupsPlanned,
        totalWords: c.totalWords, candidateTalkMs: talkMs, durationMs: (res.session.endedAt ?? Clock.now()) - res.session.startedAt,
        dominantMode: dominantMode(res.session), modeSwitches: res.session.modeHistory.length - 1, clarifications: res.session.machine.clarifications,
        isRetry: !!res.session.retryOf, lowEffort: talkMs > 0 && talkMs < 90_000,
      }, mockId)
    }
    await evaluateNudges()
  }
  return { session: res.session, interviewerTurn: res.interviewerTurn, done: res.done }
}

function dominantMode(s: MockSession): InputMode {
  const cand = s.turns.filter((t) => t.role === 'candidate')
  const v = cand.filter((t) => t.inputMode === 'voice').reduce((n, t) => n + t.words, 0)
  const tx = cand.filter((t) => t.inputMode !== 'voice').reduce((n, t) => n + t.words, 0)
  return v > tx ? 'voice' : 'text'
}

export async function recordModeSwitch(mockId: string, mode: InputMode, reason: 'user' | 'mic_error' | 'offline' | 'network' | 'unsupported' = 'user'): Promise<void> {
  const s = await db.mockSessions.get(mockId)
  if (!s) return
  const from = s.modeHistory[s.modeHistory.length - 1]?.mode
  if (from === mode) return
  await db.mockSessions.put({ ...s, modeHistory: [...s.modeHistory, { mode, fromTurn: s.turns.length, at: Clock.now() }], lastActivityAt: Clock.now() })
  await track('mode_switched', { mockId, from, to: mode, turnIndex: s.turns.length, reason }, mockId)
}

/** End before completion. Returns whether a Practice-only report can be generated (main + ≥1 follow-up answered). */
export async function endMockEarly(mockId: string): Promise<{ status: 'ended_early' | 'abandoned'; canGrade: boolean }> {
  const s = await db.mockSessions.get(mockId)
  if (!s) throw new Error('This mock could not be found.')
  if (s.status === 'completed') return { status: 'ended_early', canGrade: true }
  const now = Clock.now()
  const c = evaluateCompletion(s)
  if (c.canGradeEarly) {
    await db.mockSessions.put({ ...s, status: 'ended_early', counted: false, endedAt: now, machine: { ...s.machine, state: 'done' } })
    await track('mock_ended_early', { mockId, atSlot: slotLabel(s), durationMs: now - s.startedAt, reason: 'user' }, mockId)
    await evaluateNudges()
    return { status: 'ended_early', canGrade: true }
  }
  await db.mockSessions.put({ ...s, status: 'abandoned', counted: false, endedAt: now, machine: { ...s.machine, state: 'done' } })
  await track('mock_abandoned', { mockId, atSlot: slotLabel(s), durationMs: now - s.startedAt, reason: 'ended' }, mockId)
  await evaluateNudges()
  return { status: 'abandoned', canGrade: false }
}

export async function discardMock(mockId: string): Promise<void> {
  const s = await db.mockSessions.get(mockId)
  if (!s || s.status !== 'in_progress') return
  const now = Clock.now()
  await db.mockSessions.put({ ...s, status: 'abandoned', counted: false, endedAt: now, machine: { ...s.machine, state: 'done' } })
  await track('mock_abandoned', { mockId, atSlot: slotLabel(s), durationMs: now - s.startedAt, reason: 'discarded' }, mockId)
  await evaluateNudges()
}

/* ---------- grading & feedback ---------- */
export type GradeStage = 'reading' | 'scoring' | 'writing_fixes' | 'done'

const gradeInflight = new Map<string, Promise<Feedback>>()

/** Grades, writes Feedback, recomputes topic stats, completes any Retry, re-evaluates nudges. Honors settings.demo.minScoringMs.
 *  Idempotent: returns the stored report if the mock already has one (pass `regrade` to re-score). */
export function gradeMock(mockId: string, onStage?: (s: GradeStage) => void, opts?: { forceOffline?: boolean; regrade?: boolean }): Promise<Feedback> {
  const cur = gradeInflight.get(mockId)
  if (cur) return cur
  const p = doGrade(mockId, onStage, opts).finally(() => gradeInflight.delete(mockId))
  gradeInflight.set(mockId, p)
  return p
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)))

async function doGrade(mockId: string, onStage?: (s: GradeStage) => void, opts?: { forceOffline?: boolean; regrade?: boolean }): Promise<Feedback> {
  const session = await db.mockSessions.get(mockId)
  if (!session) throw new Error('This mock could not be found.')
  const existing = (await db.feedback.where('mockId').equals(mockId).toArray()).filter((f) => !f.supersededBy)
  if (existing.length && !opts?.regrade) { onStage?.('done'); return existing[existing.length - 1] }
  if (session.status !== 'completed' && session.status !== 'ended_early' && session.status !== 'error') throw new Error('This mock has not finished yet.')

  const settings = await getSettings()
  const minMs = Math.max(0, settings.demo.minScoringMs ?? 0)
  const started = typeof performance !== 'undefined' ? performance.now() : 0
  const elapsed = () => (typeof performance !== 'undefined' ? performance.now() : 0) - started
  const seen = new Set<GradeStage>()
  const stage = (s: GradeStage) => { if (!seen.has(s)) { seen.add(s); onStage?.(s) } }
  stage('reading')
  const t1 = setTimeout(() => stage('scoring'), minMs * 0.3)
  const t2 = setTimeout(() => stage('writing_fixes'), minMs * 0.65)
  const question = await getQuestionForSession(session)
  const input = { session, question, quality: settings.ai.graderQuality }
  let result
  try {
    const ai = opts?.forceOffline ? getScriptedAI() : await getInterviewAI(settings)
    try {
      result = await ai.gradeMock(input)
    } catch (e) {
      await track('feedback_failed', { mockId, provider: ai.id, errorType: (e as { kind?: string })?.kind ?? 'unknown' }, mockId)
      result = await getScriptedAI().gradeMock(input)
    }
  } catch (e) {
    clearTimeout(t1); clearTimeout(t2)
    await db.mockSessions.put({ ...session, status: 'error' })
    throw e
  }
  if (elapsed() < minMs) await wait(minMs - elapsed())
  clearTimeout(t1); clearTimeout(t2)
  stage('scoring'); stage('writing_fixes')

  const now = Clock.now()
  const status: MockSession['status'] = session.status === 'error' ? (session.counted ? 'completed' : 'ended_early') : session.status
  const feedback: Feedback = { ...result, id: newId(), mockId, counted: session.counted && status === 'completed', generatedAt: now, source: 'user' }
  let retryDone: Retry | null = null
  await db.transaction('rw', [db.feedback, db.mockSessions, db.topicStats, db.retries, db.meta], async () => {
    for (const old of existing) await db.feedback.put({ ...old, supersededBy: feedback.id })
    await db.feedback.put(feedback)
    await db.mockSessions.put({ ...session, status, feedbackId: feedback.id })
    const retry = await db.retries.where('newMockId').equals(mockId).first()
    if (retry) {
      const orig = (await db.feedback.where('mockId').equals(retry.originalMockId).toArray()).filter((f) => !f.supersededBy).pop()
      retryDone = { ...retry, completedAt: now, ...computeUplift(orig, feedback, retry.targetDimension) }
      await db.retries.put(retryDone)
    }
    await recomputeTopicStats(now)
  })
  await track('feedback_generated', {
    mockId, feedbackId: feedback.id, grader: feedback.grader, model: feedback.model, latencyMs: feedback.latencyMs, attempts: feedback.attempts,
    quotesRepaired: feedback.quoteRepairs, quotesDropped: feedback.quotesDropped, capsApplied: feedback.capsApplied.length, overall: feedback.overall,
    scores: Object.fromEntries(feedback.dimensionScores.map((d) => [d.dimension, d.score])), counted: feedback.counted,
  }, mockId)
  if (retryDone) {
    const r = retryDone as Retry
    await track('retry_completed', { originalMockId: r.originalMockId, newMockId: r.newMockId, targetDimension: r.targetDimension, before: r.before, after: r.after, uplift: r.uplift, overallBefore: r.overallBefore, overallAfter: r.overallAfter, within72h: r.within72h }, mockId)
  }
  stage('done')
  await evaluateNudges()
  return feedback
}

export async function markFeedbackOpened(feedbackId: string, entryPoint: 'auto' | 'home' | 'history' | 'progress' | 'nudge' = 'auto'): Promise<void> {
  const f = await db.feedback.get(feedbackId)
  if (!f || f.openedAt) return
  const now = Clock.now()
  await db.feedback.put({ ...f, openedAt: now })
  await track('feedback_opened', { mockId: f.mockId, feedbackId, msSinceReady: now - f.generatedAt, entryPoint, counted: f.counted }, f.mockId)
}

/** Call when the fixes section has been ≥50% visible for ≥2s. Fires fixes_viewed (this makes it a Reviewed Mock). */
export async function markFixesViewed(feedbackId: string, dwellMs = 2000): Promise<void> {
  const f = await db.feedback.get(feedbackId)
  if (!f || f.fixesViewedAt) return
  const now = Clock.now()
  const firstEver = (await db.feedback.filter((x) => !!x.fixesViewedAt).count()) === 0
  await db.feedback.put({ ...f, openedAt: f.openedAt ?? now, fixesViewedAt: now })
  await track('fixes_viewed', { mockId: f.mockId, feedbackId, dwellMs, msSinceOpened: now - (f.openedAt ?? now), firstEver, counted: f.counted }, f.mockId)
  await evaluateNudges()
}

export async function rateFeedback(feedbackId: string, rating: Score, tags: RatingTag[], comment?: string): Promise<void> {
  const f = await db.feedback.get(feedbackId)
  if (!f) return
  const isUpdate = f.rating != null
  await db.feedback.put({ ...f, rating, ratingTags: tags, ratingComment: comment, ratedAt: Clock.now() })
  await track('feedback_rated', { mockId: f.mockId, feedbackId, rating, tags, hasComment: !!comment?.trim(), isUpdate, grader: f.grader }, f.mockId)
}

/* ---------- retry ---------- */
/** Starts a Quick retry of the same question pinned to one fix. Fires question_reattempted. */
export async function startRetry(feedbackId: string, fixId: string, mode: InputMode, opts?: { entryPoint?: 'fix_card' | 'report_rail' | 'nudge'; nudgeId?: string }): Promise<MockSession> {
  const f = await db.feedback.get(feedbackId)
  if (!f) throw new Error('That report could not be found.')
  const original = await db.mockSessions.get(f.mockId)
  if (!original) throw new Error('The original mock could not be found.')
  const fix = f.fixes.find((x) => x.id === fixId) ?? f.fixes[0]
  const q = await db.questions.get(original.questionId)
  if (!q) throw new Error('This question was removed from your library, so it cannot be retried.')
  const now = Clock.now()
  const session = await createMock({
    topic: original.topic, questionId: original.questionId, length: 'quick', mode, entryPoint: opts?.entryPoint === 'nudge' ? 'nudge' : 'retry', nudgeId: opts?.nudgeId,
    retryOf: original.id, fixId: fix?.id, targetDimension: fix?.dimension, focusText: fix?.instruction,
    variant: original.variant ? { axis: original.variant.axis, value: original.variant.value } : null,
  })
  const since = f.openedAt ?? f.generatedAt
  const retry: Retry = {
    id: newId(), originalMockId: original.id, newMockId: session.id, fixId: fix?.id, targetDimension: fix?.dimension, sameQuestion: true,
    within72h: now - since <= 72 * HOUR, startedAt: now,
  }
  await db.retries.put(retry)
  await track('question_reattempted', {
    originalMockId: original.id, newMockId: session.id, questionId: original.questionId, fixId: fix?.id, targetDimension: fix?.dimension,
    hoursSinceOriginal: Math.round((now - (original.endedAt ?? original.startedAt)) / HOUR), within72h: retry.within72h, sameQuestion: true, entryPoint: opts?.entryPoint ?? 'fix_card',
  }, session.id)
  await evaluateNudges()
  return session
}

/** For a retry mock's report: before/after on the target dimension (null if not a retry). */
export async function getRetryComparison(newMockId: string): Promise<(Retry & { targetDimension: DimensionId }) | null> {
  const r = await db.retries.where('newMockId').equals(newMockId).first()
  if (!r || !r.targetDimension) return null
  return r as Retry & { targetDimension: DimensionId }
}

/* ---------- nudges ---------- */
export async function evaluateNudges(): Promise<void> {
  const now = Clock.now()
  const [profile, settings, sessions, feedback, retries, topicStats, nudges, events] = await Promise.all([
    getProfile(), getSettings(), db.mockSessions.toArray(), db.feedback.toArray(), db.retries.toArray(), db.topicStats.toArray(), db.nudges.toArray(), db.events.where('name').anyOf('fixes_viewed', 'feedback_fixes_viewed').toArray(),
  ])
  if (!profile) return
  const weakest = (await getMeta<TopicId | null>('weakestTopic')) ?? null
  const reviewedThisWeek = reviewedInWeek(reviewedMocks(sessions, feedback, events), now)
  const res = computeNudges({ profile, settings, sessions, feedback, retries, topicStats, nudges, weakest, reviewedThisWeek }, now)
  if (!res.create.length && !res.close.length) return
  const created: Nudge[] = res.create.map((d, i) => ({ ...d, id: newId(), createdAt: now + i, status: 'active', placement: 'next_up' }))
  await db.transaction('rw', db.nudges, async () => {
    for (const c of res.close) {
      const n = nudges.find((x) => x.id === c.id)
      if (n) await db.nudges.put({ ...n, status: c.status, resolvedAt: now })
    }
    await db.nudges.bulkPut(created)
  })
  const active = (await db.nudges.where('status').equals('active').toArray()).sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt)
  for (const n of created) {
    const placement = active[0]?.id === n.id ? 'next_up' : 'banner'
    const daysSinceTopic = n.topic ? topicStats.find((t) => t.topic === n.topic)?.lastPractisedAt : undefined
    await track('nudge_sent', { nudgeId: n.id, type: n.type, topic: n.topic, key: n.key, placement, daysSinceTopic: daysSinceTopic ? Math.floor((now - daysSinceTopic) / 86_400_000) : undefined })
  }
  for (const c of res.close) {
    const n = nudges.find((x) => x.id === c.id)
    if (n) await track('nudge_resolved', { nudgeId: n.id, type: n.type, resolvedBy: c.status })
  }
}

export async function actOnNudge(nudgeId: string): Promise<void> {
  if (nudgeId.startsWith('rec:')) return
  const n = await db.nudges.get(nudgeId)
  if (!n) return
  const now = Clock.now()
  await db.nudges.put({ ...n, status: 'acted', actedAt: now })
  await track('nudge_acted', { nudgeId, type: n.type, action: n.cta.action, msSinceSent: now - n.createdAt })
}

export async function dismissNudge(nudgeId: string): Promise<void> {
  if (nudgeId.startsWith('rec:')) return
  const n = await db.nudges.get(nudgeId)
  if (!n) return
  await db.nudges.put({ ...n, status: 'dismissed', dismissedAt: Clock.now() })
  await track('nudge_dismissed', { nudgeId, type: n.type })
}

/** "Don't show this kind": mutes the nudge type in settings and dismisses this instance. */
export async function muteNudgeType(nudgeId: string): Promise<void> {
  const n = await db.nudges.get(nudgeId)
  if (!n) return
  await updateSettings((s) => ({ ...s, nudges: { ...s.nudges, mutedTypes: [...new Set([...s.nudges.mutedTypes, n.type])] } }))
  await db.nudges.put({ ...n, status: 'dismissed', dismissedAt: Clock.now() })
  await track('nudge_muted', { nudgeId, type: n.type })
}

/* ---------- willingness to pay ---------- */
const WTP_PRICES = [99, 199, 299] as const

async function wtpPrice(profile: Profile): Promise<99 | 199 | 299> {
  if (profile.wtp?.priceInr) return profile.wtp.priceInr
  const pinned = await getMeta<number>('wtpPriceInr')
  if (pinned === 99 || pinned === 199 || pinned === 299) return pinned
  if (profile.isDemo) return 199
  return WTP_PRICES[Math.abs(Math.floor(profile.createdAt / 1000)) % 3]
}

/** Call when the WTP card is first shown. Sets profile.wtp.shownAt/priceInr and fires wtp_shown. */
export async function markWtpShown(): Promise<99 | 199 | 299 | null> {
  const p = await getProfile()
  if (!p) return null
  const priceInr = await wtpPrice(p)
  if (p.wtp?.shownAt) return priceInr
  await db.profile.put({ ...p, wtp: { ...p.wtp, shownAt: Clock.now(), priceInr } })
  const afterMockCount = await db.mockSessions.filter((s) => s.counted).count()
  await track('wtp_shown', { priceInr, afterMockCount })
  return priceInr
}

export async function answerWtp(answer: NonNullable<Profile['wtp']>['answer'], statedPrice?: number): Promise<void> {
  const p = await getProfile()
  if (!p) return
  const priceInr = await wtpPrice(p)
  await db.profile.put({ ...p, wtp: { shownAt: p.wtp?.shownAt ?? Clock.now(), priceInr, answer, statedPrice } })
  await track('wtp_answered', { answer, priceInr, statedPrice })
}

/* ---------- uploads ---------- */
export interface UploadPreview {
  fileName: string; fileType: UserUpload['fileType']; bytes: number; pages?: number
  questions: { prompt: string; topic: TopicId; caseText?: string; duplicateOf?: string; include: boolean }[]
  warnings: string[]
}

async function buildPreview(text: string, meta: { fileName: string; fileType: UserUpload['fileType']; bytes: number; pages?: number; warnings: string[] }): Promise<UploadPreview> {
  const { detectQuestions, findDuplicate, guessTopic } = await import('@/services/extract/detectQuestions')
  const existing = (await db.questions.toArray()).filter((q) => !q.retired).map((q) => ({ id: q.id, prompt: q.prompt }))
  let found = detectQuestions(text)
  const warnings = [...meta.warnings]
  if (!found.length) {
    const firstAsk = text.split(/(?<=[.?!])\s+/).find((s) => s.trim().split(/\s+/).length >= 5)?.trim() ?? text.trim().split(/\s+/).slice(0, 30).join(' ')
    found = [{ prompt: firstAsk.slice(0, 300), topic: guessTopic(text.slice(0, 2000)), caseText: text.trim().slice(0, 6000), confidence: 'low' }]
    warnings.push("We couldn't find separate questions, so the whole text is treated as one case. Edit the prompt, or paste one question per line.")
  }
  const questions = found.map((q) => {
    const duplicateOf = findDuplicate(q.prompt, existing)
    return { prompt: q.prompt, topic: q.topic, caseText: q.caseText, duplicateOf, include: !duplicateOf }
  })
  const dups = questions.filter((q) => q.duplicateOf).length
  if (dups) warnings.push(`${dups} ${dups === 1 ? 'is' : 'are'} already in your library and ${dups === 1 ? 'is' : 'are'} unticked.`)
  return { fileName: meta.fileName, fileType: meta.fileType, bytes: meta.bytes, pages: meta.pages, questions, warnings }
}

/** Extracts text (pdf/docx/txt/md) and detects questions. Throws Error with user-facing message on bad files. */
export async function previewUpload(file: File): Promise<UploadPreview> {
  const { extractText, ExtractError, fileTypeOf } = await import('@/services/extract')
  try {
    const ex = await extractText(file)
    return await buildPreview(ex.text, { fileName: file.name, fileType: ex.fileType, bytes: file.size, pages: ex.pages, warnings: ex.warnings })
  } catch (e) {
    const errorType = e instanceof ExtractError ? e.kind : 'unknown'
    await track('upload_failed', { fileType: fileTypeOf(file.name, file.type) ?? 'unknown', bytes: file.size, errorType })
    throw new Error(e instanceof Error && e instanceof ExtractError ? e.message : "We couldn't read this file. Paste the text instead.")
  }
}

export async function previewPaste(text: string): Promise<UploadPreview> {
  if (!text.trim()) throw new Error('Paste some text first.')
  return buildPreview(text, { fileName: 'Pasted text', fileType: 'paste', bytes: new Blob([text]).size, warnings: [] })
}

const TIMEBOX: Record<TopicId, number> = { product_design: 15, rca: 12, metrics: 12, guesstimate: 10, strategy: 15, tech: 10 }

export async function saveUpload(preview: UploadPreview): Promise<UserUpload> {
  const now = Clock.now()
  const uploadId = newId()
  const questions: Question[] = preview.questions.filter((q) => q.include && q.prompt.trim()).map((q) => {
    const id = `up-${newId().toLowerCase()}`
    return {
      id, topic: q.topic, subtype: 'uploaded', difficulty: 'medium', timeboxMin: TIMEBOX[q.topic], prompt: q.prompt.trim(),
      context: { hiddenFacts: [], ...(q.caseText ? { caseText: q.caseText.slice(0, 6000) } : {}) },
      coverage: [], expectedStructure: [], rubricHints: {}, commonPitfalls: [], followUpSeeds: uploadSeeds(q.topic, id), variants: {},
      tags: ['upload'], source: 'upload', uploadId, contentVersion: CONTENT_VERSION,
    }
  })
  const upload: UserUpload = { id: uploadId, fileName: preview.fileName, fileType: preview.fileType, bytes: preview.bytes, pages: preview.pages, questionIds: questions.map((q) => q.id), createdAt: now, warnings: preview.warnings }
  await db.transaction('rw', db.uploads, db.questions, async () => {
    await db.uploads.put(upload)
    await db.questions.bulkPut(questions)
  })
  await track('upload_completed', { uploadId, fileType: upload.fileType, bytes: upload.bytes, pages: upload.pages, questionsFound: preview.questions.length, questionsSaved: questions.length, parser: 'heuristic' })
  return upload
}

export async function deleteUpload(uploadId: string): Promise<void> {
  const u = await db.uploads.get(uploadId)
  await db.transaction('rw', db.uploads, db.questions, async () => {
    await db.questions.where('uploadId').equals(uploadId).delete()
    await db.uploads.delete(uploadId)
  })
  await track('upload_deleted', { uploadId, fileType: u?.fileType })
}

/* ---------- demo & data ---------- */
export type SeedName = 'fresh' | 'ishita_w3'

export async function loadSeed(name: SeedName): Promise<void> {
  const settings = await getSettings()
  await clearUserTables()
  await db.settings.put(settings)
  if (name === 'ishita_w3') {
    const { buildIshitaW3, SEED_WEEKLY_GOAL, SEED_WTP_PRICE_INR } = await import('@/content/seed/ishitaW3')
    const now = Clock.now()
    const bundle = buildIshitaW3(now)
    await db.transaction('rw', [db.profile, db.mockSessions, db.feedback, db.retries, db.events, db.nudges, db.meta, db.topicStats, db.settings], async () => {
      await db.profile.put({ ...bundle.profile, isDemo: true })
      await db.mockSessions.bulkPut(bundle.sessions)
      await db.feedback.bulkPut(bundle.feedback)
      await db.retries.bulkPut(bundle.retries)
      await db.events.bulkPut(bundle.events)
      await db.nudges.bulkPut(seedNudgeRows(bundle, dayStart(now)))
      await db.meta.put({ key: 'wtpPriceInr', value: SEED_WTP_PRICE_INR })
      await db.meta.put({ key: 'demoSeed', value: name })
      await db.settings.put({ ...settings, mock: { ...settings.mock, weeklyGoal: SEED_WEEKLY_GOAL } })
      await recomputeTopicStats(now)
    })
    await evaluateNudges()
  } else {
    await setMeta('demoSeed', name)
  }
  await track('demo_seed_loaded', { seed: name })
}

export async function setClockOffset(ms: number): Promise<void> {
  Clock.setOffset(ms)
  await updateSettings((s) => ({ ...s, demo: { ...s.demo, clockOffsetMs: ms } }))
  await track('demo_clock_changed', { offsetMs: ms })
  await expireStaleMocks()
  await recomputeTopicStats(Clock.now())
  await evaluateNudges()
}

export const EXPORT_SCHEMA_VERSION = 1

export async function exportData(): Promise<Blob> {
  const [profile, settings, questions, uploads, mockSessions, feedback, retries, nudges, events] = await Promise.all([
    getProfile(), getSettings(), db.questions.where('source').equals('upload').toArray(), db.uploads.toArray(), db.mockSessions.toArray(),
    db.feedback.toArray(), db.retries.toArray(), db.nudges.toArray(), db.events.toArray(),
  ])
  // The API key never lives in IndexedDB; nothing key-shaped is exported.
  const payload = { app: 'redpen', schemaVersion: EXPORT_SCHEMA_VERSION, contentVersion: CONTENT_VERSION, exportedAt: Clock.now(), profile, settings, questions, uploads, mockSessions, feedback, retries, nudges, events }
  await track('data_exported', { sessions: mockSessions.length, events: events.length })
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
}

const isArr = (v: unknown): v is unknown[] => Array.isArray(v)

export async function importData(file: File): Promise<void> {
  let data: Record<string, unknown>
  try {
    data = JSON.parse(typeof file.text === 'function' ? await file.text() : await new Response(file).text())
  } catch {
    throw new Error("This file isn't a Redpen backup.")
  }
  if (!data || data.app !== 'redpen' || typeof data.schemaVersion !== 'number') throw new Error("This file isn't a Redpen backup.")
  if (data.schemaVersion > EXPORT_SCHEMA_VERSION) throw new Error('This backup is from a newer version of the app.')
  for (const k of ['questions', 'uploads', 'mockSessions', 'feedback', 'retries', 'nudges', 'events']) {
    if (data[k] !== undefined && !isArr(data[k])) throw new Error('This backup is damaged and could not be imported.')
  }
  if ((await db.mockSessions.where('status').equals('in_progress').count()) > 0) throw new Error('Finish or end the mock in progress before importing.')
  const sessions = (data.mockSessions as MockSession[] | undefined) ?? []
  if (sessions.some((s) => !s || typeof s.id !== 'string' || !Array.isArray(s.turns))) throw new Error('This backup is damaged and could not be imported.')
  await clearUserTables()
  await db.transaction('rw', [db.profile, db.settings, db.questions, db.uploads, db.mockSessions, db.feedback, db.retries, db.nudges, db.events, db.topicStats, db.meta], async () => {
    if (data.profile) await db.profile.put({ ...(data.profile as Profile), id: 'me' })
    if (data.settings) await db.settings.put({ ...DEFAULT_SETTINGS, ...(data.settings as object), id: 'settings' } as typeof DEFAULT_SETTINGS)
    await db.questions.bulkPut(((data.questions as Question[]) ?? []).filter((q) => q?.source === 'upload'))
    await db.uploads.bulkPut((data.uploads as UserUpload[]) ?? [])
    await db.mockSessions.bulkPut(sessions)
    await db.feedback.bulkPut((data.feedback as Feedback[]) ?? [])
    await db.retries.bulkPut((data.retries as Retry[]) ?? [])
    await db.nudges.bulkPut((data.nudges as Nudge[]) ?? [])
    await db.events.bulkPut(((data.events as unknown[]) ?? []) as never[])
    await recomputeTopicStats(Clock.now())
  })
  const settings = await getSettings()
  Clock.setOffset(settings.demo.clockOffsetMs ?? 0)
  await track('data_imported', { sessions: sessions.length })
  await evaluateNudges()
}

export async function resetAll(): Promise<void> {
  await clearUserTables()
  await db.settings.put(DEFAULT_SETTINGS)
  Clock.setOffset(0)
  KeyStore.forget()
  try {
    if (typeof window !== 'undefined') {
      for (const store of [window.localStorage, window.sessionStorage]) {
        for (const k of Object.keys(store)) if ((k.startsWith('pmc.') || k.startsWith('redpen.')) && k !== SAMPLE_FLAG) store.removeItem(k)
      }
    }
  } catch { /* storage blocked */ }
  await track('data_reset', {})
}

/** Leaves the sample data: clears it and starts a fresh profile (onboarding next). */
export async function startOwnPractice(): Promise<void> {
  markSampleShown()
  await loadSeed('fresh')
}

/* ---------- AI connection ---------- */
export async function testAiConnection(): Promise<{ ok: boolean; latencyMs?: number; message: string }> {
  const settings = await getSettings()
  if (!settings.ai.useProxy && !KeyStore.get()) {
    const r = { ok: false, message: 'Add your Anthropic API key first.' }
    await track('provider_tested', { ok: false, errorType: 'no_key' })
    return r
  }
  const r = await testLiveConnection(settings)
  await track('provider_tested', { ok: r.ok, latencyMs: r.latencyMs })
  return r
}

export type { TopicStat, Nudge }
export { TOPICS }
