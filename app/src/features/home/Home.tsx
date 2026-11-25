/* S2 — Home. Answers "what should I do now?" in one glance: the Next-up card (the page's only primary
 * button), at most one secondary nudge, the weekly ring (North Star unit), topics and recent mocks.
 * Spec: MASTER_PLAN §3.2 S2, §4.4; doc 01 §6.2. */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BellRing, ChevronRight, PlayCircle, Sparkles } from 'lucide-react'
import { getHomeView, type HomeView } from '@/engine/selectors'
import { dismissNudge, startOwnPractice } from '@/engine/api'
import type { MockSession, Nudge, Feedback } from '@/domain/types'
import { TOPIC_LABEL, TOPIC_SHORT } from '@/domain/types'
import { Banner, Button, Card, Divider, ScorePill, SectionHeader, Skeleton, Tag, cx, toast } from '@/ui'
import { Ring, Sparkline } from '@/ui/charts'
import { useAppNow, useEngineQuery } from './useEngineQuery'
import { STATUS_WORD, dayDate, greeting, parseIsoDay, plural, relDay } from './format'
import { practiceHref, runNudge } from './nudgeAction'

export default function Home() {
  const q = useEngineQuery(() => getHomeView())
  const now = useAppNow()

  if (q.status === 'loading') return <HomeSkeleton />
  if (q.status === 'error') {
    return (
      <div className="mx-auto max-w-[1040px] px-8 pt-12 animate-rise">
        <h1 className="text-title-1 text-primary">{greeting(now)}</h1>
        <Banner tone="danger" className="mt-8" title="Home couldn't load">
          Your data is safe in this browser. Reload the page to try again.
          <div className="mt-1 font-mono text-caption text-tertiary">{q.error.message}</div>
        </Banner>
      </div>
    )
  }
  return <HomeContent v={q.data} now={now} />
}

