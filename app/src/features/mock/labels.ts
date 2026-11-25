import type { Difficulty, TopicStatus } from '@/domain/types'

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

export const STATUS_LABEL: Record<TopicStatus, string> = {
  not_started: 'Not started',
  building: 'Building',
  getting_there: 'Getting there',
  consistent: 'Consistent',
}
