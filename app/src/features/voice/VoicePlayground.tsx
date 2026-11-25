/* Dev aid: the orb in every state, a tunable single orb, the VoiceStage with a fake
 * interviewer, the ranked voice list and the mic check. Not linked in the app;
 * mount it from voice-dev.html (src/features/voice/devMain.tsx) or a dev route. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Segmented, SectionHeader } from '@/ui'
import { Orb, type OrbState } from '@/ui/Orb'
import { SpeechEnvelope } from '@/services/voice/envelope'
import { voice } from '@/services/voice/VoiceService'
import { VoiceStage } from './VoiceStage'
import { MicCheck } from './MicCheck'

const STATES: OrbState[] = ['idle', 'listening', 'speaking', 'thinking', 'muted']

const LINES = [
  "Hi, I'm Meera. One question, two follow-ups, about ten minutes. Think aloud, and ask a clarifying question whenever you need one.",
  'You said the main metric is splits created per day. What if splits go up but repeat usage falls? How would you read that?',
  "Let's change one thing: the feature launches only in tier-two cities. What changes in your metric?",
]

/** A ref updated every frame with a believable level for the given mode. */
function useSimLevel(mode: 'listening' | 'speaking' | 'off', manual?: number) {
  const ref = useRef(0)
  useEffect(() => {
    if (mode === 'off') { ref.current = manual ?? 0; return }
    const env = new SpeechEnvelope(0.61)
    env.setActive(true)
    let raf = 0
    let last = performance.now()
    let nextKick = 0
    let walk = 0.3
    let t = 0
    const loop = () => {
      const now = performance.now()
      const dt = (now - last) / 1000
      last = now
      t += dt
      if (mode === 'speaking') {
        if (t > nextKick) { env.kick(2 + Math.random() * 4); nextKick = t + 0.18 + Math.random() * 0.22 }
        // phrase pauses
        env.setActive(Math.sin(t * 0.7) > -0.6)
        ref.current = env.tick(t, dt)
      } else {
        walk += (Math.random() - 0.5) * dt * 3
        walk = Math.max(0.05, Math.min(0.9, walk))
        const syll = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 3.8 + Math.sin(t * 1.7) * 2)
        const voiced = Math.sin(t * 0.55) > -0.5 ? 1 : 0.08
        ref.current = Math.max(0, Math.min(1, walk * (0.45 + 0.55 * syll) * voiced))
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [mode, manual])
  return ref
}

function StateTile({ state }: { state: OrbState }) {
  const lvl = useSimLevel(state === 'listening' ? 'listening' : state === 'speaking' ? 'speaking' : 'off')
  return (
    <div className="flex flex-col items-center">
      <Orb state={state} levelRef={lvl} size={168} />
      <div className="text-label text-secondary">{state}</div>
    </div>
  )
}

export default function VoicePlayground() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'))
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])

  // single orb
  const [state, setState] = useState<OrbState>('listening')
  const [size, setSize] = useState(280)
  const [manual, setManual] = useState(0.4)
  const [sim, setSim] = useState(true)
  const lvl = useSimLevel(sim && (state === 'listening' || state === 'speaking') ? state : 'off', manual)

  // stage harness
  const [lineIdx, setLineIdx] = useState(0)
  const [line, setLine] = useState<{ id: string; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [disabled, setDisabled] = useState(false)
  const [tts, setTts] = useState(true)
  const [log, setLog] = useState<string[]>([])
  const push = (s: string) => setLog((l) => [s, ...l].slice(0, 8))

  // voices
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => { void voice.voices().then(setVoices) }, [])
  const support = useMemo(() => voice.support(), [])

  return (
    <div className="mx-auto max-w-[1100px] px-8 pb-24 pt-10">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-title-1 text-primary">Voice playground</h1>
          <p className="mt-1 text-body text-secondary">
            Recognition {support.stt ? 'available' : 'unavailable'} · Speech {support.tts ? 'available' : 'unavailable'}
          </p>
        </div>
        <Segmented value={theme} onChange={setTheme} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
      </header>

      <section className="mb-12" data-qa="states">
        <SectionHeader title="Orb states" sub="Simulated levels for listening and speaking" />
        <Card className="grid grid-cols-5 gap-2 px-4 py-6">
          {STATES.map((s) => <StateTile key={s} state={s} />)}
        </Card>
      </section>

      <section className="mb-12" data-qa="single">
        <SectionHeader title="Single orb" />
        <Card className="flex items-center gap-10 p-6">
          <div className="flex h-[340px] w-[340px] items-center justify-center">
            <Orb state={state} levelRef={lvl} size={size} />
          </div>
          <div className="flex flex-1 flex-col gap-5">
            <Segmented value={state} onChange={setState} options={STATES.map((s) => ({ value: s, label: s }))} />
            <label className="flex items-center gap-3 text-label text-primary">
              <input type="checkbox" checked={sim} onChange={(e) => setSim(e.target.checked)} /> Simulate level
            </label>
            <label className="flex flex-col gap-1 text-label text-primary">
              Level {manual.toFixed(2)}
              <input type="range" min={0} max={1} step={0.01} value={manual} disabled={sim} onChange={(e) => setManual(+e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-label text-primary">
              Size {size}px
              <input type="range" min={48} max={340} step={4} value={size} onChange={(e) => setSize(+e.target.value)} />
            </label>
          </div>
        </Card>
      </section>

      <section className="mb-12" data-qa="stage">
        <SectionHeader
          title="Voice stage"
          sub="Space toggles the mic; Esc discards"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => { setLine({ id: String(Math.random()), text: LINES[lineIdx % LINES.length] }); setLineIdx((i) => i + 1) }}>Next line</Button>
              <Button size="sm" variant={busy ? 'primary' : 'secondary'} onClick={() => setBusy((b) => !b)}>Busy {busy ? 'on' : 'off'}</Button>
              <Button size="sm" onClick={() => setTts((t) => !t)}>Speech {tts ? 'on' : 'off'}</Button>
              <Button size="sm" onClick={() => setDisabled((d) => !d)}>{disabled ? 'Enable' : 'Disable'}</Button>
            </div>
          }
        />
        <Card className="h-[640px] overflow-hidden">
          <VoiceStage
            interviewerLine={line}
            busy={busy}
            disabled={disabled}
            settings={{ lang: 'en-IN', ttsEnabled: tts, rate: 1, autoSend: false }}
            onTranscript={(t, m) => push(`transcript (${Math.round(m.durationMs / 1000)}s): ${t}`)}
            onSwitchToText={() => push('switch to text')}
            onError={(k, msg) => push(`error ${k}: ${msg}`)}
          />
        </Card>
        <ul className="mt-3 space-y-1 font-mono text-caption text-secondary">
          {log.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      </section>

      <section className="mb-12" data-qa="mic">
        <SectionHeader title="Mic check" />
        <Card className="p-8"><MicCheck onResult={(r) => push(`mic check: ${r}`)} /></Card>
      </section>

      <section data-qa="voices">
        <SectionHeader title="Voices" sub="Ranked best first; the top one is used unless Settings picks another" />
        <Card className="divide-y divide-border">
          {voices.length === 0 ? <div className="p-4 text-callout text-secondary">No English voices loaded.</div> : null}
          {voices.slice(0, 12).map((v, i) => (
            <div key={v.voiceURI} className="flex items-center justify-between px-4 py-2.5">
              <div className="text-callout text-primary">{i + 1}. {v.name} <span className="text-tertiary">· {v.lang}{v.localService ? ' · local' : ' · network'}</span></div>
              <Button size="sm" variant="ghost" onClick={() => voice.speak('You said the main metric is splits per day. How would you check that?', { voiceURI: v.voiceURI })}>Play</Button>
            </div>
          ))}
        </Card>
      </section>
    </div>
  )
}
