/* Question recommendation and variant choice. Pure. */
import type { Difficulty, MockSession, Question, TopicId, VariantAxis } from '@/domain/types'

const DAY = 86_400_000
const AXES: VariantAxis[] = ['user', 'market', 'constraint']

export function targetDifficulty(topicScore: number | undefined): Difficulty[] {
  if (topicScore === undefined || topicScore < 2.5) return ['easy', 'medium', 'hard']
  if (topicScore < 3.5) return ['medium', 'easy', 'hard']
  return ['hard', 'medium', 'easy']
}

/** Difficulty ladder by topic score; avoids questions attempted in the last 14 days; stable tie-break by id. */
export function pickQuestion(questions: Question[], sessions: MockSession[], topic: TopicId, topicScore: number | undefined, now: number): Question | null {
  const pool = questions.filter((q) => q.topic === topic && !q.retired)
  if (!pool.length) return null
  const lastAttempt = new Map<string, number>()
  const attempts = new Map<string, number>()
  for (const s of sessions) {
    lastAttempt.set(s.questionId, Math.max(lastAttempt.get(s.questionId) ?? 0, s.startedAt))
    attempts.set(s.questionId, (attempts.get(s.questionId) ?? 0) + 1)
  }
  const fresh = pool.filter((q) => now - (lastAttempt.get(q.id) ?? -Infinity) >= 14 * DAY)
  const candidates = fresh.length ? fresh : pool
  const ladder = targetDifficulty(topicScore)
  return [...candidates].sort((a, b) => {
    const da = ladder.indexOf(a.difficulty), db = ladder.indexOf(b.difficulty)
    if (da !== db) return da - db
    const aa = attempts.get(a.id) ?? 0, ab = attempts.get(b.id) ?? 0
    if (aa !== ab) return aa - ab
    if (a.source !== b.source) return a.source === 'curated' ? -1 : 1
    return a.id.localeCompare(b.id, undefined, { numeric: true })
  })[0]
}

/** "Surprise me": cycle axes user → market → constraint across attempts of the same question; first unseen value. */
export function pickVariant(question: Question, previous: MockSession[]): { axis: VariantAxis; value: string } | null {
  const axes = AXES.filter((a) => (question.variants?.[a]?.length ?? 0) > 0)
  if (!axes.length) return null
  const attempts = previous.filter((s) => s.questionId === question.id)
  const seen = new Set(attempts.map((s) => s.variant && `${s.variant.axis}|${s.variant.value}`).filter(Boolean) as string[])
  const start = attempts.length % axes.length
  for (let i = 0; i < axes.length; i++) {
    const axis = axes[(start + i) % axes.length]
    const value = question.variants[axis]!.find((v) => !seen.has(`${axis}|${v}`))
    if (value) return { axis, value }
  }
  const axis = axes[start]
  return { axis, value: question.variants[axis]![0] }
}

/** Demo pins (§12.1): in demo mode the Metrics recommendation is met-101 with the fee variant. */
export const DEMO_PINS: Partial<Record<TopicId, { questionId: string; variant?: { axis: VariantAxis; index: number } }>> = {
  metrics: { questionId: 'met-101', variant: { axis: 'constraint', index: 0 } },
}
