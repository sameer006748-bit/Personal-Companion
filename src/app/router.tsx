import { createBrowserRouter } from 'react-router'

import { ActivityPage } from '../features/activity/ActivityPage'
import { HomePage } from '../pages/LandingPage'
import { RouteShell } from '../pages/RouteShell'
import { AppShell } from './AppShell'

export const appRouter = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/activity', element: <ActivityPage /> },
      { path: '/assistant', element: <RouteShell title="Assistant" /> },
      { path: '/planning', element: <RouteShell title="Planning" /> },
      { path: '/profile', element: <RouteShell title="Profile" /> },
    ],
  },
])
