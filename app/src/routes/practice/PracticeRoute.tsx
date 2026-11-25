/* /practice — configure a mock in at most three choices with good defaults. MASTER_PLAN §3.2 S3, FT-02.
 * Left: the six topics (selectable rows). Right: the setup panel. One primary: Start mock (⌘↵).
 * Query params: ?topic=&questionId=&entry=&nudgeId= */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BookOpen, Keyboard, Mic, PlayCircle } from 'lucide-react'
import type { EntryPoint, InputMode, MockLength, Question, TopicId } from '@/domain/types'
import { TOPICS, TOPIC_LABEL } from '@/domain/types'
import { discardMock, startMock } from '@/engine/api'
import { db, getSettings } from '@/services/db/db'
import { useLiveQuery } from 'dexie-react-hooks'
import { Clock } from '@/services/clock'
import { Banner, Button, Card, cx, Divider, EmptyState, Kbd, Page, ScorePill, Segmented, Skeleton, Tag, toast } from '@/ui'
import { daysAgo, FOLLOWUPS, isTypingTarget, plural, questionTitle, speechSupported, TIMEBOX_MIN } from '@/features/mock/lib'
import { DIFFICULTY_LABEL, STATUS_LABEL } from '@/features/mock/labels'
import { QuestionPicker } from './QuestionPicker'
import { useAttempts, useHasAnyMock, useInProgressMock, usePracticeTopics, useRecommended, useTopicQuestions, type TopicRow } from './usePracticeData'

const START_LABEL: Record<TopicId, string> = {
  product_design: 'Start product design mock', rca: 'Start RCA mock', metrics: 'Start metrics mock',
  guesstimate: 'Start guesstimate mock', strategy: 'Start strategy mock', tech: 'Start tech mock',
}
const ENTRY_POINTS: EntryPoint[] = ['onboarding', 'home_next_up', 'nudge', 'practice', 'library', 'retry', 'progress']

