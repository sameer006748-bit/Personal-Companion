import { format } from 'date-fns'
import { Eye, EyeOff, Moon, Sun } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router'

import {
  AssistantEntry,
  AvailableBalanceHero,
  FinancialInsight,
  MonthlyFlow,
  NextCommitment,
  OutstandingPosition,
  RecentActivity,
} from '../features/home/HomeSections'
import { getHomeSummary } from '../lib/financeSelectors'
import { getActivePersonalFinanceData } from '../mocks/finance'
import { useAppStore } from '../store/appStore'

interface HeaderControlProps {
  label: string
  onClick: () => void
  pressed?: boolean
  children: ReactNode
}

function HeaderControl({
  label,
  onClick,
  pressed,
  children,
}: HeaderControlProps) {
  return (
    <button
      type="button"
      className="glass-control header-control"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function getGreeting(): string {
  const hour = new Date().getHours()

  if (hour < 12) {
    return 'Good morning'
  }

  if (hour < 18) {
    return 'Good afternoon'
  }

  return 'Good evening'
}

export function HomePage() {
  const settings = useAppStore((state) => state.settings)
  const privacyMode = useAppStore((state) => state.privacyMode)
  const theme = useAppStore((state) => state.theme)
  const togglePrivacyMode = useAppStore((state) => state.togglePrivacyMode)
  const toggleTheme = useAppStore((state) => state.toggleTheme)
  const dateLabel = format(new Date(), 'EEEE, d MMMM')
  const data = useMemo(() => getActivePersonalFinanceData(settings), [settings])
  const homeSummary = useMemo(() => getHomeSummary(data), [data])

  return (
    <div className="home-screen">
      <header className="home-header">
        <div className="home-greeting">
          <p>{dateLabel}</p>
          <h1>
            {getGreeting()}, {data.profile.name}
          </h1>
        </div>
        <div className="home-header-actions">
          <HeaderControl
            label={privacyMode ? 'Show amounts' : 'Hide amounts'}
            pressed={privacyMode}
            onClick={togglePrivacyMode}
          >
            {privacyMode ? (
              <EyeOff aria-hidden="true" />
            ) : (
              <Eye aria-hidden="true" />
            )}
          </HeaderControl>
          <HeaderControl
            label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? (
              <Sun aria-hidden="true" />
            ) : (
              <Moon aria-hidden="true" />
            )}
          </HeaderControl>
          <Link
            to="/profile"
            className="glass-control profile-control"
            aria-label={`Open ${data.profile.name}'s profile`}
          >
            {data.profile.initials}
          </Link>
        </div>
      </header>

      <AvailableBalanceHero data={data} summary={homeSummary} />
      <MonthlyFlow summary={homeSummary} />
      <AssistantEntry />

      <div className="home-secondary-content">
        <OutstandingPosition summary={homeSummary} />
        <NextCommitment data={data} />
        <FinancialInsight data={data} />
        <RecentActivity data={data} />
      </div>
    </div>
  )
}
