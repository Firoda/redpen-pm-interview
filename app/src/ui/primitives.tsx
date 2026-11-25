/* Core UI kit. Tokens only — no hex, no raw palette classes. Spec: MASTER_PLAN §2.3.
 * One primary button per screen. Hover/press change colour only (100ms). */
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cx } from './cx'
import type { LucideIcon } from 'lucide-react'
import { Loader2 } from 'lucide-react'

/* ---------------- Button ---------------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet'
type Size = 'sm' | 'md' | 'lg'
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: LucideIcon
  iconRight?: LucideIcon
  loading?: boolean
  kbd?: string
  full?: boolean
}
const variantCls: Record<Variant, string> = {
  primary: 'bg-accent-fill text-on-accent hover:bg-accent-fill-hover active:bg-accent-fill-pressed disabled:bg-subtle disabled:text-disabled',
  secondary: 'bg-surface text-primary shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-hover active:bg-pressed disabled:text-disabled',
  ghost: 'bg-transparent text-primary hover:bg-hover active:bg-pressed disabled:text-disabled',
  quiet: 'bg-transparent text-accent hover:bg-accent-subtle active:bg-pressed disabled:text-disabled',
  danger: 'bg-transparent text-danger shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-danger-subtle disabled:text-disabled',
}
const sizeCls: Record<Size, string> = {
  sm: 'h-8 px-3 text-label gap-1.5 rounded-md',
  md: 'h-10 px-4 text-[15px] leading-5 font-medium gap-2 rounded-md',
  lg: 'h-12 px-5 text-[15px] leading-5 font-medium gap-2 rounded-lg',
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, loading, kbd, full, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex select-none items-center justify-center whitespace-nowrap transition-colors duration-100 ease-standard',
        variantCls[variant], sizeCls[size], full && 'w-full', className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : Icon ? <Icon size={size === 'sm' ? 14 : 16} strokeWidth={2} /> : null}
      {children}
      {IconRight && !loading ? <IconRight size={size === 'sm' ? 14 : 16} strokeWidth={2} /> : null}
      {kbd ? <Kbd className={variant === 'primary' ? 'bg-white/20 text-on-accent shadow-none' : ''}>{kbd}</Kbd> : null}
    </button>
  )
})

export function IconButton({ icon: Icon, label, size = 'md', className, ...rest }: { icon: LucideIcon; label: string; size?: 'sm' | 'md' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex items-center justify-center rounded-md text-secondary transition-colors duration-100 hover:bg-hover hover:text-primary active:bg-pressed disabled:text-disabled',
        size === 'sm' ? 'h-7 w-7' : 'h-9 w-9', className,
      )}
      {...rest}
    >
      <Icon size={size === 'sm' ? 15 : 18} strokeWidth={1.75} />
    </button>
  )
}

/* ---------------- Kbd ---------------- */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cx('inline-flex h-5 min-w-5 items-center justify-center rounded-xs bg-subtle px-1.5 font-mono text-caption text-secondary shadow-[inset_0_-1px_0_var(--border)]', className)}>
      {children}
    </kbd>
  )
}

/* ---------------- Card ---------------- */
export function Card({ className, interactive, children, ...rest }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cx(
        'rounded-lg bg-surface shadow-1',
        interactive && 'cursor-pointer transition-colors duration-100 hover:bg-[color-mix(in_srgb,var(--bg-surface),var(--text-primary)_2%)]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

/* ---------------- Chip / Tag ---------------- */
export function Chip({ selected, onClick, children, icon: Icon, className }: { selected?: boolean; onClick?: () => void; children: ReactNode; icon?: LucideIcon; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-label transition-colors duration-150',
        selected ? 'bg-selected text-accent shadow-[inset_0_0_0_1px_var(--accent)]' : 'bg-surface text-primary shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-hover',
        className,
      )}
    >
      {Icon ? <Icon size={14} strokeWidth={2} /> : null}
      {children}
    </button>
  )
}

export function Tag({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'nudge' | 'accent' | 'danger' | 'positive'; children: ReactNode; className?: string }) {
  const t = {
    neutral: 'bg-subtle text-secondary',
    nudge: 'bg-nudge-bg text-nudge-text',
    accent: 'bg-accent-subtle text-accent',
    danger: 'bg-danger-subtle text-danger',
    positive: 'bg-score-4-tint text-score-4-text',
  }[tone]
  return <span className={cx('inline-flex h-5 items-center rounded-xs px-1.5 text-caption', t, className)}>{children}</span>
}

