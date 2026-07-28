import { RouterProvider } from 'react-router'

import { appRouter } from './router'

export function App() {
  return <RouterProvider router={appRouter} />
}
