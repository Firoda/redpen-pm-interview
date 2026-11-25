/* Report header: caption, the overall score (score-xl, tinted by score), label vs the hire bar, verdict,
 * five compact dimension pills, grader / practice-only / retry tags and the weighting caption. */
import type { Feedback, MockSession, Question, TopicId } from '@/domain/types'
import { DIMENSION_LABEL, SCORE_LABEL, TOPIC_LABEL } from '@/domain/types'
import { cx, fmtScore, roundScore, ScorePill, scoreInkClass, Tag } from '@/ui'
import { modesUsedLabel, questionTitle } from '@/features/mock/lib'
import { scrollToId } from './jump'

const ROUND_NAME: Record<TopicId, string> = {
  product_design: 'product design', rca: 'RCA', metrics: 'metrics', guesstimate: 'guesstimate', strategy: 'strategy', tech: 'tech',
}

export function hireLine(overall: number) {
  if (overall < 4) return 'below the hire bar (4)'
  if (overall < 4.5) return 'at the hire bar (4)'
  return 'above the hire bar (4)'
}

function weightsCaption(fb: Feedback): string | null {
  const ws = fb.dimensionScores.map((d) => ({ d: d.dimension, w: d.weight }))
  if (!ws.length || ws.some((x) => typeof x.w !== 'number')) return null
  const pct = (w: number) => Math.round(w <= 1 ? w * 100 : w)
  const min = Math.min(...ws.map((x) => x.w))
  const max = Math.max(...ws.map((x) => x.w))
  if (pct(max) === pct(min)) return `Each dimension counts equally for a ${ROUND_NAME[fb.topic]} round.`
  const top = ws.filter((x) => pct(x.w) > pct(min)).sort((a, b) => b.w - a.w)
  return `Weighted for a ${ROUND_NAME[fb.topic]} round: ${top.map((x) => `${DIMENSION_LABEL[x.d].toLowerCase()} ${pct(x.w)}%`).join(', ')}, the rest ${pct(min)}% each.`
}

function minutes(m: MockSession): string | null {
  const end = m.endedAt ?? Math.max(...m.turns.map((t) => t.submittedAt), m.startedAt)
  const mins = Math.max(1, Math.round((end - m.startedAt) / 60_000))
  return Number.isFinite(mins) && mins < 600 ? `${mins} min` : null
}

export function ReportHeader({ fb, mock, question, isPracticeOnly, isRetry }: { fb: Feedback; mock: MockSession; question: Question | null; isPracticeOnly: boolean; isRetry: boolean }) {
  const prompt = question?.prompt ?? mock.questionSnapshot.prompt
  const caption = [TOPIC_LABEL[fb.topic], questionTitle(prompt, 70), minutes(mock), modesUsedLabel(mock)].filter(Boolean).join(' · ')
  const r = roundScore(fb.overall)
  const weights = weightsCaption(fb)
  return (
    <header>
      <p className="text-footnote text-secondary" title={prompt}>{caption}</p>

      <div className="mt-5 flex items-end gap-5">
        <div className={cx('text-score-xl tabular', scoreInkClass(fb.overall))} aria-label={`Overall ${fmtScore(fb.overall)} out of 5`}>
          {fmtScore(fb.overall)}
        </div>
        <div className="pb-1">
          <div className="text-headline text-primary">{SCORE_LABEL[r]} <span className="text-secondary" style={{ fontWeight: 400 }}>· {hireLine(fb.overall)}</span></div>
          <div className="mt-0.5 text-footnote text-tertiary">Overall, out of 5</div>
        </div>
      </div>

      <p className="reading mt-4 text-reading text-primary">{fb.verdict}</p>

      <div className="mt-5 flex flex-wrap gap-1.5" aria-label="Scores by dimension">
        {fb.dimensionScores.map((d) => (
          <button
            key={d.dimension}
            type="button"
            onClick={() => scrollToId(`dim-${d.dimension}`)}
            className="inline-flex h-7 items-center gap-1.5 rounded-full bg-subtle pl-2.5 pr-1 text-label text-secondary transition-colors duration-100 hover:bg-hover hover:text-primary"
            aria-label={`${DIMENSION_LABEL[d.dimension]}: ${d.score} out of 5, ${SCORE_LABEL[d.score].toLowerCase()}`}
          >
            {DIMENSION_LABEL[d.dimension]}
            <ScorePill value={d.score} size="sm" />
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Tag tone={fb.grader === 'llm' ? 'accent' : 'neutral'}>{fb.grader === 'llm' ? 'Scored by Claude' : 'Scored by the offline coach'}</Tag>
        {isPracticeOnly ? <Tag tone="nudge">Practice only — not added to your scores</Tag> : null}
        {isRetry ? <Tag>Retry</Tag> : null}
        {weights ? <span className="text-footnote text-tertiary">{weights}</span> : null}
      </div>
    </header>
  )
}
