/* finalizeGrade: the code half of grading (§6.6–6.7, §7.5–7.6). Runs on every report, live or offline:
   clamp → verify evidence quotes → caps (only lower) → C8 → exactly three fixes on three dimensions ordered by
   weighted gap (quotes verified, else replaced from the offline grader) → strength check → weighted overall. */
import type { FinalizeGrade, RawGrade } from '@/ai/types'
import type { DimensionId, DimensionScore, Fix, GradeInput, GradeResult, IssueTag } from '@/domain/types'
import { DIMENSIONS } from '@/domain/types'
import { wordCount } from '@/domain/text'
import { extractFeatures } from './features'
import { applyCaps, capsFromFeatures, CAP_COPY } from './caps'
import { verifyQuote } from './quotes'
import { clampScore, orderDimensionsForFixes, TOPIC_WEIGHTS, weightedOverall } from './weights'
import { DEFAULT_TAG, isIssueTag, ISSUE_TAGS } from './tags'
import { lintFixText } from './lint'
import { offlineGradeDetailed, offlineFix } from './offlineGrader'

type Meta = Parameters<FinalizeGrade>[2] & { now?: number }

export const finalizeGrade: FinalizeGrade = (raw: RawGrade, input: GradeInput, meta: Meta): GradeResult => {
  const { session, question } = input
  const topic = session.topic
  const f = extractFeatures(session, question)
  const offline = offlineGradeDetailed({ session, question })
  let quoteRepairs = 0
  let quotesDropped = 0

  // 1. Dimensions: clamp, verify evidence, fill gaps from the offline grader.
  const rawByDim = new Map<DimensionId, RawGrade['dimensions'][number]>()
  for (const d of raw.dimensions ?? []) if (DIMENSIONS.includes(d.dimension) && !rawByDim.has(d.dimension)) rawByDim.set(d.dimension, d)
  const rawScores = {} as Record<DimensionId, number>
  const evidence = {} as Record<DimensionId, { quote: string; turnId: string }[]>
  const reasons = {} as Record<DimensionId, string>
  for (const d of DIMENSIONS) {
    const src = rawByDim.get(d) ?? offline.raw.dimensions.find((x) => x.dimension === d)!
    rawScores[d] = clampScore(Number.isFinite(src.score) ? src.score : 1)
    reasons[d] = (src.reason ?? '').trim() || offline.raw.dimensions.find((x) => x.dimension === d)!.reason
    const ev: { quote: string; turnId: string }[] = []
    for (const e of (src.evidence ?? []).slice(0, 2)) {
      const chk = verifyQuote(session, e.quote ?? '', e.turnId)
      if (chk.status === 'unverified') { quotesDropped++; continue }
      if (chk.status === 'repaired') quoteRepairs++
      ev.push({ quote: chk.quote, turnId: chk.turnId })
    }
    evidence[d] = ev
  }

  // 2. Caps C1–C11 (+ C8 for any 4+ without verified evidence). Caps only lower.
  const caps = capsFromFeatures(f)
  const { scores: capped, applied } = applyCaps(rawScores, caps)
  for (const d of DIMENSIONS) {
    if (capped[d] >= 4 && evidence[d].length === 0) {
      applied.push({ cap: CAP_COPY.C8, code: 'C8', dimension: d, from: capped[d], to: 3 })
      capped[d] = 3
    }
  }
  const capsApplied = applied.map(({ cap, dimension, from, to }) => ({ cap, dimension, from, to }))

  // 3. Fixes: exactly three, on three different dimensions, ordered by weighted gap.
  const target = orderDimensionsForFixes(topic, capped).slice(0, 3)
  const usedTurns = new Set<string>()
  const fixes: Fix[] = []
  const rawFixes = (raw.fixes ?? []).filter((x) => DIMENSIONS.includes(x.dimension))
  target.forEach((d, i) => {
    const rank = (i + 1) as 1 | 2 | 3
    let made: Fix | null = null
    for (const rf of rawFixes.filter((x) => x.dimension === d)) {
      const chk = verifyQuote(session, rf.quote ?? '', rf.turnId)
      if (chk.status === 'unverified' || wordCount(chk.quote) < 3) { quotesDropped++; continue }
      if (fixes.some((x) => x.quote === chk.quote)) continue
      if (chk.status === 'repaired') quoteRepairs++
      const issue = lintFixText(rf.issue ?? '')
      const instruction = lintFixText(rf.instruction ?? '')
      if (!issue.text || !instruction.text) continue
      const tag: IssueTag = isIssueTag(rf.issueTag) ? rf.issueTag : DEFAULT_TAG[d]
      made = {
        id: `fx${rank}-${d}`, rank, dimension: d, issueTag: tag, quote: chk.quote, turnId: chk.turnId,
        issue: issue.text, instruction: instruction.text, pattern: rf.pattern ? lintFixText(rf.pattern).text || undefined : undefined,
        source: chk.status === 'repaired' ? 'repaired' : meta.grader === 'llm' ? 'llm' : meta.grader === 'fixture' ? 'fixture' : 'offline',
      }
      break
    }
    if (!made) {
      const of = offlineFix(d, session, f, offline.notes[d], usedTurns)
      if (of) made = { id: `fx${rank}-${d}`, rank, dimension: d, issueTag: of.issueTag as IssueTag, quote: of.quote, turnId: of.turnId, issue: of.issue, instruction: of.instruction, pattern: of.pattern, source: 'offline' }
    }
    if (made) { fixes.push(made); usedTurns.add(made.turnId) }
  })

  // 4. Strength: verify, else drop.
  let strength: GradeResult['strength'] = undefined
  if (raw.strength?.quote) {
    const chk = verifyQuote(session, raw.strength.quote, raw.strength.turnId)
    if (chk.status !== 'unverified') {
      if (chk.status === 'repaired') quoteRepairs++
      strength = { text: lintFixText(raw.strength.text).text || raw.strength.text, quote: chk.quote, turnId: chk.turnId }
    } else quotesDropped++
  }

  const dimensionScores: DimensionScore[] = DIMENSIONS.map((d) => ({
    dimension: d,
    score: clampScore(capped[d]),
    rawScore: clampScore(rawScores[d]),
    reason: reasons[d],
    evidence: evidence[d],
    weight: TOPIC_WEIGHTS[topic][d],
  }))
  const overall = weightedOverall(topic, capped)
  const scoreFlat = new Set(dimensionScores.map((x) => x.score)).size === 1

  return {
    topic,
    questionId: session.questionId,
    counted: session.counted,
    grader: meta.grader,
    model: meta.model,
    promptVersion: meta.promptVersion,
    dimensionScores,
    overall,
    verdict: (raw.verdict ?? '').trim() || offline.raw.verdict,
    fixes,
    strength,
    capsApplied,
    quoteRepairs,
    quotesDropped,
    confidence: scoreFlat && meta.grader === 'llm' ? 'low' : raw.confidence ?? 'medium',
    latencyMs: meta.latencyMs,
    attempts: meta.attempts,
    generatedAt: meta.now ?? Math.max(session.endedAt ?? 0, session.lastActivityAt),
  }
}

/** Check the invariants every stored report must satisfy (used by tests and the seed validator). */
export function checkReportInvariants(g: Pick<GradeResult, 'dimensionScores' | 'fixes' | 'topic' | 'overall'>, session: GradeInput['session']): string[] {
  const errs: string[] = []
  if (g.dimensionScores.length !== 5) errs.push('dimensionScores must have 5 entries')
  if (g.fixes.length !== 3) errs.push('fixes must have exactly 3 entries')
  if (new Set(g.fixes.map((x) => x.dimension)).size !== g.fixes.length) errs.push('fixes must be on distinct dimensions')
  for (const fx of g.fixes) {
    if (verifyQuote(session, fx.quote, fx.turnId).status === 'unverified') errs.push(`fix quote not in transcript: ${fx.quote}`)
    if (!ISSUE_TAGS[fx.issueTag]) errs.push(`unknown tag ${fx.issueTag}`)
  }
  const scores = Object.fromEntries(g.dimensionScores.map((x) => [x.dimension, x.score])) as Record<DimensionId, number>
  if (Math.abs(weightedOverall(g.topic, scores) - g.overall) > 0.05) errs.push('overall does not match weighted scores')
  return errs
}
