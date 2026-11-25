/* VoiceService (MASTER_PLAN §10.4, FT-06, D-34).
 * - listen(): Web Speech recognition (continuous + interim), auto-restart on end while
 *   active, finals accumulated across restarts; a parallel getUserMedia stream drives
 *   the level meter. No automatic end-of-speech: the caller stops explicitly.
 * - speak(): speechSynthesis in sentence chunks (≤ 180 chars), natural voices first,
 *   a stuck-queue watchdog, and a synthetic level envelope for the orb.
 * Use the `voice` singleton. `NullVoiceService` for tests and unsupported browsers. */

import { CHARS_PER_SEC, chunkText, watchdogMs, wordSpans } from './chunk'
import { VOICE_COPY } from './copy'
import { SpeechEnvelope } from './envelope'
import { classifyMediaError, openMicMeter, type MicMeter } from './micLevel'
import type {
  ListenErrorKind, ListenHandle, ListenOptions, MicStatus, SpeakHandle, SpeakOptions, VoiceService, VoiceSupport,
} from './types'
import { pickVoice, rankVoices } from './voices'

/* ---------- minimal recognition typings (lib.dom has the events, not the class) ---------- */
interface SpeechRec {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}
type SpeechRecCtor = new () => SpeechRec

function recognitionCtor(): SpeechRecCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const MAX_RESTARTS = 20
const RESTART_BACKOFF_MS = 300
const STOP_GRACE_MS = 1500
const FIRST_AUDIO_TIMEOUT_MS = 4000

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const join = (...parts: string[]) => norm(parts.filter(Boolean).join(' '))
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/* ========================================================================== */

export class WebVoiceService implements VoiceService {
  private voicesP: Promise<SpeechSynthesisVoice[]> | null = null
  private currentSpeech: { cancel(): void } | null = null
  /** Chrome can GC an in-flight utterance and never fire onend; keep a reference. */
  private keepAlive: SpeechSynthesisUtterance | null = null

