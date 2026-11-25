/* Live InterviewAI: Claude via the user's browser key or the /api/claude proxy.
 * Builds prompts from ai/prompts, enforces JSON with structured outputs (output_config.format), re-validates with zod,
 * runs the engine's interviewer-line validator (one repair), and hands grades to the engine's finalizeGrade.
 * Never falls back by itself: every failure is an LLMError, and ai/resilient (ENGINE) falls back to scripted.
 * Owner: LIVE_AI agent. */
import type { FinalizeGrade, InterviewAI, RawGrade, ValidateInterviewerLine } from '@/ai/types'
import { LLMError } from '@/ai/types'
import type { DimensionId, GradeInput, GradeResult, GraderQuality, TurnContext, TurnFlag, TurnResult } from '@/domain/types'
import { DIMENSIONS } from '@/domain/types'
import {
  FILLS_FOLLOWUP_SLOT, TURN_JSON_SCHEMA, TURN_PROMPT_VERSION, WIRE_TO_DOMAIN_MOVE,
  buildTurnRepair, buildTurnSystem, buildTurnUser, planTurn, type TurnPlan,
} from '@/ai/prompts/turn'
import { GRADE_JSON_SCHEMA, GRADE_PROMPT_VERSION, buildGradeRepair, buildGradeSystem, buildGradeUser } from '@/ai/prompts/grade'
import { ISSUE_TAG_HOME, quoteInCandidateTurns, wordCount } from '@/ai/prompts/shared'
import { WireGradeSchema, WireTurnSchema, toRawGrade, type MessageResponse, type WireGrade, type WireTurn } from './schemas'
import { proxyTransport, sdkTransport, type CallSpec, type LiveModel, type MessagesRequest, type Transport } from './transport'

export { LLMError }
export type { Transport } from './transport'

/* ---------------- provider settings (MASTER_PLAN §6.12, confirmed against the current API reference) ---------------- */

interface CallConfig {
  model: LiveModel
  effort: 'low' | 'medium' | 'high'
  thinking: { type: 'disabled' } | { type: 'adaptive' }
  maxTokens: number
  timeoutMs: number
  /** Server-side refusal fallback. Not offered on Haiku 5.5; recommended on Sonnet 5.5 and Opus 5.5. */
  refusalFallback: boolean
}

/** Turn call: fastest model, effort low, thinking disabled (Haiku 5.5 accepts `disabled` at effort high or below). */
export const TURN_CALL: CallConfig = { model: 'claude-haiku-5-5', effort: 'low', thinking: { type: 'disabled' }, maxTokens: 1024, timeoutMs: 8000, refusalFallback: false }

/** Grade call by quality. Thinking stays adaptive: Sonnet 5.5 and Opus 5.5 reject `disabled`, and grading benefits from it.
 *  max_tokens counts thinking too, so it is generous (the proxy caps at 8000). */
export const GRADER_CALL: Record<GraderQuality, CallConfig> = {
  fast: { model: 'claude-haiku-5-5', effort: 'medium', thinking: { type: 'adaptive' }, maxTokens: 8000, timeoutMs: 45_000, refusalFallback: false },
  thorough: { model: 'claude-sonnet-5-5', effort: 'medium', thinking: { type: 'adaptive' }, maxTokens: 8000, timeoutMs: 45_000, refusalFallback: true },
  max: { model: 'claude-opus-5-5', effort: 'low', thinking: { type: 'adaptive' }, maxTokens: 8000, timeoutMs: 45_000, refusalFallback: true },
}

const TURN_REPAIR_BUDGET_MS = 4000 // regenerate only if under 4 s were spent (MASTER_PLAN §6.5)
const GRADE_OVERALL_MS = 90_000 // 45 s per attempt, 90 s overall (MASTER_PLAN §6.9)
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

