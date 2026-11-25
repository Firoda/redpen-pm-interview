/* Fix card: rank numeral · dimension · her quote · why it costs her · what to do next time · optional pattern ·
 * "Retry with this fix" (primary on fix 1 only — the page's one primary). */
import { RotateCcw } from 'lucide-react'
import type { Fix } from '@/domain/types'
import { DIMENSION_LABEL } from '@/domain/types'
import { Button, Tag } from '@/ui'
import { QuoteWell } from './Quote'

export function FixCard({ fix, primary, onRetry, retrying, disabled }: { fix: Fix; primary: boolean; onRetry: (f: Fix) => void; retrying: boolean; disabled?: boolean }) {
  return (
    <article className="flex gap-4 rounded-lg bg-surface py-5 pl-4 pr-6 shadow-1" aria-labelledby={`fix-${fix.id}-title`}>
      <div className="w-8 shrink-0 text-center text-title-2 tabular text-tertiary" aria-hidden>{fix.rank}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Tag>{DIMENSION_LABEL[fix.dimension]}</Tag>
          <span className="sr-only">Fix {fix.rank}</span>
        </div>

        <QuoteWell className="mt-3" text={fix.quote} turnId={fix.turnId} label="You said" />

        <p className="mt-4 text-callout text-secondary">
          <span className="text-primary" style={{ fontWeight: 500 }}>Why it costs you. </span>
          {fix.issue}
        </p>

        <div className="mt-3">
          <div className="text-caption text-tertiary">Next time</div>
          <p id={`fix-${fix.id}-title`} className="mt-0.5 text-reading text-primary" style={{ fontWeight: 500 }}>{fix.instruction}</p>
        </div>

        {fix.pattern ? (
          <p className="mt-3 inline-flex max-w-full items-baseline gap-2 rounded-md bg-subtle px-2.5 py-1.5 text-footnote text-secondary">
            <span className="shrink-0 text-caption text-tertiary">Pattern</span>
            <span className="min-w-0">{fix.pattern}</span>
          </p>
        ) : null}

        <div className="mt-5">
          <Button
            variant={primary ? 'primary' : 'secondary'}
            size={primary ? 'md' : 'sm'}
            icon={RotateCcw}
            kbd={primary ? 'R' : undefined}
            loading={retrying}
            disabled={disabled}
            onClick={() => onRetry(fix)}
          >
            Retry with this fix
          </Button>
        </div>
      </div>
    </article>
  )
}
