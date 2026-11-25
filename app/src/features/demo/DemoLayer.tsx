/* S11 — Demo panel and event-log overlay (F14). Never linked in the UI.
 * ⌥D (or Ctrl+Shift+D, or ?demo=1) toggles a compact panel bottom-right: seeds, app clock, demo mode
 * (enables ⌥G ghost fill in the mock room), event-log overlay, scoring pace and AI mode.
 * While a seed is loaded a small "Demo data" tag sits bottom-right. Layer z 90. Spec: MASTER_PLAN §3.2 S11, §8.6. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { X } from 'lucide-react'
import { db, getSettings, updateSettings } from '@/services/db/db'
import { Analytics } from '@/services/analytics'
import { Clock, DAY, HOUR } from '@/services/clock'
import { loadSeed, setClockOffset, type SeedName } from '@/engine/api'
import type { Settings } from '@/domain/types'
import { Button, Divider, IconButton, Kbd, Segmented, cx, toast } from '@/ui'
import { Toggle } from '@/features/settings/parts'
import { useAppNow } from '@/features/home/useEngineQuery'

function fmtOffset(ms: number) {
  if (!ms) return 'Real time'
  const d = Math.floor(Math.abs(ms) / DAY)
  const h = Math.round((Math.abs(ms) % DAY) / HOUR)
  const s = [d ? `${d} d` : '', h ? `${h} h` : ''].filter(Boolean).join(' ')
  return `${ms > 0 ? '+' : '−'}${s || '0 h'}`
}

async function setDemo(key: string, fn: (s: Settings) => Settings) {
  try {
    await updateSettings(fn)
    void Analytics.track('settings_changed', { key, via: 'demo_panel' })
  } catch { toast.error("Couldn't save that setting.") }
}

export default function DemoLayer() {
  const [open, setOpen] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('demo') === '1' } catch { return false }
  })
  const settings = useLiveQuery(() => getSettings(), [])
  const isDemo = useLiveQuery(async () => !!(await db.profile.get('me'))?.isDemo, [], false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const alt = e.altKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyD'
      const ctrlShift = e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')
      if (alt || ctrlShift) { e.preventDefault(); setOpen((o) => !o) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      {settings?.demo.showEventLog ? <EventOverlay /> : null}
      {open && settings ? <DemoPanel s={settings} onClose={() => setOpen(false)} /> : null}
      {!open && isDemo ? (
        <button
          onClick={() => setOpen(true)}
          title="Demo data is loaded (⌥D for the demo panel)"
          className="fixed bottom-4 right-4 z-30 inline-flex h-6 items-center gap-1.5 rounded-full bg-elevated px-2.5 text-caption text-secondary shadow-2 transition-colors duration-100 hover:text-primary max-[839px]:bottom-[68px]"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Demo data
        </button>
      ) : null}
    </>
  )
}

/* ---------------- panel ---------------- */

