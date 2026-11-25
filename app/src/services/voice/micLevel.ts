/* Mic level meter: a parallel getUserMedia stream into an AnalyserNode. RMS is
 * smoothed (fast attack, slower release) and reported at animation-frame rate.
 * Nothing is recorded; the stream only feeds the analyser. */

import { rms, rmsToLevel } from './envelope'

export type MicOpenError = 'denied' | 'no_device' | 'unsupported'

export interface MicMeter {
  stop(): void
}

type AudioCtxCtor = typeof AudioContext

function audioCtor(): AudioCtxCtor | null {
  if (typeof window === 'undefined') return null
  return (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtxCtor }).webkitAudioContext) ?? null
}

export function classifyMediaError(e: unknown): MicOpenError {
  const name = (e as { name?: string } | null)?.name ?? ''
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError' || name === 'TrackStartError') return 'no_device'
  if (name === 'TypeError' || name === 'NotSupportedError') return 'unsupported'
  return 'no_device'
}

/**
 * Opens the mic and starts metering. Resolves once the stream is live.
 * Rejects with a MicOpenError string.
 */
export async function openMicMeter(onLevel: (level: number) => void): Promise<MicMeter> {
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined
  if (!md?.getUserMedia) throw 'unsupported' satisfies MicOpenError
  let stream: MediaStream
  try {
    stream = await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
  } catch (e) {
    throw classifyMediaError(e)
  }

  const Ctor = audioCtor()
  if (!Ctor) {
    stream.getTracks().forEach((t) => t.stop())
    throw 'unsupported' satisfies MicOpenError
  }
  const ctx = new Ctor()
  if (ctx.state === 'suspended') { try { await ctx.resume() } catch { /* ignore */ } }
  const src = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  analyser.smoothingTimeConstant = 0.2
  src.connect(analyser)
  const buf = new Float32Array(analyser.fftSize)

  let raf = 0
  let timer: ReturnType<typeof setInterval> | null = null
  let level = 0
  let last = performance.now()
  let stopped = false

  const step = () => {
    if (stopped) return
    const now = performance.now()
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    analyser.getFloatTimeDomainData(buf)
    const target = rmsToLevel(rms(buf))
    const tau = target > level ? 0.04 : 0.18
    level += (target - level) * (1 - Math.exp(-dt / tau))
    onLevel(level < 0.002 ? 0 : level)
  }
  const loop = () => { step(); raf = requestAnimationFrame(loop) }
  // rAF stops in hidden tabs; fall back to a slow interval so callers still get levels
  const onVis = () => {
    if (document.hidden) { cancelAnimationFrame(raf); timer ??= setInterval(step, 100) }
    else { if (timer) { clearInterval(timer); timer = null } cancelAnimationFrame(raf); raf = requestAnimationFrame(loop) }
  }
  document.addEventListener('visibilitychange', onVis)
  onVis()

  return {
    stop() {
      if (stopped) return
      stopped = true
      cancelAnimationFrame(raf)
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
      try { src.disconnect() } catch { /* ignore */ }
      stream.getTracks().forEach((t) => t.stop())
      ctx.close().catch(() => {})
      onLevel(0)
    },
  }
}
