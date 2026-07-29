import { Outlet } from 'react-router'

import { FloatingNavigation } from './FloatingNavigation'

export function AppShell() {
  return (
    <div className="app-shell">
      <div aria-hidden="true" className="ambient-field" />
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <main id="main-content" className="app-main">
        <Outlet />
      </main>
      <FloatingNavigation />
    </div>
  )
}
