import { Outlet } from 'react-router-dom'
import { Toaster } from '@/ui'
import DemoLayer from '@/features/demo/DemoLayer'
import { useTheme } from './useTheme'

/** Wraps every route: theme, toasts, demo layer (⌥D). */
export default function RootLayout() {
  useTheme()
  return (
    <>
      <Outlet />
      <Toaster />
      <DemoLayer />
    </>
  )
}
