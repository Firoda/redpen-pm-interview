import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './styles/index.css'
import { router } from './app/router'
import { boot } from './engine/api'

function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    boot().then(() => setReady(true)).catch((e) => { console.error(e); setError(String(e?.message ?? e)); setReady(true) })
  }, [])
  if (!ready) return <div className="h-screen bg-canvas" />
  return (
    <>
      {error ? <div className="fixed left-4 top-4 z-[100] rounded-md bg-danger-subtle px-3 py-2 text-footnote text-danger">Boot: {error}</div> : null}
      <RouterProvider router={router} />
    </>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
