/* App shell: 240px canvas-grey sidebar + white main sheet. Collapses to a 64px rail below 1200px,
 * bottom tab bar below 840px. Hidden entirely in the mock room and onboarding. Spec: MASTER_PLAN §3.1, D-42. */
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { BarChart3, BookOpen, Home, LineChart, Plus, Settings as Cog, Target } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { db } from '@/services/db/db'
import { APP_NAME } from '@/config/brand'
import { cx, Kbd } from '@/ui'

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/practice', label: 'Practice', icon: Target },
  { to: '/progress', label: 'Progress', icon: LineChart },
  { to: '/library', label: 'Library', icon: BookOpen },
]
const NAV_BOTTOM: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/metrics', label: 'Metrics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Cog },
]

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--text-primary)" />
      <path d="M9 23l3-1 10-10-2-2-10 10-1 3z" fill="var(--bg-surface)" />
      <path d="M20 10l2 2" stroke="var(--score-1)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

function NavItem({ to, label, icon: Icon, end }: { to: string; label: string; icon: LucideIcon; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cx(
        'group flex h-9 items-center gap-3 rounded-md px-3 text-[14px] leading-5 transition-colors duration-100',
        'max-[1199px]:justify-center max-[1199px]:px-0',
        isActive ? 'bg-selected font-medium text-accent' : 'text-secondary hover:bg-hover hover:text-primary',
      )}
      title={label}
    >
      <Icon size={18} strokeWidth={1.75} className="shrink-0" />
      <span className="max-[1199px]:hidden">{label}</span>
    </NavLink>
  )
}

export default function AppShell() {
  const navigate = useNavigate()
  const loc = useLocation()
  // undefined = loading, null = no profile yet (both the gate and the user chip need the difference)
  const profile = useLiveQuery(async () => (await db.profile.get('me')) ?? null, [])

  // Onboarding gate
  useEffect(() => {
    if (profile === undefined) return // still loading
    if (!profile?.onboardingCompletedAt) navigate('/welcome', { replace: true })
  }, [profile, navigate])

  // Global shortcut: N = new mock
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); navigate('/practice') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col border-r border-border px-3 pb-4 pt-5 min-[840px]:flex max-[1199px]:w-[64px] max-[1199px]:px-2">
        <div className="mb-6 flex items-center gap-2.5 px-2 max-[1199px]:justify-center max-[1199px]:px-0">
          <BrandMark />
          <span className="text-[17px] font-semibold tracking-[-0.01em] text-primary max-[1199px]:hidden">{APP_NAME}</span>
        </div>
        <button
          onClick={() => navigate('/practice')}
          className="mb-4 flex h-9 items-center gap-2 rounded-md bg-surface px-3 text-[14px] font-medium text-primary shadow-1 transition-colors hover:bg-hover max-[1199px]:justify-center max-[1199px]:px-0"
          title="New mock (N)"
        >
          <Plus size={16} strokeWidth={2} />
          <span className="flex-1 text-left max-[1199px]:hidden">New mock</span>
          <Kbd className="max-[1199px]:hidden">N</Kbd>
        </button>
        <nav className="flex flex-col gap-0.5">{NAV.map((n) => <NavItem key={n.to} {...n} />)}</nav>
        <div className="flex-1" />
        <nav className="flex flex-col gap-0.5">{NAV_BOTTOM.map((n) => <NavItem key={n.to} {...n} />)}</nav>
        {profile?.firstName ? (
          <div className="mt-3 border-t border-border pt-3">
            <NavLink
              to="/settings#profile"
              title={profile.firstName}
              className="flex h-9 items-center gap-2.5 rounded-md px-2 text-[14px] text-secondary transition-colors duration-100 hover:bg-hover hover:text-primary max-[1199px]:justify-center max-[1199px]:px-0"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-subtle text-caption font-semibold text-primary">
                {profile.firstName.slice(0, 1).toUpperCase()}
              </span>
              <span className="truncate max-[1199px]:hidden">{profile.firstName}</span>
            </NavLink>
          </div>
        ) : null}
      </aside>

      <main className="min-w-0 flex-1 bg-surface min-[840px]:my-0" key={loc.pathname}>
        <Outlet />
      </main>

      {/* compact: bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex h-14 border-t border-border bg-surface min-[840px]:hidden">
        {[...NAV, NAV_BOTTOM[1]].map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cx('flex flex-1 flex-col items-center justify-center gap-0.5 text-caption', isActive ? 'text-accent' : 'text-secondary')}>
            <Icon size={20} strokeWidth={1.75} />{label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
