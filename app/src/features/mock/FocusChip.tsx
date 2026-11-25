/* Retry focus chip: the one coaching element allowed in a mock, chosen by the candidate before it started. */
import { Crosshair } from 'lucide-react'
import { cx } from '@/ui'

export function FocusChip({ text, className }: { text: string; className?: string }) {
  const raw = text.replace(/^focus:\s*/i, '')
  const body = /^[A-Z][a-z]/.test(raw) ? raw.charAt(0).toLowerCase() + raw.slice(1) : raw
  return (
    <span className={cx('inline-flex max-w-full items-center gap-1.5 rounded-full bg-accent-subtle px-3 py-1 text-label text-accent', className)}>
      <Crosshair size={14} strokeWidth={2} className="shrink-0" />
      <span className="truncate">Focus: {body}</span>
    </span>
  )
}
