import { createBrowserRouter } from 'react-router-dom'
import AppShell from './AppShell'
import RootLayout from './RootLayout'
import HomeRoute from '@/routes/home/HomeRoute'
import PracticeRoute from '@/routes/practice/PracticeRoute'
import ProgressRoute from '@/routes/progress/ProgressRoute'
import LibraryRoute from '@/routes/library/LibraryRoute'
import SettingsRoute from '@/routes/settings/SettingsRoute'
import MetricsRoute from '@/routes/metrics/MetricsRoute'
import FeedbackRoute from '@/routes/feedback/FeedbackRoute'
import WelcomeRoute from '@/routes/welcome/WelcomeRoute'
import MockRoute from '@/routes/mock/MockRoute'
import ScoringRoute from '@/routes/mock/ScoringRoute'

/** Route map (MASTER_PLAN §3.1). Full-screen routes (welcome, mock, scoring) sit outside the shell. */
export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/welcome', element: <WelcomeRoute /> },
      { path: '/mock/:mockId', element: <MockRoute /> },
      { path: '/mock/:mockId/scoring', element: <ScoringRoute /> },
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <HomeRoute /> },
          { path: '/practice', element: <PracticeRoute /> },
          { path: '/feedback/:feedbackId', element: <FeedbackRoute /> },
          { path: '/progress', element: <ProgressRoute /> },
          { path: '/library', element: <LibraryRoute /> },
          { path: '/settings', element: <SettingsRoute /> },
          { path: '/metrics', element: <MetricsRoute /> },
          { path: '*', element: <HomeRoute /> },
        ],
      },
    ],
  },
])
