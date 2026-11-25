/* Thin adapter over the VOICE agent's mic check so onboarding and Settings share one import site.
 * The result is normalised to a MicStatus whatever shape MicCheck reports. */
import { MicCheck } from '@/features/voice/MicCheck'
import type { MicStatus } from '@/services/voice/types'

export function normaliseMicResult(r: unknown): MicStatus {
  const v = typeof r === 'object' && r !== null ? ((r as { status?: unknown; result?: unknown }).status ?? (r as { result?: unknown }).result) : r
  if (v === true || v === 'ok' || v === 'granted') return 'ok'
  if (v === 'denied' || v === 'mic_denied' || v === false) return 'denied'
  if (v === 'no_device') return 'no_device'
  if (v === 'unsupported') return 'unsupported'
  return 'ok'
}

export function MicCheckSlot({ onStatus }: { onStatus?: (s: MicStatus) => void }) {
  return <MicCheck onResult={(r: unknown) => onStatus?.(normaliseMicResult(r))} />
}

export const sttSupported = () =>
  typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)
