/* S6 — Progress (F08). "Am I improving, and what should I fix next?"
 * Summary strip → topic table (select a row) → trend for that topic → dimensions + self vs scored →
 * recurring mistakes → heatmap. The page's one primary action is "Practise {weakest}".
 * Spec: MASTER_PLAN §3.2 S6, §4.9; doc 01 §6.8. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { LineChart } from 'lucide-react'
import { getProgressView, type ProgressView } from '@/engine/selectors'
import { db } from '@/services/db/db'
import { Analytics } from '@/services/analytics'
import { DAY } from '@/services/clock'
import type { DimensionId, TopicId, TopicStatus } from '@/domain/types'
import { DIMENSIONS, DIMENSION_LABEL, TOPICS, TOPIC_LABEL } from '@/domain/types'
import { Banner, Button, Divider, EmptyState, Page, ScoreBar, ScorePill, SectionHeader, Segmented, Skeleton, Tag, cx, fmtScore, scoreVar } from '@/ui'
import { Heatmap, Sparkline, TrendChart, type TrendPoint } from '@/ui/charts'
import { useAppNow, useEngineQuery } from '@/features/home/useEngineQuery'
import { STATUS_WORD, plural, relDay, signed } from '@/features/home/format'

type Range = '2w' | '4w' | 'all'
const RANGE_MS: Record<Range, number> = { '2w': 14 * DAY, '4w': 28 * DAY, all: Infinity }
type Data = { v: ProgressView; titles: Record<string, string> }

const statusTone = (s: TopicStatus) => (s === 'consistent' ? 'positive' : 'neutral') as 'positive' | 'neutral'

export default function Progress() {
  const q = useEngineQuery<Data>(async () => {
    const v = await getProgressView()
    const ids = v.topics.flatMap((t) => t.history.map((h) => h.mockId))
    const mocks = ids.length ? await db.mockSessions.bulkGet(ids) : []
    const titles: Record<string, string> = {}
    mocks.forEach((m) => { if (m) titles[m.id] = m.questionSnapshot.prompt })
    return { v, titles }
  })
  const [params] = useSearchParams()
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current || q.status === 'loading') return
    fired.current = true
    const v = q.status === 'ready' ? q.data.v : null
    void Analytics.track('tracker_viewed', {
      view: 'overview',
      weakestTopic: v?.weakest ?? null,
      countedMocks: v?.totals.counted ?? null,
      entryPoint: params.get('topic') ? 'home_topic' : params.get('from') ?? 'nav',
    })
  }, [q.status, q, params])

  if (q.status === 'loading') return <ProgressSkeleton />
  if (q.status === 'error') {
    return (
      <Page title="Progress">
        <Banner tone="danger" title="Progress couldn't load">
          Your mocks are safe in this browser. Reload the page to try again.
          <div className="mt-1 font-mono text-caption text-tertiary">{q.error.message}</div>
        </Banner>
      </Page>
    )
  }
  return <ProgressContent data={q.data} />
}

export function ProgressContent({ data: { v, titles } }: { data: Data }) {
  const navigate = useNavigate()
  const now = useAppNow()
  const [params, setParams] = useSearchParams()
  const [range, setRange] = useState<Range>('4w')
  const seenTopics = useRef(new Set<TopicId>())

  const byTopic = useMemo(() => new Map(v.topics.map((t) => [t.topic, t])), [v.topics])
  const paramTopic = params.get('topic') as TopicId | null
  const selected: TopicId = paramTopic && byTopic.has(paramTopic) ? paramTopic : v.weakest ?? v.topics.find((t) => t.countedMocks > 0)?.topic ?? 'product_design'
  const sel = byTopic.get(selected)
  const weakest = v.weakest
  const hasData = v.totals.counted > 0 || v.topics.some((t) => t.countedMocks > 0)

  const select = (t: TopicId) => {
    setParams((p) => { p.set('topic', t); return p }, { replace: true })
    if (!seenTopics.current.has(t)) {
      seenTopics.current.add(t)
      void Analytics.track('tracker_viewed', { view: 'topic', topic: t })
    }
  }
  const practise = (t: TopicId) => navigate(`/practice?topic=${t}&entry=progress`)

  const actions = weakest ? (
    <Button variant="primary" onClick={() => practise(weakest)}>Practise {TOPIC_LABEL[weakest].toLowerCase()}</Button>
  ) : null

  if (!hasData) {
    return (
      <Page title="Progress">
        <EmptyState
          icon={LineChart}
          title="No scores yet"
          body="Finish one mock and your first scores land here, by topic and by dimension."
          action={<Button variant="primary" onClick={() => navigate('/practice')}>Start a 10-minute mock</Button>}
        />
      </Page>
    )
  }

  const scored = v.topics.filter((t) => t.score != null)
  const avg = scored.length ? scored.reduce((s, t) => s + (t.score ?? 0), 0) / scored.length : null
  const weak = weakest ? byTopic.get(weakest) : undefined

  // topic table order: weakest first, then by score ascending, unscored last
  const rows = [...v.topics].sort((a, b) => {
    if (a.isWeakest !== b.isWeakest) return a.isWeakest ? -1 : 1
    if (a.score == null && b.score == null) return TOPICS.indexOf(a.topic) - TOPICS.indexOf(b.topic)
    if (a.score == null) return 1
    if (b.score == null) return -1
    return a.score - b.score
  })

  const cutoff = now - RANGE_MS[range]
  const points: TrendPoint[] = (sel?.history ?? [])
    .filter((h) => h.at >= cutoff)
    .map((h) => ({ id: h.mockId, at: h.at, score: h.score, isRetry: h.isRetry, title: titles[h.mockId] }))

  return (
    <Page title="Progress" sub="Scores from your AI-scored mocks, by topic and by dimension." actions={actions}>
      {/* 1. summary strip */}
      <div className="grid grid-cols-3 rounded-lg shadow-1">
        <Stat label="Reviewed mocks" value={String(v.totals.reviewed)} />
        <Stat label="Average topic score" value={fmtScore(avg)} className="border-l border-border" />
        <Stat
          label="Weakest"
          value={weak ? `${TOPIC_LABEL[weak.topic]} ${fmtScore(weak.score)}` : '—'}
          className="border-l border-border"
        />
      </div>
      <p className="mt-2.5 text-footnote text-secondary">
        {plural(v.totals.counted, 'scored mock')} · {plural(v.totals.retries, 'retry', 'retries')}
        {v.totals.avgUplift != null ? ` · average fix uplift ${signed(v.totals.avgUplift)}` : ''}
      </p>

      {/* 2. topic table */}
      <section className="mt-10">
        <div className="grid grid-cols-[minmax(0,1fr)_56px_64px_88px_72px_112px_112px] gap-3 px-3 pb-2 text-caption text-tertiary">
          <span>Topic</span><span className="text-right">Mocks</span><span className="text-right">Score</span><span>Trend</span>
          <span className="text-right">14 days</span><span className="text-right">Last practised</span><span>Status</span>
        </div>
        <Divider />
        <div role="listbox" aria-label="Topics" className="flex flex-col pt-1">
          {rows.map((t) => {
            const on = t.topic === selected
            return (
              <button
                key={t.topic}
                role="option"
                aria-selected={on}
                onClick={() => select(t.topic)}
                className={cx(
                  'grid grid-cols-[minmax(0,1fr)_56px_64px_88px_72px_112px_112px] items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors duration-100',
                  on ? 'bg-selected' : 'hover:bg-hover',
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className={cx('truncate text-headline', on ? 'text-accent' : 'text-primary')}>{t.label}</span>
                  {t.isWeakest ? <Tag tone="nudge">Weakest</Tag> : null}
                  {t.countedMocks === 1 ? <Tag>Low data</Tag> : null}
                </span>
                <span className="text-right text-callout text-secondary tabular">{t.countedMocks}</span>
                <span className="flex justify-end">{t.score != null ? <ScorePill value={t.score} /> : <span className="text-footnote text-tertiary">—</span>}</span>
                <Sparkline values={t.history.map((h) => h.score)} />
                <span className={cx('text-right text-callout tabular', t.delta14 == null ? 'text-tertiary' : t.delta14 > 0.05 ? 'text-positive' : t.delta14 < -0.05 ? 'text-score-1-text' : 'text-tertiary')}>
                  {t.delta14 == null ? '—' : signed(t.delta14)}
                </span>
                <span className="text-right text-footnote text-secondary">{t.lastPractisedAt ? relDay(t.lastPractisedAt, now) : '—'}</span>
                <span><Tag tone={statusTone(t.status)}>{STATUS_WORD[t.status]}</Tag></span>
              </button>
            )
          })}
        </div>
      </section>

      {/* 3. trend for the selected topic */}
      <section className="mt-12">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <h2 className="text-title-3 text-primary">{TOPIC_LABEL[selected]}</h2>
            {sel?.score != null ? <ScorePill value={sel.score} showLabel /> : null}
            {sel ? <Tag tone={statusTone(sel.status)}>{STATUS_WORD[sel.status]}</Tag> : null}
          </div>
          <Segmented size="sm" value={range} onChange={setRange} options={[{ value: '2w', label: '2 weeks' }, { value: '4w', label: '4 weeks' }, { value: 'all', label: 'All' }]} />
        </div>
        {points.length ? (
          <TrendChart key={`${selected}-${range}`} points={points} label={`${TOPIC_LABEL[selected]} scores`} />
        ) : (
          <div className="flex h-[240px] flex-col items-center justify-center rounded-lg bg-subtle text-center">
            <p className="text-callout text-secondary">
              {sel?.countedMocks ? `No ${TOPIC_LABEL[selected]} mocks in this range.` : `No ${TOPIC_LABEL[selected]} mocks yet.`}
            </p>
            <Button className="mt-3" size="sm" onClick={() => practise(selected)}>Practise {TOPIC_LABEL[selected].toLowerCase()}</Button>
          </div>
        )}
        <p className="mt-3 text-footnote text-secondary">
          {points.length === 1 ? "One point isn't a trend yet. " : ''}
          Based on {plural(sel?.countedMocks ?? 0, 'AI-scored mock')}. Confirm with a senior mock before your interview.
          {points.some((p) => p.isRetry) ? <span className="text-tertiary"> ◆ marks a retry.</span> : null}
        </p>
      </section>

      {/* 4. dimensions + self vs scored */}
      <div className="mt-12 grid grid-cols-1 gap-12 min-[1100px]:grid-cols-2">
        <section>
          <SectionHeader title="By dimension" sub={`${TOPIC_LABEL[selected]}, weighted average of your mocks`} />
          <DimensionBars dims={sel?.dimScore ?? {}} />
        </section>
        <section>
          <SectionHeader title="Your guess vs your mocks" sub="What you rated yourself at the start, next to what the mocks say" />
          <SelfVsScored rows={v.selfVsScored} />
        </section>
      </div>

      {/* 5. recurring mistakes */}
      <section className="mt-12">
        <SectionHeader title="Mistakes that keep coming back" sub="Across every topic, from the fixes in your reports" />
        {v.recurring.length ? (
          <div className="flex flex-col stagger">
            {v.recurring.slice(0, 5).map((r, i) => (
              <div key={r.tag}>
                {i > 0 ? <Divider /> : null}
                <div className="flex items-start gap-6 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-headline text-primary">
                      {r.label}
                      <span className="font-normal text-secondary"> — {r.count} of your last {r.of} mocks</span>
                    </div>
                    {r.latestQuote ? <blockquote className="quote mt-1.5 text-secondary">“{r.latestQuote}”</blockquote> : null}
                    <div className="mt-1.5 text-caption text-tertiary">{DIMENSION_LABEL[r.dimension]}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => practise(selected)}>Practise this</Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-callout text-secondary">Nothing repeats yet. A mistake shows here once it appears in two mocks.</p>
        )}
      </section>

      {/* 6. heatmap */}
      <section className="mt-12">
        <SectionHeader title="Where your points go missing" sub="Average score by topic and dimension. The outlined cell is your lowest." />
        <Heatmap
          rows={TOPICS.map((t) => ({ id: t, label: TOPIC_LABEL[t] }))}
          cols={DIMENSIONS.map((d) => ({ id: d, label: DIMENSION_LABEL[d] }))}
          value={(t, d) => v.heatmap[t]?.[d]}
          onRowClick={select}
          selectedRow={selected}
        />
      </section>
    </Page>
  )
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cx('px-5 py-4', className)}>
      <div className="text-footnote text-secondary">{label}</div>
      <div className="mt-1 truncate text-title-2 text-primary tabular">{value}</div>
    </div>
  )
}

