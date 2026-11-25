/* Trust metric: "Was this feedback specific and honest?" 1–5. A 1–3 reveals tags and a one-line note.
 * Collapses to "Rated 4 · Change". Keys 1–5 work while the card has focus. */
import { useEffect, useState } from 'react'
import type { Feedback, RatingTag, Score } from '@/domain/types'
import { rateFeedback } from '@/engine/api'
import { Button, Chip, cx, Input } from '@/ui'

const TAGS: { id: RatingTag; label: string }[] = [
  { id: 'too_lenient', label: 'Too lenient' },
  { id: 'too_harsh', label: 'Too harsh' },
  { id: 'not_specific', label: 'Not specific' },
  { id: 'misquoted', label: 'Misquoted me' },
  { id: 'wrong_topic', label: 'Wrong about the topic' },
]

export function RatingCard({ feedback }: { feedback: Feedback }) {
  const [rating, setRating] = useState<Score | null>(feedback.rating ?? null)
  const [tags, setTags] = useState<RatingTag[]>(feedback.ratingTags ?? [])
  const [comment, setComment] = useState(feedback.ratingComment ?? '')
  const [editing, setEditing] = useState(feedback.rating == null)
  const [details, setDetails] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (feedback.rating != null && !editing) setRating(feedback.rating) }, [feedback.rating, editing])

  const save = async (r: Score, t: RatingTag[], c?: string) => {
    setSaving(true)
    setError(null)
    try {
      await rateFeedback(feedback.id, r, t, c?.trim() || undefined)
      return true
    } catch (e) {
      console.error('[report] rateFeedback failed', e)
      setError("Couldn't save your rating. Try again.")
      return false
    } finally {
      setSaving(false)
    }
  }

  const pick = async (r: Score) => {
    setRating(r)
    const keep = r <= 3 ? tags : []
    if (r > 3) setTags([])
    const ok = await save(r, keep, r <= 3 ? comment : undefined)
    if (!ok) return
    if (r <= 3) setDetails(true)
    else { setDetails(false); setEditing(false) }
  }

  if (!editing && rating != null) {
    return (
      <section className="flex items-center justify-between gap-4 rounded-lg bg-subtle px-5 py-4" aria-label="Your rating of this feedback">
        <p className="text-callout text-secondary">
          <span className="text-primary" style={{ fontWeight: 500 }}>Rated {rating} of 5.</span>{' '}
          Ratings tune how strict and specific the feedback is.
        </p>
        <Button size="sm" variant="ghost" onClick={() => { setEditing(true); setDetails(rating <= 3) }}>Change</Button>
      </section>
    )
  }

  return (
    <section
      className="rounded-lg bg-surface p-5 shadow-1"
      aria-labelledby="rate-title"
      onKeyDown={(e) => {
        const t = e.target as HTMLElement
        if (t.tagName === 'INPUT') return
        const n = Number(e.key)
        if (n >= 1 && n <= 5) { e.preventDefault(); void pick(n as Score) }
      }}
    >
      <h2 id="rate-title" className="text-headline text-primary">Was this feedback specific and honest?</h2>
      <div className="mt-3 inline-flex flex-col">
        <div role="radiogroup" aria-label="Rating, 1 to 5" className="flex gap-1.5">
          {([1, 2, 3, 4, 5] as Score[]).map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={rating === n}
              disabled={saving}
              onClick={() => void pick(n)}
              className={cx(
                'h-10 w-10 rounded-md text-body tabular transition-colors duration-100',
                rating === n
                  ? 'bg-selected text-accent shadow-[inset_0_0_0_1px_var(--accent)]'
                  : 'bg-surface text-primary shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-hover',
              )}
              style={{ fontWeight: 500 }}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-caption text-tertiary">
          <span>Generic</span>
          <span>Specific and honest</span>
        </div>
      </div>

      {details && rating != null && rating <= 3 ? (
        <div className="mt-5 border-t border-border pt-4 animate-rise">
          <p className="text-label text-primary">What felt off? <span className="text-footnote text-tertiary">Optional</span></p>
          <div className="mt-2 flex flex-wrap gap-2">
            {TAGS.map((t) => (
              <Chip key={t.id} selected={tags.includes(t.id)} onClick={() => setTags((x) => (x.includes(t.id) ? x.filter((y) => y !== t.id) : [...x, t.id]))}>
                {t.label}
              </Chip>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="One line on what to fix (optional)" maxLength={240}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save(rating, tags, comment).then((ok) => ok && setEditing(false)) } }} />
            <Button variant="secondary" loading={saving} onClick={() => void save(rating, tags, comment).then((ok) => ok && setEditing(false))}>Save</Button>
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-callout text-danger" role="alert">{error}</p> : null}
    </section>
  )
}
