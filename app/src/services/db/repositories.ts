/* Small repository helpers over Dexie used by the engine. Each write that changes product state also emits its
   event from the engine, not from here. */
import type { MockSession, Profile, Question, TopicId } from '@/domain/types'
import { computeAllTopicStats, weakestTopic } from '@/domain/scoring'
import { uploadSeeds } from '@/domain/mock/templates'
import { db } from './db'

export const USER_TABLES = ['profile', 'uploads', 'mockSessions', 'feedback', 'retries', 'topicStats', 'nudges', 'events', 'meta'] as const

export async function getProfile(): Promise<Profile | null> {
  return (await db.profile.get('me')) ?? null
}

export function defaultProfile(now: number): Profile {
  return { id: 'me', selfRatings: {}, preferredMode: 'text', createdAt: now, onboardingStep: 1, isDemo: false }
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}
export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

/** The question for a session; when it was deleted (an upload), rebuild a minimal one from the snapshot (E-22). */
export async function getQuestionForSession(s: MockSession): Promise<Question> {
  const q = await db.questions.get(s.questionId)
  if (q) return q
  const snap = s.questionSnapshot
  return {
    id: s.questionId, topic: snap.topic, subtype: snap.subtype, difficulty: snap.difficulty, timeboxMin: 12, prompt: snap.prompt,
    context: { setup: snap.setup, hiddenFacts: [] }, coverage: [], expectedStructure: [], rubricHints: {}, commonPitfalls: [],
    followUpSeeds: uploadSeeds(snap.topic, s.questionId), variants: {}, tags: [], source: snap.source, contentVersion: 0,
  }
}

/** Rebuild the topicStats cache and the highlighted weakest topic. Call inside a rw transaction on
 *  [mockSessions, feedback, topicStats, meta] or on its own. */
export async function recomputeTopicStats(now: number): Promise<{ weakest: TopicId | null }> {
  const [sessions, feedback] = await Promise.all([db.mockSessions.toArray(), db.feedback.toArray()])
  const stats = computeAllTopicStats(sessions, feedback, now)
  await db.topicStats.bulkPut(stats)
  const prev = (await db.meta.get('weakestTopic'))?.value as TopicId | undefined
  const weakest = weakestTopic(stats, prev ?? null)
  await db.meta.put({ key: 'weakestTopic', value: weakest })
  return { weakest }
}

export async function clearUserTables(): Promise<void> {
  await db.transaction('rw', [db.profile, db.uploads, db.mockSessions, db.feedback, db.retries, db.topicStats, db.nudges, db.events, db.meta, db.questions], async () => {
    await Promise.all([db.profile.clear(), db.uploads.clear(), db.mockSessions.clear(), db.feedback.clear(), db.retries.clear(), db.topicStats.clear(), db.nudges.clear(), db.events.clear()])
    const keep = await db.meta.get('contentVersion')
    await db.meta.clear()
    if (keep) await db.meta.put(keep)
    await db.questions.where('source').equals('upload').delete()
  })
}
