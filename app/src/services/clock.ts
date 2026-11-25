/** App clock: Date.now() + demo offset. The ONLY place Date.now() may be called. */
let offsetMs = 0
const listeners = new Set<() => void>()

export const Clock = {
  now(): number { return Date.now() + offsetMs },
  offset(): number { return offsetMs },
  setOffset(ms: number) { offsetMs = ms; listeners.forEach((l) => l()) },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
}

export const DAY = 86_400_000
export const HOUR = 3_600_000
