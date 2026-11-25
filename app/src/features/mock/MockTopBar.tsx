/* Interview-room top bar (56 px, hairline). Left: End + topic · question. Centre: progress segments + label.
 * Right: soft timer (amber past the timebox, never cuts) and the Text / Voice switch. Never a score. */
import { useEffect, useState } from 'react'
import { ChevronLeft, Keyboard, Mic, PanelRight } from 'lucide-react'
import type { InputMode, TopicId } from '@/domain/types'
import { TOPIC_LABEL } from '@/domain/types'
import { Clock } from '@/services/clock'
import { cx, IconButton, Kbd, Segmented } from '@/ui'
import { fmtClock, questionTitle, type MockProgress } from './lib'

export function ProgressSegments({ progress }: { progress: MockProgress }) {
  const n = progress.planned + 1
  return (
    <div className="flex items-center gap-[3px]" aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        const complete = i < progress.slot || (progress.done && i <= progress.slot)
        const current = !progress.done && i === progress.slot
        return (
          <span
            key={i}
            className={cx(
              'h-1 rounded-full transition-all duration-300 ease-standard',
              i === 0 ? 'w-5' : 'w-3.5',
              complete ? 'bg-[var(--text-secondary)]' : current ? 'bg-accent' : 'bg-[var(--border-strong)]',
            )}
          />
        )
      })}
    </div>
  )
}

export function SoftTimer({ elapsed, timeboxMin }: { elapsed: () => number; timeboxMin: number }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const h = setInterval(() => tick((x) => x + 1), 1000)
    const un = Clock.subscribe(() => tick((x) => x + 1))
    return () => { clearInterval(h); un() }
  }, [])
  const ms = elapsed()
  const over = ms > timeboxMin * 60_000
  return (
    <span
      className={cx('text-callout tabular transition-colors duration-300', over ? 'text-nudge-text' : 'text-secondary')}
      style={{ fontWeight: 500 }}
      title={over ? 'Past the usual time. Keep going; nothing is cut off.' : `About ${timeboxMin} minutes`}
      role="timer"
      aria-label={`Elapsed ${fmtClock(ms)} of ${timeboxMin} minutes`}
    >
      {fmtClock(ms)}<span className={over ? 'text-nudge-text' : 'text-tertiary'}> / {String(timeboxMin).padStart(2, '0')}:00</span>
    </span>
  )
}

export function MockTopBar({ topic, prompt, progress, elapsed, timeboxMin, mode, onModeChange, onEnd, voiceAvailable, modeLocked, onTogglePanel, panelOpen }: {
  topic: TopicId
  prompt: string
  progress: MockProgress | null
  elapsed: (() => number) | null
  timeboxMin: number
  mode: InputMode
  onModeChange: (m: InputMode) => void
  onEnd: () => void
  voiceAvailable: boolean
  modeLocked?: boolean
  onTogglePanel?: () => void
  panelOpen?: boolean
}) {
  return (
    <header className="relative z-10 grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-b border-border bg-surface px-3">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={onEnd}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md pl-1.5 pr-2.5 text-label text-secondary transition-colors duration-100 hover:bg-hover hover:text-primary"
          title="End this mock (Esc)"
        >
          <ChevronLeft size={16} strokeWidth={2} />
          End
          <Kbd className="ml-1 max-[1100px]:hidden">Esc</Kbd>
        </button>
        <span className="h-4 w-px shrink-0 bg-border" aria-hidden />
        <div className="flex min-w-0 items-baseline gap-1.5 text-callout">
          <span className="shrink-0 text-primary" style={{ fontWeight: 500 }}>{TOPIC_LABEL[topic]}</span>
          <span className="shrink-0 text-tertiary">·</span>
          <span className="truncate text-secondary" title={prompt}>{questionTitle(prompt, 90)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2.5" aria-live="polite">
        {progress ? (
          <>
            <ProgressSegments progress={progress} />
            <span className="text-callout tabular text-secondary" style={{ fontWeight: 500 }}>{progress.label}</span>
          </>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-3">
        {elapsed ? <SoftTimer elapsed={elapsed} timeboxMin={timeboxMin} /> : null}
        <Segmented<InputMode>
          size="sm"
          value={mode}
          onChange={(m) => { if (!modeLocked && m !== mode) onModeChange(m) }}
          options={[
            { value: 'text', label: 'Text', icon: Keyboard },
            { value: 'voice', label: voiceAvailable ? 'Voice' : 'Voice', icon: Mic },
          ]}
        />
        {onTogglePanel ? (
          <IconButton icon={PanelRight} label={panelOpen ? 'Hide transcript' : 'Show transcript'} size="sm" onClick={onTogglePanel} className={panelOpen ? 'text-primary' : ''} />
        ) : null}
      </div>
    </header>
  )
}
