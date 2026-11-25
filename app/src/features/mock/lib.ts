/* Pure helpers shared by the practice, mock-room, scoring and report screens. No React, no Dexie. */
import type { InputMode, MockLength, MockSession, Turn } from '@/domain/types'

export const TIMEBOX_MIN: Record<MockLength, number> = { quick: 10, standard: 15 }
export const FOLLOWUPS: Record<MockLength, number> = { quick: 2, standard: 3 }

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function wordCount(t: string): number {
  const s = t.trim()
  return s ? s.split(/\s+/).length : 0
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
}

/** A short title for a question: first sentence, capped. */
export function questionTitle(prompt: string, n = 72): string {
  const first = prompt.split(/(?<=[.?!])\s/)[0] ?? prompt
  return truncate(first, n)
}

export function daysAgo(ts: number | undefined, now: number): string | null {
  if (!ts) return null
  const d = Math.floor((now - ts) / 86_400_000)
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  return `${d} days ago`
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`
}

export function sortedTurns(s: MockSession): Turn[] {
  return [...s.turns].sort((a, b) => a.index - b.index)
}

export function currentMode(s: MockSession): InputMode {
  return s.modeHistory.length ? s.modeHistory[s.modeHistory.length - 1].mode : 'text'
}

export function modesUsedLabel(s: MockSession): string {
  const used = new Set<InputMode>(s.modeHistory.map((m) => m.mode))
  s.turns.forEach((t) => { if (t.role === 'candidate' && t.inputMode) used.add(t.inputMode) })
  if (used.has('text') && used.has('voice')) return 'Text and voice'
  return used.has('voice') ? 'Voice' : 'Text'
}

export interface MockProgress {
  planned: number
  /** Follow-ups Meera has asked so far (0 while the main answer is open). */
  asked: number
  answered: number
  /** 0 = main answer, k = follow-up k. */
  slot: number
  mainAnswered: boolean
  done: boolean
  label: string
  candidateTurns: number
}

/** Derived from the turns rather than the machine so it is robust to engine indexing choices. */
export function deriveProgress(s: MockSession): MockProgress {
  const turns = sortedTurns(s)
  const fuQ = turns.filter((t) => t.role === 'interviewer' && t.kind === 'followup_q')
  const asked = fuQ.length || 0
  const done = s.machine.state === 'done' || s.status !== 'in_progress'
  const answered = fuQ.filter((q, i) => {
    const next = fuQ[i + 1]
    return turns.some((t) => t.index > q.index && (!next || t.index < next.index) && t.role === 'candidate' && t.kind !== 'clarify_q')
  }).length
  const candidateTurns = turns.filter((t) => t.role === 'candidate').length
  const mainAnswered = asked > 0 || (done && candidateTurns > 0)
  const planned = s.followupsPlanned || FOLLOWUPS[s.length]
  const label = done && answered >= planned
    ? 'All follow-ups answered'
    : asked === 0 ? 'Main answer' : `Follow-up ${Math.min(asked, planned)} of ${planned}`
  return { planned, asked, answered, slot: asked, mainAnswered, done, label, candidateTurns }
}

/** Elapsed interview time. A resume after a long break does not count the break. */
export function activeElapsed(s: MockSession, now: number, mountedAt: number, mountedGap: number): number {
  const base = s.startedAt
  if (mountedGap > 10 * 60_000) return Math.max(0, s.lastActivityAt - base) + (now - mountedAt)
  return Math.max(0, now - base)
}

export function speechSupported(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as Record<string, unknown>
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition)
}

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable))
}

/** Safe storage helpers (private windows can throw). */
export const store = {
  get(key: string): string | null { try { return window.localStorage.getItem(key) } catch { return null } },
  set(key: string, v: string) { try { window.localStorage.setItem(key, v) } catch { /* ignore */ } },
  del(key: string) { try { window.localStorage.removeItem(key) } catch { /* ignore */ } },
}
