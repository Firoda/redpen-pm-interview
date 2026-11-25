/* S10 — Metrics panel (F15). The PM-facing view for the deck: North Star (Weekly Reviewed Mocks) and its
 * inputs, GAME metrics grouped by goal with formulas on hover, the activation funnel, grader split and the
 * live event log. Everything is computed from events in this browser. Spec: MASTER_PLAN §3.2 S10, §9.3, §9.4. */
import { useMemo, useState, type ReactNode } from 'react'
import * as T from '@radix-ui/react-tooltip'
import { Download, Info } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getMetricsView, type MetricsView } from '@/engine/selectors'
import { db } from '@/services/db/db'
import { Banner, Button, Divider, Input, Page, SectionHeader, Skeleton, Tag, cx } from '@/ui'
import { Bars } from '@/ui/charts'
import { useEngineQuery } from '@/features/home/useEngineQuery'
import { downloadBlob, fullStamp, isoDay, pct, shortDate, signed } from '@/features/home/format'
import { Clock } from '@/services/clock'

export default function Metrics() {
  const q = useEngineQuery(() => getMetricsView())
  const isDemo = useLiveQuery(async () => !!(await db.profile.get('me'))?.isDemo, [], false)

  const header = (
    <span className="inline-flex items-center gap-2">
      Computed from events in this browser.
      {isDemo ? <Tag tone="accent">Includes demo data</Tag> : null}
    </span>
  )

  if (q.status === 'loading') {
    return (
      <Page title="Metrics" sub={header} width="wide">
        <Skeleton className="h-[220px] rounded-lg" />
        <div className="mt-8 grid grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
      </Page>
    )
  }
  if (q.status === 'error') {
    return (
      <Page title="Metrics" sub={header} width="wide">
        <Banner tone="danger" title="Metrics couldn't be computed">
          The event log is still being written. Reload the page to try again.
          <div className="mt-1 font-mono text-caption text-tertiary">{q.error.message}</div>
        </Banner>
      </Page>
    )
  }
  return (
    <T.Provider delayDuration={300}>
      <Page title="Metrics" sub={header} width="wide" actions={<ExportButtons />}>
        <MetricsContent v={q.data} />
      </Page>
    </T.Provider>
  )
}

