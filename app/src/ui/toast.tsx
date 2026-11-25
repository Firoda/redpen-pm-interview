/* Minimal toast system: toast('Saved'), toast.error('…'). Bottom-centre, 4s. */
import { create } from 'zustand'
import { useEffect } from 'react'
import { cx } from './cx'

type T = { id: number; text: string; tone: 'neutral' | 'error'; action?: { label: string; onClick: () => void } }
const useToasts = create<{ items: T[]; push: (t: Omit<T, 'id'>) => void; remove: (id: number) => void }>((set) => ({
  items: [],
  push: (t) => set((s) => ({ items: [...s.items.slice(-2), { ...t, id: Date.now() + Math.random() }] })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}))

export function toast(text: string, action?: T['action']) { useToasts.getState().push({ text, tone: 'neutral', action }) }
toast.error = (text: string, action?: T['action']) => useToasts.getState().push({ text, tone: 'error', action })

function Item({ t }: { t: T }) {
  const remove = useToasts((s) => s.remove)
  useEffect(() => { const h = setTimeout(() => remove(t.id), 4000); return () => clearTimeout(h) }, [t.id, remove])
  return (
    <div role="status" className={cx('pointer-events-auto flex items-center gap-4 rounded-lg px-4 py-3 text-callout shadow-3 animate-pop',
      t.tone === 'error' ? 'bg-elevated text-danger' : 'bg-[var(--text-primary)] text-[var(--bg-surface)]')}>
      <span>{t.text}</span>
      {t.action ? <button className="font-medium underline-offset-2 hover:underline" onClick={() => { t.action!.onClick(); remove(t.id) }}>{t.action.label}</button> : null}
    </div>
  )
}

export function Toaster() {
  const items = useToasts((s) => s.items)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2">
      {items.map((t) => <Item key={t.id} t={t} />)}
    </div>
  )
}
