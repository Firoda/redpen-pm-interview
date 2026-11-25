/* "Pick another": browse a topic's questions — curated, then the candidate's own uploads ("My questions"). */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Search } from 'lucide-react'
import type { Question, TopicId } from '@/domain/types'
import { TOPIC_LABEL } from '@/domain/types'
import { cx, Input, Sheet, Skeleton, Tag } from '@/ui'
import { DIFFICULTY_LABEL } from '@/features/mock/labels'

function Row({ q, selected, recommended, attempts, onPick }: { q: Question; selected: boolean; recommended: boolean; attempts?: number; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={cx(
        'group flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors duration-100',
        selected ? 'bg-selected' : 'hover:bg-hover',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-body text-primary">{q.prompt}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-secondary">
          <span>{DIFFICULTY_LABEL[q.difficulty]}</span>
          <span className="text-tertiary">·</span>
          <span>{attempts ? `Done ${attempts}×` : 'Not attempted'}</span>
          {recommended ? <Tag tone="accent">Recommended</Tag> : null}
          {q.source === 'upload' ? <Tag>Mine</Tag> : null}
        </div>
      </div>
      <span className={cx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-accent', !selected && 'invisible')} aria-hidden>
        <Check size={16} strokeWidth={2.25} />
      </span>
    </button>
  )
}

export function QuestionPicker({ open, onOpenChange, topic, questions, attempts, selectedId, recommendedId, onPick }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  topic: TopicId
  questions: Question[] | undefined
  attempts: Map<string, { count: number; last: number }> | undefined
  selectedId: string | null
  recommendedId: string | null
  onPick: (q: Question) => void
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = questions ?? []
    return q ? list.filter((x) => x.prompt.toLowerCase().includes(q) || x.subtype.toLowerCase().includes(q)) : list
  }, [questions, query])
  const curated = filtered.filter((q) => q.source === 'curated')
  const mine = filtered.filter((q) => q.source === 'upload')
  const ownTotal = (questions ?? []).filter((q) => q.source === 'upload').length

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setQuery('') }} title={`${TOPIC_LABEL[topic]} questions`} width={560}>
      <div className="relative">
        <Search size={16} strokeWidth={2} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" />
        <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search questions" className="pl-9" aria-label="Search questions" />
      </div>

      {questions === undefined ? (
        <div className="mt-5 flex flex-col gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <div className="mt-5 flex flex-col gap-6">
          <section>
            <h3 className="mb-1 px-3 text-label text-secondary">Curated <span className="text-tertiary">· {curated.length}</span></h3>
            {curated.length ? (
              <div className="flex flex-col gap-0.5">
                {curated.map((q) => (
                  <Row key={q.id} q={q} selected={q.id === selectedId} recommended={q.id === recommendedId} attempts={attempts?.get(q.id)?.count} onPick={() => onPick(q)} />
                ))}
              </div>
            ) : (
              <p className="px-3 text-callout text-tertiary">{query ? 'No questions match. Clear the search.' : 'No curated questions for this topic yet.'}</p>
            )}
          </section>
          <section>
            <h3 className="mb-1 px-3 text-label text-secondary">My questions <span className="text-tertiary">· {mine.length}</span></h3>
            {mine.length ? (
              <div className="flex flex-col gap-0.5">
                {mine.map((q) => (
                  <Row key={q.id} q={q} selected={q.id === selectedId} recommended={q.id === recommendedId} attempts={attempts?.get(q.id)?.count} onPick={() => onPick(q)} />
                ))}
              </div>
            ) : ownTotal === 0 ? (
              <p className="px-3 text-callout text-secondary">
                No uploaded {TOPIC_LABEL[topic].toLowerCase()} questions.{' '}
                <Link to="/library?tab=mine" className="text-accent underline-offset-2 hover:underline">Add a casebook in the Library</Link>.
              </p>
            ) : (
              <p className="px-3 text-callout text-tertiary">No questions match. Clear the search.</p>
            )}
          </section>
        </div>
      )}
    </Sheet>
  )
}
