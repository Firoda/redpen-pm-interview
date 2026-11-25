/* The interview room (/mock/:id). Full screen, no shell, nothing evaluative. MASTER_PLAN §3.2 S4, §4.5–4.6.
 * State lives in IndexedDB (refresh resumes); this component only holds view state: the draft, the optimistic
 * candidate turn, the busy flag and the voice review box. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { WifiOff } from 'lucide-react'
import type { InputMode, MockSession, Settings, Turn } from '@/domain/types'
import { TOPIC_LABEL } from '@/domain/types'
import { discardMock, endMockEarly, recordModeSwitch, submitAnswer } from '@/engine/api'
import { Clock } from '@/services/clock'
import { INTERVIEWER_NAME } from '@/config/brand'
import { Button, cx, Kbd, toast } from '@/ui'
import { activeElapsed, currentMode, deriveProgress, isTypingTarget, sortedTurns, speechSupported, store, TIMEBOX_MIN } from './lib'
import { MockTopBar } from './MockTopBar'
import { ReadyScreen } from './ReadyScreen'
import { Composer, type ComposerHandle } from './Composer'
import { buildTimeline, ModeSwitchLine, TurnBlock } from './Transcript'
import { ThinkingDots } from './ThinkingDots'
import { EndDialog, type EndChoice } from './EndDialog'
import { FocusChip } from './FocusChip'
import { revealDuration } from './RevealText'
import { VoiceStageSlot } from './VoiceStageSlot'
import { getDemoAnswer, useGhostTyper } from './demoAnswers'
import { useOnline } from './useOnline'

type Pending = { text: string; mode: InputMode; base: number; at: number }
type Review = { original: string; value: string }

const draftKey = (id: string) => `rp.draft.${id}`

export function MockRoom({ session, settings }: { session: MockSession; settings: Settings }) {
  const navigate = useNavigate()
  const online = useOnline()
  const progress = useMemo(() => deriveProgress(session), [session])
  const timeline = useMemo(() => buildTimeline(session), [session])

  /* ---------- what was on screen when we arrived ---------- */
  const arrival = useRef<{ ids: Set<string>; at: number; gap: number; candidates: number } | null>(null)
  if (!arrival.current) {
    const now = Clock.now()
    arrival.current = {
      ids: new Set(session.turns.map((t) => t.id)),
      at: now,
      gap: now - session.lastActivityAt,
      candidates: session.turns.filter((t) => t.role === 'candidate').length,
    }
  }
  const resumed = arrival.current.candidates > 0

  /* ---------- view state ---------- */
  const [started, setStarted] = useState(resumed)
  const [noReveal, setNoReveal] = useState<Set<string>>(() => arrival.current!.ids)
  const [mode, setMode] = useState<InputMode>(() => {
    const m = currentMode(session)
    return m === 'voice' && !speechSupported() ? 'text' : m
  })
  const [draft, setDraftState] = useState<string>(() => store.get(draftKey(session.id)) ?? '')
  const [review, setReview] = useState<Review | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [busySince, setBusySince] = useState<number | null>(null)
  const [closing, setClosing] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const [endBusy, setEndBusy] = useState<EndChoice | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1200)
  const [resumeNote, setResumeNote] = useState<string | null>(() =>
    resumed && session.status === 'in_progress' ? `You're back in your ${TOPIC_LABEL[session.topic]} mock. ${deriveProgress(session).label}.` : null,
  )

  const composerRef = useRef<ComposerHandle>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const answerStart = useRef<number | null>(null)
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finishing = useRef(false)

  const busy = busySince != null

  /* ---------- draft persistence (debounced) ---------- */
  const setDraft = useCallback((v: string | ((p: string) => string)) => setDraftState(v), [])
  useEffect(() => {
    const h = setTimeout(() => { if (draft) store.set(draftKey(session.id), draft); else store.del(draftKey(session.id)) }, 300)
    return () => clearTimeout(h)
  }, [draft, session.id])

  /* ---------- notices fade on their own ---------- */
  useEffect(() => { if (!resumeNote) return; const h = setTimeout(() => setResumeNote(null), 6000); return () => clearTimeout(h) }, [resumeNote])
  useEffect(() => { if (!notice) return; const h = setTimeout(() => setNotice(null), 6000); return () => clearTimeout(h) }, [notice])

  /* ---------- optimistic turn clears once the real one is in the DB ---------- */
  useEffect(() => {
    if (pending && progress.candidateTurns > pending.base) setPending(null)
  }, [pending, progress.candidateTurns])

  /* ---------- finishing: close line reveals, then scoring ---------- */
  const lastMeera = useMemo(() => [...sortedTurns(session)].reverse().find((t) => t.role === 'interviewer') ?? null, [session])
  const finish = useCallback(() => {
    if (finishing.current) return
    finishing.current = true
    setClosing(true)
    store.del(draftKey(session.id))
    const read = lastMeera ? revealDuration(lastMeera.text) : 0
    const wait = read + (mode === 'voice' ? 2600 : 1500)
    finishTimer.current = setTimeout(() => navigate(`/mock/${session.id}/scoring`, { replace: true }), wait)
  }, [lastMeera, mode, navigate, session.id])
  useEffect(() => () => { if (finishTimer.current) clearTimeout(finishTimer.current) }, [])
  useEffect(() => {
    if (!finishing.current && started && (session.machine.state === 'done' || session.status === 'completed')) finish()
  }, [session.machine.state, session.status, started, finish])

  /* ---------- auto-scroll on new content ---------- */
  useEffect(() => {
    // On arrival (resume), land at the latest turn once layout has settled.
    const h = setTimeout(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight }, 80)
    return () => clearTimeout(h)
  }, [started, mode])
  const contentKey = `${session.turns.length}|${pending ? 1 : 0}|${busy ? 1 : 0}|${started ? 1 : 0}|${review ? 1 : 0}`
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: arrival.current && Clock.now() - arrival.current.at < 600 ? 'auto' : 'smooth' }))
  }, [contentKey, mode, panelOpen])

  /* ---------- sending ---------- */
  const ghostTarget = useRef<'draft' | 'review'>('draft')
  const ghost = useGhostTyper(useCallback((v: string) => {
    if (ghostTarget.current === 'review') setReview((r) => (r ? { ...r, value: v } : { original: v, value: v }))
    else setDraftState(v)
  }, []))

  const send = useCallback(async (raw: string, via: InputMode, editedAfterSpeech?: boolean) => {
    const text = raw.trim()
    if (!text || busy || closing) return
    ghost.stop()
    setSendError(null)
    const base = progress.candidateTurns
    setPending({ text, mode: via, base, at: Clock.now() })
    setBusySince(Clock.now())
    if (via === 'text') setDraftState('')
    else setReview(null)
    const startedAt = answerStart.current ?? undefined
    answerStart.current = null
    try {
      const res = await submitAnswer(session.id, text, via, { editedAfterSpeech, startedAt })
      if (res.done) finish()
    } catch (e) {
      console.error('[mock] submitAnswer failed', e)
      setPending(null)
      if (via === 'text') setDraftState(text)
      else setReview({ original: text, value: text })
      setSendError("Couldn't save that answer. It's back in the box. Try sending again.")
    } finally {
      setBusySince(null)
      requestAnimationFrame(() => composerRef.current?.focus())
    }
  }, [busy, closing, finish, ghost, progress.candidateTurns, session.id])

  /* ---------- mode switching ---------- */
  const switchMode = useCallback((next: InputMode, opts: { partial?: string; reason?: string } = {}) => {
    if (next === mode) return
    if (next === 'voice') {
      if (!speechSupported()) { setNotice('Voice needs Chrome on a computer. You can keep typing.'); return }
      if (!online) { setNotice("Voice needs internet in Chrome. You're offline, so typing stays on."); return }
    }
    ghost.stop()
    if (next === 'text') {
      const carry = [review?.value, opts.partial].filter((x): x is string => Boolean(x && x.trim())).join(' ')
      if (carry) setDraftState((d) => (d.trim() ? `${d.trimEnd()} ${carry}` : carry))
      setReview(null)
    }
    setMode(next)
    recordModeSwitch(session.id, next).catch((e) => console.warn('[mock] recordModeSwitch failed', e))
  }, [ghost, mode, online, review, session.id])

  // Offline while in voice: fall back to text.
  useEffect(() => {
    if (!online && mode === 'voice') {
      switchMode('text', { reason: 'offline' })
      setNotice('Voice needs internet in Chrome. Switched to text.')
    }
  }, [online, mode, switchMode])

  /* E-06 / E-11: fatal voice errors switch to text with the exact copy. */
  const onVoiceError = useCallback((kind: 'mic_denied' | 'no_device' | 'unsupported' | 'network', _message: string) => {
    if (kind === 'mic_denied' || kind === 'no_device') {
      toast.error("Microphone is blocked, so we've switched to typing. You can turn it back on from the lock icon in the address bar.")
    } else if (kind === 'network') {
      toast.error('Voice needs internet in Chrome. Switched to text.')
    } else {
      toast.error('Voice needs Chrome on a computer. Switched to text.')
    }
    switchMode('text', { reason: 'mic_error' })
  }, [switchMode])

  const onTranscript = useCallback((text: string, _meta?: { durationMs: number }) => {
    if (!text || !text.trim()) return
    if (settings.voice.autoSend) void send(text, 'voice', false)
    else { setReview({ original: text, value: text }); answerStart.current ??= Clock.now() }
  }, [send, settings.voice.autoSend])

  /* ---------- ending ---------- */
  const onEndChoice = useCallback(async (c: Exclude<EndChoice, 'keep'>) => {
    setEndBusy(c)
    try {
      if (c === 'leave') {
        navigate('/', { replace: true })
      } else if (c === 'discard') {
        await discardMock(session.id)
        store.del(draftKey(session.id))
        navigate('/', { replace: true })
        toast('Mock discarded.')
      } else {
        const r = await endMockEarly(session.id)
        store.del(draftKey(session.id))
        if (r.canGrade) navigate(`/mock/${session.id}/scoring`, { replace: true })
        else { navigate('/', { replace: true }); toast('Saved. You can pick it up again within 24 hours.') }
      }
    } catch (e) {
      console.error('[mock] end failed', e)
      setEndBusy(null)
      setEndOpen(false)
      setNotice("Couldn't end the mock just now. Your answers are saved.")
    }
  }, [navigate, session.id])

  /* ---------- demo ghost fill (⌥G, or Tab in an empty box) ---------- */
  const ghostFill = useCallback((): boolean => {
    if (!settings.demo.enabled || busy || closing || !started) return false
    const answer = getDemoAnswer(session.questionId, progress.slot)
    if (!answer) { setNotice('No prepared answer for this part of the question.'); return true }
    if (mode === 'voice') {
      ghostTarget.current = 'review'
      setReview({ original: answer, value: '' })
    } else {
      ghostTarget.current = 'draft'
      setDraftState('')
    }
    answerStart.current ??= Clock.now()
    ghost.start(answer)
    requestAnimationFrame(() => composerRef.current?.focus())
    return true
  }, [busy, closing, ghost, mode, progress.slot, session.questionId, settings.demo.enabled, started])

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (e.key === 'Escape' && !endOpen && !closing) {
        if (ghost.typing) { ghost.stop(); return }
        e.preventDefault()
        setEndOpen(true)
        return
      }
      if (e.altKey && e.code === 'KeyG') { if (ghostFill()) e.preventDefault(); return }
      // "/" focuses the answer box in text mode
      if (e.key === '/' && mode === 'text' && started && !isTypingTarget(e.target)) { e.preventDefault(); composerRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closing, endOpen, ghost, ghostFill, mode, started])

  /* ---------- start (ready screen) ---------- */
  const onStart = useCallback(() => {
    setNoReveal(new Set()) // reveal the intro and the question now
    setStarted(true)
    requestAnimationFrame(() => composerRef.current?.focus())
  }, [])

  /* ---------- timer ---------- */
  const elapsed = useCallback(() => {
    const a = arrival.current!
    return activeElapsed(session, Clock.now(), a.at, a.gap)
  }, [session])

  /* ---------- rendering helpers ---------- */
  const pendingTurn: Turn | null = pending
    ? {
        id: 'pending', index: Number.MAX_SAFE_INTEGER, role: 'candidate', kind: progress.slot === 0 ? 'main' : 'followup_a', text: pending.text,
        inputMode: pending.mode, words: 0, flags: [], startedAt: pending.at, submittedAt: pending.at,
      }
    : null

  const renderTimeline = (compact: boolean, dimBefore = -1) => {
    let delay = 0
    const turnItems = timeline.filter((i) => i.kind === 'turn').length
    let ti = 0
    return timeline.map((item) => {
      if (item.kind === 'switch') return <ModeSwitchLine key={item.key} mode={item.mode} at={item.at} />
      const t = item.turn
      const reveal = t.role === 'interviewer' && !noReveal.has(t.id)
      const d = reveal ? delay : 0
      if (reveal) delay += revealDuration(t.text)
      else delay = 0
      const idx = ti++
      return (
        <TurnBlock
          key={t.id}
          turn={t}
          session={session}
          reveal={reveal}
          revealDelay={d}
          compact={compact}
          dim={dimBefore >= 0 && idx < turnItems - dimBefore}
        />
      )
    })
  }

  const composerHint = closing
    ? 'Mock complete. Opening your scores…'
    : !progress.mainAnswered
      ? <>Start your answer, or ask a clarifying question. <span className="max-[900px]:hidden"><Kbd>↵</Kbd> new line</span></>
      : <>Think aloud. <span className="max-[900px]:hidden"><Kbd>↵</Kbd> new line</span></>

  const subBar = (
    <>
      {!online ? (
        <div className="flex shrink-0 items-center justify-center gap-2 border-b border-border bg-subtle px-4 py-2 text-callout text-secondary" role="status">
          <WifiOff size={15} strokeWidth={2} className="shrink-0" />
          You're offline. You can keep practising. Follow-ups and feedback come from the offline coach until you're back.
        </div>
      ) : null}
      {(session.focusText && started) || resumeNote || notice ? (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-[5] flex flex-col items-center gap-2 px-6">
          {session.focusText && started ? <FocusChip text={session.focusText} className="pointer-events-auto shadow-[0_0_0_4px_var(--bg-surface)]" /> : null}
          {resumeNote ? <div className="pointer-events-auto rounded-full bg-subtle px-3 py-1 text-label text-secondary shadow-[0_0_0_4px_var(--bg-surface)] animate-fade" role="status">{resumeNote}</div> : null}
          {notice ? <div className="pointer-events-auto rounded-full bg-nudge-bg px-3 py-1 text-label text-nudge-text shadow-[inset_0_0_0_1px_var(--nudge-border)] animate-fade" role="status">{notice}</div> : null}
        </div>
      ) : null}
    </>
  )

  const textBody = (
    <>
      <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[680px] flex-col gap-7 px-6 pb-8 pt-16" role="log" aria-live="polite" aria-label="Interview transcript">
          {renderTimeline(false)}
          {pendingTurn ? <TurnBlock turn={pendingTurn} session={session} pending /> : null}
          {busy ? <ThinkingDots since={busySince!} /> : null}
        </div>
      </div>
      <div className="shrink-0 px-6 pb-6 pt-1">
        <div className="mx-auto max-w-[720px]">
          {sendError ? <p className="mb-2 text-callout text-danger" role="alert">{sendError}</p> : null}
          <Composer
            ref={composerRef}
            value={draft}
            onChange={(v) => { setDraft(v); if (!answerStart.current && v) answerStart.current = Clock.now() }}
            onUserInput={() => ghost.typing && ghost.stop()}
            onSubmit={() => void send(draft, 'text')}
            disabled={busy || closing}
            hint={composerHint}
            onEmptyTab={settings.demo.enabled ? ghostFill : undefined}
            autoFocus
          />
        </div>
      </div>
    </>
  )

  const latestLine = lastMeera && started ? lastMeera : null
  const voiceBody = (
    <div className="flex min-h-0 flex-1">
      <section className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className={cx('flex w-full flex-1 flex-col items-center pt-8', review ? 'min-h-[300px]' : 'min-h-[520px]')}>
          <VoiceStageSlot
            interviewerLine={latestLine ? { id: latestLine.id, text: latestLine.text } : null}
            busy={busy}
            disabled={Boolean(review) || closing}
            settings={settings.voice}
            onTranscript={onTranscript}
            onSwitchToText={() => switchMode('text')}
            onError={onVoiceError}
            interviewerName={INTERVIEWER_NAME}
          />
        </div>
        <div className="mx-auto w-full max-w-[680px] shrink-0 px-6">
          {review ? (
            <div className="mb-6 w-full animate-rise">
              {sendError ? <p className="mb-2 text-callout text-danger" role="alert">{sendError}</p> : null}
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-label text-primary">Review your answer</span>
                <span className="text-footnote text-tertiary">Fix any words Chrome misheard. Edits are noted, not scored.</span>
              </div>
              <Composer
                ref={composerRef}
                value={review.value}
                onChange={(v) => setReview((r) => (r ? { ...r, value: v } : r))}
                onUserInput={() => ghost.typing && ghost.stop()}
                onSubmit={() => void send(review.value, 'voice', review.value.trim() !== review.original.trim())}
                disabled={busy || closing}
                minLines={2}
                label="Review your spoken answer"
                onEmptyTab={settings.demo.enabled ? ghostFill : undefined}
                hint={null}
                extra={<Button variant="ghost" size="sm" onClick={() => { ghost.stop(); setReview(null) }} disabled={busy}>Re-record</Button>}
                autoFocus
              />
            </div>
          ) : null}
        </div>
      </section>
      {panelOpen ? (
        <aside className="flex w-[360px] shrink-0 flex-col border-l border-border bg-surface animate-fade" aria-label="Transcript">
          <div className="flex h-11 shrink-0 items-center justify-between px-5 text-label text-secondary">
            <span>Transcript</span>
            <button className="rounded-md px-2 py-1 text-label text-secondary hover:bg-hover" onClick={() => setPanelOpen(false)}>Hide</button>
          </div>
          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
            <div className="flex flex-col gap-5" role="log" aria-live="off">
              {renderTimeline(true, 2)}
              {pendingTurn ? <TurnBlock turn={pendingTurn} session={session} compact pending /> : null}
            </div>
          </div>
        </aside>
      ) : null}
    </div>
  )

  return (
    <div className="flex h-screen flex-col bg-surface">
      <MockTopBar
        topic={session.topic}
        prompt={session.questionSnapshot.prompt}
        progress={started ? progress : null}
        elapsed={started ? elapsed : null}
        timeboxMin={TIMEBOX_MIN[session.length]}
        mode={mode}
        onModeChange={(m) => switchMode(m, { reason: 'user' })}
        onEnd={() => setEndOpen(true)}
        voiceAvailable={speechSupported()}
        modeLocked={busy || closing}
        onTogglePanel={mode === 'voice' && started ? () => setPanelOpen((o) => !o) : undefined}
        panelOpen={panelOpen}
      />
      <div className={cx('relative flex min-h-0 flex-1 flex-col')}>
        {subBar}
        {!started ? <ReadyScreen session={session} mode={mode} onStart={onStart} /> : mode === 'voice' ? voiceBody : textBody}
      </div>
      <EndDialog open={endOpen} onOpenChange={(o) => { setEndOpen(o); if (!o) setEndBusy(null) }} progress={progress} onChoose={onEndChoice} busy={endBusy} />
    </div>
  )
}
