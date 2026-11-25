import { useLiveQuery } from 'dexie-react-hooks'

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: Error }

/** useLiveQuery that never throws into render: engine selectors may reject (or still be stubs). */
export function useSafeLiveQuery<T>(fn: () => Promise<T>, deps: unknown[]): Loadable<T> {
  const r = useLiveQuery(async () => {
    try {
      return { ok: true as const, data: await fn() }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e : new Error(String(e)) }
    }
  }, deps)
  if (r === undefined) return { status: 'loading' }
  return r.ok ? { status: 'ready', data: r.data } : { status: 'error', error: r.error }
}
