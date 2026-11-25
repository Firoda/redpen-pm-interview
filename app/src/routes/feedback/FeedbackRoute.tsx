/* /feedback/:feedbackId — the report. Order (D-27): header → three fixes → five dimensions → self-rated vs scored
 * → strength → what a strong answer covered → transcript → rating → WTP. Retry reports open with the Fix check.
 * One primary: "Retry with this fix" on fix 1 (R). */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, FileQuestion } from 'lucide-react'
import type { Fix, InputMode } from '@/domain/types'
import { TOPIC_LABEL } from '@/domain/types'
import { getHomeView, type ReportView } from '@/engine/selectors'
import { loadReportView } from '@/features/feedback/reportFallback'
import { markFeedbackOpened, markFixesViewed, startRetry } from '@/engine/api'
import { db } from '@/services/db/db'
import { Button, cx, EmptyState, fmtScore, Kbd, ScorePill, Skeleton, toast } from '@/ui'
import { useSafeLiveQuery } from '@/features/mock/useSafeLiveQuery'
import { currentMode, isTypingTarget, store } from '@/features/mock/lib'
import { ReportHeader } from '@/features/feedback/ReportHeader'
import { FixCard } from '@/features/feedback/FixCard'
import { DimensionRow } from '@/features/feedback/DimensionRow'
import { FixCheck } from '@/features/feedback/FixCheck'
import { QuoteWell } from '@/features/feedback/Quote'
import { ReportTranscript } from '@/features/feedback/ReportTranscript'
import { RatingCard } from '@/features/feedback/RatingCard'
import { WtpCard } from '@/features/feedback/WtpCard'
import { useFixesViewed } from '@/features/feedback/useFixesViewed'
import { scrollToId } from '@/features/feedback/jump'

const opened = new Set<string>() // markFeedbackOpened once per page session (StrictMode-safe)

function Shell({ children, rail }: { children: React.ReactNode; rail?: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1040px] px-8 pb-24 pt-12 animate-rise">
      <div className="min-[1280px]:grid min-[1280px]:grid-cols-[minmax(0,680px)_220px] min-[1280px]:justify-between min-[1280px]:gap-12">
        <div className="min-w-0">{children}</div>
        {rail ? <aside className="hidden min-[1280px]:block">{rail}</aside> : null}
      </div>
    </div>
  )
}

function ReportSkeleton() {
  return (
    <Shell>
      <div aria-busy>
        <Skeleton className="h-3.5 w-80" />
        <div className="mt-5 flex items-end gap-5"><Skeleton className="h-14 w-24" /><Skeleton className="mb-1 h-4 w-48" /></div>
        <Skeleton className="mt-5 h-5 w-full" />
        <div className="mt-5 flex gap-1.5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-7 w-28 rounded-full" />)}</div>
        <Skeleton className="mt-12 h-5 w-40" />
        <div className="mt-4 flex flex-col gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-52 w-full rounded-lg" />)}</div>
      </div>
    </Shell>
  )
}

function Rail({ view, previous }: { view: ReportView; previous: number | null }) {
  const navigate = useNavigate()
  const links: [string, string][] = [
    ...(view.retry ? [['fixcheck', 'Fix check'] as [string, string]] : []),
    ['fixes', 'Your three fixes'], ['scores', 'Scores by dimension'], ['transcript', 'Transcript'], ['rate', 'Rate this feedback'],
  ]
  return (
    <div className="sticky top-12 flex flex-col gap-6">
      <nav aria-label="On this page" className="flex flex-col gap-0.5">
        {links.map(([id, label]) => (
          <button key={id} onClick={() => scrollToId(id)} className="rounded-md px-2 py-1.5 text-left text-callout text-secondary transition-colors duration-100 hover:bg-hover hover:text-primary">
            {label}
          </button>
        ))}
      </nav>
      <div className="border-t border-border px-2 pt-4">
        <div className="text-footnote text-secondary">{TOPIC_LABEL[view.feedback.topic]}, previous mock</div>
        <div className="mt-1.5">{previous != null ? <ScorePill value={previous} /> : <span className="text-callout text-tertiary">None yet</span>}</div>
      </div>
      <div className="flex flex-col items-start gap-1 px-0.5">
        <Button size="sm" variant="secondary" onClick={() => navigate(`/practice?topic=${view.feedback.topic}`)}>New {TOPIC_LABEL[view.feedback.topic].toLowerCase()} question</Button>
        <Button size="sm" variant="ghost" onClick={() => navigate('/')}>Back to Home</Button>
      </div>
    </div>
  )
}

