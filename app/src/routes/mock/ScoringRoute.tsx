/* /mock/:mockId/scoring — staged progress while the report is written, then straight to the report. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertCircle } from 'lucide-react'
import type { MockSession } from '@/domain/types'
import { TOPIC_LABEL } from '@/domain/types'
import { gradeMock, type GradeStage } from '@/engine/api'
import { db, updateSettings } from '@/services/db/db'
import { Button, EmptyState, Skeleton } from '@/ui'
import { StagedProgress } from '@/features/mock/StagedProgress'
import { runGrade, unsubscribeGrade } from '@/features/mock/gradeRunner'
import { questionTitle } from '@/features/mock/lib'

const LABELS = ['Reading your answers', 'Scoring five dimensions', 'Writing your three fixes']
const STAGE_INDEX: Record<GradeStage, number> = { reading: 0, scoring: 1, writing_fixes: 2, done: 3 }
const STEP_MS = 850 // calm floor per stage when the grader is faster than the eye

/* CONTRACT-REQUEST(ENGINE): gradeMock(mockId, onStage, { forceOffline: true }) for "Use offline coach".
 * Local fallback: switch the AI mode to scripted for this one call, then restore it. */
async function gradeOffline(mockId: string, onStage?: (s: GradeStage) => void) {
  const prev = await db.settings.get('settings')
  const prevMode = prev?.ai?.mode
  if (prevMode && prevMode !== 'scripted') await updateSettings((s) => ({ ...s, ai: { ...s.ai, mode: 'scripted' } }))
  try {
    return await gradeMock(mockId, onStage)
  } finally {
    if (prevMode && prevMode !== 'scripted') await updateSettings((s) => ({ ...s, ai: { ...s.ai, mode: prevMode } }))
  }
}

function Scoring({ session }: { session: MockSession }) {
  const navigate = useNavigate()
  const [engineIdx, setEngineIdx] = useState(0)
  const [timedIdx, setTimedIdx] = useState(0)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slow, setSlow] = useState(false)
  const [attempt, setAttempt] = useState<{ n: number; offline: boolean }>({ n: 0, offline: false })
  const t0 = useRef(performance.now())

  // Timed floor so the three stages are readable (≈2.5 s total) even with a sub-second grader.
  useEffect(() => {
    if (error) return
    t0.current = performance.now()
    setTimedIdx(0)
    const a = setTimeout(() => setTimedIdx(1), STEP_MS)
    const b = setTimeout(() => setTimedIdx(2), STEP_MS * 2)
    const c = setTimeout(() => setSlow(true), 45_000)
    return () => { clearTimeout(a); clearTimeout(b); clearTimeout(c) }
  }, [attempt, error])

  const onStage = useCallback((s: GradeStage) => setEngineIdx((i) => Math.max(i, STAGE_INDEX[s])), [])

  useEffect(() => {
    let alive = true
    setError(null)
    runGrade(session.id, onStage, { fresh: attempt.n > 0, grade: attempt.offline ? gradeOffline : undefined })
      .then(async (fb) => {
        // Let the last stage be seen before leaving.
        const minTotal = STEP_MS * 2 + 600
        const wait = Math.max(0, minTotal - (performance.now() - t0.current))
        await new Promise((r) => setTimeout(r, wait))
        if (!alive) return
        setDone(true)
        await new Promise((r) => setTimeout(r, 450))
        if (alive) navigate(`/feedback/${fb.id}`, { replace: true })
      })
      .catch((e) => {
        console.error('[scoring] gradeMock failed', e)
        if (alive) setError(e instanceof Error ? e.message : String(e))
      })
    return () => { alive = false; unsubscribeGrade(session.id, onStage) }
  }, [attempt, navigate, onStage, session.id])

  const active = Math.min(2, Math.max(engineIdx, timedIdx))
  const caption = `${TOPIC_LABEL[session.topic]} · ${questionTitle(session.questionSnapshot.prompt, 64)}`
  const practiceOnly = session.status === 'ended_early'

  if (error) {
    return (
      <div className="w-full max-w-[440px] animate-rise">
        <div className="text-footnote text-secondary">{caption}</div>
        <div className="mt-6 flex items-start gap-3">
          <AlertCircle size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-danger" />
          <div>
            <h1 className="text-title-3 text-primary">We couldn't score this mock.</h1>
            <p className="mt-1 text-body text-secondary">Your transcript is saved. Try again, or let the offline coach score it now.</p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2 pl-8">
          <Button variant="primary" onClick={() => setAttempt((a) => ({ n: a.n + 1, offline: false }))}>Try again</Button>
          <Button variant="secondary" onClick={() => setAttempt((a) => ({ n: a.n + 1, offline: true }))}>Use offline coach</Button>
          <Button variant="ghost" onClick={() => navigate('/')}>Back to Home</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-[440px] animate-rise">
      <div className="text-footnote text-secondary">{caption}</div>
      <h1 className="mt-1 text-title-2 text-primary">{practiceOnly ? 'Scoring your practice mock' : 'Scoring your mock'}</h1>
      <StagedProgress className="mt-8" labels={LABELS} active={done ? 3 : active} allDone={done} />
      <div className="mt-10 border-t border-border pt-4 text-footnote text-tertiary">
        {slow ? (
          <p className="text-secondary">Taking longer than usual. Your mock is saved.</p>
        ) : (
          <p>Usually under a minute. The same bar is used for every mock.</p>
        )}
        <p className="mt-1">
          You can leave. It will be waiting on <Link to="/" className="text-accent underline-offset-2 hover:underline">Home</Link>.
        </p>
      </div>
    </div>
  )
}

export default function ScoringRoute() {
  const { mockId = '' } = useParams()
  const session = useLiveQuery(async () => (await db.mockSessions.get(mockId)) ?? null, [mockId])
  const arrival = useRef<MockSession | null>(null)
  const navigate = useNavigate()

  let body
  if (session === undefined) {
    body = (
      <div className="w-full max-w-[440px]">
        <Skeleton className="h-3.5 w-48" />
        <Skeleton className="mt-3 h-7 w-56" />
        <div className="mt-8 flex flex-col gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-5 w-64" />)}</div>
      </div>
    )
  } else if (session === null) {
    body = <EmptyState title="This mock isn't on this device." body="Mocks are saved in the browser where you took them." action={<Button variant="primary" onClick={() => navigate('/')}>Back to Home</Button>} />
  } else {
    if (!arrival.current) arrival.current = session
    const a = arrival.current
    if (a.feedbackId) return <Navigate to={`/feedback/${a.feedbackId}`} replace />
    if (a.status === 'in_progress' && a.machine.state !== 'done') return <Navigate to={`/mock/${a.id}`} replace />
    if (a.status === 'abandoned') {
      body = <EmptyState title="This mock was discarded." body="There's nothing to score. Start a fresh one from Practice." action={<Button variant="primary" onClick={() => navigate('/practice')}>Go to Practice</Button>} />
    } else {
      body = <Scoring session={session} />
    }
  }

  return <div className="flex min-h-screen items-start justify-center bg-surface px-6 pt-[22vh]">{body}</div>
}
