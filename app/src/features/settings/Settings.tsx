/* S8 — Settings (F13). One 640 px column of grouped sections. Local writes are silent (no "Saved" toasts);
 * every change fires settings_changed{key} and never carries a secret value. Spec: MASTER_PLAN §3.2 S8, §4.11. */
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Eye, EyeOff, Minus, Plus, Volume2 } from 'lucide-react'
import { db, getSettings, updateSettings } from '@/services/db/db'
import { Analytics } from '@/services/analytics'
import { Clock } from '@/services/clock'
import { KeyStore } from '@/services/keyStore'
import { isNoveltyVoice, rankVoices } from '@/services/voice/voices'
import { exportData, importData, resetAll, saveProfile, testAiConnection } from '@/engine/api'
import type { NudgeType, Profile, Score, Settings as SettingsT, TopicId } from '@/domain/types'
import { TOPICS, TOPIC_LABEL } from '@/domain/types'
import { INTERVIEWER_NAME } from '@/config/brand'
import { Button, Dialog, IconButton, Input, Page, Segmented, Skeleton, cx, toast } from '@/ui'
import { downloadBlob, isoDay } from '@/features/home/format'
import { RatingSegments } from '@/features/onboarding/RatingSegments'
import { MicCheckSlot } from '@/features/onboarding/MicCheckSlot'
import { Group, Row, Select, Toggle } from './parts'

// Only user-facing nudge kinds get a toggle (the engine's 'recommended' fallback is always on).
const NUDGE_LABEL: Partial<Record<NudgeType, string>> = {
  resume_mock: 'Resume an open mock',
  unread_feedback: 'Feedback you haven’t read',
  retry_fix: 'Retry window after a mock',
  neglected_topic: 'Topics untouched for a week',
  weekly_goal: 'Weekly goal, Friday to Sunday',
  interview_countdown: 'Interview countdown',
}

async function change(key: string, fn: (s: SettingsT) => SettingsT) {
  try {
    await updateSettings(fn)
    void Analytics.track('settings_changed', { key })
  } catch (e) {
    toast.error("Couldn't save that setting. Storage may be full.")
  }
}
async function changeProfile(key: string, patch: Partial<Profile>) {
  try {
    await saveProfile(patch)
    void Analytics.track('settings_changed', { key: `profile.${key}` })
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Couldn't save that.")
  }
}

export default function Settings() {
  const s = useLiveQuery(() => getSettings(), [])
  const profile = useLiveQuery(async () => (await db.profile.get('me')) ?? null, [])
  const loc = useLocation()

  useEffect(() => {
    if (!s || !loc.hash) return
    document.getElementById(loc.hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [s, loc.hash])

  if (!s || profile === undefined) {
    return (
      <Page title="Settings" width="reading">
        <div className="flex max-w-[640px] flex-col gap-8">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-lg" />)}</div>
      </Page>
    )
  }

  return (
    <Page title="Settings" sub="Everything here stays in this browser." width="reading">
      <div className="flex max-w-[640px] flex-col gap-10">
        <ProfileSection profile={profile} />
        <PracticeSection s={s} profile={profile} />
        <VoiceSection s={s} />
        <AiSection s={s} />
        <NudgeSection s={s} />
        <Group title="Appearance">
          <Row label="Theme">
            <Segmented
              size="sm"
              value={s.theme}
              onChange={(v) => change('theme', (x) => ({ ...x, theme: v }))}
              options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]}
            />
          </Row>
        </Group>
        <DataSection />
        <Group title="Privacy">
          <div className="flex flex-col gap-2 px-4 py-3.5 text-callout text-secondary">
            <p><span className="text-primary">Stays in this browser:</span> your profile, mocks, scores, uploads and the event log. There is no account and no server database.</p>
            <p><span className="text-primary">Sent to the AI provider</span> (only when Claude is on): the question, its interviewer notes and your answers, during a mock and at scoring.</p>
            <p><span className="text-primary">Voice:</span> Chrome sends audio to its speech service to transcribe it. Nothing is recorded or stored.</p>
          </div>
        </Group>
        <Group title="About">
          <Row label="Redpen" hint="MVP build · scores are AI estimates, not a hiring decision" />
          <Row label="Metrics panel" hint="North Star and GAME metrics, computed from events in this browser">
            <Link to="/metrics" className="text-label text-accent hover:underline">Open</Link>
          </Row>
        </Group>
      </div>
    </Page>
  )
}