function Disclosure({ title, children, defaultOpen = false, id }: { title: string; children: React.ReactNode; defaultOpen?: boolean; id?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section id={id}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="-mx-2 flex w-[calc(100%+16px)] items-center justify-between rounded-md px-2 py-2 text-left hover:bg-hover">
        <span className="text-title-3 text-primary">{title}</span>
        <ChevronDown size={18} strokeWidth={2} className={cx('text-secondary transition-transform duration-200 ease-standard', open && 'rotate-180')} />
      </button>
      {open ? <div className="mt-3 animate-rise">{children}</div> : null}
    </section>
  )
}

function Report({ view }: { view: ReportView }) {
  const navigate = useNavigate()
  const { feedback: fb, mock, question } = view
  const fixesRef = useRef<HTMLElement>(null)
  const [retrying, setRetrying] = useState<string | null>(null)
  const wtpKey = `rp.wtp.dismissed.${fb.id}`
  const [wtpDismissed, setWtpDismissed] = useState(() => store.get(wtpKey) === '1')

  useEffect(() => {
    if (opened.has(fb.id)) return
    opened.add(fb.id)
    markFeedbackOpened(fb.id).catch((e) => console.warn('[report] markFeedbackOpened failed', e))
  }, [fb.id])

  useFixesViewed(fixesRef, fb.id, Boolean(fb.fixesViewedAt), () => {
    markFixesViewed(fb.id).catch((e) => console.warn('[report] markFixesViewed failed', e))
  })

  const extras = useSafeLiveQuery(async () => {
    const profile = (await db.profile.get('me')) ?? null
    let showWtp = false
    try { showWtp = (await getHomeView()).showWtp } catch { showWtp = false }
    const counted = await db.mockSessions.filter((m) => m.counted).count()
    const prior = (await db.feedback.where('topic').equals(fb.topic).toArray())
      .filter((f) => f.id !== fb.id && f.counted && f.generatedAt < fb.generatedAt && !f.supersededBy)
      .sort((a, b) => b.generatedAt - a.generatedAt)[0]
    return { profile, showWtp: showWtp && !profile?.wtp?.answer, counted, previous: prior?.overall ?? null }
  }, [fb.id, fb.topic, fb.generatedAt])
  const ex = extras.status === 'ready' ? extras.data : null
  const mode: InputMode = ex?.profile?.preferredMode ?? currentMode(mock)

  const retry = useCallback(async (fix: Fix) => {
    if (retrying) return
    setRetrying(fix.id)
    try {
      const s = await startRetry(fb.id, fix.id, mode)
      navigate(`/mock/${s.id}`)
    } catch (e) {
      console.error('[report] startRetry failed', e)
      toast.error("Couldn't start the retry. Nothing was lost; try again.")
      setRetrying(null)
    }
  }, [fb.id, mode, navigate, retrying])

  const fixes = [...fb.fixes].sort((a, b) => a.rank - b.rank)

  // R = retry with fix 1
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.key === 'r' || e.key === 'R') && fixes[0]) { e.preventDefault(); void retry(fixes[0]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fixes, retry])

  const strength = fb.strength
  const structure = question?.expectedStructure ?? []
  const showSelf = view.isFirstReport && view.selfRating != null

  return (
    <Shell rail={<Rail view={view} previous={ex?.previous ?? null} />}>
      <div className="flex flex-col gap-12">
        <ReportHeader fb={fb} mock={mock} question={question} isPracticeOnly={view.isPracticeOnly} isRetry={Boolean(view.retry)} />

        {view.retry ? <div id="fixcheck" className="-mt-4"><FixCheck retry={view.retry} feedback={fb} retryOf={view.retryOf} mock={mock} /></div> : null}

        <section id="fixes" ref={fixesRef} aria-labelledby="fixes-title">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 id="fixes-title" className="text-title-3 text-primary">Your three fixes</h2>
              <p className="mt-0.5 text-footnote text-secondary">Each one quotes what you said. Start with the first.</p>
            </div>
            <span className="text-footnote text-tertiary max-[900px]:hidden"><Kbd>R</Kbd> retry with fix 1</span>
          </div>
          {fixes.length ? (
            <div className="flex flex-col gap-4 stagger">
              {fixes.map((f, i) => (
                <FixCard key={f.id} fix={f} primary={i === 0} onRetry={retry} retrying={retrying === f.id} disabled={Boolean(retrying) && retrying !== f.id} />
              ))}
            </div>
          ) : (
            <p className="text-body text-secondary">No fixes for this mock: there wasn't enough of your own words to quote.</p>
          )}
        </section>

        <section id="scores" aria-labelledby="scores-title">
          <h2 id="scores-title" className="text-title-3 text-primary">Scores by dimension</h2>
          <p className="mt-0.5 text-footnote text-secondary">The tick on each bar is the hire bar (4).</p>
          <div className="mt-2 stagger">
            {fb.dimensionScores.map((d, i) => <DimensionRow key={d.dimension} d={d} fb={fb} index={i} />)}
          </div>
        </section>

        {showSelf ? (
          <section className="rounded-lg bg-subtle px-5 py-4" aria-label="Self-rated versus scored">
            <p className="text-reading text-primary">
              You rated yourself <span className="tabular" style={{ fontWeight: 600 }}>{view.selfRating}</span> in {TOPIC_LABEL[fb.topic]}.
              {' '}This mock scored <span className="tabular" style={{ fontWeight: 600 }}>{fmtScore(fb.overall)}</span>.
            </p>
            <p className="mt-1 text-callout text-secondary">That's your starting point, not a verdict.</p>
          </section>
        ) : null}

        {strength ? (
          <section aria-labelledby="strength-title">
            <h2 id="strength-title" className="text-title-3 text-primary">What went well</h2>
            <p className="reading mt-2 text-reading text-primary">{strength.text}</p>
            {strength.quote ? <QuoteWell className="mt-3" text={strength.quote} turnId={strength.turnId} /> : null}
          </section>
        ) : null}

        {structure.length ? (
          <Disclosure title="What a strong answer covered">
            <ol className="flex flex-col gap-2">
              {structure.map((s, i) => (
                <li key={i} className="flex gap-3 text-body text-primary">
                  <span className="w-5 shrink-0 text-right tabular text-tertiary">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-footnote text-tertiary">The beats an interviewer listens for, in order. Not a model answer.</p>
          </Disclosure>
        ) : null}

        <ReportTranscript mock={mock} />

        <div id="rate" className="flex flex-col gap-4">
          <RatingCard feedback={fb} />
          {ex?.showWtp && !wtpDismissed ? (
            <WtpCard
              price={ex.profile?.wtp?.priceInr ?? 199}
              countedMocks={ex.counted}
              onDismiss={() => { store.set(wtpKey, '1'); setWtpDismissed(true) }}
            />
          ) : null}
        </div>
      </div>
    </Shell>
  )
}

export default function FeedbackRoute() {
  const { feedbackId = '' } = useParams()
  const navigate = useNavigate()
  const view = useSafeLiveQuery(() => loadReportView(feedbackId), [feedbackId])
  // A superseded report (re-scored) forwards to its replacement.
  const superseded = useLiveQuery(async () => (await db.feedback.get(feedbackId))?.supersededBy ?? null, [feedbackId])
  useEffect(() => { if (superseded) navigate(`/feedback/${superseded}`, { replace: true }) }, [superseded, navigate])

  if (view.status === 'loading') return <ReportSkeleton />
  if (view.status === 'error') {
    return (
      <Shell>
        <EmptyState
          icon={FileQuestion}
          title="We couldn't open this report."
          body="Your transcript is saved. Try again in a moment."
          action={<Button variant="primary" onClick={() => window.location.reload()}>Try again</Button>}
        />
      </Shell>
    )
  }
  if (!view.data) {
    return (
      <Shell>
        <EmptyState
          icon={FileQuestion}
          title="This report isn't on this device."
          body="Reports are saved in the browser where you took the mock."
          action={<Button variant="primary" onClick={() => navigate('/')}>Back to Home</Button>}
        />
      </Shell>
    )
  }
  return <Report key={view.data.feedback.id} view={view.data} />
}
