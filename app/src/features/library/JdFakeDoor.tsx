/* Fake-door test for JD tailoring (Phase 2). Records interest on the profile and fires jd_fake_door_clicked.
 * Spec: MASTER_PLAN §3.2 S7 (Should). */
import { useState } from 'react'
import { saveProfile } from '@/engine/api'
import { Analytics } from '@/services/analytics'
import { Clock } from '@/services/clock'
import type { Profile } from '@/domain/types'
import { Button, Tag, Textarea } from '@/ui'
import { shortDate } from '@/features/home/format'

export function JdFakeDoor({ profile }: { profile: Profile | null | undefined }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const done = profile?.jdInterest

  const submit = async () => {
    const t = text.trim()
    if (!t) return
    setBusy(true)
    setError(null)
    try {
      await saveProfile({ jdInterest: { text: t.slice(0, 5000), at: Clock.now() } })
      void Analytics.track('jd_fake_door_clicked', { chars: t.length })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg bg-subtle p-5">
      <div className="flex items-center gap-2">
        <h3 className="text-title-3 text-primary">Tailor to a job description</h3>
        <Tag>Coming in Phase 2</Tag>
      </div>
      <p className="mt-1 max-w-[60ch] text-callout text-secondary">
        Paste a JD and practise the questions that role is most likely to ask, scored against what the team looks for.
      </p>
      {done ? (
        <p className="mt-4 text-callout text-positive">Noted on {shortDate(done.at)}. We'll tell you here when it's ready.</p>
      ) : (
        <div className="mt-4">
          <Textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste a JD to get notified"
            className="text-callout"
            aria-label="Job description"
          />
          {error ? <p className="mt-1.5 text-footnote text-danger">{error}</p> : null}
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-footnote text-tertiary">Stays in this browser. Used only to gauge interest.</span>
            <Button size="sm" onClick={submit} loading={busy} disabled={!text.trim()}>Notify me</Button>
          </div>
        </div>
      )}
    </div>
  )
}