/* ---------------- Profile ---------------- */

function ProfileSection({ profile }: { profile: Profile | null }) {
  const [name, setName] = useState(profile?.firstName ?? '')
  const today = isoDay(Clock.now())
  const date = profile?.interviewDate?.slice(0, 10) ?? ''
  const [dateDraft, setDateDraft] = useState(date)
  useEffect(() => setDateDraft(date), [date])
  const past = !!dateDraft && dateDraft < today

  const setRating = (t: TopicId, v: Score | undefined) => {
    const next = { ...(profile?.selfRatings ?? {}) }
    if (v == null) delete next[t]; else next[t] = v
    void changeProfile('selfRatings', {
      selfRatings: next,
      // keep the onboarding guess for the first-report comparison
      originalSelfRatings: profile?.originalSelfRatings ?? profile?.selfRatings ?? next,
    })
  }

  return (
    <Group id="profile" title="Profile">
      <Row label="Name" hint={`What ${INTERVIEWER_NAME} calls you`} htmlFor="set-name">
        <Input
          id="set-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if ((profile?.firstName ?? '') !== name.trim()) void changeProfile('firstName', { firstName: name.trim() || undefined }) }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          placeholder="First name"
          className="w-[220px]"
          maxLength={40}
        />
      </Row>
      <Row
        label="Interview date"
        hint={past ? <span className="text-danger">That date has passed. Pick a new one or clear it.</span> : 'Reminders pace themselves to it'}
        htmlFor="set-date"
      >
        <div className="flex items-center gap-2">
          <Input
            id="set-date"
            type="date"
            min={today}
            value={dateDraft}
            onChange={(e) => {
              setDateDraft(e.target.value)
              if (e.target.value && e.target.value >= today) void changeProfile('interviewDate', { interviewDate: e.target.value })
            }}
            className="w-[168px]"
          />
          {date ? <Button size="sm" variant="ghost" onClick={() => { setDateDraft(''); void changeProfile('interviewDate', { interviewDate: null }) }}>Clear</Button> : null}
        </div>
      </Row>
      <div className="px-4 py-3.5">
        <div className="text-body text-primary">How confident you feel</div>
        <div className="mt-0.5 text-footnote text-secondary">Your first guess is kept for the “you rated yourself” comparison.</div>
        <div className="mt-3 flex flex-col gap-2">
          {TOPICS.map((t) => (
            <div key={t} className="flex items-center justify-between gap-4">
              <span className="text-callout text-secondary">{TOPIC_LABEL[t]}</span>
              <RatingSegments label={TOPIC_LABEL[t]} value={profile?.selfRatings?.[t]} onChange={(v) => setRating(t, v)} />
            </div>
          ))}
        </div>
      </div>
    </Group>
  )
}

/* ---------------- Practice ---------------- */

function PracticeSection({ s, profile }: { s: SettingsT; profile: Profile | null }) {
  const goal = s.mock.weeklyGoal
  const setGoal = (g: number) => change('mock.weeklyGoal', (x) => ({ ...x, mock: { ...x.mock, weeklyGoal: Math.max(1, Math.min(7, g)) } }))
  return (
    <Group title="Practice">
      <Row label="Default length" hint={s.mock.defaultLength === 'quick' ? '2 follow-ups, about 10 minutes' : '3 follow-ups, about 15 minutes'}>
        <Segmented
          size="sm"
          value={s.mock.defaultLength}
          onChange={(v) => change('mock.defaultLength', (x) => ({ ...x, mock: { ...x.mock, defaultLength: v } }))}
          options={[{ value: 'quick', label: 'Quick' }, { value: 'standard', label: 'Standard' }]}
        />
      </Row>
      <Row label="Default mode">
        <Segmented
          size="sm"
          value={profile?.preferredMode ?? 'text'}
          onChange={(v) => changeProfile('preferredMode', { preferredMode: v })}
          options={[{ value: 'text', label: 'Text' }, { value: 'voice', label: 'Voice' }]}
        />
      </Row>
      <Row label="Weekly goal" hint="Reviewed mocks a week. The ring on Home tracks it.">
        <div className="flex items-center gap-1">
          <IconButton icon={Minus} label="Fewer" size="sm" onClick={() => setGoal(goal - 1)} disabled={goal <= 1} />
          <span className="w-8 text-center text-headline text-primary tabular" aria-live="polite">{goal}</span>
          <IconButton icon={Plus} label="More" size="sm" onClick={() => setGoal(goal + 1)} disabled={goal >= 7} />
        </div>
      </Row>
    </Group>
  )
}

