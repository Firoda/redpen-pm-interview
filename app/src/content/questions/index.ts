import type { Question } from '@/domain/types'
import productDesign from './product_design.json'
import rca from './rca.json'
import metrics from './metrics.json'
import guesstimate from './guesstimate.json'
import strategy from './strategy.json'
import tech from './tech.json'

export const CONTENT_VERSION = 1

export const CURATED_QUESTIONS: Question[] = [
  ...(productDesign as unknown as Question[]),
  ...(rca as unknown as Question[]),
  ...(metrics as unknown as Question[]),
  ...(guesstimate as unknown as Question[]),
  ...(strategy as unknown as Question[]),
  ...(tech as unknown as Question[]),
]

const TOPIC_IDS = ['product_design', 'rca', 'metrics', 'guesstimate', 'strategy', 'tech']
const DIFFS = ['easy', 'medium', 'hard']
const DIM_IDS = ['structure', 'userFocus', 'prioritisation', 'metrics', 'communication']

/** Returns a list of human-readable problems; empty means the set is valid. */
export function validateQuestions(qs: Question[]): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const q of qs) {
    const at = q?.id ?? '(no id)'
    const bad = (m: string) => problems.push(`${at}: ${m}`)
    if (!q.id) bad('missing id')
    else if (seen.has(q.id)) bad('duplicate id')
    else seen.add(q.id)
    if (!TOPIC_IDS.includes(q.topic)) bad('bad topic')
    if (!q.subtype) bad('missing subtype')
    if (!DIFFS.includes(q.difficulty)) bad('bad difficulty')
    if (!q.timeboxMin) bad('missing timeboxMin')
    if (!q.prompt) bad('missing prompt')
    else if (q.prompt.trim().split(/\s+/).length > 30) bad('prompt over 30 words')
    if (!q.context || !Array.isArray(q.context.hiddenFacts) || q.context.hiddenFacts.length < 2 || q.context.hiddenFacts.length > 5) bad('hiddenFacts must have 2-5 items')
    if (q.topic === 'guesstimate' && !q.context?.referenceAnswer) bad('guesstimate needs referenceAnswer')
    if (!Array.isArray(q.coverage) || q.coverage.length < 3) bad('coverage needs 3+ ids')
    if (!Array.isArray(q.expectedStructure) || q.expectedStructure.length < 4 || q.expectedStructure.length > 6) bad('expectedStructure needs 4-6 beats')
    for (const d of DIM_IDS) if (!q.rubricHints?.[d as keyof Question['rubricHints']]) bad(`rubricHint missing: ${d}`)
    if (!Array.isArray(q.commonPitfalls) || q.commonPitfalls.length < 2) bad('commonPitfalls needs 2+ items')
    const seeds = q.followUpSeeds ?? []
    if (seeds.length < 4) bad('needs 4+ follow-up seeds')
    if (!seeds.some(s => s.isVariantSlot && s.text.includes('{variant}'))) bad('no variant slot seed')
    if (!seeds.some(s => s.probes === 'prioritisation')) bad('no prioritisation seed')
    if (!seeds.some(s => s.probes === 'metrics')) bad('no metrics seed')
    const sids = new Set(seeds.map(s => s.id))
    if (sids.size !== seeds.length) bad('duplicate seed ids')
    if (Object.keys(q.variants ?? {}).length < 2) bad('variants need 2+ axes')
    for (const [axis, vals] of Object.entries(q.variants ?? {})) if (!vals || vals.length < 1 || vals.length > 2) bad(`variant axis ${axis} needs 1-2 values`)
    if (!q.tags?.length) bad('missing tags')
    if (q.source !== 'curated') bad('source must be curated')
    if (q.contentVersion !== CONTENT_VERSION) bad('contentVersion mismatch')
  }
  return problems
}
