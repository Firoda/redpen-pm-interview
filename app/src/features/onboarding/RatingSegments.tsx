/* Five-segment 1–5 picker that can be left empty (a skipped rating). Clicking the selected value clears it.
 * Used in onboarding step 3 and Settings → Profile. */
import type { Score } from '@/domain/types'
import { SCORE_LABEL } from '@/domain/types'
import { cx } from '@/ui'

export function RatingSegments({ value, onChange, label }: { value?: Score; onChange: (v: Score | undefined) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 rounded-md bg-subtle p-0.5">
      {([1, 2, 3, 4, 5] as Score[]).map((s) => {
        const on = value === s
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${s} — ${SCORE_LABEL[s]}`}
            title={SCORE_LABEL[s]}
            onClick={() => onChange(on ? undefined : s)}
            className={cx(
              'h-8 w-9 rounded-sm text-label tabular transition-all duration-150 ease-standard',
              on ? 'bg-surface text-primary shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(0,0,0,.06)]' : 'text-secondary hover:text-primary',
            )}
          >
            {s}
          </button>
        )
      })}
    </div>
  )
}
