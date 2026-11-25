/* Answer composer: auto-growing textarea (3–12 lines, 17/26), word count, ⌘↵ sends, ↵ / ⇧↵ add a newline.
 * Disabled while Meera is replying. Radius 12, hairline, accent ring on focus. */
import { forwardRef, useEffect, useImperativeHandle, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Button, cx } from '@/ui'
import { wordCount } from './lib'

export interface ComposerHandle { focus: () => void; el: HTMLTextAreaElement | null }

const LINE = 26
const MIN_LINES = 3
const MAX_LINES = 12

export const Composer = forwardRef<ComposerHandle, {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  disabled?: boolean
  placeholder?: string
  submitLabel?: string
  hint?: ReactNode
  extra?: ReactNode
  /** Called on Tab in an empty field; return true when handled (demo ghost fill). */
  onEmptyTab?: () => boolean
  onUserInput?: () => void
  autoFocus?: boolean
  minLines?: number
  className?: string
  label?: string
}>(function Composer({ value, onChange, onSubmit, disabled, placeholder = 'Type your answer…', submitLabel = 'Send', hint, extra, onEmptyTab, onUserInput, autoFocus, minLines = MIN_LINES, className, label = 'Your answer' }, ref) {
  const ta = useRef<HTMLTextAreaElement>(null)
  useImperativeHandle(ref, () => ({ focus: () => ta.current?.focus(), get el() { return ta.current } }), [])

  // Auto-grow
  useEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = 'auto'
    const min = minLines * LINE + 24
    const max = MAX_LINES * LINE + 24
    el.style.height = `${Math.max(min, Math.min(max, el.scrollHeight))}px`
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
  }, [value, minLines])

  useEffect(() => { if (autoFocus && !disabled) ta.current?.focus() }, [autoFocus, disabled])

  const words = wordCount(value)
  const canSend = !disabled && value.trim().length > 0

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (canSend) onSubmit()
      return
    }
    if (e.key === 'Tab' && !e.shiftKey && value.trim() === '' && onEmptyTab) {
      if (onEmptyTab()) e.preventDefault()
    }
  }

  return (
    <div
      className={cx(
        'rounded-lg bg-surface shadow-[0_0_0_1px_var(--border),0_6px_20px_rgba(0,0,0,.05)] transition-shadow duration-150',
        'focus-within:shadow-[0_0_0_1px_var(--accent),0_0_0_4px_var(--accent-subtle),0_6px_20px_rgba(0,0,0,.05)]',
        disabled && 'bg-subtle/40',
        className,
      )}
    >
      <textarea
        ref={ta}
        aria-label={label}
        value={value}
        disabled={disabled}
        placeholder={disabled ? '' : placeholder}
        onChange={(e) => { onChange(e.target.value); onUserInput?.() }}
        onKeyDown={onKeyDown}
        rows={minLines}
        className="block w-full resize-none bg-transparent px-4 pt-3 pb-1 text-reading text-primary placeholder:text-tertiary focus:outline-none disabled:cursor-not-allowed disabled:text-secondary"
        style={{ minHeight: minLines * LINE + 24 }}
      />
      <div className="flex min-h-11 items-center gap-3 px-3 pb-2.5 pl-4">
        <div className="min-w-0 flex-1 truncate text-footnote text-tertiary">{hint}</div>
        {extra}
        <span className="text-footnote tabular text-tertiary" aria-live="off">{words} {words === 1 ? 'word' : 'words'}</span>
        <Button variant="primary" size="sm" onClick={onSubmit} disabled={!canSend} kbd="⌘↵" aria-label={`${submitLabel} (Command Enter)`}>
          {submitLabel}
        </Button>
      </div>
    </div>
  )
})
