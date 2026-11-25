/* One grading run per mock, shared across StrictMode double-mounts and remounts (navigating away and back).
 * Subscribers get the latest engine stage. */
import type { Feedback } from '@/domain/types'
import { gradeMock, type GradeStage } from '@/engine/api'

type Run = { promise: Promise<Feedback>; stage: GradeStage | null; listeners: Set<(s: GradeStage) => void> }
const runs = new Map<string, Run>()

export function runGrade(mockId: string, onStage: (s: GradeStage) => void, opts: { fresh?: boolean; grade?: typeof gradeMock } = {}): Promise<Feedback> {
  let run = runs.get(mockId)
  if (!run || opts.fresh) {
    const listeners = new Set<(s: GradeStage) => void>()
    const r: Run = { stage: null, listeners, promise: Promise.resolve(null as unknown as Feedback) }
    r.promise = (opts.grade ?? gradeMock)(mockId, (s) => { r.stage = s; r.listeners.forEach((l) => l(s)) })
    r.promise.catch(() => { if (runs.get(mockId) === r) runs.delete(mockId) }) // failed runs can be retried
    runs.set(mockId, r)
    run = r
  }
  run.listeners.add(onStage)
  if (run.stage) onStage(run.stage)
  return run.promise
}

export function unsubscribeGrade(mockId: string, onStage: (s: GradeStage) => void) {
  runs.get(mockId)?.listeners.delete(onStage)
}
