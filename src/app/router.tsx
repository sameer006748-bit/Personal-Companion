import { createBrowserRouter } from 'react-router'

import { ActivityPage } from '../features/activity/ActivityPage'
import { AssistantPage } from '../features/assistant/AssistantPage'
import { PlanningPage } from '../features/planning/PlanningPage'
import { ProfilePage } from '../features/profile/ProfilePage'
import { AuthPage } from '../features/auth/AuthPage'
import { HomePage } from '../pages/LandingPage'
import { OnboardingRoute, ProtectedAppShell } from './OnboardingRoutes'

export const appRouter = createBrowserRouter([
  { path: '/auth', element: <AuthPage /> },
  { path: '/onboarding', element: <OnboardingRoute /> },
  {
    element: <ProtectedAppShell />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/activity', element: <ActivityPage /> },
      { path: '/assistant', element: <AssistantPage /> },
      { path: '/planning', element: <PlanningPage /> },
      { path: '/profile', element: <ProfilePage /> },
    ],
  },
])
