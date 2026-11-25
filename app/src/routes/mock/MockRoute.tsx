/* /mock/:mockId — the interview room. Full screen, no sidebar. Refresh resumes (state is in IndexedDB). */
import { useRef } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings } from '@/services/db/db'
import { Button, EmptyState, Skeleton } from '@/ui'
import { MockRoom } from '@/features/mock/MockRoom'

function RoomSkeleton() {
  return (
    <div className="flex h-screen flex-col bg-surface" aria-busy>
      <div className="flex h-14 items-center gap-4 border-b border-border px-4">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-4 w-72" />
        <div className="flex-1" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-32" />
      </div>
      <div className="mx-auto w-full max-w-[640px] px-6 pt-[14vh]">
        <Skeleton className="mb-5 h-3.5 w-56" />
        <Skeleton className="mb-3 h-6 w-full" />
        <Skeleton className="mb-3 h-6 w-11/12" />
        <Skeleton className="h-6 w-2/3" />
      </div>
    </div>
  )
}

function Lost({ title, body }: { title: string; body: string }) {
  const navigate = useNavigate()
  return (
    <div className="flex h-screen items-start justify-center bg-surface pt-[18vh]">
      <EmptyState
        title={title}
        body={body}
        action={<Button variant="primary" onClick={() => navigate('/', { replace: true })}>Back to Home</Button>}
      />
    </div>
  )
}

export default function MockRoute() {
  const { mockId = '' } = useParams()
  const session = useLiveQuery(async () => (await db.mockSessions.get(mockId)) ?? null, [mockId])
  const settings = useLiveQuery(() => getSettings(), [])
  // Decide "already finished" once, on arrival — a mock that finishes while open handles its own exit.
  const arrivedStatus = useRef<string | null>(null)

  if (session === undefined || settings === undefined) return <RoomSkeleton />
  if (session === null) return <Lost title="This mock isn't on this device." body="Mocks are saved in the browser where you took them." />

  if (arrivedStatus.current === null) arrivedStatus.current = session.machine.state === 'done' && session.status === 'in_progress' ? 'completed' : session.status
  const s = arrivedStatus.current
  if (s !== 'in_progress') {
    if (session.feedbackId) return <Navigate to={`/feedback/${session.feedbackId}`} replace />
    if (s === 'completed' || s === 'ended_early') return <Navigate to={`/mock/${session.id}/scoring`} replace />
    return <Lost title="This mock was closed." body="It was discarded or left for more than 24 hours, so it can't be resumed. Start a fresh one from Practice." />
  }

  return <MockRoom key={session.id} session={session} settings={settings} />
}
