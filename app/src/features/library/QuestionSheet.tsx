/* Question preview side sheet: full prompt, setup, difficulty, timebox and what the round tests.
 * Hidden facts, rubric hints and follow-up seeds are never shown. */
import type { Question } from '@/domain/types'
import { TOPIC_LABEL } from '@/domain/types'
import { Button, Sheet, Tag, fmtScore } from '@/ui'
import { TOPIC_TESTS, plural } from '@/features/home/format'
import { DIFFICULTY_LABEL } from './QuestionRow'

export function QuestionSheet({ q, attempts, best, onClose, onStart }: {
  q: Question | null; attempts: number; best?: number; onClose: () => void; onStart: (q: Question) => void
}) {
  return (
    <Sheet
      open={!!q}
      onOpenChange={(o) => { if (!o) onClose() }}
      title={q ? TOPIC_LABEL[q.topic] : ''}
      width={480}
      footer={q ? (
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={() => onStart(q)}>Start this question</Button>
        </>
      ) : null}
    >
      {q ? (
        <div className="animate-rise">
          <div className="flex flex-wrap items-center gap-2">
            <Tag>{DIFFICULTY_LABEL[q.difficulty]}</Tag>
            <Tag>About {q.timeboxMin} min</Tag>
            {q.source === 'upload' ? <Tag>Your upload</Tag> : <Tag>Curated</Tag>}
          </div>
          <h3 className="mt-4 text-title-2 text-primary">{q.prompt}</h3>
          {q.context.setup ? <p className="mt-3 text-reading text-secondary">{q.context.setup}</p> : null}

          <dl className="mt-8 flex flex-col gap-5">
            <div>
              <dt className="text-footnote text-secondary">What this round tests</dt>
              <dd className="mt-1 text-body text-primary">{TOPIC_TESTS[q.topic]}.</dd>
            </div>
            <div>
              <dt className="text-footnote text-secondary">How it runs</dt>
              <dd className="mt-1 text-body text-primary">
                Your main answer, then 2 follow-ups in a Quick mock or 3 in a Standard one. Meera may change one fact of the case.
              </dd>
            </div>
            <div>
              <dt className="text-footnote text-secondary">Your history</dt>
              <dd className="mt-1 text-body text-primary">
                {attempts ? `${plural(attempts, 'attempt')}${best != null ? `, best ${fmtScore(best)}` : ''}.` : 'Not attempted yet.'}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
    </Sheet>
  )
}