function DimensionBars({ dims }: { dims: Partial<Record<DimensionId, number>> }) {
  const any = DIMENSIONS.some((d) => dims[d] != null)
  if (!any) return <p className="text-callout text-secondary">No dimension scores for this topic yet.</p>
  return (
    <div className="flex flex-col gap-3.5">
      {DIMENSIONS.map((d) => {
        const v = dims[d]
        return (
          <div key={d} className="grid grid-cols-[120px_1fr_40px] items-center gap-4">
            <span className="text-callout text-primary">{DIMENSION_LABEL[d]}</span>
            {v != null ? <ScoreBar value={v} /> : <div className="h-2 rounded-xs bg-subtle" />}
            <span className="text-right text-callout font-medium text-primary tabular">{fmtScore(v)}</span>
          </div>
        )
      })}
    </div>
  )
}

function SelfVsScored({ rows }: { rows: ProgressView['selfVsScored'] }) {
  if (!rows.length) return <p className="text-callout text-secondary">Rate yourself in Settings, then finish a mock in that topic to see the gap.</p>
  const biggest = [...rows].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))[0]
  const pos = (x: number) => `${((Math.max(1, Math.min(5, x)) - 1) / 4) * 100}%`
  return (
    <div>
      {biggest && Math.abs(biggest.gap) >= 0.5 ? (
        <p className="mb-4 text-body text-primary">
          You rated {TOPIC_LABEL[biggest.topic]} {biggest.self}; your mocks say {fmtScore(biggest.scored)}.
        </p>
      ) : null}
      <div className="flex flex-col gap-3">
        {rows.map((r) => {
          const lo = Math.min(r.self, r.scored), hi = Math.max(r.self, r.scored)
          return (
            <div key={r.topic} className="grid grid-cols-[120px_1fr_72px] items-center gap-4">
              <span className="truncate text-callout text-primary">{TOPIC_LABEL[r.topic]}</span>
              <div className="relative h-4" aria-label={`${TOPIC_LABEL[r.topic]}: you rated ${r.self}, scored ${fmtScore(r.scored)}`} role="img">
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
                <div className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-[var(--border-strong)]" style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }} />
                <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface shadow-[inset_0_0_0_2px_var(--text-tertiary)]" style={{ left: pos(r.self) }} />
                <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: pos(r.scored), background: scoreVar(r.scored) }} />
              </div>
              <span className="text-right text-footnote text-secondary tabular">{r.self} → {fmtScore(r.scored)}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 text-caption text-tertiary">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full shadow-[inset_0_0_0_2px_var(--text-tertiary)]" />Your guess</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-score-3" />Your mocks</span>
        <span className="ml-auto">1 – 5</span>
      </div>
    </div>
  )
}

function ProgressSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1040px] px-8 pt-12" aria-busy>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-8 h-[84px] rounded-lg" />
      <div className="mt-10 flex flex-col gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-7" />)}</div>
      <Skeleton className="mt-12 h-[240px] rounded-lg" />
    </div>
  )
}
