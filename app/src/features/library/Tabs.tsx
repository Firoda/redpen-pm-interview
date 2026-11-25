/* Text tabs with a 2 px accent underline that slides between tabs (150 ms). Spec: doc 01 §5.20. */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cx } from '@/ui'

export function Tabs<T extends string>({ value, onChange, tabs, className }: {
  value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode }[]; className?: string
}) {
  const refs = useRef(new Map<T, HTMLButtonElement>())
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const el = refs.current.get(value)
    if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth })
  }, [value, tabs.length])

  return (
    <div role="tablist" className={cx('relative flex gap-6 border-b border-border', className)}>
      {tabs.map((t) => {
        const on = t.value === value
        return (
          <button
            key={t.value}
            ref={(el) => { if (el) refs.current.set(t.value, el); else refs.current.delete(t.value) }}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.value)}
            className={cx('h-10 text-[14px] font-medium leading-5 transition-colors duration-150', on ? 'text-primary' : 'text-secondary hover:text-primary')}
          >
            {t.label}
          </button>
        )
      })}
      {bar ? (
        <span
          aria-hidden
          className="absolute -bottom-px h-0.5 rounded-full bg-accent transition-all duration-150 ease-standard"
          style={{ left: bar.left, width: bar.width }}
        />
      ) : null}
    </div>
  )
}
