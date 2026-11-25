/* S1 — Welcome and onboarding (F01). Four short steps, first question in under 60 s.
 * Persists the step and each answer to the profile so a reload resumes where she left off.
 * Spec: MASTER_PLAN §3.2 S1, §4.3; doc 02 F01. */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Keyboard, Mic } from 'lucide-react'
import { db } from '@/services/db/db'
import { Clock, DAY } from '@/services/clock'
import { Analytics } from '@/services/analytics'
import { completeOnboarding, saveProfile, startMock } from '@/engine/api'
import type { InputMode, Profile, Score, TopicId } from '@/domain/types'
import { TOPICS, TOPIC_LABEL } from '@/domain/types'
import { APP_NAME } from '@/config/brand'
import { BrandMark } from '@/app/AppShell'
import { Banner, Button, Chip, Divider, Input, Label, cx } from '@/ui'
import { TOPIC_TESTS, dayDate, daysBetween, isoDay, parseIsoDay } from '@/features/home/format'
import { RatingSegments } from './RatingSegments'
import { SampleFixCard } from './SampleFixCard'
import { MicCheckSlot, sttSupported } from './MicCheckSlot'
import type { MicStatus } from '@/services/voice/types'

type Step = 1 | 2 | 3 | 4
type DateChoice = 'soon' | 'date' | 'none' | null
const STEP_NAME = { 1: 'promise', 2: 'date', 3: 'confidence', 4: 'mode' } as const

/** Lowest self-rating wins; ties go to the earlier topic; no ratings → Product design. */
export function firstMockTopic(r: Partial<Record<TopicId, Score>>): TopicId {
  let best: TopicId = 'product_design'
  let low = Infinity
  for (const t of TOPICS) { const v = r[t]; if (v != null && v < low) { low = v; best = t } }
  return best
}

async function persist(patch: Partial<Profile>) {
  try { await saveProfile(patch) } catch (e) { console.warn('[onboarding] could not save profile', e) }
}