export function MetricsContent({ v }: { v: MetricsView }) {
  const { nsm, inputs, game, funnel, graderSplit } = v
  const delta = nsm.thisWeek - nsm.lastWeek
  const series = nsm.series.slice(-8)

  return (
    <div className="flex flex-col gap-12">
      {/* North Star */}
      <section className="grid grid-cols-1 gap-8 rounded-lg p-6 shadow-1 min-[1100px]:grid-cols-[320px_1fr]">
        <div>
          <Defined term="North Star" def="Distinct mocks that were completed and whose fixes were read (≥ 50% visible for 2 s), counted in the week the fixes were read. Weeks run Monday to Sunday.">
            <span className="text-footnote text-secondary">North Star · Weekly Reviewed Mocks</span>
          </Defined>
          <div className="mt-2 text-score-xl text-primary tabular">{nsm.thisWeek}</div>
          <div className="mt-2 text-callout text-secondary">
            this week ·{' '}
            <span className={cx(delta > 0 ? 'text-positive' : delta < 0 ? 'text-score-1-text' : 'text-tertiary')}>
              {delta === 0 ? 'same as' : `${signed(delta, 0)} vs`} last week ({nsm.lastWeek})
            </span>
          </div>
          <p className="mt-6 max-w-[34ch] text-footnote text-tertiary">
            One reviewed mock = a finished mock whose feedback was read to the fixes. It is the moment the product delivers its value.
          </p>
        </div>
        <div className="flex flex-col justify-end">
          {series.length ? (
            <Bars data={series.map((s, i) => ({ key: String(s.weekStart), label: i === series.length - 1 ? 'This week' : shortDate(s.weekStart), value: s.value, highlight: i === series.length - 1 }))} height={140} />
          ) : <p className="text-callout text-secondary">No weeks recorded yet.</p>}
        </div>
      </section>

      {/* Inputs */}
      <section>
        <SectionHeader title="What moves the North Star" sub="Breadth × depth × frequency × quality" />
        <div className="grid grid-cols-2 rounded-lg shadow-1 min-[1100px]:grid-cols-4">
          <Tile label="Weekly active" value={inputs.weeklyActive ? 'Yes' : 'No'} def="Breadth: at least one mock started this week." />
          <Tile label="Reviewed mocks per week" value={String(inputs.reviewedPerWeek)} target="≥ 3" def="Depth: reviewed mocks ÷ weekly active users (one browser = one user)." border />
          <Tile label="Second mock within 7 days" value={inputs.secondMockWithin7d == null ? '—' : inputs.secondMockWithin7d ? 'Yes' : 'No'} target="≥ 40% of users" def="Frequency: a second completed mock within 7 days of the first." border />
          <Tile label="Trust rate" value={pct(inputs.trustRate)} target="≥ 70%" def="Quality: reports rated 4 or 5 for 'specific and honest' ÷ rated reports." border />
        </div>
      </section>

      {/* GAME by goal */}
      <section className="flex flex-col gap-8">
        <SectionHeader title="GAME metrics by goal" sub="Hover a metric for its formula" />
        <GoalGroup goal="Honest feedback" line="Feedback she reads, trusts and acts on.">
          <Tile label="Feedback trust score" value={pct(game.trustScore)} target="≥ 70%" def="feedback_rated with rating ≥ 4 (latest per report) ÷ rated reports." />
          <Tile label="Feedback read rate" value={pct(game.feedbackReadRate)} def="Counted mocks with fixes_viewed ÷ counted mocks." border />
          <Tile label="Fix-applied rate" value={pct(game.fixAppliedRate)} def="Counted mocks followed by question_reattempted within 72 h ÷ counted mocks." border />
          <Tile label="Fix uplift" value={game.fixUplift == null ? '—' : signed(game.fixUplift)} target="> 0" def="Mean change on the targeted dimension in same-question retries (retry_completed.uplift)." border />
        </GoalGroup>
        <GoalGroup goal="Practise whenever" line="A real-feeling round on demand, without booking anyone.">
          <Tile label="Mock completion rate" value={pct(game.completionRate)} def="mock_completed ÷ mock_started." />
          <Tile label="Mocks this week" value={String(game.mocksPerWeek)} target="≥ 3" def="Counted mocks completed this week." border />
          <Tile label="Second-mock rate" value={pct(game.secondMockRate)} target="≥ 40%" def="Of first completed mocks, the share followed by a second within 7 days." border />
          <Tile label="Time to first question" value={game.timeToFirstQuestionMs == null ? '—' : `${(game.timeToFirstQuestionMs / 1000).toFixed(0)} s`} target="< 60 s" def="Median first_question_shown − app open, first session." border />
        </GoalGroup>
        <GoalGroup goal="See improvement" line="Progress she can see, and a reason to come back.">
          <Tile label="Tracker views" value={String(game.trackerViews)} def="tracker_viewed events." />
          <Tile label="Weak-topic follow-through" value={pct(game.weakTopicFollowThrough)} def="mock_started on the then-weakest topic ÷ mock_started." border />
          <Tile label="Nudge conversion" value={pct(game.nudgeConversion)} def="nudge_sent followed within 48 h by its matching action ÷ nudge_sent." border />
          <Tile label="Willingness to pay" value={game.wtpAnswer ? wtpLabel(game.wtpAnswer) : '—'} def="Answer to “₹199 a month to keep your full history and unlimited voice mocks?”, asked once after 5 scored mocks." border />
        </GoalGroup>
      </section>

      {/* Funnel + grader */}
      <section className="grid grid-cols-1 gap-12 min-[1100px]:grid-cols-[1fr_320px]">
        <div>
          <SectionHeader title="Mock funnel" sub="From a started mock to a retry with the fix" />
          <Funnel f={funnel} />
        </div>
        <div>
          <SectionHeader title="Who scored the mocks" sub="Calibration check: live model vs offline coach" />
          <GraderSplit g={graderSplit} />
        </div>
      </section>

      <EventLog events={v.events} />
    </div>
  )
}

