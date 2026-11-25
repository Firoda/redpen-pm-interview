/* End dialog (End button or Esc). Copy varies with progress — MASTER_PLAN §3.2 S4. Discard asks once more. */
import { useEffect, useState } from 'react'
import { Button, Dialog } from '@/ui'
import { plural, type MockProgress } from './lib'

export type EndChoice = 'keep' | 'leave' | 'finish' | 'discard'

export function EndDialog({ open, onOpenChange, progress, onChoose, busy }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  progress: MockProgress
  onChoose: (c: Exclude<EndChoice, 'keep'>) => void
  busy?: EndChoice | null
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  useEffect(() => { if (!open) setConfirmDiscard(false) }, [open])

  const canGrade = progress.mainAnswered && progress.answered >= 1
  const remaining = Math.max(0, progress.planned - progress.answered)

  if (confirmDiscard) {
    return (
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="Discard this mock?"
        description="It won't appear in your history or count toward anything. This can't be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>Cancel</Button>
            <Button variant="danger" loading={busy === 'discard'} onClick={() => onChoose('discard')}>Discard mock</Button>
          </>
        }
      />
    )
  }

  if (canGrade) {
    return (
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="End now?"
        description={`${plural(remaining, 'follow-up')} ${remaining === 1 ? 'is' : 'are'} unanswered. This mock won't count toward your scores, but you'll still get feedback.`}
        footer={
          <div className="flex w-full items-center gap-2">
            <Button variant="danger" onClick={() => setConfirmDiscard(true)}>Discard</Button>
            <span className="flex-1" />
            <Button variant="secondary" loading={busy === 'finish'} onClick={() => onChoose('finish')}>End and get feedback</Button>
            <Button variant="primary" autoFocus onClick={() => onOpenChange(false)}>Keep going</Button>
          </div>
        }
      />
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Leave this mock?"
      description={
        progress.mainAnswered
          ? 'You can pick it up again within 24 hours. Answer one follow-up if you want feedback on it.'
          : 'You can pick it up again within 24 hours.'
      }
      footer={
        <div className="flex w-full items-center gap-2">
          <Button variant="danger" onClick={() => setConfirmDiscard(true)}>Discard</Button>
          <span className="flex-1" />
          <Button variant="secondary" loading={busy === 'leave'} onClick={() => onChoose('leave')}>Leave</Button>
          <Button variant="primary" autoFocus onClick={() => onOpenChange(false)}>Keep going</Button>
        </div>
      }
    />
  )
}