  constructor() {
    // Kick off async voice loading early (Chrome populates voices lazily).
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try { window.speechSynthesis.getVoices() } catch { /* ignore */ }
    }
  }

  support(): VoiceSupport {
    return {
      stt: recognitionCtor() !== null,
      tts: typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined',
    }
  }

  async checkMic(): Promise<MicStatus> {
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined
    if (!md?.getUserMedia) return 'unsupported'
    try {
      const s = await md.getUserMedia({ audio: true })
      s.getTracks().forEach((t) => t.stop())
      return 'ok'
    } catch (e) {
      const k = classifyMediaError(e)
      return k === 'denied' ? 'denied' : k === 'unsupported' ? 'unsupported' : 'no_device'
    }
  }

  /* ------------------------------- listen ------------------------------- */

  listen(opts: ListenOptions): ListenHandle {
    const Ctor = recognitionCtor()
    let active = true
    let stopping = false
    let totalRestarts = 0
    let emptyRestarts = 0       // consecutive restarts without any result
    let noSpeechRun = 0
    let committed = ''          // finals from earlier recognition sessions
    let sessionFinal = ''       // finals in the current session
    let interim = ''
    let rec: SpeechRec | null = null
    let running = false
    let meter: MicMeter | null = null
    let restartTimer: ReturnType<typeof setTimeout> | null = null
    let onEnded: (() => void) | null = null

    const full = () => join(committed, sessionFinal)

    const cleanup = () => {
      if (restartTimer) { clearTimeout(restartTimer); restartTimer = null }
      meter?.stop(); meter = null
      if (rec) {
        const r = rec
        r.onresult = null; r.onerror = null
        if (running) { r.onend = null; try { r.abort() } catch { /* ignore */ } }
      }
      opts.onLevel?.(0)
    }

    const fail = (kind: ListenErrorKind) => {
      if (!active) return
      const partial = join(committed, sessionFinal, interim)
      active = false
      stopping = true
      cleanup()
      opts.onError?.({ kind, fatal: true, message: VOICE_COPY[kind], partial })
    }

    if (!Ctor) {
      queueMicrotask(() => fail('unsupported'))
      return { stop: async () => '', abort: () => { active = false }, restarts: () => 0 }
    }

    // Level meter on a parallel stream. Permission failures here are authoritative.
    openMicMeter((lvl) => { if (active) opts.onLevel?.(lvl) })
      .then((m) => { if (!active) m.stop(); else meter = m })
      .catch((err: unknown) => {
        if (err === 'denied') fail('mic_denied')
        else if (err === 'no_device') fail('no_device')
        // 'unsupported': no Web Audio; recognition may still work without a meter
      })

    const startRec = () => {
      const r = new Ctor()
      rec = r
      r.lang = opts.lang
      r.continuous = true
      r.interimResults = true
      r.maxAlternatives = 1
      sessionFinal = ''
      interim = ''

      r.onresult = (e) => {
        let fin = ''
        let intr = ''
        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i]
          const t = res[0]?.transcript ?? ''
          if (res.isFinal) fin += ' ' + t
          else intr += ' ' + t
        }
        noSpeechRun = 0
        emptyRestarts = 0
        fin = norm(fin)
        if (fin !== sessionFinal) {
          const seg = fin.startsWith(sessionFinal) ? norm(fin.slice(sessionFinal.length)) : fin
          sessionFinal = fin
          if (seg) opts.onFinal?.(seg, full())
        }
        interim = norm(intr)
        opts.onInterim?.(interim, full())
      }

      r.onerror = (e) => {
        switch (e.error) {
          case 'no-speech':
            noSpeechRun++
            if (noSpeechRun === 3) opts.onError?.({ kind: 'no_speech', fatal: false, message: VOICE_COPY.no_speech, partial: full() })
            break
          case 'aborted':
            break
          case 'not-allowed':
          case 'service-not-allowed':
            fail('mic_denied'); break
          case 'audio-capture':
            fail('no_device'); break
          case 'network':
            fail('network'); break
          case 'language-not-supported':
            fail('unsupported'); break
          default:
            break
        }
      }

      r.onend = () => {
        running = false
        // Chrome finalises on end; anything still interim is kept rather than lost.
        committed = join(committed, sessionFinal, interim)
        sessionFinal = ''
        interim = ''
        if (stopping || !active) { onEnded?.(); return }
        if (emptyRestarts >= MAX_RESTARTS) {
          const partial = committed
          active = false
          stopping = true
          cleanup()
          opts.onError?.({ kind: 'no_speech', fatal: true, message: VOICE_COPY.no_speech, partial })
          return
        }
        totalRestarts++
        emptyRestarts++
        restartTimer = setTimeout(() => {
          restartTimer = null
          if (!active || stopping) return
          try { startRec() } catch { fail('network') }
        }, RESTART_BACKOFF_MS)
      }

      r.start()
      running = true
    }

    try { startRec() } catch { queueMicrotask(() => fail('unsupported')) }

    let stopP: Promise<string> | null = null
    return {
      stop: () => {
        if (stopP) return stopP
        if (!active) return (stopP = Promise.resolve(full()))
        stopping = true
        if (restartTimer) { clearTimeout(restartTimer); restartTimer = null }
        stopP = new Promise<string>((resolve) => {
          let done = false
          const finish = () => {
            if (done) return
            done = true
            const text = join(committed, sessionFinal, interim)
            active = false
            cleanup()
            resolve(text)
          }
          if (!rec || !running) { finish(); return }
          onEnded = finish
          try { rec.stop() } catch { finish() }
          setTimeout(finish, STOP_GRACE_MS)
        })
        return stopP
      },
      abort: () => {
        if (!active) return
        active = false
        stopping = true
        cleanup()
      },
      restarts: () => totalRestarts,
    }
  }

  /* -------------------------------- speak ------------------------------- */

  async voices(): Promise<SpeechSynthesisVoice[]> {
    return rankVoices(await this.loadVoices())
  }

  private loadVoices(): Promise<SpeechSynthesisVoice[]> {
    if (typeof window === 'undefined' || !window.speechSynthesis) return Promise.resolve([])
    const synth = window.speechSynthesis
    const now = synth.getVoices()
    if (now.length) return Promise.resolve(now)
    if (this.voicesP) return this.voicesP
    this.voicesP = new Promise((resolve) => {
      const done = (v: SpeechSynthesisVoice[]) => {
        synth.removeEventListener('voiceschanged', onChange)
        clearTimeout(t)
        if (!v.length) this.voicesP = null // try again next time
        resolve(v)
      }
      const onChange = () => { const v = synth.getVoices(); if (v.length) done(v) }
      const t = setTimeout(() => done(synth.getVoices()), 1500)
      synth.addEventListener('voiceschanged', onChange)
    })
    return this.voicesP
  }

  cancelSpeech(): void {
    const c = this.currentSpeech
    this.currentSpeech = null
    c?.cancel()
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try { window.speechSynthesis.cancel() } catch { /* ignore */ }
    }
  }

  speak(text: string, opts: SpeakOptions = {}): SpeakHandle {
    const hadSpeech = this.currentSpeech !== null || (typeof window !== 'undefined' && !!window.speechSynthesis?.speaking)
    this.cancelSpeech()

    let resolveDone!: () => void
    let resolveFirst!: (v: boolean) => void
    const done = new Promise<void>((r) => { resolveDone = r })
    const firstAudio = new Promise<boolean>((r) => { resolveFirst = r })

    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
    if (!synth || !text.trim()) {
      resolveFirst(false); resolveDone()
      return { done, firstAudio, cancel() {} }
    }

    const rate = clamp(opts.rate ?? 1, 0.5, 2)
    const chunks = chunkText(text)
    const words = wordSpans(text)
    const env = new SpeechEnvelope(Math.random())

    let cancelled = false
    let finished = false
    let started = false
    let chunkIdx = -1
    let chunkStartAt = 0
    let chunkVoiced = false
    let boundariesWork = false
    let lastWord = -1
    let raf = 0
    let lastT = performance.now()
    let watchdog: ReturnType<typeof setTimeout> | null = null
    let startTimer: ReturnType<typeof setTimeout> | null = null

    const emitThrough = (globalChar: number, estimated: boolean) => {
      while (lastWord + 1 < words.length && words[lastWord + 1].start <= globalChar) {
        lastWord++
        const w = words[lastWord]
        env.kick(Math.min(10, w.text.length) / 4)
        opts.onBoundary?.({ charIndex: w.start, charLength: w.end - w.start, estimated })
      }
    }

    const frame = () => {
      const now = performance.now()
      const dt = (now - lastT) / 1000
      lastT = now
      if (chunkVoiced && !boundariesWork && chunkIdx >= 0 && now - chunkStartAt > 280) {
        const c = chunks[chunkIdx]
        const est = c.start + ((now - chunkStartAt) / 1000) * CHARS_PER_SEC * rate
        emitThrough(Math.min(est, c.start + c.text.length - 1), true)
      }
      opts.onLevel?.(env.tick(now / 1000, dt))
      raf = requestAnimationFrame(frame)
    }

    const finish = (natural: boolean) => {
      if (finished) return
      finished = true
      cancelAnimationFrame(raf)
      if (watchdog) clearTimeout(watchdog)
      if (startTimer) clearTimeout(startTimer)
      if (natural) emitThrough(text.length, !boundariesWork)
      opts.onLevel?.(0)
      if (this.currentSpeech === handle) this.currentSpeech = null
      this.keepAlive = null
      resolveFirst(started)
      resolveDone()
    }

    const speakChunk = (i: number, voice: SpeechSynthesisVoice | null) => {
      if (cancelled || finished) return
      if (i >= chunks.length) { finish(true); return }
      chunkIdx = i
      chunkVoiced = false
      const c = chunks[i]
      const u = new SpeechSynthesisUtterance(c.text)
      if (voice) { u.voice = voice; u.lang = voice.lang } else u.lang = opts.lang ?? 'en-US'
      u.rate = rate
      u.pitch = 1
      u.volume = 1
      this.keepAlive = u

      let ended = false
      const next = () => {
        if (ended) return
        ended = true
        if (watchdog) { clearTimeout(watchdog); watchdog = null }
        chunkVoiced = false
        env.setActive(false)
        emitThrough(c.start + c.text.length - 1, !boundariesWork)
        // a short breath between sentences
        setTimeout(() => speakChunk(i + 1, voice), 40)
      }

      u.onstart = () => {
        if (!started) {
          started = true
          if (startTimer) { clearTimeout(startTimer); startTimer = null }
          resolveFirst(true)
          opts.onStart?.()
        }
        chunkStartAt = performance.now()
        chunkVoiced = true
        env.setActive(true)
      }
      u.onboundary = (e) => {
        if (e.name && e.name !== 'word') return
        boundariesWork = true
        emitThrough(c.start + e.charIndex, false)
      }
      u.onend = next
      u.onerror = (e) => {
        if (cancelled || finished) return
        if (!started && (e.error === 'not-allowed' || e.error === 'synthesis-failed' || e.error === 'synthesis-unavailable' || e.error === 'audio-busy' || e.error === 'audio-hardware' || e.error === 'voice-unavailable')) {
          opts.onError?.(`Speech playback failed (${e.error}).`)
          finish(false)
          return
        }
        next()
      }

      // Stuck-queue watchdog (chars × 120 ms + 2 s). Chrome sometimes never fires onend.
      watchdog = setTimeout(() => {
        if (ended || cancelled) return
        try { synth.cancel() } catch { /* ignore */ }
        next()
      }, watchdogMs(c.text.length, rate))

      if (synth.paused) synth.resume()
      synth.speak(u)
    }

    const handle = {
      cancel: () => {
        if (finished) return
        cancelled = true
        try { synth.cancel() } catch { /* ignore */ }
        finish(false)
      },
    }
    this.currentSpeech = handle

    raf = requestAnimationFrame(frame)
    startTimer = setTimeout(() => {
      if (started || finished) return
      try { synth.cancel() } catch { /* ignore */ }
      opts.onError?.('Speech synthesis produced no audio.')
      finish(false)
    }, FIRST_AUDIO_TIMEOUT_MS)

    this.loadVoices().then((list) => {
      if (cancelled || finished) return
      const v = pickVoice(list, { voiceURI: opts.voiceURI, lang: opts.lang })
      // Chrome drops a speak() issued in the same tick as cancel(); give it a beat.
      setTimeout(() => speakChunk(0, v), hadSpeech ? 80 : 0)
    })

    return { done, firstAudio, cancel: handle.cancel }
  }
}

/* ========================================================================== */

export class NullVoiceService implements VoiceService {
  support(): VoiceSupport { return { stt: false, tts: false } }
  async checkMic(): Promise<MicStatus> { return 'unsupported' }
  listen(opts: ListenOptions): ListenHandle {
    queueMicrotask(() => opts.onError?.({ kind: 'unsupported', fatal: true, message: VOICE_COPY.unsupported, partial: '' }))
    return { stop: async () => '', abort() {}, restarts: () => 0 }
  }
  speak(_text: string, _opts?: SpeakOptions): SpeakHandle {
    return { done: Promise.resolve(), firstAudio: Promise.resolve(false), cancel() {} }
  }
  cancelSpeech(): void {}
  async voices(): Promise<SpeechSynthesisVoice[]> { return [] }
}

/** App-wide voice service. Web Speech in browsers, the null service elsewhere (tests, SSR). */
export const voice: VoiceService = typeof window !== 'undefined' ? new WebVoiceService() : new NullVoiceService()
