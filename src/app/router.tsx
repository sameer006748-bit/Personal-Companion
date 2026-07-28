import { createBrowserRouter } from 'react-router'

import { LandingPage } from '../pages/LandingPage'

export const appRouter = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
])
