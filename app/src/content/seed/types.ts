import type { AnalyticsEvent, Feedback, MockSession, Profile, Retry } from '@/domain/types'

export interface SeedBundle {
  profile: Profile
  sessions: MockSession[]
  feedback: Feedback[]
  retries: Retry[]
  events: AnalyticsEvent[]
}
