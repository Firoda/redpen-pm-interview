/* Upload review sheet: edit each detected question, set its topic, untick any you don't want.
 * Duplicates arrive unticked and tagged. Spec: MASTER_PLAN §3.2 S7. */
import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { saveUpload, type UploadPreview } from '@/engine/api'
import type { TopicId, UserUpload } from '@/domain/types'
import { TOPICS, TOPIC_LABEL } from '@/domain/types'
import { Banner, Button, Divider, Sheet, Tag, Textarea, cx } from '@/ui'
import { plural } from '@/features/home/format'

type Item = UploadPreview['questions'][number]

export function UploadReview({ preview, onClose, onSaved, onPasteInstead }: {
  preview: UploadPreview | null
  onClose: () => void
  onSaved: (u: UserUpload, added: number, duplicates: number) => void
  onPasteInstead: () => void
}) {
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setItems(preview?.questions ?? []); setError(null); setBusy(false) }, [preview])

  const included = items.filter((q) => q.include && q.prompt.trim())
  const dups = items.filter((q) => q.duplicateOf).length
  const set = (i: number, patch: Partial<Item>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const save = async () => {
    if (!preview || !included.length) return
    setBusy(true)
    setError(null)
    try {
      const u = await saveUpload({ ...preview, questions: items.map((q) => ({ ...q, prompt: q.prompt.trim() })) })
      onSaved(u, included.length, dups)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save these questions. Nothing was added.")
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={!!preview}
      onOpenChange={(o) => { if (!o && !busy) onClose() }}
      title="Review questions"
      width={520}
      footer={items.length ? (
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={!included.length}>
            {included.length ? `Add ${plural(included.length, 'question')}` : 'Add questions'}
          </Button>
        </>
      ) : <Button variant="primary" onClick={onPasteInstead}>Paste text instead</Button>}
    >
      {preview ? (
        <div>
          {items.length ? (
            <>
              <p className="text-body text-primary">
                We found {plural(items.length, 'question')} in <span className="font-medium">{preview.fileName}</span>. Untick any you don't want.
              </p>
              {dups ? <p className="mt-1 text-footnote text-secondary">{dups} {dups === 1 ? 'is' : 'are'} already in your library, so {dups === 1 ? "it's" : "they're"} unticked.</p> : null}
            </>
          ) : (
            <p className="text-body text-primary">We couldn't find separate questions in {preview.fileName}. Paste one question per line instead.</p>
          )}

          {preview.warnings.length ? (
            <Banner tone="neutral" icon={AlertTriangle} className="mt-4">
              {preview.warnings.map((w, i) => <div key={i}>{w}</div>)}
            </Banner>
          ) : null}

          <div className="mt-5 flex flex-col">
            {items.map((q, i) => (
              <div key={i}>
                {i > 0 ? <Divider /> : null}
                <div className={cx('flex gap-3 py-3.5 transition-opacity duration-150', !q.include && 'opacity-60')}>
                  <input
                    type="checkbox"
                    checked={q.include}
                    onChange={(e) => set(i, { include: e.target.checked })}
                    aria-label={`Include question ${i + 1}`}
                    className="mt-2.5 h-4 w-4 shrink-0 cursor-pointer rounded-sm"
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <div className="min-w-0 flex-1">
                    <Textarea
                      rows={2}
                      value={q.prompt}
                      onChange={(e) => set(i, { prompt: e.target.value })}
                      className="text-callout"
                      aria-label={`Question ${i + 1}`}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select
                        value={q.topic}
                        onChange={(e) => set(i, { topic: e.target.value as TopicId })}
                        aria-label="Topic"
                        className="h-7 rounded-md bg-surface px-2 text-label text-primary shadow-[inset_0_0_0_1px_var(--border-strong)] focus:outline-none focus:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_var(--accent-subtle)]"
                      >
                        {TOPICS.map((t) => <option key={t} value={t}>{TOPIC_LABEL[t]}</option>)}
                      </select>
                      {q.duplicateOf ? <Tag tone="nudge">Already in your library</Tag> : null}
                      {q.caseText ? <Tag>Case text attached</Tag> : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {error ? <Banner tone="danger" className="mt-4">{error}</Banner> : null}
          <p className="mt-6 text-footnote text-tertiary">Stored only in this browser. A question is sent to the AI only when you practise it.</p>
        </div>
      ) : null}
    </Sheet>
  )
}
