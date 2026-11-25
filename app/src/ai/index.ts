import { setScriptedAuthoringOrder } from './scripted/ruleInterviewer'
/* Picks the InterviewAI for the current settings. Scripted always works; live is loaded on demand and wrapped
   with per-call fallback to scripted. */
import type { InterviewAI } from '@/ai/types'
import type { Settings } from '@/domain/types'
import { ScriptedInterviewAI } from './scripted/ScriptedInterviewAI'
import { ResilientInterviewAI } from './resilient'
import { finalizeGrade } from '@/domain/rubric/postprocess'
import { validateInterviewerLine } from '@/domain/rubric/validator'
import { KeyStore } from '@/services/keyStore'

let scripted: ScriptedInterviewAI | null = null
export function getScriptedAI(): ScriptedInterviewAI {
  return (scripted ??= new ScriptedInterviewAI())
}

/** Tests and tooling: replace the scripted provider (e.g. zero latency). */
export function configureScriptedAI(opts: ConstructorParameters<typeof ScriptedInterviewAI>[0]): void {
  scripted = new ScriptedInterviewAI(opts)
  cached = null
}

let cached: { sig: string; ai: InterviewAI } | null = null

export async function getInterviewAI(settings: Settings): Promise<InterviewAI> {
  setScriptedAuthoringOrder(!!settings.demo.enabled)
  if (settings.ai.mode !== 'live') return getScriptedAI()
  const sig = JSON.stringify([settings.ai.useProxy, settings.ai.graderQuality, settings.demo.enabled])
  if (cached?.sig === sig) return cached.ai
  try {
    const mod = await import('@/ai/live')
    const live = mod.createLiveInterviewAI({
      finalizeGrade,
      validateLine: validateInterviewerLine,
      getKey: () => KeyStore.get(),
      useProxy: settings.ai.useProxy,
      quality: settings.ai.graderQuality,
    })
    const demo = settings.demo.enabled
    const ai = new ResilientInterviewAI(live, getScriptedAI(), { turnTimeoutMs: demo ? 6000 : 8000, gradeTimeoutMs: demo ? 30_000 : 45_000 })
    cached = { sig, ai }
    return ai
  } catch (e) {
    console.warn('[ai] live provider unavailable, using the offline coach', e)
    return getScriptedAI()
  }
}

/** Settings → "Test connection". */
export async function testLiveConnection(settings: Settings): Promise<{ ok: boolean; latencyMs?: number; message: string }> {
  try {
    const mod = await import('@/ai/live')
    return await mod.pingLive({ getKey: () => KeyStore.get(), useProxy: settings.ai.useProxy })
  } catch {
    return { ok: false, message: 'The live provider could not be loaded.' }
  }
}

export { ScriptedInterviewAI, ResilientInterviewAI }
