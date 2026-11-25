/* A static example of what every mock ends with: a fix that quotes the candidate's own words.
 * Shown on onboarding step 1 so the promise is concrete. */
import { ScorePill } from '@/ui'

export function SampleFixCard() {
  return (
    <figure className="rounded-lg bg-surface p-5 text-left shadow-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-caption text-tertiary">Sample fix · Metrics round</span>
        <span className="inline-flex items-center gap-2 text-caption text-secondary">Metrics <ScorePill value={2} showLabel size="sm" /></span>
      </div>
      <div className="mt-3 flex gap-3">
        <span className="text-title-2 leading-6 text-tertiary tabular">1</span>
        <div className="min-w-0 flex-1">
          <div className="text-title-3 text-primary">Name one guardrail before you finish.</div>
          <div className="mt-3 rounded-md bg-subtle py-2.5 pl-4 pr-3 shadow-[inset_2px_0_0_var(--border-strong)]">
            <div className="text-caption text-tertiary">You said</div>
            <blockquote className="quote mt-0.5 text-primary">“If splits go up, the feature is working.”</blockquote>
          </div>
          <p className="mt-3 text-callout text-secondary">
            <span className="font-medium text-primary">Next time: </span>
            pair the success metric with one thing that must not get worse, like payment failures, and say what would make you roll back.
          </p>
        </div>
      </div>
    </figure>
  )
}