export function HomeContent({ v, now }: { v: HomeView; now: number }) {
  const name = v.profile?.firstName?.trim()
  const interviewAt = v.profile?.interviewDate ? parseIsoDay(v.profile.interviewDate) : null
  const showResume = v.inProgress && v.nextUp?.cta.action !== 'resume_mock'
  const firstRun = v.recent.length === 0 && v.topics.every((t) => t.countedMocks === 0)

  return (
    <div className="mx-auto w-full max-w-[1040px] px-8 pb-24 pt-12 animate-rise">
      {v.profile?.isDemo ? <SampleBanner /> : null}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-title-1 text-primary">{greeting(now)}{name ? `, ${name}` : ''}</h1>
          <p className="mt-1 text-body text-secondary">{dayDate(now)}</p>
        </div>
        <div className="text-callout">
          {v.interviewInDays != null && v.interviewInDays >= 0 ? (
            <span className="text-secondary">
              <span className="font-medium text-primary">
                {v.interviewInDays === 0 ? 'Interview today' : `Interview in ${plural(v.interviewInDays, 'day')}`}
              </span>
              {interviewAt ? ` · ${dayDate(interviewAt)}` : ''}
            </span>
          ) : (
            <Link to="/settings#profile" className="text-label text-accent hover:underline">Add interview date</Link>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-x-8 gap-y-10 min-[1100px]:grid-cols-12">
        <div className="flex flex-col gap-4 min-[1100px]:col-span-8">
          {showResume && v.inProgress ? <ResumeBanner mock={v.inProgress} /> : null}
          <NextUpCard v={v} />
          {v.banner && v.banner.id !== v.nextUp?.id ? <NudgeBanner nudge={v.banner} v={v} /> : null}
        </div>

        <aside className="min-[1100px]:col-span-4">
          <WeeklyCard weekly={v.weekly} firstRun={firstRun} />
        </aside>

        <section className="min-[1100px]:col-span-8">
          <SectionHeader title="Topics" action={<Link to="/progress" className="text-label text-accent hover:underline">See progress</Link>} />
          <TopicList v={v} now={now} />
        </section>

        <section className="min-[1100px]:col-span-8">
          <SectionHeader title="Recent mocks" />
          <RecentList recent={v.recent} now={now} />
        </section>
      </div>
    </div>
  )
}

/* ---------------- Next up ---------------- */

function NextUpCard({ v }: { v: HomeView }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const n = v.nextUp
  const mode = v.profile?.preferredMode === 'voice' ? 'Voice' : 'Text'

  if (!n) {
    return (
      <Card className="p-6">
        <div className="text-footnote text-secondary">Next up</div>
        <h2 className="mt-1.5 text-title-2 text-primary">Start a mock</h2>
        <p className="mt-1.5 max-w-[60ch] text-body text-secondary">Pick a topic and a question. Every mock ends with a score and three fixes.</p>
        <div className="mt-5"><Button variant="primary" size="lg" icon={PlayCircle} onClick={() => navigate('/practice')}>Start mock</Button></div>
      </Card>
    )
  }

  const act = async () => {
    setBusy(true)
    try { await runNudge(n, v.profile, navigate) }
    catch (e) { toast.error(e instanceof Error ? e.message : 'That didn\'t start. Try again.'); setBusy(false) }
  }
  const href = practiceHref(n)
  const length = n.cta.payload?.length === 'standard' ? 'Standard, about 15 min' : 'Quick, about 10 min'

  return (
    <Card className="p-6">
      <div className="text-footnote text-secondary">Next up{n.topic ? ` · ${TOPIC_LABEL[n.topic]}` : ''}</div>
      <h2 className="mt-1.5 text-title-2 text-primary">{n.title}</h2>
      {n.body ? <p className="mt-1.5 max-w-[62ch] text-body text-secondary">{n.body}</p> : null}
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button variant="primary" size="lg" onClick={act} loading={busy}>{n.cta.label}</Button>
        {href ? (
          <span className="text-footnote text-secondary">
            {mode} · {length} · <Link to={href} className="text-accent hover:underline">Change</Link>
          </span>
        ) : null}
      </div>
    </Card>
  )
}

function NudgeBanner({ nudge, v }: { nudge: Nudge; v: HomeView }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [hidden, setHidden] = useState(false)
  if (hidden) return null
  const act = async () => {
    setBusy(true)
    try { await runNudge(nudge, v.profile, navigate) }
    catch (e) { toast.error(e instanceof Error ? e.message : 'That didn\'t start. Try again.'); setBusy(false) }
  }
  const dismiss = async () => {
    setHidden(true)
    try { await dismissNudge(nudge.id) } catch (e) { console.warn('[home] dismissNudge failed', e) }
  }
  return (
    <Banner
      tone="nudge"
      icon={BellRing}
      title={nudge.title}
      action={<Button size="sm" onClick={act} loading={busy}>{nudge.cta.label}</Button>}
      onDismiss={dismiss}
      className="animate-rise"
    >
      {nudge.body}
    </Banner>
  )
}

function ResumeBanner({ mock }: { mock: MockSession }) {
  const navigate = useNavigate()
  const asked = mock.machine.followupsAsked
  const left = Math.max(0, mock.followupsPlanned - asked)
  const where = mock.machine.slot.kind === 'main' ? 'Main answer still open.' : `${plural(left, 'follow-up')} left.`
  return (
    <Banner
      tone="info"
      icon={PlayCircle}
      title={`Your ${TOPIC_LABEL[mock.topic]} mock is still open`}
      action={<Button size="sm" onClick={() => navigate(`/mock/${mock.id}`)}>Resume</Button>}
    >
      {where} You can pick it up within 24 hours.
    </Banner>
  )
}

/* ---------------- Weekly ring ---------------- */

function WeeklyCard({ weekly, firstRun }: { weekly: HomeView['weekly']; firstRun: boolean }) {
  const { reviewed, goal } = weekly
  const met = reviewed >= goal && goal > 0
  const sub = met
    ? 'Weekly goal met'
    : firstRun && reviewed === 0
      ? 'Your first reviewed mock counts here'
      : `${plural(goal - reviewed, 'more mock', 'more mocks')} to reach your goal`
  return (
    <Card className="p-5">
      <div className="flex items-center gap-4">
        <Ring value={reviewed} goal={goal} label={`${reviewed} of ${goal} reviewed mocks this week`}>
          <span className="text-headline text-primary tabular">{reviewed}/{goal}</span>
        </Ring>
        <div className="min-w-0">
          <div className="text-headline text-primary">{reviewed} of {goal} reviewed mocks this week</div>
          <div className={cx('mt-0.5 text-footnote', met ? 'text-positive' : 'text-secondary')}>{sub}</div>
        </div>
      </div>
      <Divider className="my-4" />
      <p className="text-footnote text-tertiary">A mock counts once you've read its fixes. The week resets on Monday.</p>
    </Card>
  )
}

/* ---------------- Topics ---------------- */

function TopicList({ v, now }: { v: HomeView; now: number }) {
  const navigate = useNavigate()
  const rows = [...v.topics].sort((a, b) => {
    if (a.isWeakest !== b.isWeakest) return a.isWeakest ? -1 : 1
    if (a.score == null && b.score == null) return 0
    if (a.score == null) return 1
    if (b.score == null) return -1
    return a.score - b.score
  })
  const guesses = v.profile?.selfRatings ?? {}

  return (
    <div className="-mx-3 flex flex-col stagger">
      {rows.map((t, i) => (
        <div key={t.topic}>
          {i > 0 ? <Divider className="mx-3" /> : null}
          <button
            onClick={() => navigate(`/progress?topic=${t.topic}`)}
            className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[minmax(0,1fr)_110px_84px_76px_116px_16px] rounded-md px-3 py-3 text-left transition-colors duration-100 hover:bg-hover"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-headline text-primary">{TOPIC_LABEL[t.topic]}</span>
              {t.isWeakest ? <Tag tone="nudge">Weakest</Tag> : null}
            </span>
            <span className="hidden text-footnote text-secondary md:block">{t.countedMocks ? STATUS_WORD[t.status] : 'No mocks yet'}</span>
            <span className="hidden md:block"><Sparkline values={t.spark} /></span>
            <span className="flex justify-end">
              {t.score != null ? <ScorePill value={t.score} /> : guesses[t.topic] ? <span className="text-caption text-tertiary">Your guess {guesses[t.topic]}</span> : <span className="text-footnote text-tertiary">—</span>}
            </span>
            <span className="hidden text-right text-footnote text-secondary md:block">{t.lastPractisedAt ? relDay(t.lastPractisedAt, now) : ''}</span>
            <ChevronRight size={16} className="hidden text-tertiary opacity-0 md:block transition-opacity duration-100 group-hover:opacity-100" />
          </button>
        </div>
      ))}
    </div>
  )
}

/* ---------------- Sample data ---------------- */

function SampleBanner() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const start = async () => {
    setBusy(true)
    try { await startOwnPractice(); navigate('/welcome', { replace: true }) } finally { setBusy(false) }
  }
  return (
    <Banner
      tone="info"
      icon={Sparkles}
      className="mb-8"
      title="You're looking at sample data"
      action={<Button size="sm" onClick={start} disabled={busy}>Start my own practice</Button>}
    >
      This is Ishita, three weeks into PM interview prep. Open her reports, try a retry or look at Progress. When you're ready, start fresh. Nothing leaves this browser.
    </Banner>
  )
}

/* ---------------- Recent mocks ---------------- */

function mockStatus(mock: MockSession, fb?: Feedback): { label: string; tone: 'neutral' | 'nudge' | 'accent' } {
  if (mock.status === 'abandoned') return { label: 'Abandoned', tone: 'neutral' }
  if (mock.status === 'error') return { label: "Couldn't score", tone: 'neutral' }
  if (!fb) return { label: 'Scoring…', tone: 'neutral' }
  if (!fb.counted) return { label: 'Practice only', tone: 'neutral' }
  if (!fb.fixesViewedAt) return { label: fb.openedAt ? 'Fixes not read' : 'Feedback unread', tone: 'nudge' }
  return { label: 'Reviewed', tone: 'neutral' }
}

function RecentList({ recent, now }: { recent: HomeView['recent']; now: number }) {
  const navigate = useNavigate()
  if (!recent.length) return <p className="text-callout text-secondary">No mocks yet. Your first one lands here with its score.</p>
  return (
    <div className="-mx-3 flex flex-col stagger">
      {recent.slice(0, 5).map(({ mock, feedback }, i) => {
        const s = mockStatus(mock, feedback)
        const to = feedback ? `/feedback/${feedback.id}` : mock.status === 'completed' || mock.status === 'ended_early' ? `/mock/${mock.id}/scoring` : null
        const at = mock.endedAt ?? mock.lastActivityAt
        return (
          <div key={mock.id}>
            {i > 0 ? <Divider className="mx-3" /> : null}
            <button
              disabled={!to}
              onClick={() => to && navigate(to)}
              className="group grid w-full grid-cols-[minmax(0,1fr)_auto_52px_16px] items-center gap-3 rounded-md px-3 py-3 text-left transition-colors duration-100 enabled:hover:bg-hover disabled:cursor-default"
            >
              <span className="min-w-0">
                <span className="block truncate text-headline font-medium text-primary">{mock.questionSnapshot.prompt}</span>
                <span className="mt-0.5 block text-footnote text-secondary">
                  {TOPIC_SHORT[mock.topic]} · {relDay(at, now)}{mock.retryOf ? ' · Retry' : ''}
                </span>
              </span>
              <Tag tone={s.tone}>{s.label}</Tag>
              <span className="flex justify-end">{feedback ? <ScorePill value={feedback.overall} /> : null}</span>
              <ChevronRight size={16} className={cx('text-tertiary opacity-0 transition-opacity duration-100', to && 'group-hover:opacity-100')} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

/* ---------------- Loading ---------------- */

function HomeSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1040px] px-8 pt-12" aria-busy>
      <Skeleton className="h-8 w-72" />
      <Skeleton className="mt-2 h-4 w-32" />
      <div className="mt-8 grid grid-cols-1 gap-8 min-[1100px]:grid-cols-12">
        <Skeleton className="h-[168px] rounded-lg min-[1100px]:col-span-8" />
        <Skeleton className="h-[132px] rounded-lg min-[1100px]:col-span-4" />
        <div className="flex flex-col gap-4 min-[1100px]:col-span-8">
          <Skeleton className="h-5 w-24" />
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-6" />)}
        </div>
      </div>
    </div>
  )
}
