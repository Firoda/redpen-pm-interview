/* Seed loading: curated questions on boot, and the demo seed bundles. */
import type { Nudge, Question, TopicId } from '@/domain/types'
import { CONTENT_VERSION, CURATED_QUESTIONS } from '@/content/questions'
import type { SeedBundle } from '@/content/seed/types'
import { db } from './db'

/** Upsert curated questions when the bundled content version is newer (or the table has none).
 *  Never touches uploads; curated rows no longer bundled are marked retired. */
export async function seedCuratedQuestions(): Promise<{ upserted: number }> {
  const stored = (await db.meta.get('contentVersion'))?.value as number | undefined
  const curatedCount = await db.questions.where('source').equals('curated').count()
  if (stored !== undefined && stored >= CONTENT_VERSION && curatedCount >= CURATED_QUESTIONS.length) return { upserted: 0 }
  await db.transaction('rw', db.questions, db.meta, async () => {
    const ids = new Set(CURATED_QUESTIONS.map((q) => q.id))
    const existing = await db.questions.where('source').equals('curated').toArray()
    const retired: Question[] = existing.filter((q) => !ids.has(q.id)).map((q) => ({ ...q, retired: true }))
    await db.questions.bulkPut([...CURATED_QUESTIONS, ...retired])
    await db.meta.put({ key: 'contentVersion', value: CONTENT_VERSION })
  })
  return { upserted: CURATED_QUESTIONS.length }
}

/** Nudge history implied by a seed: the seeded nudge_sent events become closed rows, and the retry window of
 *  every seeded counted mock is recorded as already offered, so the live rules start from a clean "now". */
export function seedNudgeRows(bundle: SeedBundle, todayStart: number): Nudge[] {
  const rows: Nudge[] = []
  const acted = new Map<string, number>()
  for (const e of bundle.events) if (e.name === 'nudge_acted' && typeof e.props?.nudgeId === 'string') acted.set(e.props.nudgeId as string, e.ts)
  for (const e of bundle.events) {
    if (e.name !== 'nudge_sent') continue
    const p = e.props as Record<string, unknown>
    const id = String(p.nudgeId ?? e.id)
    const at = acted.get(id)
    rows.push({
      id, key: String(p.key ?? id), type: (p.type as Nudge['type']) ?? 'neglected_topic', topic: p.topic as TopicId | undefined,
      title: '', body: '', cta: { label: '', action: 'start_mock', payload: {} }, priority: 5, placement: (p.placement as Nudge['placement']) ?? 'next_up',
      status: at ? 'acted' : 'expired', createdAt: Math.min(e.ts, todayStart - 1), ...(at ? { actedAt: at } : {}),
    })
  }
  for (const s of bundle.sessions) {
    if (!s.counted) continue
    rows.push({
      // no topic and a createdAt before today: history rows must not use up today's caps
      id: `seed-retry-window-${s.id}`, key: `retry_fix:${s.id}`, type: 'retry_fix', mockId: s.id,
      title: '', body: '', cta: { label: '', action: 'start_retry', payload: {} }, priority: 2, placement: 'banner',
      status: 'expired', createdAt: Math.min(s.endedAt ?? s.startedAt, todayStart - 1),
    })
  }
  return rows
}
