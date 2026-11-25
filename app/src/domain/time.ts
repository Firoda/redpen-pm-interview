/* Calendar helpers on the app clock. Pure: callers pass the epoch (never Date.now()). Device time zone. */
export const HOUR = 3_600_000
export const DAY = 86_400_000

/** Monday 00:00 (local) of the week containing `t`. */
export function weekStart(t: number): number {
  const d = new Date(t)
  const sinceMonday = (d.getDay() + 6) % 7
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - sinceMonday).getTime()
}

export function dayStart(t: number): number {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** 0 = Monday … 6 = Sunday. */
export function weekday(t: number): number {
  return (new Date(t).getDay() + 6) % 7
}

export function localDateKey(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Days from today to an ISO date (YYYY-MM-DD), by local calendar days. */
export function daysUntil(isoDate: string | null | undefined, now: number): number | null {
  if (!isoDate) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate)
  if (!m) return null
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
  return Math.round((target - dayStart(now)) / DAY)
}

export function daysBetween(a: number, b: number): number {
  return Math.floor((b - a) / DAY)
}
