/* Live reads that never crash a screen. Wraps a selector in useLiveQuery and turns a thrown error
 * (including the engine's "not implemented yet") into an error state the screen can render calmly. */
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Clock } from '@/services/clock'

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'ready'; data: T }

export function useEngineQuery<T>(fn: () => Promise<T>, deps: unknown[] = []): Loadable<T> {
  const r = useLiveQuery(async (): Promise<Loadable<T>> => {
    try {
      return { status: 'ready', data: await fn() }
    } catch (e) {
      return { status: 'error', error: e instanceof Error ? e : new Error(String(e)) }
    }
  }, deps)
  return r ?? { status: 'loading' }
}

/** Re-renders when the demo clock moves, and once a minute so "days ago" stays honest. */
export function useAppNow(tickMs = 60_000): number {
  const [now, setNow] = useState(() => Clock.now())
  useEffect(() => {
    const off = Clock.subscribe(() => setNow(Clock.now()))
    const h = setInterval(() => setNow(Clock.now()), tickMs)
    return () => { off(); clearInterval(h) }
  }, [tickMs])
  return now
}
