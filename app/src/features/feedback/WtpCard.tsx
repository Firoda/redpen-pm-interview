/* Willingness to pay (S9). Quiet, dismissible, never blocks. Shown under the rating after the 5th counted mock. */
import { useState } from 'react'
import { X } from 'lucide-react'
import type { Profile } from '@/domain/types'
import { answerWtp } from '@/engine/api'
import { Button, IconButton, Input } from '@/ui'

type Answer = NonNullable<NonNullable<Profile['wtp']>['answer']>

export function WtpCard({ price, countedMocks, onDismiss }: { price: number; countedMocks?: number; onDismiss: () => void }) {
  const [lower, setLower] = useState(false)
  const [stated, setStated] = useState('')
  const [answered, setAnswered] = useState<Answer | null>(null)
  const [saving, setSaving] = useState<Answer | null>(null)

  const send = async (a: Answer, p?: number) => {
    setSaving(a)
    try {
      await answerWtp(a, p)
      setAnswered(a)
    } catch (e) {
      console.error('[report] answerWtp failed', e)
      setAnswered(a) // never block on this; the answer is a nicety
    } finally {
      setSaving(null)
    }
  }

  if (answered) {
    return (
      <section className="rounded-lg bg-subtle px-5 py-4 text-callout text-secondary animate-fade" role="status">
        Noted. Thank you. Nothing changes in the app.
      </section>
    )
  }

  const statedNum = Number(stated)
  const validLower = stated.trim() !== '' && Number.isFinite(statedNum) && statedNum >= 0 && statedNum < price

  return (
    <section className="rounded-lg bg-subtle px-5 py-4 animate-rise" aria-labelledby="wtp-title">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p id="wtp-title" className="text-body text-primary">
            {countedMocks && countedMocks >= 5 ? `You've done ${countedMocks} scored mocks. ` : ''}
            Would you pay ₹{price} a month to keep your full history and unlimited mocks?
          </p>
        </div>
        <IconButton icon={X} label="Dismiss" size="sm" onClick={onDismiss} className="-mr-1 -mt-0.5" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" loading={saving === 'yes'} onClick={() => void send('yes')}>Yes</Button>
        <Button size="sm" variant={lower ? 'ghost' : 'secondary'} aria-expanded={lower} onClick={() => setLower((x) => !x)}>Yes, at a lower price</Button>
        <Button size="sm" variant="secondary" loading={saving === 'no'} onClick={() => void send('no')}>No</Button>
        <Button size="sm" variant="ghost" loading={saving === 'unsure'} onClick={() => void send('unsure')}>Not sure</Button>
      </div>
      {lower ? (
        <form
          className="mt-3 flex items-center gap-2 animate-rise"
          onSubmit={(e) => { e.preventDefault(); if (validLower) void send('yes_lower', Math.round(statedNum)) }}
        >
          <span className="text-callout text-secondary">₹</span>
          <Input autoFocus type="number" inputMode="numeric" min={0} max={price - 1} value={stated} onChange={(e) => setStated(e.target.value)}
            placeholder="99" aria-label="Price you would pay per month, in rupees" className="h-8 w-28 tabular" />
          <span className="text-callout text-secondary">a month</span>
          <Button size="sm" variant="secondary" type="submit" disabled={!validLower} loading={saving === 'yes_lower'}>Send</Button>
        </form>
      ) : null}
      <p className="mt-3 text-footnote text-tertiary">Just a question. Nothing changes in the app.</p>
    </section>
  )
}
