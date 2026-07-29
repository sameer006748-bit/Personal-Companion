import { ArrowLeft, Moon, Sun } from 'lucide-react'
import { Link } from 'react-router'

import { useAppStore } from '../store/appStore'

export interface RouteShellProps {
  title: string
}

export function RouteShell({ title }: RouteShellProps) {
  const theme = useAppStore((state) => state.theme)
  const toggleTheme = useAppStore((state) => state.toggleTheme)

  return (
    <section className="route-shell">
      <div className="route-shell-surface glass-hero">
        <div>
          <p className="eyebrow">Personal Companion</p>
          <h1>{title}</h1>
          <p>
            This destination is intentionally minimal while the Home experience
            and navigation complete visual approval.
          </p>
        </div>
        <div className="route-shell-actions">
          <Link className="glass-control route-control" to="/">
            <ArrowLeft aria-hidden="true" />
            Home
          </Link>
          <button
            type="button"
            className="glass-control route-control"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? (
              <Sun aria-hidden="true" />
            ) : (
              <Moon aria-hidden="true" />
            )}
            Theme
          </button>
        </div>
      </div>
    </section>
  )
}
