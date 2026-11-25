/* Voice-mode stage for the mock room (MASTER_PLAN §4.5 voice, FT-06, D-34).
 * Centred orb + state word, live captions, and a controls bar. Turn-taking is
 * explicit: Space (or the mic button) starts and stops; Esc discards the current
 * recording. No automatic end-of-speech. Space while Meera speaks cuts her off
 * (barge-in) and starts listening.
 *
 * The parent owns the transcript and sending: onTranscript() fires when the
 * candidate finishes, and the parent puts the text in the composer for review
 * (or sends it when settings.autoSend is on). */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, Mic, MicOff, RotateCcw, SkipForward, Square } from 'lucide-react'
import { Banner, Button, IconButton, Kbd, cx } from '@/ui'
import { Orb, type OrbState } from '@/ui/Orb'
import { voice } from '@/services/voice/VoiceService'
import { VOICE_COPY } from '@/services/voice/copy'
import { splitSentences, wordSpans } from '@/services/voice/chunk'
import type { ListenError, ListenHandle, SpeakHandle } from '@/services/voice/types'

export interface VoiceStageProps {
  interviewerLine: { id: string; text: string } | null // when the id changes and TTS is on, speak it, then go to 'ready to talk'
  busy: boolean                // waiting for the AI → thinking state
  disabled?: boolean
  settings: { lang: 'en-IN' | 'en-US' | 'en-GB'; ttsEnabled: boolean; voiceURI?: string; rate: number; autoSend: boolean }
  onTranscript: (text: string, meta: { durationMs: number }) => void // candidate finished speaking (Space or tap)
  onSwitchToText: () => void
  onError: (kind: 'mic_denied' | 'no_device' | 'unsupported' | 'network', message: string) => void
  interviewerName?: string     // default 'Meera'
}

type Phase = 'ready' | 'speaking' | 'listening' | 'stopping' | 'error'
type FatalKind = 'mic_denied' | 'no_device' | 'unsupported' | 'network'