const wtpLabel = (a: string) => ({ yes: 'Yes', yes_lower: 'Yes, lower price', no: 'No', unsure: 'Not sure' } as Record<string, string>)[a] ?? a

/* ---------------- pieces ---------------- */

function Defined({ term, def, children }: { term: string; def: string; children: ReactNode }) {
  return (
    <T.Root>
      <T.Trigger asChild>
        <span tabIndex={0} className="inline-flex cursor-help items-center gap-1 rounded-xs focus-visible:outline-2" aria-label={`${term}: ${def}`}>
          {children}
          <Info size={12} className="text-tertiary" />
        </span>
      </T.Trigger>
      <T.Portal>
        <T.Content side="top" sideOffset={6} className="z-[70] max-w-[280px] rounded-md bg-elevated px-3 py-2 text-footnote text-primary shadow-2 animate-fade">
          {def}
        </T.Content>
      </T.Portal>
    </T.Root>
  )
}

function Tile({ label, value, target, def, border }: { label: string; value: string; target?: string; def: string; border?: boolean }) {
  return (
    <div className={cx('px-5 py-4', border && 'border-l border-border')}>
      <Defined term={label} def={def}><span className="text-footnote text-secondary">{label}</span></Defined>
      <div className="mt-1 text-title-2 text-primary tabular">{value}</div>
      {target ? <div className="mt-0.5 text-caption text-tertiary">Target {target}</div> : <div className="mt-0.5 h-4" />}
    </div>
  )
}

function GoalGroup({ goal, line, children }: { goal: string; line: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-headline text-primary">{goal}</h3>
        <span className="text-footnote text-secondary">{line}</span>
      </div>
      <div className="grid grid-cols-2 rounded-lg shadow-1 min-[1100px]:grid-cols-4">{children}</div>
    </div>
  )
}

function Funnel({ f }: { f: MetricsView['funnel'] }) {
  const steps: { key: keyof MetricsView['funnel']; label: string }[] = [
    { key: 'started', label: 'Started' },
    { key: 'completed', label: 'Completed' },
    { key: 'opened', label: 'Feedback opened' },
    { key: 'fixesViewed', label: 'Fixes read' },
    { key: 'rated', label: 'Rated' },
    { key: 'retried', label: 'Retried with a fix' },
  ]
  const top = Math.max(1, f.started)
  return (
    <div className="flex flex-col gap-2.5">
      {steps.map((s, i) => {
        const n = f[s.key]
        const prev = i > 0 ? f[steps[i - 1].key] : null
        return (
          <div key={s.key} className="grid grid-cols-[140px_1fr_44px_56px] items-center gap-4">
            <span className="text-callout text-primary">{s.label}</span>
            <div className="h-5 rounded-xs bg-subtle">
              <div className="h-full rounded-xs bg-accent animate-bar" style={{ width: `${(n / top) * 100}%`, opacity: 1 - i * 0.1 }} />
            </div>
            <span className="text-right text-callout font-medium text-primary tabular">{n}</span>
            <span className="text-right text-footnote text-tertiary tabular">{prev != null ? (prev ? `${Math.round((n / prev) * 100)}%` : '—') : ''}</span>
          </div>
        )
      })}
      <p className="mt-1 text-footnote text-tertiary">Right column: conversion from the step above.</p>
    </div>
  )
}

