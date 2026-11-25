/* Runs a nudge's one-tap action: records nudge_acted (via the engine) then performs the CTA.
 * Pseudo-nudges (the "recommended" fallback that isn't stored) skip actOnNudge. */
import type { NavigateFunction } from 'react-router-dom'
import { db } from '@/services/db/db'
import { actOnNudge, startMock, startRetry } from '@/engine/api'
import type { InputMode, MockLength, Nudge, Profile, TopicId } from '@/domain/types'
import { TOPICS } from '@/domain/types'

// CONTRACT-REQUEST: Nudge.cta.payload keys are not typed. This reads topic, questionId, length, mode, feedbackId,
// fixId and mockId from the payload, falling back to nudge.topic / feedbackId / mockId. Pseudo-nudges (Next-up
// fallback not stored in db.nudges) skip actOnNudge and start with entryPoint 'home_next_up'.
// CONTRACT-REQUEST: nudge_sent is expected to be fired by the engine (evaluateNudges), not by Home.
export async function runNudge(n: Nudge, profile: Profile | null | undefined, navigate: NavigateFunction): Promise<void> {
  let stored = false
  try { stored = !!(await db.nudges.get(n.id)) } catch { stored = false }
  if (stored) {
    try { await actOnNudge(n.id) } catch (e) { console.warn('[home] actOnNudge failed', e) }
  }
  const p = n.cta.payload ?? {}
  const mode = (p.mode === 'voice' || p.mode === 'text' ? p.mode : profile?.preferredMode ?? 'text') as InputMode
  const feedbackId = p.feedbackId ?? n.feedbackId
  const mockId = p.mockId ?? n.mockId

  switch (n.cta.action) {
    case 'resume_mock':
      if (mockId) navigate(`/mock/${mockId}`)
      return
    case 'open_feedback':
      if (feedbackId) navigate(`/feedback/${feedbackId}#fixes`)
      return
    case 'start_retry': {
      if (!feedbackId) return
      if (!p.fixId) { navigate(`/feedback/${feedbackId}#fixes`); return }
      const s = await startRetry(feedbackId, p.fixId, mode)
      navigate(`/mock/${s.id}`)
      return
    }
    case 'start_mock': {
      const raw = p.topic ?? n.topic
      const topic: TopicId = raw && (TOPICS as string[]).includes(raw) ? (raw as TopicId) : 'product_design'
      const length: MockLength = p.length === 'standard' ? 'standard' : 'quick'
      const s = await startMock({
        topic,
        questionId: p.questionId || undefined,
        length,
        mode,
        entryPoint: stored ? 'nudge' : 'home_next_up',
        nudgeId: stored ? n.id : undefined,
      })
      navigate(`/mock/${s.id}`)
    }
  }
}

/** Link to configure the mock instead of starting it in one tap. */
export function practiceHref(n: Nudge): string | null {
  if (n.cta.action !== 'start_mock') return null
  const q = new URLSearchParams()
  const topic = n.cta.payload?.topic ?? n.topic
  if (topic) q.set('topic', topic)
  if (n.cta.payload?.questionId) q.set('questionId', n.cta.payload.questionId)
  q.set('entry', 'nudge')
  q.set('nudgeId', n.id)
  return `/practice?${q.toString()}`
}