export default function Onboarding() {
  const navigate = useNavigate()
  // undefined = still loading, null = no profile yet
  const profile = useLiveQuery(async () => (await db.profile.get('me')) ?? null, [])
  const starting = useRef(false)
  const hydrated = useRef(false)
  const openedAt = useRef(Clock.now())

  const [step, setStep] = useState<Step>(1)
  const [name, setName] = useState('')
  const [dateChoice, setDateChoice] = useState<DateChoice>(null)
  const [date, setDate] = useState('')
  const [ratings, setRatings] = useState<Partial<Record<TopicId, Score>>>({})
  const [mode, setMode] = useState<InputMode>('text')
  const [topicOverride, setTopicOverride] = useState<TopicId | null>(null)
  const [pickTopic, setPickTopic] = useState(false)
  const [mic, setMic] = useState<MicStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canVoice = useMemo(sttSupported, [])

  // Hydrate once from a saved profile (resume on reload); leave if onboarding is already done.
  useEffect(() => {
    if (profile === undefined || hydrated.current) return
    hydrated.current = true
    if (!profile) return
    if (profile.onboardingCompletedAt && !starting.current) { navigate('/', { replace: true }); return }
    setStep((profile.onboardingStep ?? 1) as Step)
    setName(profile.firstName ?? '')
    setRatings(profile.selfRatings ?? {})
    if (profile.preferredMode) setMode(profile.preferredMode === 'voice' && !canVoice ? 'text' : profile.preferredMode)
    if (profile.interviewDate) { setDateChoice('date'); setDate(profile.interviewDate.slice(0, 10)) }
    else if (profile.interviewDate === null && (profile.onboardingStep ?? 1) > 2) setDateChoice('none')
  }, [profile, navigate, canVoice])

  // Debounced save of the name while typing.
  useEffect(() => {
    if (!hydrated.current) return
    const h = setTimeout(() => { void persist({ firstName: name.trim() || undefined }) }, 500)
    return () => clearTimeout(h)
  }, [name])

  const now = Clock.now()
  const today = isoDay(now)
  const interviewDate: string | null = dateChoice === 'soon' ? isoDay(now + 3 * DAY) : dateChoice === 'date' && date ? date : null
  const datePast = dateChoice === 'date' && !!date && date < today
  const topic = topicOverride ?? firstMockTopic(ratings)
  const ratedCount = Object.values(ratings).filter(Boolean).length

  const go = (next: Step) => {
    setError(null)
    setStep(next)
    void persist({ onboardingStep: next })
    window.scrollTo({ top: 0 })
  }

  const complete = (s: Step, props: Record<string, unknown> = {}) =>
    void Analytics.track('onboarding_step_completed', { step: STEP_NAME[s], ...props })

  const onContinue = (e?: FormEvent) => {
    e?.preventDefault()
    if (step === 1) {
      void persist({ firstName: name.trim() || undefined, onboardingStep: 2 })
      complete(1, { namedSelf: !!name.trim() })
      go(2)
    } else if (step === 2) {
      if (datePast) return
      const t = interviewDate ? parseIsoDay(interviewDate) : null
      void persist({ interviewDate })
      complete(2, { daysOut: t != null ? daysBetween(now, t) : null, choice: dateChoice ?? 'none' })
      go(3)
    } else if (step === 3) {
      void persist({ selfRatings: ratings, originalSelfRatings: ratings })
      complete(3, { ratedCount })
      go(4)
    } else {
      void start()
    }
  }

  const skipTo4 = () => {
    if (step === 3) { setRatings({}); void persist({ selfRatings: {}, originalSelfRatings: {} }); complete(3, { ratedCount: 0, skipped: true }) }
    if (step === 2) { void persist({ interviewDate: null }); complete(2, { skipped: true }) }
    go(4)
  }

  async function start() {
    if (busy) return
    setBusy(true)
    setError(null)
    starting.current = true
    try {
      try { void navigator.storage?.persist?.() } catch { /* not supported */ }
      await saveProfile({
        firstName: name.trim() || undefined,
        interviewDate,
        selfRatings: ratings,
        originalSelfRatings: ratings,
        preferredMode: mode,
        onboardingStep: 4,
      })
      complete(4, { mode, mic: mic ?? undefined, msSinceOpen: Clock.now() - openedAt.current })
      await completeOnboarding()
      const session = await startMock({ topic, length: 'quick', mode, entryPoint: 'onboarding' })
      navigate(`/mock/${session.id}`, { replace: true })
    } catch (e) {
      starting.current = false
      setBusy(false)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const onMic = (s: MicStatus) => {
    setMic(s)
    if (s !== 'ok') setMode('text')
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* top bar: brand · progress · skip */}
      <header className="mx-auto grid h-16 max-w-[1040px] grid-cols-[1fr_auto_1fr] items-center px-8">
        <div className="flex items-center gap-2.5">
          <BrandMark size={24} />
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-primary">{APP_NAME}</span>
        </div>
        <div className="flex flex-col items-center gap-1.5" aria-label={`Step ${step} of 4`}>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={cx('h-1 w-8 rounded-full transition-colors duration-200 ease-standard', i <= step ? 'bg-accent' : 'bg-subtle')} />
            ))}
          </div>
          <span className="text-caption text-tertiary tabular">{step} of 4</span>
        </div>
        <div className="flex justify-end">
          {step === 2 || step === 3 ? <Button variant="ghost" size="sm" onClick={skipTo4}>{step === 3 ? 'Skip — I’ll find out' : 'Skip'}</Button> : null}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[560px] px-6 pb-24 pt-20">
        <form key={step} onSubmit={onContinue} className="animate-rise">
          {step === 1 ? (
            <>
              <h1 className="text-display text-primary">Practise PM interviews. Get scored honestly.</h1>
              <p className="mt-4 text-reading text-secondary">
                Every mock ends with a 1–5 score on five dimensions and three fixes that quote what you said.
                Most first mocks land at 2 or 3. That's the point.
              </p>
              <div className="mt-10"><SampleFixCard /></div>
              <div className="mt-10">
                <Label htmlFor="ob-name" hint="Optional">What should the interviewer call you?</Label>
                <Input id="ob-name" autoFocus autoComplete="given-name" placeholder="First name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h1 className="text-title-1 text-primary">When is your next PM interview?</h1>
              <p className="mt-2 text-body text-secondary">We pace reminders to it. You can change it later.</p>
              <div className="mt-8 flex flex-wrap gap-2">
                <Chip selected={dateChoice === 'soon'} onClick={() => setDateChoice('soon')}>Within 3 days</Chip>
                <Chip selected={dateChoice === 'date'} onClick={() => setDateChoice('date')}>Pick a date</Chip>
                <Chip selected={dateChoice === 'none'} onClick={() => setDateChoice('none')}>No date yet</Chip>
              </div>
              {dateChoice === 'date' ? (
                <div className="mt-6 max-w-[280px] animate-rise">
                  <Label htmlFor="ob-date">Interview date</Label>
                  <Input id="ob-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} autoFocus />
                  {datePast ? <p className="mt-1.5 text-footnote text-danger">That date has passed. Pick a new one or choose No date yet.</p> : null}
                </div>
              ) : null}
              {interviewDate && !datePast ? (
                <p className="mt-4 text-callout text-secondary">
                  {dayDate(parseIsoDay(interviewDate)!)} · in {daysBetween(now, parseIsoDay(interviewDate)!)} days
                </p>
              ) : null}
            </>
          ) : null}

          {step === 3 ? (
            <>
              <h1 className="text-title-1 text-primary">How confident are you in each type?</h1>
              <p className="mt-2 text-body text-secondary">1 is not at all, 5 is ready for the real thing. Leave any you're unsure of.</p>
              <div className="mt-8 flex flex-col">
                {TOPICS.map((t, i) => (
                  <div key={t}>
                    {i > 0 ? <Divider /> : null}
                    <div className="flex items-center gap-6 py-3.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-headline text-primary">{TOPIC_LABEL[t]}</div>
                        <div className="mt-0.5 text-footnote text-secondary">{TOPIC_TESTS[t]}</div>
                      </div>
                      <RatingSegments label={TOPIC_LABEL[t]} value={ratings[t]} onChange={(v) => setRatings((r) => ({ ...r, [t]: v }))} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-footnote text-tertiary">This is your starting guess. Your mocks will show the real picture.</p>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <h1 className="text-title-1 text-primary">How do you want to answer?</h1>
              <p className="mt-2 text-body text-secondary">You can switch between typing and speaking during any mock.</p>
              <div role="radiogroup" aria-label="Answer mode" className="mt-8 grid grid-cols-2 gap-3">
                {([
                  { v: 'text' as const, icon: Keyboard, title: 'Text', body: 'Quiet places, quick reps' },
                  { v: 'voice' as const, icon: Mic, title: 'Voice', body: canVoice ? 'Closest to the real thing' : 'Voice needs Chrome on desktop.' },
                ]).map((o) => {
                  const on = mode === o.v
                  const disabled = o.v === 'voice' && !canVoice
                  return (
                    <button
                      key={o.v}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={disabled}
                      onClick={() => setMode(o.v)}
                      className={cx(
                        'flex h-[132px] flex-col justify-between rounded-lg p-4 text-left transition-colors duration-150',
                        on ? 'bg-selected shadow-[inset_0_0_0_1.5px_var(--accent)]' : 'bg-surface shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-hover',
                        disabled && 'cursor-not-allowed opacity-50 hover:bg-surface',
                      )}
                    >
                      <o.icon size={20} strokeWidth={1.75} className={on ? 'text-accent' : 'text-secondary'} />
                      <span>
                        <span className="block text-headline text-primary">{o.title}</span>
                        <span className="mt-0.5 block text-footnote text-secondary">{o.body}</span>
                      </span>
                    </button>
                  )
                })}
              </div>

              {mode === 'voice' ? (
                <div className="mt-5 animate-rise">
                  <MicCheckSlot onStatus={onMic} />
                </div>
              ) : null}
              {mic && mic !== 'ok' && mode === 'text' ? (
                <Banner tone="neutral" className="mt-5">
                  {mic === 'denied'
                    ? "Microphone is blocked, so we'll start with typing. You can turn voice on later from the mock screen."
                    : mic === 'no_device' ? "No microphone found, so we'll start with typing." : "Voice isn't available in this browser, so we'll start with typing."}
                </Banner>
              ) : null}

              <div className="mt-10 rounded-lg bg-subtle px-4 py-3.5">
                <div className="text-callout text-primary">
                  <span className="text-secondary">Your first mock: </span>
                  <span className="font-medium">{TOPIC_LABEL[topic]}</span>
                  <span className="text-secondary"> · Quick, about 10 minutes · {mode === 'voice' ? 'Voice' : 'Text'}</span>
                </div>
                {!pickTopic ? (
                  <button type="button" onClick={() => setPickTopic(true)} className="mt-1 text-label text-accent hover:underline">Pick a different topic</button>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2 animate-rise">
                    {TOPICS.map((t) => (
                      <Chip key={t} selected={topic === t} onClick={() => setTopicOverride(t)}>{TOPIC_LABEL[t]}</Chip>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}

          {error ? <Banner tone="danger" className="mt-6" title="Couldn't start the mock">{error}</Banner> : null}

          <div className="mt-10 flex items-center justify-between gap-3">
            {step > 1 ? (
              <Button type="button" variant="ghost" icon={ArrowLeft} onClick={() => go((step - 1) as Step)} disabled={busy}>Back</Button>
            ) : <span className="text-footnote text-tertiary">Everything stays in this browser. No account.</span>}
            <Button type="submit" variant="primary" size="lg" loading={busy} disabled={step === 2 && datePast}>
              {step === 4 ? (busy ? 'Starting…' : 'Start my first mock') : 'Continue'}
            </Button>
          </div>
        </form>
      </main>
    </div>
  )
}
