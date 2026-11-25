/* ResilientInterviewAI (§6.9, §6.12): per-call fallback from the live model to the scripted provider.
   Timeouts (turn 8 s / 6 s in demo, grade 45 s / 30 s in demo), one retry on retryable errors only,
   circuit breaker (3 live failures within 2 min → scripted for 5 min), llm_call / llm_fallback telemetry. */
import type { InterviewAI, ParsedQuestion } from '@/ai/types'
import { LLMError, type LLMErrorKind } from '@/ai/types'
import type { GradeInput, GradeResult, TurnContext, TurnResult } from '@/domain/types'
import { Analytics } from '@/services/analytics'

export interface ResilientOptions {
  turnTimeoutMs?: number
  gradeTimeoutMs?: number
  /** Overrideable for tests. */
  now?: () => number
  track?: (name: 'llm_call' | 'llm_fallback', props: Record<string, unknown>) => void
  breaker?: { failures: number; windowMs: number; openMs: number }
  /** Waits before the single retry; tests pass 0. */
  retryDelayMs?: number
}

const RETRYABLE: LLMErrorKind[] = ['rate_limit', 'overloaded', 'network', 'timeout']

function kindOf(e: unknown): LLMErrorKind {
  if (e instanceof LLMError) return e.kind
  if ((e as { name?: string })?.name === 'AbortError') return 'timeout'
  return 'unknown'
}

function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number, outer?: AbortSignal): Promise<T> {
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort(outer?.reason)
  outer?.addEventListener('abort', onAbort, { once: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { ctrl.abort(); reject(new LLMError('timeout', `No response within ${Math.round(ms / 1000)} s.`)) }, ms)
  })
  return Promise.race([fn(ctrl.signal), timeout]).finally(() => {
    if (timer) clearTimeout(timer)
    outer?.removeEventListener('abort', onAbort)
  })
}

const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve())

export class ResilientInterviewAI implements InterviewAI {
  readonly id = 'resilient' as const
  private failures: number[] = []
  private openUntil = 0
  private o: Required<Omit<ResilientOptions, 'track'>> & { track: NonNullable<ResilientOptions['track']> }

  constructor(private primary: InterviewAI, private fallback: InterviewAI, opts: ResilientOptions = {}) {
    this.o = {
      turnTimeoutMs: opts.turnTimeoutMs ?? 8000,
      gradeTimeoutMs: opts.gradeTimeoutMs ?? 45_000,
      now: opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : 0)),
      track: opts.track ?? ((name, props) => { void Analytics.track(name, props) }),
      breaker: opts.breaker ?? { failures: 3, windowMs: 120_000, openMs: 300_000 },
      retryDelayMs: opts.retryDelayMs ?? 600,
    }
  }

  /** True while the breaker routes everything to the scripted provider (UI can show the offline-coach banner). */
  get breakerOpen(): boolean { return this.o.now() < this.openUntil }

  private recordFailure() {
    const t = this.o.now()
    this.failures = this.failures.filter((x) => t - x < this.o.breaker.windowMs)
    this.failures.push(t)
    if (this.failures.length >= this.o.breaker.failures) { this.openUntil = t + this.o.breaker.openMs; this.failures = [] }
  }

  private async run<T>(task: 'turn' | 'grade', live: (s: AbortSignal) => Promise<T>, fb: () => Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
    if (this.breakerOpen) {
      this.o.track('llm_fallback', { task, reason: 'circuit_open' })
      return fb()
    }
    const t0 = this.o.now()
    let attempt = 0
    let lastErr: unknown
    while (attempt < 2) {
      attempt++
      try {
        const out = await withTimeout(live, timeoutMs, signal)
        this.o.track('llm_call', { task, provider: 'anthropic', status: attempt > 1 ? 'retry' : 'ok', latencyMs: Math.round(this.o.now() - t0), attempt })
        return out
      } catch (e) {
        lastErr = e
        if (signal?.aborted) throw e
        const kind = kindOf(e)
        const retryAfter = e instanceof LLMError ? e.retryAfterMs : undefined
        const remaining = timeoutMs - (this.o.now() - t0)
        if (attempt === 1 && RETRYABLE.includes(kind) && (task === 'grade' || remaining > 2000)) {
          await sleep(Math.min(retryAfter ?? this.o.retryDelayMs, 5000))
          continue
        }
        break
      }
    }
    const kind = kindOf(lastErr)
    if (kind !== 'validator' && kind !== 'schema') this.recordFailure()
    this.o.track('llm_call', { task, provider: 'anthropic', status: 'fallback', errorType: kind, latencyMs: Math.round(this.o.now() - t0) })
    this.o.track('llm_fallback', { task, errorType: kind, message: lastErr instanceof Error ? lastErr.message.slice(0, 160) : undefined })
    return fb()
  }

  nextTurn(ctx: TurnContext, signal?: AbortSignal): Promise<TurnResult> {
    return this.run('turn', (s) => this.primary.nextTurn(ctx, s), () => this.fallback.nextTurn(ctx, signal), this.o.turnTimeoutMs, signal)
  }

  gradeMock(input: GradeInput, signal?: AbortSignal): Promise<GradeResult> {
    return this.run('grade', (s) => this.primary.gradeMock(input, s), () => this.fallback.gradeMock(input, signal), this.o.gradeTimeoutMs, signal)
  }

  async parseUpload(text: string, signal?: AbortSignal): Promise<ParsedQuestion[]> {
    if (!this.primary.parseUpload) return []
    try { return await withTimeout((s) => this.primary.parseUpload!(text, s), 20_000, signal) } catch { return [] }
  }
}
