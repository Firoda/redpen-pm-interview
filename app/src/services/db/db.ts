import Dexie, { type Table } from 'dexie'
import type {
  AnalyticsEvent, Feedback, MetaRow, MockSession, Nudge, Profile, Question, Retry, Settings, TopicStat, UserUpload,
} from '@/domain/types'

/** IndexedDB via Dexie. Spec: MASTER_PLAN §8.3. Never edit an old version block — add a new one. */
export class RedpenDB extends Dexie {
  profile!: Table<Profile, string>
  settings!: Table<Settings, string>
  questions!: Table<Question, string>
  uploads!: Table<UserUpload, string>
  mockSessions!: Table<MockSession, string>
  feedback!: Table<Feedback, string>
  retries!: Table<Retry, string>
  topicStats!: Table<TopicStat, string>
  nudges!: Table<Nudge, string>
  events!: Table<AnalyticsEvent, string>
  meta!: Table<MetaRow, string>

  constructor() {
    super('redpen')
    this.version(1).stores({
      profile: 'id',
      settings: 'id',
      questions: 'id, topic, [topic+subtype], difficulty, source, uploadId',
      uploads: 'id, createdAt',
      mockSessions: 'id, questionId, topic, status, startedAt, endedAt, retryOf, [topic+endedAt]',
      feedback: 'id, mockId, topic, generatedAt, openedAt, fixesViewedAt',
      retries: 'id, originalMockId, &newMockId',
      topicStats: 'topic',
      nudges: 'id, key, type, status, createdAt',
      events: 'id, name, ts, mockId, [name+ts]',
      meta: 'key',
    })
  }
}

export const db = new RedpenDB()

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  ai: { mode: 'scripted', keyStorage: 'session', useProxy: false, graderQuality: 'fast' },
  voice: { lang: 'en-IN', ttsEnabled: true, rate: 1.0, autoSend: false },
  nudges: { muted: false, mutedTypes: [] },
  mock: { defaultLength: 'standard', weeklyGoal: 3 },
  theme: 'light',
  demo: { enabled: false, clockOffsetMs: 0, showEventLog: false, minScoringMs: 2400 },
}

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings')
  return s ? { ...DEFAULT_SETTINGS, ...s, ai: { ...DEFAULT_SETTINGS.ai, ...s.ai }, voice: { ...DEFAULT_SETTINGS.voice, ...s.voice }, demo: { ...DEFAULT_SETTINGS.demo, ...s.demo } } : DEFAULT_SETTINGS
}

export async function updateSettings(patch: Partial<Settings> | ((s: Settings) => Settings)) {
  const cur = await getSettings()
  const next = typeof patch === 'function' ? patch(cur) : { ...cur, ...patch }
  await db.settings.put(next)
  return next
}
