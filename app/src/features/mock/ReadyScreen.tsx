/* Ready screen: the deliberate pause before the round. Centred; the question in `question` type; one primary. */
import { useEffect } from 'react'
import { Keyboard, Mic } from 'lucide-react'
import type { MockSession } from '@/domain/types'
import { DIFFICULTY_LABEL } from './labels'
import { TOPIC_LABEL } from '@/domain/types'
import { INTERVIEWER_NAME } from '@/config/brand'
import { Button, Kbd } from '@/ui'
import { TIMEBOX_MIN, plural } from './lib'
import { FocusChip } from './FocusChip'

export function ReadyScreen({ session, mode, onStart, starting }: { session: MockSession; mode: 'text' | 'voice'; onStart: () => void; starting?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
        const t = e.target as HTMLElement
        if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'BUTTON')) return
        e.preventDefault()
        onStart()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onStart])

  const q = session.questionSnapshot
  const n = session.followupsPlanned
  return (
    <div className="flex flex-1 items-start justify-center overflow-y-auto px-6">
      <div className="w-full max-w-[640px] pt-[14vh] pb-16 animate-rise">
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-secondary">
          <span className="text-primary" style={{ fontWeight: 500 }}>{TOPIC_LABEL[session.topic]}</span>
          <span className="text-tertiary">·</span>
          <span>{DIFFICULTY_LABEL[q.difficulty]}</span>
          <span className="text-tertiary">·</span>
          <span>{session.length === 'quick' ? 'Quick' : 'Standard'}, about {TIMEBOX_MIN[session.length]} min</span>
          <span className="text-tertiary">·</span>
          <span className="inline-flex items-center gap-1">{mode === 'voice' ? <Mic size={13} strokeWidth={2} /> : <Keyboard size={13} strokeWidth={2} />}{mode === 'voice' ? 'Voice' : 'Text'}</span>
        </div>

        <h1 className="text-question text-primary">{q.prompt}</h1>
        {q.setup ? <p className="mt-3 text-body text-secondary">{q.setup}</p> : null}
        {session.focusText ? <div className="mt-5"><FocusChip text={session.focusText} /></div> : null}

        <div className="mt-10 border-t border-border pt-6">
          <p className="text-body text-secondary">
            {INTERVIEWER_NAME} will ask one question and {plural(n, 'follow-up')}. No hints, no scores until the end.
            {' '}Take a moment to structure. Ask a clarifying question whenever you need one.
          </p>
          {mode === 'voice' ? (
            <p className="mt-2 text-footnote text-tertiary">
              Press <Kbd>Space</Kbd> to start and stop talking. Chrome transcribes your words; no audio is stored.
            </p>
          ) : null}
          <div className="mt-6 flex items-center gap-3">
            <Button variant="primary" size="lg" onClick={onStart} loading={starting} kbd="↵" autoFocus>
              I'm ready
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
