import { createBrowserRouter } from 'react-router'

import { ActivityPage } from '../features/activity/ActivityPage'
import { AssistantPage } from '../features/assistant/AssistantPage'
import { PlanningPage } from '../features/planning/PlanningPage'
import { ProfilePage } from '../features/profile/ProfilePage'
import { HomePage } from '../pages/LandingPage'
import { AppShell } from './AppShell'

export const appRouter = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/activity', element: <ActivityPage /> },
      { path: '/assistant', element: <AssistantPage /> },
      { path: '/planning', element: <PlanningPage /> },
      { path: '/profile', element: <ProfilePage /> },
    ],
  },
])