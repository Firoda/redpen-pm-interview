import type { GradeInput, GradeResult, Question, TopicId, TurnContext, TurnResult } from '@/domain/types'

/** What the engine calls. Implementations:
 *  - ai/scripted  → ScriptedInterviewAI (rules + offline grader; no network; always works)  [ENGINE agent]
 *  - ai/live      → createLiveInterviewAI() (Claude via browser key or /api/claude proxy)  [LIVE-AI agent]
 *  - ai/resilient → wraps live with per-call fallback to scripted                           [ENGINE agent]
 */
export interface InterviewAI {
  readonly id: 'scripted' | 'live' | 'resilient'
  nextTurn(ctx: TurnContext, signal?: AbortSignal): Promise<TurnResult>
  gradeMock(input: GradeInput, signal?: AbortSignal): Promise<GradeResult>
  /** Optional: turn pasted/uploaded casebook text into questions (heuristic fallback lives in services/extract). */
  parseUpload?(text: string, signal?: AbortSignal): Promise<ParsedQuestion[]>
}

export interface ParsedQuestion { prompt: string; topic: TopicId; caseText?: string; confidence: 'high' | 'medium' | 'low' }

export type LLMErrorKind = 'auth' | 'rate_limit' | 'overloaded' | 'network' | 'timeout' | 'schema' | 'refusal' | 'max_tokens' | 'validator' | 'no_key' | 'unknown'
export class LLMError extends Error {
  constructor(public kind: LLMErrorKind, message: string, public status?: number, public retryAfterMs?: number) {
    super(message)
  }
}

/** Raw grader output before code post-processing (caps, quote verification, fix rules, weighting).
 *  The live grader produces this; domain/rubric/postprocess.finalizeGrade() turns it into a GradeResult. */
export interface RawGrade {
  dimensions: { dimension: import('@/domain/types').DimensionId; score: number; reason: string; evidence: { quote: string; turnId: string }[] }[]
  fixes: { dimension: import('@/domain/types').DimensionId; issueTag: string; quote: string; turnId: string; issue: string; instruction: string; pattern?: string }[]
  strength?: { text: string; quote: string; turnId: string }
  verdict: string
  confidence?: 'low' | 'medium' | 'high'
}

export type FinalizeGrade = (raw: RawGrade, input: GradeInput, meta: { grader: 'llm' | 'offline' | 'fixture'; model?: string; promptVersion: string; latencyMs: number; attempts: number }) => GradeResult

/** Used by live AI to sanity-check interviewer lines before showing them (no praise, no teaching, ≤ 45 words). */
export type ValidateInterviewerLine = (say: string, ctx: TurnContext, opts?: { maxWords?: number }) => { ok: true } | { ok: false; reason: string }

export type { Question }
