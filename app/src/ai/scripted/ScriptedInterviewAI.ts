/* ScriptedInterviewAI: rules + offline grader. No network; always works. Used with no key, in tests, and as the
   per-call fallback behind ai/resilient. */
import type { InterviewAI } from '@/ai/types'
import type { GradeInput, GradeResult, TurnContext, TurnResult } from '@/domain/types'
import { offlineGrade } from '@/domain/rubric/offlineGrader'
import { finalizeGrade } from '@/domain/rubric/postprocess'
import { scriptedDecision } from './ruleInterviewer'

export const OFFLINE_PROMPT_VERSION = 'offline-grader@1'

export interface ScriptedOptions {
  /** Artificial thinking time for turns, so the UI behaves like the live path. [min, max] ms. */
  turnLatencyMs?: [number, number]
  /** Optional clock for generatedAt (the engine overrides it anyway). */
  now?: () => number
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason ?? new Error('aborted')) }, { once: true })
  })
}

export class ScriptedInterviewAI implements InterviewAI {
  readonly id = 'scripted' as const
  constructor(private opts: ScriptedOptions = {}) {}

  async nextTurn(ctx: TurnContext, signal?: AbortSignal): Promise<TurnResult> {
    const started = typeof performance !== 'undefined' ? performance.now() : 0
    const d = scriptedDecision(ctx)
    const [min, max] = this.opts.turnLatencyMs ?? [400, 900]
    // longer lines "take longer to think"; deterministic jitter from the turn id
    const jitter = [...ctx.lastAnswer.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % Math.max(1, max - min + 1)
    await sleep(min + jitter, signal)
    const { plan: _plan, ...decision } = d
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : 0) - started
    return { ...decision, generatedBy: 'scripted', latencyMs: Math.round(elapsed) }
  }

  async gradeMock(input: GradeInput): Promise<GradeResult> {
    const started = typeof performance !== 'undefined' ? performance.now() : 0
    const raw = offlineGrade(input)
    const latencyMs = Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - started)
    return finalizeGrade(raw, input, { grader: 'offline', promptVersion: OFFLINE_PROMPT_VERSION, latencyMs, attempts: 1, now: this.opts.now?.() } as Parameters<typeof finalizeGrade>[2])
  }
}