export interface LiveDeps {
  finalizeGrade: FinalizeGrade
  validateLine: ValidateInterviewerLine
  getKey: () => string | null
  useProxy: boolean
  quality: GraderQuality
  /** Tests inject a fake; production picks the SDK or the proxy from useProxy. */
  transport?: Transport
}

/** TurnResult plus planner notes the engine may store. CONTRACT-REQUEST (ENGINE): consider adding optional
 *  `coverage`, `reason`, `quoteAnchor`, `promptVersion`, `model` to TurnResult / Turn so they persist. */
export interface LiveTurnResult extends TurnResult {
  coverage: Record<string, 'covered' | 'partial' | 'missing'>
  reason: string
  quoteAnchor: string | null
  promptVersion: string
  model: string
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : 0)

function pickTransport(deps: LiveDeps): Transport {
  return deps.transport ?? (deps.useProxy ? proxyTransport() : sdkTransport(deps.getKey))
}

function buildSpec(cfg: CallConfig, system: string, user: string, schema: Record<string, unknown> | null): CallSpec {
  const body: MessagesRequest = {
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    thinking: cfg.thinking,
    output_config: schema ? { effort: cfg.effort, format: { type: 'json_schema', schema } } : { effort: cfg.effort },
  }
  if (cfg.refusalFallback) {
    body.fallbacks = 'default'
    return { body, betas: [FALLBACK_BETA] }
  }
  return { body }
}

/** Reads the JSON text out of a response, after checking why the model stopped. */
export function extractJson(res: MessageResponse): unknown {
  if (res.stop_reason === 'refusal') {
    const cat = res.stop_details?.category
    throw new LLMError('refusal', `The model declined this request${cat ? ` (${cat})` : ''}.`)
  }
  if (res.stop_reason === 'max_tokens') throw new LLMError('max_tokens', 'The response was cut off at the token limit.')
  const text = res.content.filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('').trim()
  if (!text) throw new LLMError('schema', 'The response had no text.')
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(cleaned)
  } catch {
    throw new LLMError('schema', 'The response was not valid JSON.')
  }
}

function parseWith<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } }, value: unknown, what: string): T {
  const r = schema.safeParse(value)
  if (r.success) return r.data
  const first = r.error.issues[0]
  throw new LLMError('schema', `${what} did not match the schema${first ? ` at ${first.path.join('.') || '(root)'}: ${first.message}` : ''}.`)
}

/* ---------------- turn ---------------- */

export function checkTurn(wire: WireTurn, ctx: TurnContext, plan: TurnPlan, validateLine: ValidateInterviewerLine): { ok: true } | { ok: false; reason: string } {
  if (!plan.allowedMoves.includes(wire.move)) {
    return { ok: false, reason: `the move "${wire.move}" is not allowed this turn; choose one of: ${plan.allowedMoves.join(', ')}` }
  }
  return validateLine(wire.say.trim(), ctx)
}

export function toTurnResult(wire: WireTurn, ctx: TurnContext, latencyMs: number, model: string): LiveTurnResult {
  const flags: TurnFlag[] = []
  if (wire.signals.idk || wire.candidateTurn === 'idk') flags.push('idk')
  if (wire.candidateTurn === 'off_topic') flags.push('off_topic')
  if (wire.signals.injection) flags.push('injection')
  const seedOk = wire.seedId && ctx.question.followUpSeeds.some((s) => s.id === wire.seedId)
  return {
    move: WIRE_TO_DOMAIN_MOVE[wire.move],
    say: wire.say.trim(),
    targetDimension: wire.targetDimension,
    ...(seedOk ? { seedId: wire.seedId as string } : {}),
    isVariant: wire.move === 'ask_variant',
    countsAsFollowup: FILLS_FOLLOWUP_SLOT.has(wire.move),
    flags,
    generatedBy: 'llm',
    latencyMs: Math.round(latencyMs),
    coverage: Object.fromEntries(wire.coverageUpdate.map((c) => [c.area, c.status])),
    reason: wire.reason,
    quoteAnchor: wire.quoteAnchor,
    promptVersion: TURN_PROMPT_VERSION,
    model,
  }
}