/* ---------------- Voice ---------------- */

function VoiceSection({ s }: { s: SettingsT }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [testing, setTesting] = useState(false)
  const hasTts = typeof window !== 'undefined' && 'speechSynthesis' in window

  useEffect(() => {
    if (!hasTts) return
    const load = () => setVoices(rankVoices(window.speechSynthesis.getVoices(), s.voice.lang).filter((v) => !isNoveltyVoice(v.name) || v.voiceURI === s.voice.voiceURI))
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [hasTts, s.voice.lang, s.voice.voiceURI])

  const sample = () => {
    if (!hasTts) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(`Hi, I'm ${INTERVIEWER_NAME}. One question, two follow-ups, about ten minutes.`)
    const v = voices.find((x) => x.voiceURI === s.voice.voiceURI) ?? voices[0]
    if (v) u.voice = v
    u.lang = v?.lang ?? s.voice.lang
    u.rate = s.voice.rate
    window.speechSynthesis.speak(u)
  }

  return (
    <Group title="Voice" sub="Works in Chrome on desktop.">
      <Row label="Speech language" hint="Accent the transcriber listens for">
        <Segmented
          size="sm"
          value={s.voice.lang}
          onChange={(v) => change('voice.lang', (x) => ({ ...x, voice: { ...x.voice, lang: v } }))}
          options={[{ value: 'en-IN', label: 'India' }, { value: 'en-US', label: 'US' }, { value: 'en-GB', label: 'UK' }]}
        />
      </Row>
      <Row label={`Speak ${INTERVIEWER_NAME}'s lines`} hint="Her lines always show as text too">
        <Toggle label="Speak the interviewer's lines" checked={s.voice.ttsEnabled} onChange={(v) => change('voice.ttsEnabled', (x) => ({ ...x, voice: { ...x.voice, ttsEnabled: v } }))} />
      </Row>
      {s.voice.ttsEnabled && hasTts ? (
        <Row label="Interviewer voice" htmlFor="set-voice">
          <div className="flex items-center gap-2">
            <Select
              id="set-voice"
              label="Interviewer voice"
              value={s.voice.voiceURI ?? ''}
              onChange={(v) => change('voice.voiceURI', (x) => ({ ...x, voice: { ...x.voice, voiceURI: v || undefined } }))}
              options={[{ value: '', label: voices[0] ? `Best available (${voices[0].name})` : 'Best available' }, ...voices.map((v) => ({ value: v.voiceURI, label: `${v.name} · ${v.lang}` }))]}
            />
            <IconButton icon={Volume2} label="Play a sample" size="sm" onClick={sample} />
          </div>
        </Row>
      ) : null}
      {s.voice.ttsEnabled && hasTts ? (
        <Row label="Speaking rate" htmlFor="set-rate">
          <div className="flex items-center gap-3">
            <input
              id="set-rate"
              type="range"
              min={0.8}
              max={1.3}
              step={0.05}
              value={s.voice.rate}
              onChange={(e) => change('voice.rate', (x) => ({ ...x, voice: { ...x.voice, rate: Number(e.target.value) } }))}
              className="w-36"
              style={{ accentColor: 'var(--accent)' }}
            />
            <span className="w-10 text-right text-callout text-secondary tabular">{s.voice.rate.toFixed(2).replace(/0$/, '')}×</span>
          </div>
        </Row>
      ) : null}
      <Row label="Send voice answers without review" hint="Off: your transcript lands in the box first so you can fix it">
        <Toggle label="Send voice answers without review" checked={s.voice.autoSend} onChange={(v) => change('voice.autoSend', (x) => ({ ...x, voice: { ...x.voice, autoSend: v } }))} />
      </Row>
      <Row label="Microphone check" stack>
        {testing ? (
          <MicCheckSlot />
        ) : (
          <Button size="sm" onClick={() => setTesting(true)} className="self-start">Test microphone</Button>
        )}
      </Row>
    </Group>
  )
}

/* ---------------- AI ---------------- */

function AiSection({ s }: { s: SettingsT }) {
  const [key, setKey] = useState('')
  const [reveal, setReveal] = useState(false)
  const [where, setWhere] = useState<'session' | 'local' | null>(() => KeyStore.where())
  const [test, setTest] = useState<{ ok: boolean; message: string; latencyMs?: number } | null>(null)
  const [testing, setTesting] = useState(false)
  const live = s.ai.mode === 'live'
  const remember = s.ai.keyStorage === 'local'

  const saveKey = () => {
    if (!key.trim()) return
    KeyStore.set(key, remember)
    setWhere(KeyStore.where())
    setKey('')
    setReveal(false)
    setTest(null)
    void Analytics.track('settings_changed', { key: 'ai.key' })
  }
  const forget = () => {
    KeyStore.forget()
    setWhere(null)
    setTest(null)
    void Analytics.track('settings_changed', { key: 'ai.key' })
  }
  const setRemember = (v: boolean) => {
    const cur = KeyStore.get()
    if (cur) KeyStore.set(cur, v)
    setWhere(KeyStore.where())
    void change('ai.keyStorage', (x) => ({ ...x, ai: { ...x.ai, keyStorage: v ? 'local' : 'session' } }))
  }
  const runTest = async () => {
    setTesting(true)
    setTest(null)
    try { setTest(await testAiConnection()) }
    catch (e) { setTest({ ok: false, message: e instanceof Error ? e.message : 'Test failed.' }) }
    finally { setTesting(false) }
  }

  return (
    <Group id="ai" title="Interviewer and grader" sub="Scripted works offline with prepared follow-ups and an offline coach. Claude adapts to what you say.">
      <Row label="Mode">
        <Segmented
          size="sm"
          value={s.ai.mode}
          onChange={(v) => { setTest(null); void change('ai.mode', (x) => ({ ...x, ai: { ...x.ai, mode: v } })) }}
          options={[{ value: 'scripted', label: 'Scripted' }, { value: 'live', label: 'Claude' }]}
        />
      </Row>
      {live ? (
        <Row label="Use server key" hint="Calls go through this app's Vercel function. No key needed in the browser.">
          <Toggle label="Use server key" checked={s.ai.useProxy} onChange={(v) => { setTest(null); void change('ai.useProxy', (x) => ({ ...x, ai: { ...x.ai, useProxy: v } })) }} />
        </Row>
      ) : null}
      {live && !s.ai.useProxy ? (
        <Row
          label="Anthropic API key"
          stack
          hint={where
            ? <span className="text-positive">Key saved {where === 'local' ? 'on this device' : 'for this tab only'}.</span>
            : 'Stored in this browser and sent directly to Anthropic. Use a key with a low spend limit.'}
        >
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                type={reveal ? 'text' : 'password'}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveKey() }}
                placeholder={where ? 'Paste a new key to replace it' : 'sk-ant-…'}
                autoComplete="off"
                spellCheck={false}
                className="pr-10 font-mono text-callout"
                aria-label="Anthropic API key"
              />
              <IconButton
                icon={reveal ? EyeOff : Eye}
                label={reveal ? 'Hide key' : 'Show key'}
                size="sm"
                onClick={() => setReveal((r) => !r)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2"
              />
            </div>
            <Button size="md" onClick={saveKey} disabled={!key.trim()}>Save key</Button>
            {where ? <Button size="md" variant="ghost" onClick={forget}>Forget</Button> : null}
          </div>
          <div className="mt-3 flex items-center justify-between gap-4">
            <span className="text-footnote text-secondary">Remember on this device</span>
            <Toggle label="Remember the key on this device" checked={remember} onChange={setRemember} />
          </div>
        </Row>
      ) : null}
      <Row label="Grader quality" hint={{ fast: 'Quickest feedback, fine for practice', thorough: 'Slower, more careful scoring', max: 'Slowest and most careful' }[s.ai.graderQuality]}>
        <Segmented
          size="sm"
          value={s.ai.graderQuality}
          onChange={(v) => change('ai.graderQuality', (x) => ({ ...x, ai: { ...x.ai, graderQuality: v } }))}
          options={[{ value: 'fast', label: 'Fast' }, { value: 'thorough', label: 'Thorough' }, { value: 'max', label: 'Max' }]}
        />
      </Row>
      {live ? (
        <Row
          label="Connection"
          hint={test ? (
            <span className={test.ok ? 'text-positive' : 'text-danger'}>
              {test.ok ? `Connected${test.latencyMs != null ? ` · ${Math.round(test.latencyMs)} ms` : ''}` : test.message}
            </span>
          ) : 'If Claude fails during a mock, the scripted interviewer takes over.'}
        >
          <Button size="sm" onClick={runTest} loading={testing}>{testing ? 'Testing…' : 'Test connection'}</Button>
        </Row>
      ) : null}
    </Group>
  )
}

