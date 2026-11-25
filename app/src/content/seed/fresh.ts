import type { SeedBundle } from './types'

/** Fresh user: no onboarded profile and no history. The engine treats this as a reset. */
export function buildFresh(now: number): SeedBundle {
  return {
    profile: {
      id: 'me',
      selfRatings: {},
      preferredMode: 'text',
      createdAt: now,
      onboardingStep: 1,
      onboardingCompletedAt: undefined,
      isDemo: false,
    },
    sessions: [],
    feedback: [],
    retries: [],
    events: [],
  }
}
