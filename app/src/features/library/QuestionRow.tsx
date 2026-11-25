/* One library question: prompt (two lines max), meta, and a Practise action revealed on hover or focus. */
import type { Question } from '@/domain/types'
import { TOPIC_SHORT } from '@/domain/types'
import { Button, Tag, fmtScore } from '@/ui'

export const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const

export function QuestionRow({ q, attempts, best, onOpen, onPractise }: {
  q: Question; attempts: number; best?: number; onOpen: () => void; onPractise: () => void
}) {
  const meta = [
    TOPIC_SHORT[q.topic],
    DIFFICULTY_LABEL[q.difficulty],
    `about ${q.timeboxMin} min`,
    attempts ? `Attempted ${attempts}×${best != null ? ` · best ${fmtScore(best)}` : ''}` : 'Not attempted',
  ].join(' · ')
  return (
    <div className="group relative flex items-center gap-4 rounded-md px-3 py-3 transition-colors duration-100 hover:bg-hover focus-within:bg-hover">
      <button onClick={onOpen} className="min-w-0 flex-1 text-left after:absolute after:inset-0 after:content-[''] focus:outline-none">
        <span className="line-clamp-2 text-headline font-medium text-primary">{q.prompt}</span>
        <span className="mt-1 flex items-center gap-2 text-footnote text-secondary">
          {q.source === 'upload' ? <Tag>Mine</Tag> : null}
          <span className="truncate">{meta}</span>
        </span>
      </button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onPractise}
        className="relative z-10 opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
      >
        Practise
      </Button>
    </div>
  )
}
