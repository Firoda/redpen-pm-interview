/* Deterministic caps C1–C11 (§7.4). Computed from the feature vector; they only ever lower scores. */
import type { DimensionId } from '@/domain/types'
import type { Features } from './features'

export type CapCode = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8' | 'C9' | 'C10' | 'C11'

export interface CapRule { code: CapCode; dimension: DimensionId | 'all'; max: number; copy: string }

export const CAP_COPY: Record<CapCode, string> = {
  C1: 'Capped at 3: your answers were too short to show more',
  C2: 'Capped at 2: no success metric named anywhere',
  C3: 'Capped at 2: no choice was made',
  C4: 'Capped at 2: no user or segment named',
  C5: 'Capped at 2: almost no numbers shown',
  C6: 'Capped at 3: no sanity check',
  C7: 'Capped at 3: one follow-up got a one-line answer',
  C8: 'Capped at 3: no quote supports a higher score',
  C9: "Capped at 3: the changed constraint wasn't addressed",
  C10: 'Capped at 3: you asked for a hint here',
  C11: "Capped at 3: one answer was 'I don't know'",
}

export function capsFromFeatures(f: Features): CapRule[] {
  const caps: CapRule[] = []
  const add = (code: CapCode, dimension: CapRule['dimension'], max: number) => caps.push({ code, dimension, max, copy: CAP_COPY[code] })
  if (f.totalWords < 120) add('C1', 'all', 3)
  if (f.topic !== 'guesstimate' && !f.metricTerms) add('C2', 'metrics', 2)
  if (!f.prioritisationLang) add('C3', 'prioritisation', 2)
  if ((f.topic === 'product_design' || f.topic === 'strategy' || f.topic === 'metrics') && f.userTerms.length === 0) add('C4', 'userFocus', 2)
  if (f.topic === 'guesstimate' && f.numbersInMain < 3) add('C5', 'metrics', 2)
  if (f.topic === 'guesstimate' && !f.sanity) add('C6', 'metrics', 3)
  if (f.shortFollowups > 0) add('C7', 'communication', 3)
  if (f.variantAsked && f.variantAnswered && !f.variantAddressed) add('C9', 'structure', 3)
  if (f.hintUsed && f.hintDimension) add('C10', f.hintDimension, 3)
  if (f.idkTurns > 0) add('C11', 'communication', 3)
  return caps
}

/** Apply caps to a score map; returns the capped scores and one record per lowered dimension (lowest cap wins). */
export function applyCaps(scores: Record<DimensionId, number>, caps: CapRule[]): { scores: Record<DimensionId, number>; applied: { cap: string; code: CapCode; dimension: DimensionId; from: number; to: number }[] } {
  const out = { ...scores }
  const applied: { cap: string; code: CapCode; dimension: DimensionId; from: number; to: number }[] = []
  const dims = Object.keys(scores) as DimensionId[]
  for (const d of dims) {
    const relevant = caps.filter((c) => c.dimension === d || c.dimension === 'all')
    if (!relevant.length) continue
    const lowest = relevant.reduce((a, b) => (b.max < a.max ? b : a))
    if (out[d] > lowest.max) {
      applied.push({ cap: lowest.copy, code: lowest.code, dimension: d, from: out[d], to: lowest.max })
      out[d] = lowest.max
    }
  }
  return { scores: out, applied }
}
