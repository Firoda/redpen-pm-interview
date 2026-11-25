/* Settings building blocks: grouped section (caption + one card with inset dividers), row, toggle. */
import * as S from '@radix-ui/react-switch'
import { Children, type ReactNode } from 'react'
import { cx } from '@/ui'

export function Group({ id, title, sub, children }: { id?: string; title: string; sub?: ReactNode; children: ReactNode }) {
  const items = Children.toArray(children).filter(Boolean)
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="mb-1 px-1 text-headline text-primary">{title}</h2>
      {sub ? <p className="mb-3 px-1 text-footnote text-secondary">{sub}</p> : <div className="mb-2" />}
      <div className="rounded-lg bg-surface shadow-1">
        {items.map((c, i) => (
          <div key={i}>
            {i > 0 ? <div className="ml-4 border-t border-border" /> : null}
            {c}
          </div>
        ))}
      </div>
    </section>
  )
}

export function Row({ label, hint, children, htmlFor, stack }: { label: ReactNode; hint?: ReactNode; children?: ReactNode; htmlFor?: string; stack?: boolean }) {
  return (
    <div className={cx('px-4 py-3.5', stack ? 'flex flex-col gap-3' : 'flex items-center justify-between gap-6')}>
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-body text-primary">{label}</label>
        {hint ? <div className="mt-0.5 text-footnote text-secondary">{hint}</div> : null}
      </div>
      {children ? <div className={cx(stack ? '' : 'shrink-0')}>{children}</div> : null}
    </div>
  )
}

export function Toggle({ checked, onChange, label, id, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string; disabled?: boolean }) {
  return (
    <S.Root
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={label}
      className={cx(
        'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-100 ease-standard disabled:opacity-40',
        checked ? 'bg-accent-fill' : 'bg-[var(--border-strong)]',
      )}
    >
      <S.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.2)] transition-transform duration-150 ease-standard data-[state=checked]:translate-x-[18px]" />
    </S.Root>
  )
}

export function Select<T extends string>({ value, onChange, options, label, id, className }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; id?: string; className?: string
}) {
  return (
    <select
      id={id}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cx(
        'h-9 max-w-[260px] rounded-md bg-surface px-2.5 text-callout text-primary shadow-[inset_0_0_0_1px_var(--border)] hover:shadow-[inset_0_0_0_1px_var(--border-strong)] focus:outline-none focus:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_var(--accent-subtle)]',
        className,
      )}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