function GraderSplit({ g }: { g: MetricsView['graderSplit'] }) {
  const total = g.llm + g.offline + g.fixture
  const parts = [
    { k: 'llm', label: 'Claude', n: g.llm, color: 'var(--accent)' },
    { k: 'offline', label: 'Offline coach', n: g.offline, color: 'var(--chart-muted)' },
    { k: 'fixture', label: 'Prepared (demo)', n: g.fixture, color: 'var(--border-strong)' },
  ]
  if (!total) return <p className="text-callout text-secondary">No mocks scored yet.</p>
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-xs bg-subtle" role="img" aria-label={parts.map((p) => `${p.label} ${p.n}`).join(', ')}>
        {parts.map((p) => p.n ? <div key={p.k} style={{ width: `${(p.n / total) * 100}%`, background: p.color }} className="h-full border-r-2 border-surface last:border-r-0" /> : null)}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {parts.map((p) => (
          <div key={p.k} className="flex items-center gap-2.5 text-callout">
            <span className="h-2.5 w-2.5 rounded-xs" style={{ background: p.color }} />
            <span className="flex-1 text-primary">{p.label}</span>
            <span className="text-secondary tabular">{p.n}</span>
            <span className="w-10 text-right text-tertiary tabular">{Math.round((p.n / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function propsLine(p: Record<string, unknown>) {
  const entries = Object.entries(p ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
  return entries.map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join('  ')
}

function EventLog({ events }: { events: MetricsView['events'] }) {
  const [all, setAll] = useState(false)
  const [filter, setFilter] = useState('')
  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase()
    const sorted = [...events].sort((a, b) => b.ts - a.ts)
    return f ? sorted.filter((e) => e.name.includes(f)) : sorted
  }, [events, filter])
  const shown = all ? rows : rows.slice(0, 25)

  return (
    <section>
      <SectionHeader
        title="Event log"
        sub={`Latest ${events.length} events, newest first. Updates live.`}
        action={<Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name" className="h-8 w-[200px] text-callout" aria-label="Filter events" />}
      />
      {rows.length ? (
        <div className="overflow-hidden rounded-lg shadow-1">
          <table className="w-full table-fixed text-left">
            <thead>
              <tr className="text-caption text-tertiary">
                <th className="w-[220px] px-4 py-2 font-medium">Event</th>
                <th className="w-[170px] px-4 py-2 font-medium">Time (app clock)</th>
                <th className="px-4 py-2 font-medium">Properties</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e, i) => (
                <tr key={`${e.ts}-${e.name}-${i}`} className="border-t border-border align-top">
                  <td className="truncate px-4 py-2 font-mono text-caption text-primary">{e.name}</td>
                  <td className="px-4 py-2 text-footnote text-secondary tabular">{fullStamp(e.ts)}</td>
                  <td className="truncate px-4 py-2 font-mono text-caption text-secondary" title={propsLine(e.props)}>{propsLine(e.props) || <span className="text-tertiary">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 25 ? (
            <>
              <Divider />
              <div className="px-4 py-2.5"><Button size="sm" variant="ghost" onClick={() => setAll((a) => !a)}>{all ? 'Show latest 25' : `Show all ${rows.length}`}</Button></div>
            </>
          ) : null}
        </div>
      ) : <p className="text-callout text-secondary">{filter ? 'No events match.' : 'No events yet. Start a mock and they appear here as they fire.'}</p>}
    </section>
  )
}

function ExportButtons() {
  const run = async (kind: 'json' | 'csv') => {
    const events = await db.events.orderBy('ts').toArray()
    const stamp = isoDay(Clock.now()).replace(/-/g, '')
    if (kind === 'json') {
      downloadBlob(new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' }), `redpen-events-${stamp}.json`)
    } else {
      const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
      const lines = ['id,name,ts,iso,mockId,source,props', ...events.map((e) => [e.id, e.name, e.ts, new Date(e.ts).toISOString(), e.mockId ?? '', e.source, esc(JSON.stringify(e.props ?? {}))].join(','))]
      downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv' }), `redpen-events-${stamp}.csv`)
    }
  }
  return (
    <>
      <Button size="sm" icon={Download} onClick={() => run('csv')}>CSV</Button>
      <Button size="sm" icon={Download} onClick={() => run('json')}>JSON</Button>
    </>
  )
}
