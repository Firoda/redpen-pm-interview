/* Mic check for onboarding and Settings. Explains first, then asks for permission,
 * then shows a live level (small orb + meter) and a preview of recognised words.
 * Calls onResult once: 'ok' as soon as we hear you, or the failure reason. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Mic, MicOff, RotateCcw } from 'lucide-react'
import { Button, cx } from '@/ui'
import { Orb } from '@/ui/Orb'
import { voice } from '@/services/voice/VoiceService'
import type { ListenHandle, MicStatus } from '@/services/voice/types'

export interface MicCheckProps {
  onResult: (r: MicStatus) => void
  lang?: 'en-IN' | 'en-US' | 'en-GB'
  className?: string
}

type Stage = 'intro' | 'asking' | 'live' | 'failed'

const FAIL_COPY: Record<Exclude<MicStatus, 'ok'>, { title: string; body: string }> = {
  denied: { title: 'Microphone is blocked', body: 'Allow it from the lock icon in the address bar, then try again. You can always answer by typing.' },
  no_device: { title: 'No microphone found', body: 'Plug one in or check your sound settings, then try again.' },
  unsupported: { title: 'Voice is not available here', body: 'Voice answers need Chrome on a computer. You can still practise by typing.' },
}

export function MicCheck({ onResult, lang = 'en-IN', className }: MicCheckProps) {
  const [stage, setStage] = useState<Stage>('intro')
  const [fail, setFail] = useState<Exclude<MicStatus, 'ok'> | null>(null)
  const [heard, setHeard] = useState(false)
  const [words, setWords] = useState({ final: '', interim: '' })
  const [sttNote, setSttNote] = useState<string | null>(null)
  const levelRef = useRef(0)
  const listenRef = useRef<ListenHandle | null>(null)
  const reported = useRef(false)
  const loudMs = useRef(0)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  const report = useCallback((r: MicStatus) => {
    if (reported.current) return
    reported.current = true
    onResultRef.current(r)
  }, [])

  const markHeard = useCallback(() => {
    setHeard(true)
    report('ok')
  }, [report])

  const stopListening = useCallback(() => {
    listenRef.current?.abort()
    listenRef.current = null
    levelRef.current = 0
  }, [])

  const start = useCallback(async () => {
    setFail(null)
    setSttNote(null)
    const sup = voice.support()
    setStage('asking')
    const status = await voice.checkMic()
    if (status !== 'ok' || !sup.stt) {
      const r = status !== 'ok' ? status : 'unsupported'
      setFail(r)
      setStage('failed')
      reported.current = false // allow a later success after "Try again"
      onResultRef.current(r)
      return
    }
    setStage('live')
    setWords({ final: '', interim: '' })
    loudMs.current = 0
    let last = performance.now()
    listenRef.current = voice.listen({
      lang,
      onLevel: (l) => {
        levelRef.current = l
        const now = performance.now()
        if (l > 0.3) loudMs.current += now - last
        last = now
        if (loudMs.current > 300) markHeard()
      },
      onInterim: (interim, final) => { setWords({ final, interim }); if (interim || final) markHeard() },
      onFinal: (_s, final) => { setWords((w) => ({ ...w, final })); markHeard() },
      onError: (e) => {
        if (e.kind === 'mic_denied' || e.kind === 'no_device') {
          listenRef.current = null
          setFail(e.kind === 'mic_denied' ? 'denied' : 'no_device')
          setStage('failed')
          onResultRef.current(e.kind === 'mic_denied' ? 'denied' : 'no_device')
        } else if (e.kind === 'network') {
          setSttNote('Your mic works, but speech recognition needs an internet connection.')
        }
      },
    })
  }, [lang, markHeard])

  useEffect(() => () => stopListening(), [stopListening])

  return (
    <div className={cx('flex flex-col items-center text-center', className)}>
      {stage === 'intro' || stage === 'asking' ? (
        <div key="intro" className="flex flex-col items-center animate-fade">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-subtle text-secondary">
            <Mic size={22} strokeWidth={1.75} />
          </div>
          <p className="max-w-[40ch] text-callout text-secondary">
            Audio is transcribed in your browser session. Recordings aren't stored.
          </p>
          <Button className="mt-4" icon={Mic} loading={stage === 'asking'} onClick={() => void start()}>
            {stage === 'asking' ? 'Waiting for permission' : 'Check my microphone'}
          </Button>
        </div>
      ) : stage === 'live' ? (
        <div key="live" className="flex w-full flex-col items-center animate-fade">
          <Orb state="listening" levelRef={levelRef} size={128} />
          <LevelBar levelRef={levelRef} className="mt-1 w-40" />
          <div role="status" aria-live="polite" className="mt-3 flex h-6 items-center gap-1.5 text-headline text-primary">
            {heard ? (
              <span key="ok" className="inline-flex items-center gap-1.5 animate-fade"><Check size={16} strokeWidth={2} className="text-positive" /> We can hear you</span>
            ) : (
              <span key="say" className="animate-fade">Say something, like your name</span>
            )}
          </div>
          <p className="mt-2 min-h-[26px] max-w-[52ch] text-reading">
            <span className="text-primary">{words.final}</span>
            {words.interim ? <span className="text-tertiary">{words.final ? ' ' : ''}{words.interim}</span> : null}
          </p>
          {sttNote ? <p className="mt-1 text-footnote text-secondary">{sttNote}</p> : null}
          <Button className="mt-3" size="sm" variant="ghost" onClick={() => { stopListening(); setStage('intro') }}>
            Stop test
          </Button>
        </div>
      ) : fail ? (
        <div key="fail" className="flex flex-col items-center animate-fade">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-subtle text-danger">
            <MicOff size={22} strokeWidth={1.75} />
          </div>
          <div className="text-headline text-primary">{FAIL_COPY[fail].title}</div>
          <p className="mt-1 max-w-[44ch] text-callout text-secondary">{FAIL_COPY[fail].body}</p>
          {fail !== 'unsupported' ? (
            <Button className="mt-4" size="sm" icon={RotateCcw} onClick={() => void start()}>Try again</Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** Slim level meter that reads a ref every frame (no React re-render per frame). */
export function LevelBar({ levelRef, className }: { levelRef: { readonly current: number }; className?: string }) {
  const fillRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${Math.max(0.02, Math.min(1, levelRef.current))})`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [levelRef])
  return (
    <div className={cx('h-1 overflow-hidden rounded-full bg-subtle', className)} aria-hidden>
      <div ref={fillRef} className="h-full origin-left rounded-full bg-accent-fill" style={{ transform: 'scaleX(0.02)' }} />
    </div>
  )
}

export default MicCheck
