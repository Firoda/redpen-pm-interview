/* Local fallback for selectors.getReportView — used only if the selector throws, so a stored report can always
 * be opened. Mirrors the ReportView contract with plain table reads. */
import type { DimensionId, Retry } from '@/domain/types'
import { getReportView, type ReportView } from '@/engine/selectors'
import { db } from '@/services/db/db'

export async function buildReportViewLocal(feedbackId: string): Promise<ReportView | null> {
  const feedback = await db.feedback.get(feedbackId)
  if (!feedback) return null
  const mock = await db.mockSessions.get(feedback.mockId)
  if (!mock) return null
  const question = (await db.questions.get(feedback.questionId)) ?? null
  const profile = await db.profile.get('me')
  const selfRating = (profile?.originalSelfRatings ?? profile?.selfRatings)?.[feedback.topic]

  let retry: (Retry & { targetDimension: DimensionId }) | null = null
  let retryOf: ReportView['retryOf'] = null
  if (mock.retryOf) {
    const row = await db.retries.where('newMockId').equals(mock.id).first()
    const origMock = await db.mockSessions.get(mock.retryOf)
    const origFb = origMock?.feedbackId ? await db.feedback.get(origMock.feedbackId) : (await db.feedback.where('mockId').equals(mock.retryOf).first())
    if (origMock && origFb) retryOf = { feedback: origFb, mock: origMock }
    const target = row?.targetDimension ?? mock.targetDimension
    if (target) {
      const before = row?.before ?? origFb?.dimensionScores.find((d) => d.dimension === target)?.score
      const after = row?.after ?? feedback.dimensionScores.find((d) => d.dimension === target)?.score
      retry = {
        id: row?.id ?? `local-${mock.id}`, originalMockId: mock.retryOf, newMockId: mock.id, fixId: row?.fixId ?? mock.retryFixId,
        targetDimension: target, sameQuestion: row?.sameQuestion ?? true, within72h: row?.within72h ?? true,
        startedAt: row?.startedAt ?? mock.startedAt, completedAt: row?.completedAt, before, after,
        uplift: before != null && after != null ? after - before : undefined,
        overallBefore: row?.overallBefore ?? origFb?.overall, overallAfter: row?.overallAfter ?? feedback.overall,
      }
    }
  }

  const earlierCounted = (await db.feedback.toArray()).some((f) => f.id !== feedback.id && f.counted && f.generatedAt < feedback.generatedAt)
  return {
    feedback, mock, question, retry, retryOf, selfRating,
    isFirstReport: feedback.counted && !earlierCounted,
    isPracticeOnly: !feedback.counted,
  }
}

export async function loadReportView(feedbackId: string): Promise<ReportView | null> {
  try {
    return await getReportView(feedbackId)
  } catch (e) {
    console.warn('[report] getReportView failed, using local read', e)
    return buildReportViewLocal(feedbackId)
  }
}
