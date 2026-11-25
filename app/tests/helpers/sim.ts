import type { MockLength, MockSession, Question, VariantAxis, DimensionId } from '@/domain/types'
import { ScriptedInterviewAI } from '@/ai/scripted/ScriptedInterviewAI'
import { createSession, runTurn, type RunTurnResult } from '@/engine/mockFlow'

export const fastAI = () => new ScriptedInterviewAI({ turnLatencyMs: [0, 0], now: () => 1_700_000_000_000 })

export function newSession(q: Question, o: { length?: MockLength; variant?: { axis: VariantAxis; value: string } | null; id?: string; retryOf?: string; targetDimension?: DimensionId } = {}): MockSession {
  return createSession({ id: o.id ?? 'MOCK1', question: q, length: o.length ?? 'quick', mode: 'text', entryPoint: 'practice', now: 1_700_000_000_000, variant: o.variant ?? null, provider: 'scripted', retryOf: o.retryOf, targetDimension: o.targetDimension })
}

let tick = 1_700_000_000_000
export async function say(s: MockSession, q: Question, text: string): Promise<RunTurnResult> {
  const ai = fastAI()
  return runTurn(s, q, text, 'text', { ai, fallback: ai, now: () => (tick += 1000), firstName: 'Ishita' })
}

export async function playAll(q: Question, answers: string[], o: Parameters<typeof newSession>[1] = {}): Promise<{ session: MockSession; results: RunTurnResult[] }> {
  let s = newSession(q, o)
  const results: RunTurnResult[] = []
  for (const a of answers) {
    const r = await say(s, q, a)
    results.push(r)
    s = r.session
    if (r.done) break
  }
  return { session: s, results }
}