function DemoPanel({ s, onClose }: { s: Settings; onClose: () => void }) {
  const navigate = useNavigate()
  const now = useAppNow(10_000)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmSeed, setConfirmSeed] = useState<SeedName | null>(null)
  const offset = s.demo.clockOffsetMs ?? Clock.offset()
  const ref = useRef<HTMLDivElement>(null)

  const runSeed = async (name: SeedName, force = false) => {
    if (!force) {
      const p = await db.profile.get('me').catch(() => undefined)
      const mocks = await db.mockSessions.count().catch(() => 0)
      if (p && !p.isDemo && (p.onboardingCompletedAt || mocks > 0)) { setConfirmSeed(name); return }
    }
    setConfirmSeed(null)
    setBusy(name)
    try {
      await loadSeed(name)
      navigate(name === 'fresh' ? '/welcome' : '/', { replace: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load that seed.")
    } finally {
      setBusy(null)
    }
  }

  const shift = async (ms: number | null) => {
    const next = ms == null ? 0 : offset + ms
    try { await setClockOffset(next) } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't move the clock.") }
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Demo panel"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}
      className="fixed bottom-4 right-4 z-[90] w-[320px] rounded-lg bg-elevated p-4 shadow-2 animate-pop max-[839px]:bottom-[68px]"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-headline text-primary">Demo</span>
          <Kbd>⌥D</Kbd>
        </div>
        <IconButton icon={X} label="Close demo panel" size="sm" onClick={onClose} />
      </div>

      <Section label="Load seed">
        {confirmSeed ? (
          <div className="rounded-md bg-subtle p-3 animate-rise">
            <p className="text-footnote text-primary">This replaces your own data in this browser.</p>
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirmSeed(null)}>Cancel</Button>
              <Button size="sm" variant="danger" onClick={() => runSeed(confirmSeed, true)}>Load anyway</Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" onClick={() => runSeed('fresh')} loading={busy === 'fresh'} disabled={!!busy}>Fresh user</Button>
            <Button size="sm" onClick={() => runSeed('ishita_w3')} loading={busy === 'ishita_w3'} disabled={!!busy}>Ishita · week 3</Button>
          </div>
        )}
      </Section>

      <Section label="App clock" aside={<span className={cx('tabular', offset ? 'text-accent' : 'text-tertiary')}>{fmtOffset(offset)}</span>}>
        <div className="mb-2 text-callout text-primary tabular">
          {new Date(now).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          <Button size="sm" className="px-0" onClick={() => shift(HOUR)}>+1 h</Button>
          <Button size="sm" className="px-0" onClick={() => shift(DAY)}>+1 day</Button>
          <Button size="sm" className="px-0" onClick={() => shift(7 * DAY)}>+7 days</Button>
          <Button size="sm" className="px-0" variant="ghost" onClick={() => shift(null)} disabled={!offset}>Reset</Button>
        </div>
      </Section>

      <Section label="Recording">
        <div className="flex flex-col gap-2.5">
          <label className="flex items-center justify-between gap-3">
            <span className="text-callout text-primary">Demo mode <span className="text-footnote text-tertiary">· ⌥G ghost fill</span></span>
            <Toggle label="Demo mode" checked={s.demo.enabled} onChange={(v) => setDemo('demo.enabled', (x) => ({ ...x, demo: { ...x.demo, enabled: v } }))} />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-callout text-primary">Event log overlay</span>
            <Toggle label="Event log overlay" checked={s.demo.showEventLog} onChange={(v) => setDemo('demo.showEventLog', (x) => ({ ...x, demo: { ...x.demo, showEventLog: v } }))} />
          </label>
        </div>
      </Section>

      <Section label="Scoring pace" aside={<span className="text-tertiary">minimum on screen</span>}>
        <Segmented
          size="sm"
          className="w-full [&>button]:flex-1"
          value={String(s.demo.minScoringMs)}
          onChange={(v) => setDemo('demo.minScoringMs', (x) => ({ ...x, demo: { ...x.demo, minScoringMs: Number(v) } }))}
          options={[0, 2400, 4000, 8000].map((ms) => ({ value: String(ms), label: ms ? `${ms / 1000} s` : 'Off' }))}
        />
      </Section>

      <Section label="AI mode" aside={<span className="text-tertiary">Claude falls back to scripted</span>}>
        <Segmented
          size="sm"
          className="w-full [&>button]:flex-1"
          value={s.ai.mode}
          onChange={(v) => setDemo('ai.mode', (x) => ({ ...x, ai: { ...x.ai, mode: v } }))}
          options={[{ value: 'scripted', label: 'Scripted' }, { value: 'live', label: 'Claude' }]}
        />
      </Section>

      <Divider className="mt-4" />
      <div className="mt-3 flex items-center justify-between">
        <button className="text-label text-accent hover:underline" onClick={() => navigate('/metrics')}>Metrics panel</button>
        <span className="text-caption text-tertiary">Not visible to users</span>
      </div>
    </div>
  )
}

function Section({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between text-caption">
        <span className="text-secondary">{label}</span>
        {aside}
      </div>
      {children}
    </div>
  )
}

/* ---------------- live event log overlay ---------------- */

type Live = { key: number; name: string; ts: number; props: Record<string, unknown> }
let seq = 0

function EventOverlay() {
  const [items, setItems] = useState<Live[]>([])
  useEffect(() => Analytics.subscribe((e) => setItems((xs) => [{ ...e, key: ++seq }, ...xs].slice(0, 6))), [])

  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 top-4 z-[90] w-[300px] rounded-lg bg-elevated p-2.5 shadow-2">
      <div className="mb-1.5 flex items-center justify-between px-1 text-caption text-tertiary">
        <span>Events</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-accent animate-blink" />live</span>
      </div>
      {items.length ? (
        <ul className="flex flex-col">
          {items.map((e, i) => (
            <li
              key={e.key}
              className={cx('flex items-baseline justify-between gap-3 rounded-sm px-1 py-0.5 font-mono text-caption transition-opacity duration-300', i === 0 && 'animate-rise')}
              style={{ opacity: Math.max(0.3, 1 - i * 0.14) }}
            >
              <span className="truncate text-primary">{e.name}</span>
              <span className="shrink-0 text-tertiary tabular">{new Date(e.ts).toLocaleTimeString('en-GB')}</span>
            </li>
          ))}
        </ul>
      ) : <div className="px-1 py-1 font-mono text-caption text-tertiary">Waiting for events…</div>}
    </div>
  )
}
