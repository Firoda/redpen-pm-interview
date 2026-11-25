/* ENGINE API — the single facade screens call for anything that writes state or needs the AI.
 * Reads for display should use dexie-react-hooks `useLiveQuery` with the selectors in engine/selectors.ts
 * (owned by the ENGINE agent) or directly on `db` tables for simple lists.
 *
 * Owner: ENGINE agent replaces every `TODO_ENGINE` body. Screens must code against these signatures only.
 * Do not change a signature without updating every caller.
 */
import type {
  DimensionId, EntryPoint, Feedback, InputMode, MockLength, MockSession, Nudge, Question, Retry, Score,
  RatingTag, TopicId, TopicStat, Turn, Profile, UserUpload,
} from '@/domain/types'

const TODO_ENGINE = (name: string): never => { throw new Error(`engine.${name} not implemented yet`) }

/* ---------- boot ---------- */
/** Idempotent. Seeds curated questions, default settings, applies clock offset, expires stale mocks, evaluates nudges. */
export async function boot(): Promise<void> { return TODO_ENGINE('boot') }

/* ---------- onboarding / profile ---------- */
export async function saveProfile(patch: Partial<Profile>): Promise<Profile> { return TODO_ENGINE('saveProfile') }
export async function completeOnboarding(): Promise<void> { return TODO_ENGINE('completeOnboarding') }

/* ---------- questions ---------- */
/** Recommended next question for a topic (difficulty ladder by topic score, avoids recently seen). */
export async function recommendQuestion(topic: TopicId): Promise<Question> { return TODO_ENGINE('recommendQuestion') }

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
}
/** Creates the session with the interviewer intro + question turns already appended. Fires mock_started. */
export async function startMock(opts: StartMockOptions): Promise<MockSession> { return TODO_ENGINE('startMock') }

export interface SubmitResult {
  session: MockSession
  interviewerTurn?: Turn // the interviewer's reply (follow-up, clarification answer, expand ask, close…)
  done: boolean // true when the closing line was said and the mock is completed (counted or not)
}
/** Appends the candidate turn, asks the AI for the next move, appends the interviewer turn. Never throws for AI
 *  failures (falls back to scripted). Throws only on storage failure. */
export async function submitAnswer(mockId: string, text: string, mode: InputMode, opts?: { editedAfterSpeech?: boolean; startedAt?: number }): Promise<SubmitResult> { return TODO_ENGINE('submitAnswer') }

export async function recordModeSwitch(mockId: string, mode: InputMode): Promise<void> { return TODO_ENGINE('recordModeSwitch') }

/** End before completion. Returns whether a Practice-only report can be generated (main + ≥1 follow-up answered). */
export async function endMockEarly(mockId: string): Promise<{ status: 'ended_early' | 'abandoned'; canGrade: boolean }> { return TODO_ENGINE('endMockEarly') }
export async function discardMock(mockId: string): Promise<void> { return TODO_ENGINE('discardMock') }

/* ---------- grading & feedback ---------- */
export type GradeStage = 'reading' | 'scoring' | 'writing_fixes' | 'done'
/** Grades, writes Feedback, recomputes topic stats, completes any Retry, re-evaluates nudges. Honors settings.demo.minScoringMs. */
export async function gradeMock(mockId: string, onStage?: (s: GradeStage) => void): Promise<Feedback> { return TODO_ENGINE('gradeMock') }
export async function markFeedbackOpened(feedbackId: string): Promise<void> { return TODO_ENGINE('markFeedbackOpened') }
/** Call when the fixes section has been ≥50% visible for ≥2s. Fires fixes_viewed (this makes it a Reviewed Mock). */
export async function markFixesViewed(feedbackId: string): Promise<void> { return TODO_ENGINE('markFixesViewed') }
export async function rateFeedback(feedbackId: string, rating: Score, tags: RatingTag[], comment?: string): Promise<void> { return TODO_ENGINE('rateFeedback') }

/* ---------- retry ---------- */
/** Starts a Quick retry of the same question pinned to one fix. Fires question_reattempted. */
export async function startRetry(feedbackId: string, fixId: string, mode: InputMode): Promise<MockSession> { return TODO_ENGINE('startRetry') }
/** For a retry mock's report: before/after on the target dimension (null if not a retry). */
export async function getRetryComparison(newMockId: string): Promise<(Retry & { targetDimension: DimensionId }) | null> { return TODO_ENGINE('getRetryComparison') }

/* ---------- nudges ---------- */
export async function evaluateNudges(): Promise<void> { return TODO_ENGINE('evaluateNudges') }
export async function actOnNudge(nudgeId: string): Promise<void> { return TODO_ENGINE('actOnNudge') }
export async function dismissNudge(nudgeId: string): Promise<void> { return TODO_ENGINE('dismissNudge') }

/* ---------- willingness to pay ---------- */
export async function answerWtp(answer: NonNullable<Profile['wtp']>['answer'], statedPrice?: number): Promise<void> { return TODO_ENGINE('answerWtp') }

/* ---------- uploads ---------- */
export interface UploadPreview {
  fileName: string; fileType: UserUpload['fileType']; bytes: number; pages?: number
  questions: { prompt: string; topic: TopicId; caseText?: string; duplicateOf?: string; include: boolean }[]
  warnings: string[]
}
/** Extracts text (pdf/docx/txt/md) and detects questions. Throws Error with user-facing message on bad files. */
export async function previewUpload(file: File): Promise<UploadPreview> { return TODO_ENGINE('previewUpload') }
export async function previewPaste(text: string): Promise<UploadPreview> { return TODO_ENGINE('previewPaste') }
export async function saveUpload(preview: UploadPreview): Promise<UserUpload> { return TODO_ENGINE('saveUpload') }
export async function deleteUpload(uploadId: string): Promise<void> { return TODO_ENGINE('deleteUpload') }

/* ---------- demo & data ---------- */
export type SeedName = 'fresh' | 'ishita_w3'
export async function loadSeed(name: SeedName): Promise<void> { return TODO_ENGINE('loadSeed') }
export async function setClockOffset(ms: number): Promise<void> { return TODO_ENGINE('setClockOffset') }
export async function exportData(): Promise<Blob> { return TODO_ENGINE('exportData') }
export async function importData(file: File): Promise<void> { return TODO_ENGINE('importData') }
export async function resetAll(): Promise<void> { return TODO_ENGINE('resetAll') }

/* ---------- AI connection ---------- */
export async function testAiConnection(): Promise<{ ok: boolean; latencyMs?: number; message: string }> { return TODO_ENGINE('testAiConnection') }

export type { TopicStat, Nudge }