/* ---------------- grade ---------------- */

/** Code-side checks that strict schemas cannot express (BUILD_PROMPT_STRUCTURE B.6). Each problem is phrased for the repair call. */
export function checkGrade(g: WireGrade, input: GradeInput): string[] {
  const problems: string[] = []
  const dims = g.dimensions.map((d) => d.dimension)
  const missing = DIMENSIONS.filter((d) => !dims.includes(d))
  if (missing.length) problems.push(`the dimensions list is missing: ${missing.join(', ')}`)
  if (dims.length !== new Set(dims).size || dims.length !== 5) problems.push('there must be exactly five dimension objects, one per dimension')
  if (g.fixes.length !== 3) problems.push(`there must be exactly three fixes, not ${g.fixes.length}`)
  const fixDims = g.fixes.map((f) => f.dimension)
  if (new Set(fixDims).size !== fixDims.length) problems.push('two fixes are on the same dimension; each fix needs a different dimension')
  g.fixes.forEach((f, i) => {
    const n = i + 1
    if (ISSUE_TAG_HOME[f.issueTag] !== f.dimension) problems.push(`fix ${n} uses the tag ${f.issueTag}, which belongs to ${ISSUE_TAG_HOME[f.issueTag]}, not ${f.dimension}`)
    const w = wordCount(f.quote)
    if (w < 4 || w > 25) problems.push(`fix ${n} quotes ${w} words; quotes must be 4 to 25 words`)
    else if (!quoteInCandidateTurns(f.quote, input.session.turns)) problems.push(`fix ${n} quotes text that does not appear in the candidate's turns`)
  })
  return problems
}

/** One object per dimension in the fixed order (first wins on duplicates). Missing dimensions are left for finalizeGrade. */
function orderDimensions(raw: RawGrade): RawGrade {
  const byDim = new Map<DimensionId, RawGrade['dimensions'][number]>()
  for (const d of raw.dimensions) if (!byDim.has(d.dimension)) byDim.set(d.dimension, d)
  return { ...raw, dimensions: DIMENSIONS.filter((d) => byDim.has(d)).map((d) => byDim.get(d)!) }
}

/* ---------------- factory ---------------- */