/* ---------------- Nudges ---------------- */

function NudgeSection({ s }: { s: SettingsT }) {
  const muted = s.nudges.muted
  const toggleType = (t: NudgeType, on: boolean) =>
    change(`nudges.${t}`, (x) => ({
      ...x,
      nudges: { ...x.nudges, mutedTypes: on ? x.nudges.mutedTypes.filter((m) => m !== t) : Array.from(new Set([...x.nudges.mutedTypes, t])) },
    }))
  return (
    <Group title="Nudges" sub="Shown on Home only. Never during a mock.">
      <Row label="Show nudges" hint="Next up on Home still recommends a topic when this is off">
        <Toggle label="Show nudges" checked={!muted} onChange={(v) => change('nudges.muted', (x) => ({ ...x, nudges: { ...x.nudges, muted: !v } }))} />
      </Row>
      {(Object.keys(NUDGE_LABEL) as NudgeType[]).map((t) => (
        <Row key={t} label={<span className={cx(muted && 'text-disabled')}>{NUDGE_LABEL[t]}</span>}>
          <Toggle label={NUDGE_LABEL[t] ?? t} disabled={muted} checked={!s.nudges.mutedTypes.includes(t)} onChange={(v) => toggleType(t, v)} />
        </Row>
      ))}
    </Group>
  )
}

