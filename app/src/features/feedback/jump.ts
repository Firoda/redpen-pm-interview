/* "Jump to answer": scroll the report transcript to a turn and flash it (--accent-subtle, 1.2 s). */
const EVT = 'rp:jump-to-turn'

export function jumpToTurn(turnId: string) {
  window.dispatchEvent(new CustomEvent<string>(EVT, { detail: turnId }))
}

export function onJumpToTurn(fn: (turnId: string) => void) {
  const h = (e: Event) => fn((e as CustomEvent<string>).detail)
  window.addEventListener(EVT, h)
  return () => window.removeEventListener(EVT, h)
}

export function flashTurn(turnId: string) {
  const host = document.getElementById(`turn-${turnId}`)
  if (!host) return false
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  host.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
  const el = (host.querySelector('[data-candidate-block]') as HTMLElement | null) ?? host
  el.style.transition = 'background-color 300ms var(--ease-standard), box-shadow 300ms var(--ease-standard)'
  el.style.backgroundColor = 'var(--accent-subtle)'
  el.style.boxShadow = '0 0 0 1px var(--accent)'
  window.setTimeout(() => { el.style.backgroundColor = ''; el.style.boxShadow = '' }, 1200)
  return true
}

export function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}