export function createLiveInterviewAI(deps: LiveDeps): InterviewAI {
  const transport = pickTransport(deps)

  async function call<T>(spec: CallSpec, timeoutMs: number, signal: AbortSignal | undefined, parse: (v: unknown) => T): Promise<{ data: T; model: string }> {
    const res = await transport(spec, { signal, timeoutMs })
    return { data: parse(extractJson(res)), model: res.model ?? spec.body.model }
  }

  return {
    id: 'live',

    async nextTurn(ctx: TurnContext, signal?: AbortSignal): Promise<TurnResult> {
      const t0 = now()
      const plan = planTurn(ctx)
      const system = buildTurnSystem(ctx)
      const user = buildTurnUser(ctx, plan)
      const parse = (v: unknown) => parseWith(WireTurnSchema, v, 'The turn')

      let { data: wire, model } = await call(buildSpec(TURN_CALL, system, user, TURN_JSON_SCHEMA), TURN_CALL.timeoutMs, signal, parse)
      let check = checkTurn(wire, ctx, plan, deps.validateLine)
      if (!check.ok) {
        const spent = now() - t0
        if (spent >= TURN_REPAIR_BUDGET_MS) throw new LLMError('validator', check.reason)
        const repaired = await call(
          buildSpec(TURN_CALL, system, buildTurnRepair(user, wire.say, check.reason), TURN_JSON_SCHEMA),
          Math.max(1000, TURN_CALL.timeoutMs - spent), signal, parse,
        )
        wire = repaired.data
        model = repaired.model
        check = checkTurn(wire, ctx, plan, deps.validateLine)
        if (!check.ok) throw new LLMError('validator', check.reason)
      }
      return toTurnResult(wire, ctx, now() - t0, model)
    },

    async gradeMock(input: GradeInput, signal?: AbortSignal): Promise<GradeResult> {
      const t0 = now()
      const cfg = GRADER_CALL[input.quality ?? deps.quality]
      const system = buildGradeSystem(input.question.topic)
      const user = buildGradeUser(input)
      const parse = (v: unknown) => parseWith(WireGradeSchema, v, 'The assessment')

      let attempts = 1
      let best: { data: WireGrade; model: string } | null = null
      let problems: string[] = []
      try {
        best = await call(buildSpec(cfg, system, user, GRADE_JSON_SCHEMA), cfg.timeoutMs, signal, parse)
        problems = checkGrade(best.data, input)
      } catch (e) {
        // Only a malformed answer earns a repair; transport errors go straight to the resilient layer.
        if (!(e instanceof LLMError) || e.kind !== 'schema') throw e
        problems = [e.message]
      }

      const spent = now() - t0
      if (problems.length && spent < cfg.timeoutMs) {
        attempts = 2
        try {
          const second = await call(buildSpec(cfg, system, buildGradeRepair(user, problems), GRADE_JSON_SCHEMA), Math.min(cfg.timeoutMs, GRADE_OVERALL_MS - spent), signal, parse)
          const secondProblems = checkGrade(second.data, input)
          if (!best || secondProblems.length <= problems.length) best = second
        } catch (e) {
          if (!best) throw e // nothing usable from either attempt
        }
      }
      if (!best) throw new LLMError('schema', problems[0] ?? 'The assessment could not be read.')

      // Remaining problems (a misquote, a duplicate dimension) are repaired by finalizeGrade in code.
      const raw = orderDimensions(toRawGrade(best.data))
      return deps.finalizeGrade(raw, input, {
        grader: 'llm', model: best.model, promptVersion: GRADE_PROMPT_VERSION, latencyMs: Math.round(now() - t0), attempts,
      })
    },
  }
}

/* ---------------- connection test (Settings) ---------------- */

const PING_TIMEOUT_MS = 15_000

export async function pingLive(deps: Pick<LiveDeps, 'getKey' | 'useProxy' | 'transport'>): Promise<{ ok: boolean; latencyMs?: number; message: string }> {
  const transport = deps.transport ?? (deps.useProxy ? proxyTransport() : sdkTransport(deps.getKey))
  const spec: CallSpec = {
    body: {
      model: 'claude-haiku-5-5',
      max_tokens: 16,
      system: [{ type: 'text', text: 'This is a connection check. Reply with the single word OK.' }],
      messages: [{ role: 'user', content: 'OK?' }],
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
    },
  }
  const t0 = now()
  try {
    await transport(spec, { timeoutMs: PING_TIMEOUT_MS })
    const latencyMs = Math.round(now() - t0)
    return { ok: true, latencyMs, message: `Connected. Claude replied in ${latencyMs} ms.` }
  } catch (e) {
    return { ok: false, message: pingMessage(e, deps.useProxy) }
  }
}

function pingMessage(e: unknown, proxy: boolean): string {
  if (!(e instanceof LLMError)) return 'Something went wrong while testing the connection.'
  switch (e.kind) {
    case 'no_key': return 'Add your Anthropic API key first.'
    case 'auth': return proxy ? 'The server key is missing or was rejected. Set ANTHROPIC_API_KEY in Vercel.' : 'The key was rejected. Check it and try again.'
    case 'rate_limit': return 'Rate limited. Try again in a minute.'
    case 'overloaded': return 'Claude is busy right now. Try again shortly.'
    case 'network': return proxy ? 'Could not reach /api/claude. It runs only on the Vercel deployment.' : 'Could not reach the Anthropic API. Check your connection.'
    case 'timeout': return 'No reply within 15 seconds.'
    default: return e.message
  }
}