/* ---------------- topic list ---------------- */
function TopicRowButton({ row, index, selected, onSelect }: { row: TopicRow; index: number; selected: boolean; onSelect: () => void }) {
  const now = Clock.now()
  const ago = daysAgo(row.lastPractisedAt, now)
  const meta = row.countedMocks > 0
    ? [STATUS_LABEL[row.status], plural(row.countedMocks, 'mock'), ago].filter(Boolean).join(' · ')
    : row.selfRating ? `Not started · Your guess: ${row.selfRating}` : 'Not started'
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cx(
        'group flex h-[60px] w-full items-center gap-3 rounded-md px-3 text-left transition-colors duration-100',
        selected ? 'bg-selected' : 'hover:bg-hover',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cx('truncate text-headline', selected ? 'text-accent' : 'text-primary')}>{TOPIC_LABEL[row.topic]}</span>
          {row.isWeakest ? <Tag tone="nudge">Weakest</Tag> : null}
        </div>
        <div className="mt-0.5 truncate text-footnote text-secondary">{meta}</div>
      </div>
      {row.score != null && row.countedMocks > 0
        ? <ScorePill value={row.score} />
        : <span className="w-8 text-center text-callout text-tertiary" aria-label="No score yet">—</span>}
      <Kbd className={cx('transition-opacity duration-100', selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>{index + 1}</Kbd>
    </button>
  )
}

function TopicListSkeleton() {
  return (
    <div className="flex flex-col gap-1" aria-busy>
      {TOPICS.map((t) => (
        <div key={t} className="flex h-[60px] items-center gap-3 px-3">
          <div className="flex-1"><Skeleton className="h-4 w-32" /><Skeleton className="mt-2 h-3 w-44" /></div>
          <Skeleton className="h-6 w-10 rounded-full" />
        </div>
      ))}
    </div>
  )
}

/* ---------------- question preview ---------------- */
function QuestionPreview({ question, loading, attempts, isPicked }: { question: Question | null; loading: boolean; attempts?: { count: number; last: number }; isPicked: boolean }) {
  if (loading) {
    return (
      <div aria-busy>
        <Skeleton className="h-6 w-full" />
        <Skeleton className="mt-2.5 h-6 w-4/5" />
        <Skeleton className="mt-4 h-3.5 w-48" />
      </div>
    )
  }
  if (!question) return null
  const source = question.source === 'upload' ? 'Your upload' : 'Curated'
  const recently = attempts && Clock.now() - attempts.last < 14 * 86_400_000
  return (
    <div key={question.id} className="animate-fade">
      <h2 className="text-title-2 text-primary" style={{ fontWeight: 500 }}>{question.prompt}</h2>
      {question.context.setup ? <p className="mt-2 text-callout text-secondary">{question.context.setup}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-secondary">
        <span>{source}</span>
        <span className="text-tertiary">·</span>
        <span>{DIFFICULTY_LABEL[question.difficulty]}</span>
        <span className="text-tertiary">·</span>
        <span>{attempts?.count ? `Done ${attempts.count}×` : 'Not attempted'}</span>
        {recently && !isPicked ? <Tag>Revisit</Tag> : null}
        {question.source === 'upload' ? <Tag>Mine</Tag> : null}
      </div>
    </div>
  )
}

/* ---------------- route ---------------- */
export default function PracticeRoute() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const paramTopic = params.get('topic') as TopicId | null
  const paramQuestion = params.get('questionId') ?? params.get('question')
  const entryParam = params.get('entry') as EntryPoint | null
  const entryPoint: EntryPoint = entryParam && ENTRY_POINTS.includes(entryParam) ? entryParam : 'practice'
  const nudgeId = params.get('nudgeId') ?? undefined

  const topics = usePracticeTopics()
  const settings = useLiveQuery(() => getSettings(), [])
  const inProgress = useInProgressMock()
  const hasAnyMock = useHasAnyMock()

  /* selected topic */
  const [topic, setTopic] = useState<TopicId | null>(paramTopic && TOPICS.includes(paramTopic) ? paramTopic : null)
  // A ?questionId= without ?topic= decides the topic.
  const paramQ = useLiveQuery(async () => (paramQuestion ? (await db.questions.get(paramQuestion)) ?? null : null), [paramQuestion])
  useEffect(() => {
    if (topic || topics.status === 'loading') return
    if (paramQuestion && paramQ === undefined) return
    if (paramQ) { setTopic(paramQ.topic); return }
    const rows = topics.status === 'ready' ? topics.data.rows : []
    const weakest = rows.find((r) => r.isWeakest)?.topic
    const lowestGuess = rows.filter((r) => r.selfRating).sort((a, b) => (a.selfRating ?? 9) - (b.selfRating ?? 9))[0]?.topic
    setTopic(weakest ?? lowestGuess ?? 'product_design')
  }, [topic, topics, paramQuestion, paramQ])
  const activeTopic: TopicId = topic ?? 'product_design'

  /* question */
  const [pickedId, setPickedId] = useState<string | null>(paramQuestion)
  const [shuffle, setShuffle] = useState(0)
  const rec = useRecommended(activeTopic, shuffle)
  const questions = useTopicQuestions(activeTopic)
  const attempts = useAttempts(activeTopic)
  const picked = useMemo(() => (pickedId ? questions?.find((q) => q.id === pickedId) ?? null : null), [pickedId, questions])
  const recQuestion = rec.status === 'ready' && rec.topic === activeTopic ? rec.question : null
  const question = picked ?? recQuestion
  const questionLoading = !picked && (rec.status === 'loading' || rec.topic !== activeTopic || (pickedId != null && questions === undefined))
  const [pickerOpen, setPickerOpen] = useState(false)

  /* length and mode */
  const [length, setLength] = useState<MockLength | null>(null)
  const [mode, setMode] = useState<InputMode | null>(null)
  const voiceOk = speechSupported()
  const effLength: MockLength = length ?? (hasAnyMock === false || entryPoint === 'onboarding' ? 'quick' : settings?.mock.defaultLength ?? 'standard')
  const profile = topics.status === 'ready' ? topics.data.profile : null
  const effMode: InputMode = (mode ?? profile?.preferredMode ?? 'text') === 'voice' && voiceOk ? 'voice' : 'text'

  /* start */
  const [starting, setStarting] = useState(false)
  const blocked = Boolean(inProgress)
  const canStart = Boolean(question) && !starting && !blocked && topic != null
  const start = useCallback(async () => {
    if (!canStart || !question) return
    setStarting(true)
    try {
      const s = await startMock({ topic: activeTopic, questionId: question.id, length: effLength, mode: effMode, entryPoint, nudgeId })
      navigate(`/mock/${s.id}`)
    } catch (e) {
      console.error('[practice] startMock failed', e)
      toast.error("Couldn't start the mock. Nothing was lost; try again.")
      setStarting(false)
    }
  }, [activeTopic, canStart, effLength, effMode, entryPoint, navigate, nudgeId, question])

  const selectTopic = useCallback((t: TopicId) => {
    setTopic(t)
    setPickedId(null)
  }, [])

  /* keyboard: ⌘↵ start · 1–6 topic · P pick another · S shuffle */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pickerOpen) return
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void start(); return }
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      const n = Number(e.key)
      if (n >= 1 && n <= 6) { e.preventDefault(); selectTopic(TOPICS[n - 1]); return }
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); setPickerOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pickerOpen, selectTopic, start])

  const rows = topics.status === 'ready' ? topics.data.rows : null
  const noQuestions = !questionLoading && !question

  return (
    <Page title="Practice" sub="Pick a topic. Meera brings a question you haven't done recently.">
      {inProgress ? (
        <Banner
          tone="nudge"
          icon={PlayCircle}
          className="mb-8"
          title={`Finish or end your current ${TOPIC_LABEL[inProgress.topic].toLowerCase()} mock first.`}
          action={
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={async () => {
                try { await discardMock(inProgress.id); toast('Mock discarded.') } catch { toast.error("Couldn't discard it. Try again.") }
              }}>Discard</Button>
              <Button size="sm" variant="secondary" onClick={() => navigate(`/mock/${inProgress.id}`)}>Resume</Button>
            </div>
          }
        >
          {questionTitle(inProgress.questionSnapshot.prompt, 80)}
        </Banner>
      ) : null}

      <div className="grid grid-cols-12 gap-10 max-[1000px]:grid-cols-1 max-[1000px]:gap-6">
        {/* topics */}
        <section className="col-span-5 max-[1000px]:col-span-1" aria-label="Topics">
          <div className="mb-2 flex items-baseline justify-between px-3">
            <h2 className="text-label text-secondary">Topic</h2>
            <span className="text-footnote text-tertiary">Topic score</span>
          </div>
          {rows ? (
            <div role="radiogroup" aria-label="Topic" className="flex flex-col gap-0.5 stagger">
              {rows.map((r, i) => (
                <TopicRowButton key={r.topic} row={r} index={i} selected={r.topic === topic} onSelect={() => selectTopic(r.topic)} />
              ))}
            </div>
          ) : topics.status === 'loading' ? <TopicListSkeleton /> : (
            <div role="radiogroup" aria-label="Topic" className="flex flex-col gap-0.5">
              {TOPICS.map((t, i) => (
                <TopicRowButton key={t} index={i} selected={t === topic} onSelect={() => selectTopic(t)}
                  row={{ topic: t, status: 'not_started', countedMocks: 0, isWeakest: false }} />
              ))}
            </div>
          )}
        </section>

        {/* setup */}
        <section className="col-span-7 max-[1000px]:col-span-1" aria-label="Mock setup">
          <Card className="p-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-label text-secondary">{picked ? 'Your pick' : 'Recommended for you'}</span>
              <div className="-mr-2 flex items-center gap-1">
                {picked ? <Button size="sm" variant="quiet" onClick={() => setPickedId(null)}>Use recommended</Button> : (
                  <Button size="sm" variant="ghost" onClick={() => setShuffle((s) => s + 1)} disabled={questionLoading} title="Another recommendation">Shuffle</Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setPickerOpen(true)} kbd="P">Pick another</Button>
              </div>
            </div>

            {noQuestions ? (
              <EmptyState
                className="py-8"
                icon={BookOpen}
                title={`No ${TOPIC_LABEL[activeTopic].toLowerCase()} questions yet.`}
                body="Add your own from a casebook or question list. They stay in this browser."
                action={<Button variant="secondary" onClick={() => navigate('/library?tab=mine')}>Open Library</Button>}
              />
            ) : (
              <QuestionPreview question={question} loading={questionLoading} attempts={question ? attempts?.get(question.id) : undefined} isPicked={Boolean(picked)} />
            )}

            <Divider className="my-6" />

            <div className="grid grid-cols-[96px_1fr] items-center gap-x-4 gap-y-5">
              <span className="text-label text-primary">Length</span>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Segmented<MockLength>
                  value={effLength}
                  onChange={setLength}
                  options={[{ value: 'quick', label: 'Quick' }, { value: 'standard', label: 'Standard' }]}
                />
                <span className="text-footnote text-secondary">
                  {plural(FOLLOWUPS[effLength], 'follow-up')} · about {TIMEBOX_MIN[effLength]} min
                </span>
              </div>

              <span className="text-label text-primary">Answer by</span>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Segmented<InputMode>
                  value={effMode}
                  onChange={(m) => { if (m === 'voice' && !voiceOk) return; setMode(m) }}
                  options={[{ value: 'text', label: 'Text', icon: Keyboard }, { value: 'voice', label: 'Voice', icon: Mic }]}
                />
                <span className="text-footnote text-secondary">
                  {!voiceOk ? 'Voice needs Chrome on a computer.' : effMode === 'voice' ? 'Space to talk. Nothing is recorded.' : 'Switch any time during the mock.'}
                </span>
              </div>
            </div>

            <Divider className="my-6" />

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button variant="primary" size="lg" kbd="⌘↵" onClick={() => void start()} loading={starting} disabled={!canStart}>
                {START_LABEL[activeTopic]}
              </Button>
              <span className="text-footnote text-tertiary">
                {blocked ? 'Finish or end your current mock first.' : 'Meera scores every mock on the same bar.'}
              </span>
            </div>
          </Card>
          <p className="mt-3 px-1 text-footnote text-tertiary">
            <Kbd>1</Kbd>–<Kbd>6</Kbd> choose a topic · <Kbd>P</Kbd> pick a question · <Kbd>⌘↵</Kbd> start
          </p>
        </section>
      </div>

      <QuestionPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        topic={activeTopic}
        questions={questions}
        attempts={attempts}
        selectedId={question?.id ?? null}
        recommendedId={recQuestion?.id ?? null}
        onPick={(q) => { setPickedId(q.id === recQuestion?.id ? null : q.id); setPickerOpen(false) }}
      />
    </Page>
  )
}
