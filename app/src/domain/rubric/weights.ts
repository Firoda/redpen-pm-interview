import type { DimensionId, Score, TopicId } from '@/domain/types'
import { DIMENSIONS } from '@/domain/types'

/** Topic weights (§7.4). Each row sums to 1.0. */
export const TOPIC_WEIGHTS: Record<TopicId, Record<DimensionId, number>> = {
  product_design: { structure: 0.2, userFocus: 0.3, prioritisation: 0.25, metrics: 0.1, communication: 0.15 },
  rca: { structure: 0.3, userFocus: 0.1, prioritisation: 0.2, metrics: 0.25, communication: 0.15 },
  metrics: { structure: 0.2, userFocus: 0.15, prioritisation: 0.15, metrics: 0.35, communication: 0.15 },
  guesstimate: { structure: 0.35, userFocus: 0.05, prioritisation: 0.1, metrics: 0.35, communication: 0.15 },
  strategy: { structure: 0.25, userFocus: 0.15, prioritisation: 0.25, metrics: 0.15, communication: 0.2 },
  tech: { structure: 0.25, userFocus: 0.15, prioritisation: 0.15, metrics: 0.1, communication: 0.35 },
}

/** round1(x) = floor(x × 10 + 0.5) / 10 — half up, one decimal (with an epsilon for float noise). */
export function round1(x: number): number {
  return Math.floor(x * 10 + 0.5 + 1e-9) / 10
}

export function weightedOverall(topic: TopicId, scores: Partial<Record<DimensionId, number>>): number {
  const w = TOPIC_WEIGHTS[topic]
  let sum = 0
  for (const d of DIMENSIONS) sum += w[d] * (scores[d] ?? 1)
  return round1(sum)
}

export function clampScore(n: number): Score {
  const r = Math.round(n)
  return (r < 1 ? 1 : r > 5 ? 5 : r) as Score
}

/** Display label for a dimension; metrics reads as "Numbers & maths" for guesstimates. */
export function dimensionLabelFor(topic: TopicId, d: DimensionId): string {
  if (d === 'metrics' && topic === 'guesstimate') return 'Numbers & maths'
  return { structure: 'Structure', userFocus: 'User focus', prioritisation: 'Prioritisation', metrics: 'Metrics', communication: 'Communication' }[d]
}

/** Weighted gap used to order fixes: weight × max(0, 4 − score). */
export function weightedGap(topic: TopicId, d: DimensionId, score: number): number {
  return TOPIC_WEIGHTS[topic][d] * Math.max(0, 4 - score)
}

/** Order dimensions for fixes (§7.5 rule 1). */
export function orderDimensionsForFixes(topic: TopicId, scores: Record<DimensionId, number>): DimensionId[] {
  const w = TOPIC_WEIGHTS[topic]
  return [...DIMENSIONS].sort((a, b) => {
    const ga = weightedGap(topic, a, scores[a]), gb = weightedGap(topic, b, scores[b])
    if (Math.abs(gb - ga) > 1e-9) return gb - ga
    // both zero gap (≥ 4): lowest score first, then higher weight
    if (ga === 0 && gb === 0 && scores[a] !== scores[b]) return scores[a] - scores[b]
    if (w[b] !== w[a]) return w[b] - w[a]
    if (scores[a] !== scores[b]) return scores[a] - scores[b]
    return DIMENSIONS.indexOf(a) - DIMENSIONS.indexOf(b)
  })
}
