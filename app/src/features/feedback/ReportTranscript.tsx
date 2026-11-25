/* Full transcript on the report, collapsed by default. "Jump to answer" opens it, scrolls and flashes the turn. */
import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { MockSession } from '@/domain/types'
import { cx } from '@/ui'
import { buildTimeline, ModeSwitchLine, TurnBlock } from '@/features/mock/Transcript'
import { flashTurn, onJumpToTurn } from './jump'

export function ReportTranscript({ mock }: { mock: MockSession }) {
  const [open, setOpen] = useState(false)
  const items = buildTimeline(mock)
  const turnCount = mock.turns.length

  useEffect(() => onJumpToTurn((id) => {
    setOpen(true)
    // Wait for the expanded list to render, then scroll and flash.
    requestAnimationFrame(() => requestAnimationFrame(() => flashTurn(id)))
  }), [])

  return (
    <section id="transcript" aria-labelledby="transcript-title">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="-mx-2 flex w-[calc(100%+16px)] items-center justify-between rounded-md px-2 py-2 text-left hover:bg-hover"
      >
        <span id="transcript-title" className="text-title-3 text-primary">
          Full transcript <span className="text-body text-tertiary" style={{ fontWeight: 400 }}>· {turnCount} turns</span>
        </span>
        <ChevronDown size={18} strokeWidth={2} className={cx('text-secondary transition-transform duration-200 ease-standard', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="mt-4 flex flex-col gap-6 animate-rise">
          {items.map((it) => it.kind === 'switch'
            ? <ModeSwitchLine key={it.key} mode={it.mode} at={it.at} />
            : <TurnBlock key={it.turn.id} turn={it.turn} session={mock} />)}
        </div>
      ) : null}
    </section>
  )
}