const ORB_MAX = 280
const ORB_MIN = 140

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function VoiceStage({
  interviewerLine, busy, disabled = false, settings, onTranscript, onSwitchToText, onError, interviewerName = 'Meera',
}: VoiceStageProps) {
  const support = useMemo(() => voice.support(), [])
  const [phase, setPhase] = useState<Phase>(support.stt ? 'ready' : 'error')
  const [error, setError] = useState<{ kind: FatalKind; message: string } | null>(
    support.stt ? null : { kind: 'unsupported', message: VOICE_COPY.unsupported },
  )
  const [hint, setHint] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(Number.POSITIVE_INFINITY) // chars of the interviewer line revealed
  const [finalText, setFinalText] = useState('')
  const [interim, setInterim] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [slowThinking, setSlowThinking] = useState(false)

  const levelRef = useRef(0)
  const listenRef = useRef<ListenHandle | null>(null)
  const speakRef = useRef<SpeakHandle | null>(null)
  const startedAt = useRef(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const [stageH, setStageH] = useState(0)
  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setStageH(Math.round(e.contentRect.height)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Latest props for async callbacks.
  const live = useRef({ onTranscript, onError, onSwitchToText, settings })
  live.current = { onTranscript, onError, onSwitchToText, settings }

  const ttsOn = settings.ttsEnabled && support.tts && !disabled

  /* ---------------- unsupported: tell the parent once ---------------- */
  const reportedUnsupported = useRef(false)
  useEffect(() => {
    if (!support.stt && !reportedUnsupported.current) {
      reportedUnsupported.current = true
      live.current.onError('unsupported', VOICE_COPY.unsupported)
    }
  }, [support.stt])

  /* ---------------- interviewer speech ---------------- */
  const lineId = interviewerLine?.id
  useEffect(() => {
    if (!interviewerLine) return
    const text = interviewerLine.text
    if (!ttsOn || listenRef.current) { setRevealed(Number.POSITIVE_INFINITY); return }
    setRevealed(0)
    setHint(null)
    setPhase((p) => (p === 'error' ? p : 'speaking'))
    const h = voice.speak(text, {
      voiceURI: settings.voiceURI,
      lang: settings.lang,
      rate: settings.rate,
      onLevel: (l) => { if (!listenRef.current) levelRef.current = l },
      onBoundary: (b) => setRevealed((r) => Math.max(r, b.charIndex + b.charLength)),
    })
    speakRef.current = h
    h.done.then(() => {
      if (speakRef.current !== h) return
      speakRef.current = null
      setRevealed(Number.POSITIVE_INFINITY)
      setPhase((p) => (p === 'speaking' ? 'ready' : p))
    })
    return () => { h.cancel() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineId])

  const cutSpeech = useCallback(() => {
    const h = speakRef.current
    speakRef.current = null
    h?.cancel()
    setRevealed(Number.POSITIVE_INFINITY)
    levelRef.current = 0
  }, [])

  // TTS switched off mid-line, or the stage disabled: stop talking.
  useEffect(() => {
    if (!ttsOn && speakRef.current) { cutSpeech(); setPhase((p) => (p === 'speaking' ? 'ready' : p)) }
  }, [ttsOn, cutSpeech])

  /* ---------------- listening ---------------- */
  const raise = useCallback((kind: FatalKind, message: string) => {
    listenRef.current = null
    levelRef.current = 0
    setError({ kind, message })
    setPhase('error')
    live.current.onError(kind, message)
  }, [])

  const deliver = useCallback((text: string) => {
    const t = text.trim()
    const durationMs = Math.round(performance.now() - startedAt.current)
    if (t) live.current.onTranscript(t, { durationMs })
    return !!t
  }, [])

  const handleListenError = useCallback((e: ListenError) => {
    if (!e.fatal) { setHint(e.message); return }
    if (e.kind === 'no_speech') {
      // recognition gave up after a long silence: keep what we have
      listenRef.current = null
      levelRef.current = 0
      setPhase('ready')
      if (!deliver(e.partial)) setHint(e.message)
      return
    }
    // Keep partial words: they land in the composer for review (never auto-sent here).
    if (e.partial && !live.current.settings.autoSend) deliver(e.partial)
    raise(e.kind, e.message)
  }, [deliver, raise])

  const startListening = useCallback(() => {
    if (disabled || busy || listenRef.current) return
    if (!support.stt) { raise('unsupported', VOICE_COPY.unsupported); return }
    cutSpeech()
    setHint(null)
    setError(null)
    setFinalText('')
    setInterim('')
    setElapsed(0)
    levelRef.current = 0
    startedAt.current = performance.now()
    const h = voice.listen({
      lang: settings.lang,
      onInterim: (i, f) => { setInterim(i); setFinalText(f) },
      onFinal: (_seg, f) => { setFinalText(f); setHint(null) },
      onLevel: (l) => { levelRef.current = l },
      onError: handleListenError,
    })
    listenRef.current = h
    setPhase('listening')
  }, [disabled, busy, support.stt, settings.lang, cutSpeech, raise, handleListenError])

  const stopAndSend = useCallback(async () => {
    const h = listenRef.current
    if (!h) return
    listenRef.current = null
    setPhase('stopping')
    const text = await h.stop()
    levelRef.current = 0
    setPhase((p) => (p === 'stopping' ? 'ready' : p))
    setInterim('')
    if (deliver(text)) setFinalText(text)
    else setHint("We didn't catch anything. Try again a little closer to the mic.")
  }, [deliver])

  const discard = useCallback(() => {
    const h = listenRef.current
    if (!h) return
    listenRef.current = null
    h.abort()
    levelRef.current = 0
    setFinalText('')
    setInterim('')
    setPhase('ready')
    setHint('Recording discarded.')
  }, [])

  const toggle = useCallback(() => {
    if (phase === 'listening') void stopAndSend()
    else if (phase === 'ready' || phase === 'speaking') startListening()
  }, [phase, stopAndSend, startListening])

  const switchToText = useCallback(async () => {
    cutSpeech()
    const h = listenRef.current
    if (h) {
      listenRef.current = null
      if (live.current.settings.autoSend) h.abort()
      else deliver(await h.stop())
    }
    setPhase((p) => (p === 'error' ? p : 'ready'))
    live.current.onSwitchToText()
  }, [cutSpeech, deliver])

  // Disabled: stop everything.
  useEffect(() => {
    if (!disabled) return
    cutSpeech()
    listenRef.current?.abort()
    listenRef.current = null
    setPhase((p) => (p === 'error' ? p : 'ready'))
  }, [disabled, cutSpeech])

  // Unmount: release mic and speech.
  useEffect(() => () => {
    listenRef.current?.abort()
    speakRef.current?.cancel()
  }, [])

  /* ---------------- timers ---------------- */
  useEffect(() => {
    if (phase !== 'listening') return
    const id = setInterval(() => setElapsed(performance.now() - startedAt.current), 250)
    return () => clearInterval(id)
  }, [phase])

  useEffect(() => {
    setSlowThinking(false)
    if (!busy) return
    const id = setTimeout(() => setSlowThinking(true), 5000)
    return () => clearTimeout(id)
  }, [busy])

  /* ---------------- keyboard: Space toggles, Esc discards ---------------- */
  const keyRef = useRef({ toggle, discard })
  keyRef.current = { toggle, discard }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const tgt = e.target as HTMLElement | null
      if (tgt && (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName))) return
      if (tgt?.closest?.('[role="dialog"],[role="alertdialog"]')) return
      if (e.code === 'Space' || e.key === ' ') {
        if (disabled) return
        e.preventDefault()
        if (e.repeat) return
        keyRef.current.toggle()
      } else if (e.key === 'Escape' && listenRef.current) {
        e.preventDefault()
        e.stopPropagation()
        keyRef.current.discard()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [disabled])

  /* ---------------- derived view state ---------------- */
  const thinking = busy && phase !== 'listening' && phase !== 'speaking'
  const orbState: OrbState =
    disabled || phase === 'error' ? 'muted'
      : phase === 'listening' ? 'listening'
        : phase === 'speaking' ? 'speaking'
          : thinking || phase === 'stopping' ? 'thinking'
            : 'idle'

  const stateWord =
    disabled ? 'Voice paused'
      : phase === 'error' ? 'Voice is off'
        : phase === 'listening' ? 'Listening'
          : phase === 'stopping' ? 'Wrapping up'
            : phase === 'speaking' ? `${interviewerName} is speaking`
              : thinking ? (slowThinking ? 'Still thinking' : 'Thinking')
                : 'Tap or press Space to answer'

  const listeningView = phase === 'listening' || phase === 'stopping'
  // Orb shrinks to fit short stages (captions + controls need ~380px, a banner ~64px more).
  const orbSize = stageH ? Math.max(ORB_MIN, Math.min(ORB_MAX, stageH - 400 - (error ? 56 : 0))) : ORB_MAX
  const canMic = !disabled && phase !== 'error' && phase !== 'stopping' && !thinking

  return (
    <div ref={rootRef} className="flex h-full w-full flex-col items-center">
      {/* orb + state word */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center pt-4">
        <Orb state={orbState} levelRef={levelRef} size={orbSize} />
        <div role="status" aria-live="polite" className="mt-1 flex h-6 items-center gap-2 text-callout text-secondary">
          <span key={stateWord} className="animate-fade">{stateWord}</span>
        </div>
      </div>

      {/* captions */}
      <div className="w-full max-w-[680px] px-6">
        <div className="flex min-h-[132px] flex-col justify-start">
          {listeningView ? (
            <div key="you" className="animate-fade">
              {interviewerLine ? (
                <p className="mb-3 line-clamp-1 text-footnote text-tertiary">{interviewerLine.text}</p>
              ) : null}
              <p className="text-reading" aria-live="polite">
                {finalText || interim ? (
                  <>
                    <span className="text-primary">{finalText}</span>
                    {interim ? <span className="text-tertiary">{finalText ? ' ' : ''}{interim}</span> : null}
                  </>
                ) : (
                  <span className="text-tertiary">Go ahead. Press Space when you're done.</span>
                )}
              </p>
            </div>
          ) : interviewerLine ? (
            <InterviewerCaption key={interviewerLine.id} text={interviewerLine.text} revealed={revealed} speaking={phase === 'speaking'} name={interviewerName} />
          ) : null}
        </div>
      </div>

      {/* inline messages */}
      <div className="w-full max-w-[680px] px-6">
        {error ? (
          <Banner
            tone="danger"
            icon={MicOff}
            className="mb-4 animate-rise"
            action={
              <div className="flex items-center gap-1">
                {error.kind !== 'unsupported' ? (
                  <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => { setError(null); setPhase('ready') }}>Try again</Button>
                ) : null}
                <Button size="sm" variant="secondary" icon={Keyboard} onClick={() => void switchToText()}>Use text instead</Button>
              </div>
            }
          >
            {error.message}
          </Banner>
        ) : hint ? (
          <p key={hint} className="mb-2 h-6 animate-fade text-center text-footnote text-secondary">{hint}</p>
        ) : <div className="mb-2 h-6" aria-hidden />}
      </div>

      {/* controls */}
      <div className="grid w-full max-w-[680px] grid-cols-[1fr_auto_1fr] items-center gap-6 px-6 pb-8">
        <div className="flex justify-start">
          <IconButton icon={Keyboard} label="Type instead" onClick={() => void switchToText()} />
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => toggle()}
            disabled={!canMic}
            aria-label={listeningView ? 'Finish answer' : phase === 'speaking' ? 'Interrupt and answer' : 'Start answering'}
            aria-pressed={listeningView}
            className={cx(
              'relative flex h-16 w-16 items-center justify-center rounded-full transition-colors duration-150 ease-standard',
              'bg-accent-fill text-on-accent hover:bg-accent-fill-hover active:bg-accent-fill-pressed',
              'disabled:bg-subtle disabled:text-disabled',
            )}
          >
            {listeningView ? <Square size={20} strokeWidth={0} fill="currentColor" /> : <Mic size={24} strokeWidth={1.75} />}
          </button>
          <div className="flex h-5 items-center gap-1.5 text-caption text-tertiary">
            {listeningView ? (
              <><Kbd>Space</Kbd> to finish <span className="mx-1">·</span> <Kbd>Esc</Kbd> to discard</>
            ) : phase === 'speaking' ? (
              <><Kbd>Space</Kbd> to interrupt</>
            ) : canMic ? (
              <><Kbd>Space</Kbd> to answer</>
            ) : null}
          </div>
        </div>

        <div className="flex justify-end">
          {listeningView ? (
            <div className="flex h-8 items-center gap-2 rounded-full bg-subtle px-3 text-label text-primary animate-fade" aria-label={`Recording, ${fmt(elapsed)}`}>
              <span className="h-2 w-2 rounded-full bg-live animate-blink" aria-hidden />
              <span className="text-secondary">Rec</span>
              <span className="tabular">{fmt(elapsed)}</span>
            </div>
          ) : phase === 'speaking' ? (
            <Button size="sm" variant="ghost" icon={SkipForward} onClick={() => { cutSpeech(); setPhase('ready') }} className="animate-fade">
              Skip
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/* ---------------- interviewer caption: words reveal with speech ---------------- */

function InterviewerCaption({ text, revealed, speaking, name }: { text: string; revealed: number; speaking: boolean; name: string }) {
  const sentences = useMemo(
    () => splitSentences(text).map((s) => ({ ...s, words: wordSpans(s.text).map((w) => ({ ...w, start: w.start + s.start, end: w.end + s.start })) })),
    [text],
  )
  let current = sentences.length - 1
  if (speaking) {
    current = 0
    for (let i = 0; i < sentences.length; i++) if (sentences[i].start < revealed) current = i
  }
  return (
    <div className="animate-fade">
      <div className="mb-1.5 text-caption text-tertiary">{name}</div>
      <p className="text-reading" aria-label={text}>
        {sentences.map((s, si) => {
          const past = speaking && si < current
          const now = speaking && si === current
          return (
            <span key={s.start} className={cx('transition-colors duration-300 ease-standard', past ? 'text-tertiary' : now ? 'text-primary' : 'text-interviewer')}>
              {s.words.map((w) => (
                <span
                  key={w.start}
                  aria-hidden
                  className={cx('transition-opacity duration-200 ease-standard', w.start < revealed ? 'opacity-100' : 'opacity-0')}
                >
                  {w.text}{' '}
                </span>
              ))}
            </span>
          )
        })}
      </p>
    </div>
  )
}

export default VoiceStage
