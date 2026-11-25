/* Read models for the Practice screen. Prefers the engine selectors; falls back to direct table reads so the
 * screen keeps working if a selector is unavailable. */
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import type { MockSession, Profile, Question, TopicId, TopicStatus } from '@/domain/types'
import { TOPICS } from '@/domain/types'
import { getHomeView } from '@/engine/selectors'
import { recommendQuestion } from '@/engine/api'
import { db } from '@/services/db/db'
import { Clock } from '@/services/clock'
import { useSafeLiveQuery } from '@/features/mock/useSafeLiveQuery'

export interface TopicRow {
  topic: TopicId
  score?: number
  status: TopicStatus
  countedMocks: number
  lastPractisedAt?: number
  isWeakest: boolean
  selfRating?: number
}

export function usePracticeTopics() {
  return useSafeLiveQuery(async () => {
    const profile = (await db.profile.get('me')) ?? null
    let rows: TopicRow[]
    try {
      const hv = await getHomeView()
      rows = hv.topics.map((t) => ({ ...t, selfRating: profile?.selfRatings?.[t.topic] }))
    } catch {
      const stats = await db.topicStats.toArray()
      const by = new Map(stats.map((s) => [s.topic, s]))
      const scored = stats.filter((s) => s.countedMocks > 0 && s.score != null)
      const weakest = scored.length ? scored.reduce((a, b) => ((a.score ?? 9) <= (b.score ?? 9) ? a : b)).topic : null
      rows = TOPICS.map((topic) => {
        const s = by.get(topic)
        return {
          topic, score: s?.score, status: s?.status ?? 'not_started', countedMocks: s?.countedMocks ?? 0,
          lastPractisedAt: s?.lastPractisedAt, isWeakest: topic === weakest, selfRating: profile?.selfRatings?.[topic],
        }
      })
    }
    // Keep the six topics in their canonical order so number keys stay stable.
    rows.sort((a, b) => TOPICS.indexOf(a.topic) - TOPICS.indexOf(b.topic))
    return { rows, profile: profile as Profile | null }
  }, [])
}

export function useTopicQuestions(topic: TopicId) {
  return useLiveQuery(async () => {
    const qs = await db.questions.where('topic').equals(topic).toArray()
    return qs.filter((q) => !q.retired).sort((a, b) => a.id.localeCompare(b.id))
  }, [topic])
}

export function useAttempts(topic: TopicId) {
  return useLiveQuery(async () => {
    const ms = await db.mockSessions.where('topic').equals(topic).toArray()
    const map = new Map<string, { count: number; last: number }>()
    for (const m of ms) {
      if (m.status === 'abandoned') continue
      const cur = map.get(m.questionId) ?? { count: 0, last: 0 }
      map.set(m.questionId, { count: cur.count + 1, last: Math.max(cur.last, m.startedAt) })
    }
    return map
  }, [topic])
}

/** The most recent resumable mock (< 24 h old), if any. */
export function useInProgressMock() {
  return useLiveQuery(async () => {
    const list = await db.mockSessions.where('status').equals('in_progress').toArray()
    const now = Clock.now()
    const live = list.filter((m) => now - m.lastActivityAt < 86_400_000).sort((a, b) => b.lastActivityAt - a.lastActivityAt)
    return (live[0] ?? null) as MockSession | null
  }, [])
}

export function useHasAnyMock() {
  return useLiveQuery(async () => (await db.mockSessions.count()) > 0, [])
}

type Rec = { topic: TopicId; status: 'loading' } | { topic: TopicId; status: 'ready'; question: Question | null }

/** recommendQuestion(topic) with a local fallback (first unretired question for the topic). */
export function useRecommended(topic: TopicId, nonce: number): Rec {
  const [rec, setRec] = useState<Rec>({ topic, status: 'loading' })
  useEffect(() => {
    let alive = true
    setRec({ topic, status: 'loading' })
    ;(async () => {
      let q: Question | null = null
      try {
        q = await recommendQuestion(topic)
      } catch (e) {
        console.warn('[practice] recommendQuestion failed, using local fallback', e)
        const qs = (await db.questions.where('topic').equals(topic).toArray()).filter((x) => !x.retired && x.source === 'curated')
        qs.sort((a, b) => a.id.localeCompare(b.id))
        q = qs.length ? qs[nonce % qs.length] : null
      }
      if (alive) setRec({ topic, status: 'ready', question: q })
    })()
    return () => { alive = false }
  }, [topic, nonce])
  return rec
}
