/* Fix check (retry reports only): the focus dimension before → after, overall before → after, Then/Now quotes,
 * and the other four dimensions compactly. Honest when nothing moved. */
import type { DimensionId, Feedback, MockSession, Retry } from '@/domain/types'
import { DIMENSION_LABEL, DIMENSIONS } from '@/domain/types'
import { cx, fmtScore } from '@/ui'
import { Bar } from './DimensionRow'
import { QuoteWell } from './Quote'

function Delta({ d, decimals = 0, className }: { d: number | null; decimals?: number; className?: string }) {
  if (d == null) return <span className={cx('text-tertiary', className)}>—</span>
  const v = Math.round(d * 10 ** decimals) / 10 ** decimals
  const txt = v > 0 ? `+${v.toFixed(decimals)}` : v < 0 ? `−${Math.abs(v).toFixed(decimals)}` : decimals ? (0).toFixed(decimals) : '0'
  return <span className={cx('tabular', v > 0 ? 'text-positive' : v < 0 ? 'text-score-1-text' : 'text-tertiary', className)} style={{ fontWeight: 600 }}>{txt}</span>
}

export function FixCheck({ retry, feedback, retryOf, mock }: {
  retry: Retry & { targetDimension: DimensionId }
  feedback: Feedback
  retryOf: { feedback: Feedback; mock: MockSession } | null
  mock: MockSession
}) {
  const dim = retry.targetDimension
  const label = DIMENSION_LABEL[dim]
  const nowScore = feedback.dimensionScores.find((d) => d.dimension === dim)
  const before = retry.before ?? retryOf?.feedback.dimensionScores.find((d) => d.dimension === dim)?.score ?? null
  const after = retry.after ?? nowScore?.score ?? null
  const uplift = before != null && after != null ? after - before : null
  const oBefore = retry.overallBefore ?? retryOf?.feedback.overall ?? null
  const oAfter = retry.overallAfter ?? feedback.overall

  const thenFix = retryOf?.feedback.fixes.find((f) => f.id === (retry.fixId ?? mock.retryFixId)) ?? retryOf?.feedback.fixes.find((f) => f.dimension === dim)
  const nowQuote = nowScore?.evidence.find((e) => e.quote?.trim())

  const summary = before == null || after == null
    ? `No baseline for ${label.toLowerCase()}: the first attempt wasn't scored.`
    : uplift! > 0 ? `${label} ${before} → ${after}. The fix landed.`
      : uplift === 0 ? `${label} stayed at ${before}. ${nowScore?.reason ?? ''}`.trim()
        : `${label} went from ${before} to ${after}. ${nowScore?.reason ?? ''}`.trim()

  const others = DIMENSIONS.filter((d) => d !== dim)

  return (
    <section className="rounded-lg bg-surface p-6 shadow-1 animate-rise" aria-labelledby="fixcheck-title">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="fixcheck-title" className="text-title-3 text-primary">Fix check</h2>
        <span className="text-footnote text-tertiary">Same question, same bar. The grader didn't see your first try.</span>
      </div>
      <p className="mt-1 text-body text-secondary">{summary}</p>

      <div className="mt-5 grid grid-cols-[120px_minmax(0,1fr)_56px] items-center gap-x-4 gap-y-2.5">
        <span className="text-headline text-primary">{label}</span>
        <div className="flex items-center gap-3">
          <span className="w-10 text-caption text-tertiary">Then</span>
          <Bar value={before ?? 0} muted animate={false} className="flex-1" />
          <span className="w-7 text-right text-callout tabular text-secondary">{before ?? '—'}</span>
        </div>
        <span className="row-span-2 self-center text-right text-title-2"><Delta d={uplift} /></span>
        <span />
        <div className="flex items-center gap-3">
          <span className="w-10 text-caption text-tertiary">Now</span>
          <Bar value={after ?? 0} delay={200} className="flex-1" />
          <span className="w-7 text-right text-callout tabular text-primary" style={{ fontWeight: 600 }}>{after ?? '—'}</span>
        </div>
      </div>

      <div className="mt-4 flex items-baseline gap-2 border-t border-border pt-3 text-callout text-secondary">
        <span>Overall</span>
        <span className="tabular text-primary">{oBefore != null ? fmtScore(oBefore) : '—'} → {fmtScore(oAfter)}</span>
        <Delta d={oBefore != null ? oAfter - oBefore : null} decimals={1} />
      </div>

      {thenFix || nowQuote ? (
        <div className="mt-5 grid grid-cols-2 gap-4 max-[760px]:grid-cols-1">
          {thenFix ? <QuoteWell label="Then" text={thenFix.quote} /> : <div />}
          {nowQuote ? <QuoteWell label="Now" text={nowQuote.quote} turnId={nowQuote.turnId} /> : null}
        </div>
      ) : null}

      {retryOf ? (
        <details className="group mt-5">
          <summary className="cursor-pointer list-none text-label text-secondary hover:text-primary [&::-webkit-details-marker]:hidden">
            Other dimensions <span className="text-tertiary group-open:hidden">· show</span>
          </summary>
          <div className="mt-2 flex flex-col">
            {others.map((d) => {
              const b = retryOf.feedback.dimensionScores.find((x) => x.dimension === d)?.score
              const a = feedback.dimensionScores.find((x) => x.dimension === d)?.score
              return (
                <div key={d} className="flex items-center gap-3 border-b border-border py-2 text-callout last:border-b-0">
                  <span className="flex-1 text-primary">{DIMENSION_LABEL[d]}</span>
                  <span className="tabular text-secondary">{b ?? '—'} → {a ?? '—'}</span>
                  <span className="w-8 text-right"><Delta d={a != null && b != null ? a - b : null} /></span>
                </div>
              )
            })}
          </div>
        </details>
      ) : null}
    </section>
  )
}