/* ---------------- Data ---------------- */

function DataSection() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [usage, setUsage] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => {
      if (e.usage != null) setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB used in this browser`)
    }).catch(() => {})
  }, [])

  const doExport = async () => {
    setExporting(true)
    try {
      const blob = await exportData()
      downloadBlob(blob, `redpen-export-${isoDay(Clock.now()).replace(/-/g, '')}.json`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't export your data.")
    } finally {
      setExporting(false)
    }
  }
  const doImport = async (f: File) => {
    setImporting(true)
    try {
      await importData(f)
      toast('Data imported')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That file couldn't be imported.")
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }
  const doReset = async () => {
    setResetting(true)
    try {
      KeyStore.forget()
      await resetAll()
      setResetOpen(false)
      navigate('/welcome', { replace: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete local data.")
      setResetting(false)
    }
  }

  return (
    <>
    <Group title="Your data" sub={usage ?? undefined}>
      <Row label="Export my data" hint="A JSON file of your profile, mocks, feedback and events. Never includes your API key.">
        <Button size="sm" onClick={doExport} loading={exporting}>Export</Button>
      </Row>
      <Row label="Import a backup" hint="Replaces what's in this browser">
        <Button size="sm" onClick={() => fileRef.current?.click()} loading={importing}>Import</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f) }} />
      </Row>
      <Row label="Delete all local data" hint="Mocks, scores, uploads and settings. This can't be undone.">
        <Button size="sm" variant="danger" onClick={() => { setConfirm(''); setResetOpen(true) }}>Delete</Button>
      </Row>
    </Group>
      <Dialog
        open={resetOpen}
        onOpenChange={(o) => { if (!resetting) setResetOpen(o) }}
        title="Delete all local data?"
        description="Every mock, score, upload and setting in this browser is removed, and you start again from onboarding. Export first if you want a copy."
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)} disabled={resetting}>Cancel</Button>
            <Button
              variant="danger"
              className="bg-danger text-on-accent shadow-none hover:bg-danger hover:opacity-90"
              disabled={confirm !== 'DELETE'}
              loading={resetting}
              onClick={doReset}
            >
              Delete everything
            </Button>
          </>
        }
      >
        <label htmlFor="reset-confirm" className="mb-1.5 block text-label text-primary">Type DELETE to confirm</label>
        <Input id="reset-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoFocus autoComplete="off" className="font-mono" />
      </Dialog>
    </>
  )
}