/* ---------------- Inputs ---------------- */
const field = 'w-full rounded-md bg-surface text-body text-primary placeholder:text-tertiary shadow-[inset_0_0_0_1px_var(--border)] hover:shadow-[inset_0_0_0_1px_var(--border-strong)] focus:outline-none focus:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_var(--accent-subtle)] transition-shadow duration-100'
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(field, 'h-10 px-3', className)} {...rest} />
})
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(field, 'px-3 py-2.5 text-reading resize-none', className)} {...rest} />
})
export function Label({ children, hint, htmlFor }: { children: ReactNode; hint?: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between text-label text-primary">
      <span>{children}</span>
      {hint ? <span className="text-footnote text-tertiary">{hint}</span> : null}
    </label>
  )
}

/* ---------------- Segmented control ---------------- */
export function Segmented<T extends string>({ value, onChange, options, size = 'md', className }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; icon?: LucideIcon }[]; size?: 'sm' | 'md'; className?: string
}) {
  return (
    <div role="radiogroup" className={cx('inline-flex rounded-md bg-subtle p-0.5', className)}>
      {options.map((o) => {
        const on = o.value === value
        const I = o.icon
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex items-center justify-center gap-1.5 rounded-sm px-3 text-label transition-all duration-150 ease-standard',
              size === 'sm' ? 'h-7' : 'h-8',
              on ? 'bg-surface text-primary shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(0,0,0,.06)]' : 'text-secondary hover:text-primary',
            )}
          >
            {I ? <I size={14} strokeWidth={2} /> : null}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------- Banner ---------------- */
export function Banner({ tone = 'info', icon: Icon, title, children, action, onDismiss, className }: {
  tone?: 'info' | 'nudge' | 'danger' | 'neutral'; icon?: LucideIcon; title?: ReactNode; children?: ReactNode; action?: ReactNode; onDismiss?: () => void; className?: string
}) {
  const t = {
    info: 'bg-accent-subtle text-primary',
    nudge: 'bg-nudge-bg text-primary shadow-[inset_0_0_0_1px_var(--nudge-border)]',
    danger: 'bg-danger-subtle text-primary',
    neutral: 'bg-subtle text-primary',
  }[tone]
  const ic = { info: 'text-accent', nudge: 'text-nudge-text', danger: 'text-danger', neutral: 'text-secondary' }[tone]
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('flex items-start gap-3 rounded-lg px-4 py-3', t, className)}>
      {Icon ? <Icon size={18} strokeWidth={2} className={cx('mt-px shrink-0', ic)} /> : null}
      <div className="min-w-0 flex-1 text-callout">
        {title ? <div className="text-headline">{title}</div> : null}
        {children ? <div className={cx(title && 'mt-0.5', 'text-secondary')}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
      {onDismiss ? (
        <button onClick={onDismiss} aria-label="Dismiss" className="-mr-1 shrink-0 self-center rounded-md px-2 py-1 text-label text-secondary hover:bg-hover">Dismiss</button>
      ) : null}
    </div>
  )
}

/* ---------------- Empty state ---------------- */
export function EmptyState({ icon: Icon, title, body, action, className }: { icon?: LucideIcon; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center px-6 py-16 text-center', className)}>
      {Icon ? <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-subtle text-secondary"><Icon size={22} strokeWidth={1.75} /></div> : null}
      <div className="text-title-3 text-primary">{title}</div>
      {body ? <div className="mt-1.5 max-w-[42ch] text-callout text-secondary">{body}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

/* ---------------- Skeleton ---------------- */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('skeleton h-4', className)} />
}

/* ---------------- Section header ---------------- */
export function SectionHeader({ title, action, sub }: { title: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-title-3 text-primary">{title}</h2>
        {sub ? <p className="mt-0.5 text-footnote text-secondary">{sub}</p> : null}
      </div>
      {action}
    </div>
  )
}

/* ---------------- Page ---------------- */
export function Page({ title, sub, actions, children, width = 'default' }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; width?: 'default' | 'reading' | 'wide' }) {
  const w = width === 'reading' ? 'max-w-[760px]' : width === 'wide' ? 'max-w-[1200px]' : 'max-w-[1040px]'
  return (
    <div className={cx('mx-auto w-full px-8 pb-24 pt-12 animate-rise', w)}>
      {title ? (
        <header className="mb-8 flex items-end justify-between gap-6">
          <div>
            <h1 className="text-title-1 text-primary">{title}</h1>
            {sub ? <p className="mt-1 text-body text-secondary">{sub}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </div>
  )
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cx('border-0 border-t border-border', className)} />
}
