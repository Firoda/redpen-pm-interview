import { db } from './db/db'
import { Clock } from './clock'
import { newId } from './id'

/** Canonical event names. The 8 GAME events (MASTER_PLAN §9.2) keep exact names. */
export type EventName =
  | 'mock_started' | 'mock_completed' | 'feedback_opened' | 'feedback_rated' | 'question_reattempted'
  | 'tracker_viewed' | 'nudge_sent' | 'nudge_acted'
  // supporting
  | 'onboarding_step_completed' | 'onboarding_completed' | 'first_question_shown' | 'turn_submitted'
  | 'mode_switched' | 'mock_ended_early' | 'mock_abandoned' | 'fixes_viewed' | 'retry_completed'
  | 'nudge_dismissed' | 'wtp_shown' | 'wtp_answered' | 'upload_completed' | 'upload_failed'
  | 'library_viewed' | 'jd_fake_door_clicked' | 'llm_call' | 'llm_fallback' | 'voice_error'
  | 'settings_changed' | 'data_exported' | 'data_reset' | 'demo_seed_loaded'
  // engine additions (MASTER_PLAN §9.2 supporting events)
  | 'followup_asked' | 'clarification_asked' | 'feedback_generated' | 'feedback_failed' | 'nudge_resolved'
  | 'upload_deleted' | 'data_imported' | 'demo_clock_changed' | 'provider_tested' | 'mock_resumed'
  | 'tracker_cta_clicked' | 'metrics_viewed' | 'events_exported' | 'nudge_muted'

type Listener = (e: { name: EventName; props: Record<string, unknown>; ts: number }) => void
const listeners = new Set<Listener>()

export const Analytics = {
  async track(name: EventName, props: Record<string, unknown> = {}, opts: { mockId?: string } = {}) {
    const ts = Clock.now()
    listeners.forEach((l) => l({ name, props, ts }))
    try {
      await db.events.add({ id: newId(), name, ts, mockId: opts.mockId, props, source: 'user' })
    } catch (err) {
      console.warn('[analytics] failed to write event', name, err)
    }
  },
  /** Live mirror for the demo event-log overlay. */
  subscribe(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn) } },
}
