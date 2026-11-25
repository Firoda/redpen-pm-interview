/* Zod mirrors of the wire JSON schemas (ai/prompts). Structured outputs already constrain the shape;
 * these re-validate in code and convert wire objects into the app's types. Owner: LIVE_AI agent. */
import { z } from 'zod'
import type { RawGrade } from '@/ai/types'
import type { DimensionId } from '@/domain/types'
import { DIMENSIONS } from '@/domain/types'
import { CANDIDATE_TURN_KINDS, WIRE_MOVES } from '@/ai/prompts/turn'
import { ISSUE_TAG_IDS } from '@/ai/prompts/shared'

const Dim = z.enum(DIMENSIONS as [DimensionId, ...DimensionId[]])

export const WireTurnSchema = z.object({
  candidateTurn: z.enum(CANDIDATE_TURN_KINDS),
  signals: z.object({ idk: z.boolean(), contradiction: z.boolean(), rambling: z.boolean(), injection: z.boolean() }),
  coverageUpdate: z.array(z.object({ area: z.string(), status: z.enum(['covered', 'partial', 'missing']) })),
  move: z.enum(WIRE_MOVES),
  targetDimension: Dim,
  seedId: z.string().nullable(),
  reason: z.string(),
  quoteAnchor: z.string().nullable(),
  say: z.string().trim().min(1),
})
export type WireTurn = z.infer<typeof WireTurnSchema>

const Quote = z.object({ turnId: z.string(), quote: z.string() })

export const WireGradeSchema = z.object({
  dimensions: z.array(
    z.object({
      dimension: Dim,
      evidence: z.array(Quote),
      criteriaMet: z.array(z.string()),
      criteriaMissing: z.array(z.string()),
      score: z.number().int().min(1).max(5),
      reason: z.string(),
    }),
  ).min(1),
  fixes: z.array(
    z.object({
      dimension: Dim,
      issueTag: z.enum(ISSUE_TAG_IDS),
      quote: z.string(),
      turnId: z.string(),
      issue: z.string(),
      instruction: z.string(),
      pattern: z.string().nullable(),
    }),
  ),
  verdict: z.string().trim().min(1),
  strength: z.object({ quote: z.string(), turnId: z.string(), text: z.string() }).nullable(),
  confidence: z.enum(['low', 'medium', 'high']),
})
export type WireGrade = z.infer<typeof WireGradeSchema>

export function toRawGrade(g: WireGrade): RawGrade {
  return {
    dimensions: g.dimensions.map((d) => ({ dimension: d.dimension, score: d.score, reason: d.reason, evidence: d.evidence.slice(0, 2) })),
    fixes: g.fixes.map((f) => ({
      dimension: f.dimension, issueTag: f.issueTag, quote: f.quote, turnId: f.turnId,
      issue: f.issue, instruction: f.instruction, ...(f.pattern ? { pattern: f.pattern } : {}),
    })),
    ...(g.strength ? { strength: g.strength } : {}),
    verdict: g.verdict,
    confidence: g.confidence,
  }
}

/** Minimal shape of a Messages API response that both transports return. */
export const MessageResponseSchema = z.object({
  model: z.string().optional(),
  stop_reason: z.string().nullable().optional(),
  stop_details: z.object({ category: z.string().nullable().optional(), explanation: z.string().nullable().optional() }).passthrough().nullable().optional(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()),
  usage: z.record(z.string(), z.unknown()).optional(),
}).passthrough()
export type MessageResponse = z.infer<typeof MessageResponseSchema>
