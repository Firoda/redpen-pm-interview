/* Display formatting shared by the app screens. Dates are always relative to the app clock. */
import { DAY, Clock } from '@/services/clock'
import type { TopicStatus } from '@/domain/types'

const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }

/** Calendar days between two instants (0 = same day). */
export function daysBetween(from: number, to: number) {
  return Math.round((startOfDay(to) - startOfDay(from)) / DAY)
}

/** "today", "yesterday", "3 days ago", "2 weeks ago", "12 Nov". */
export function relDay(at: number | undefined, now = Clock.now()): string {
  if (at == null) return ''
  const d = daysBetween(at, now)
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 14) return `${d} days ago`
  if (d < 35) return `${Math.floor(d / 7)} weeks ago`
  return shortDate(at)
}

export const shortDate = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
export const dayDate = (t: number) => new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
export const timeOfDay = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
export const fullStamp = (t: number) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** yyyy-mm-dd in local time, for <input type="date">. */
export function isoDay(t: number) {
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
/** Local midnight of a yyyy-mm-dd string. */
export function parseIsoDay(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
}

export function greeting(now: number) {
  const h = new Date(now).getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export const STATUS_WORD: Record<TopicStatus, string> = {
  not_started: 'Not started',
  building: 'Building',
  getting_there: 'Getting there',
  consistent: 'Consistent',
}

export const pct = (x: number | null | undefined, digits = 0) => (x == null ? '—' : `${(x * 100).toFixed(digits)}%`)
export const signed = (x: number, digits = 1) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(digits)}`
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export const TOPIC_TESTS = {
  product_design: 'Choosing a user, a problem and one solution, and defending the choice',
  rca: 'Narrowing down why a metric moved, step by step',
  metrics: 'Defining success for a product or feature, with a guardrail',
  guesstimate: 'Breaking a number down, stating assumptions, checking the answer',
  strategy: 'Deciding whether and how a company should make a move',
  tech: 'Explaining how something works and its trade-offs, simply',
} as const

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
