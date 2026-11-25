/* S7 — Library (F09, F10). Curated questions and her own uploads, with topic/difficulty filters, search
 * (press / to focus), a preview sheet and the upload flow. Spec: MASTER_PLAN §3.2 S7, §4.10; doc 01 §6.9. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FileText, Lock, Search, Trash2, X } from 'lucide-react'
import { db } from '@/services/db/db'
import { Analytics } from '@/services/analytics'
import { deleteUpload, type UploadPreview } from '@/engine/api'
import type { Difficulty, Profile, Question, TopicId, UserUpload } from '@/domain/types'
import { TOPICS, TOPIC_SHORT } from '@/domain/types'
import { Banner, Button, Chip, Dialog, Divider, EmptyState, IconButton, Input, Kbd, Page, Segmented, Skeleton, Tag, toast } from '@/ui'
import { useEngineQuery } from '@/features/home/useEngineQuery'
import { plural, shortDate } from '@/features/home/format'
import { Tabs } from './Tabs'
import { QuestionRow } from './QuestionRow'
import { QuestionSheet } from './QuestionSheet'
import { Dropzone } from './Dropzone'
import { UploadReview } from './UploadReview'
import { JdFakeDoor } from './JdFakeDoor'

type Tab = 'curated' | 'mine'
type Data = {
  questions: Question[]
  uploads: UserUpload[]
  attempts: Record<string, number>
  best: Record<string, number>
  profile: Profile | null
}

const PAGE = 60

export default function Library() {
  const q = useEngineQuery<Data>(async () => {
    const [questions, uploads, mocks, feedback, profile] = await Promise.all([
      db.questions.toArray(),
      db.uploads.orderBy('createdAt').reverse().toArray(),
      db.mockSessions.toArray(),
      db.feedback.toArray(),
      db.profile.get('me'),
    ])
    const attempts: Record<string, number> = {}
    for (const m of mocks) if (m.status === 'completed' || m.status === 'ended_early') attempts[m.questionId] = (attempts[m.questionId] ?? 0) + 1
    const best: Record<string, number> = {}
    for (const f of feedback) if (f.counted && !f.supersededBy) best[f.questionId] = Math.max(best[f.questionId] ?? 0, f.overall)
    return { questions: questions.filter((x) => !x.retired), uploads, attempts, best, profile: profile ?? null }
  })

  useEffect(() => { void Analytics.track('library_viewed', {}) }, [])

  if (q.status === 'loading') {
    return (
      <Page title="Library">
        <Skeleton className="h-10 w-64" />
        <div className="mt-6 flex flex-col gap-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      </Page>
    )
  }
  if (q.status === 'error') {
    return (
      <Page title="Library">
        <Banner tone="danger" title="The library couldn't load">
          Reload the page to try again.
          <div className="mt-1 font-mono text-caption text-tertiary">{q.error.message}</div>
        </Banner>
      </Page>
    )
  }
  return <LibraryContent d={q.data} />
}

function LibraryContent({ d }: { d: Data }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'mine' ? 'mine' : 'curated'
  const [topic, setTopic] = useState<TopicId | null>(null)
  const [notAttempted, setNotAttempted] = useState(false)
  const [difficulty, setDifficulty] = useState<'all' | Difficulty>('all')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [open, setOpen] = useState<Question | null>(null)
  const [preview, setPreview] = useState<UploadPreview | null>(null)
  const [toDelete, setToDelete] = useState<UserUpload | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [pasteKey, setPasteKey] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)

  // "/" focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => setLimit(PAGE), [tab, topic, notAttempted, difficulty, search])

  const pool = useMemo(() => d.questions.filter((x) => (tab === 'mine' ? x.source === 'upload' : x.source !== 'upload')), [d.questions, tab])
  const needle = search.trim().toLowerCase()
  const baseFiltered = pool.filter((x) =>
    (!notAttempted || !d.attempts[x.id]) &&
    (difficulty === 'all' || x.difficulty === difficulty) &&
    (!needle || x.prompt.toLowerCase().includes(needle) || x.tags.some((t) => t.toLowerCase().includes(needle))))
  const counts = TOPICS.reduce((acc, t) => ({ ...acc, [t]: baseFiltered.filter((x) => x.topic === t).length }), {} as Record<TopicId, number>)
  const list = baseFiltered
    .filter((x) => !topic || x.topic === topic)
    .sort((a, b) => TOPICS.indexOf(a.topic) - TOPICS.indexOf(b.topic) || a.id.localeCompare(b.id))
  const filtersOn = !!topic || notAttempted || difficulty !== 'all' || !!needle
  const clear = () => { setTopic(null); setNotAttempted(false); setDifficulty('all'); setSearch('') }

  const practise = (x: Question) => navigate(`/practice?topic=${x.topic}&questionId=${encodeURIComponent(x.id)}&entry=library`)
  const setTab = (t: Tab) => setParams((p) => { if (t === 'mine') p.set('tab', 'mine'); else p.delete('tab'); return p }, { replace: true })

  const onSaved = (u: UserUpload, added: number, dups: number) => {
    setPreview(null)
    setTab('mine')
    const first = u.questionIds[0]
    toast(
      `${plural(added, 'question')} added${dups ? ` · ${dups} already in your library` : ''}`,
      first ? { label: 'Practise one now', onClick: () => { const x = d.questions.find((q) => q.id === first); navigate(`/practice?${x ? `topic=${x.topic}&` : ''}questionId=${encodeURIComponent(first)}&entry=library`) } } : undefined,
    )
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    try {
      await deleteUpload(toDelete.id)
      setToDelete(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete that upload.")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Page title="Library" sub="Curated questions, and the ones you bring. Everything stays in this browser.">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'curated', label: <>Curated <span className="ml-1 text-tertiary tabular">{d.questions.filter((x) => x.source !== 'upload').length}</span></> },
          { value: 'mine', label: <>My questions <span className="ml-1 text-tertiary tabular">{d.questions.filter((x) => x.source === 'upload').length}</span></> },
        ]}
      />

      {tab === 'mine' ? (
        <section className="mt-6">
          <Dropzone key={pasteKey} onPreview={setPreview} compact={d.uploads.length > 0} initialPaste={pasteKey > 0} />
          {d.uploads.length ? (
            <div className="mt-6">
              <div className="mb-1 text-footnote text-secondary">Uploads</div>
              <div className="flex flex-col">
                {d.uploads.map((u, i) => (
                  <div key={u.id}>
                    {i > 0 ? <Divider /> : null}
                    <div className="flex items-center gap-3 py-3">
                      <FileText size={18} strokeWidth={1.75} className="shrink-0 text-secondary" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-headline font-medium text-primary">{u.fileType === 'paste' ? 'Pasted text' : u.fileName}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-footnote text-secondary">
                          <span>{plural(u.questionIds.length, 'question')} · {shortDate(u.createdAt)}</span>
                          <span className="inline-flex items-center gap-1 text-tertiary"><Lock size={12} />Private</span>
                        </div>
                      </div>
                      <IconButton icon={Trash2} label={`Delete ${u.fileName}`} size="sm" onClick={() => setToDelete(u)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* filters */}
      {pool.length ? (
        <div className="mt-6 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-[320px]">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" />
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setSearch(''); e.currentTarget.blur() } }}
                placeholder="Search questions"
                className="pl-9 pr-10"
                aria-label="Search questions"
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">{search ? null : <Kbd>/</Kbd>}</span>
            </div>
            <Segmented
              size="sm"
              value={difficulty}
              onChange={setDifficulty}
              options={[{ value: 'all', label: 'Any level' }, { value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }]}
            />
            <Chip selected={notAttempted} onClick={() => setNotAttempted((x) => !x)}>Not attempted</Chip>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip selected={!topic} onClick={() => setTopic(null)}>All <span className="text-tertiary tabular">{baseFiltered.length}</span></Chip>
            {TOPICS.map((t) => (
              <Chip key={t} selected={topic === t} onClick={() => setTopic(topic === t ? null : t)}>
                {TOPIC_SHORT[t]} <span className="text-tertiary tabular">{counts[t]}</span>
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      {/* list */}
      <section className="mt-4">
        {pool.length === 0 ? (
          tab === 'mine' ? (
            <p className="py-6 text-callout text-secondary">Your questions show up here, marked Mine. Only you can see them.</p>
          ) : (
            <EmptyState title="No curated questions on this device" body="Reload the page to restore the library." />
          )
        ) : list.length === 0 ? (
          <EmptyState
            title="No questions match"
            body="Try another topic or level, or clear the search."
            action={filtersOn ? <Button size="sm" icon={X} onClick={clear}>Clear filters</Button> : null}
          />
        ) : (
          <div className="-mx-3 flex flex-col">
            {list.slice(0, limit).map((x, i) => (
              <div key={x.id}>
                {i > 0 ? <Divider className="mx-3" /> : null}
                <QuestionRow q={x} attempts={d.attempts[x.id] ?? 0} best={d.best[x.id]} onOpen={() => setOpen(x)} onPractise={() => practise(x)} />
              </div>
            ))}
            {list.length > limit ? (
              <div className="px-3 pt-4">
                <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, list.length - limit)} more</Button>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {tab === 'curated' ? (
        <section className="mt-12"><JdFakeDoor profile={d.profile} /></section>
      ) : null}

      <QuestionSheet q={open} attempts={open ? d.attempts[open.id] ?? 0 : 0} best={open ? d.best[open.id] : undefined} onClose={() => setOpen(null)} onStart={practise} />
      <UploadReview
        preview={preview}
        onClose={() => setPreview(null)}
        onSaved={onSaved}
        onPasteInstead={() => { setPreview(null); setTab('mine'); setPasteKey((k) => k + 1) }}
      />
      <Dialog
        open={!!toDelete}
        onOpenChange={(o) => { if (!o) setToDelete(null) }}
        title={`Delete ${toDelete?.fileType === 'paste' ? 'pasted text' : toDelete?.fileName ?? 'upload'}?`}
        description={toDelete ? `Its ${plural(toDelete.questionIds.length, 'question')} leave your library. Past mocks keep their transcript and scores.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)} disabled={deleting}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleting}>Delete</Button>
          </>
        }
      />
    </Page>
  )
}
