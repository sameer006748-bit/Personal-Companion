import { format } from 'date-fns'
import { Eye, EyeOff, Moon, Plus, Sun } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'

import {
  AvailableBalanceHero,
  FinancialInsight,
  HomeDensityControl,
  MonthlyFlow,
  PlanningOverview,
  QuickActions,
  RecentActivity,
  SafeToSpend,
} from '../features/home/HomeSections'
import { TransactionDialog } from '../features/finance/TransactionDialog'
import { getHomeInsight, getHomeSummary } from '../lib/financeSelectors'
import {
  readDismissedInsightKey,
  writeDismissedInsightKey,
} from '../lib/homeInsightDismissal'
import { getLocalPersonalFinanceData } from '../mocks/finance'
import type { TransactionType } from '../models/finance'
import { useAppStore } from '../store/appStore'

const SIMPLE_ACTIVITY_LIMIT = 2
const DETAILED_ACTIVITY_LIMIT = 5

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
  const [transactionDraft, setTransactionDraft] = useState<TransactionType | null>(
    null,
  )
  const settings = useAppStore((state) => state.settings)
  const finance = useAppStore((state) => state.finance)
  const planning = useAppStore((state) => state.planning)
  const privacyMode = useAppStore((state) => state.privacyMode)
  const theme = useAppStore((state) => state.theme)
  const togglePrivacyMode = useAppStore((state) => state.togglePrivacyMode)
  const toggleTheme = useAppStore((state) => state.toggleTheme)
  // The canonical Profile setting drives Home density. Home never keeps its own
  // copy, so the compact control below and the Profile row stay in lockstep.
  const positionStyle = settings.finance.financialPositionStyle
  const setFinancialPositionStyle = useAppStore(
    (state) => state.setFinancialPositionStyle,
  )
  const isDetailed = positionStyle === 'detailed'
  const dateLabel = format(new Date(), 'EEEE, d MMMM')
  const data = useMemo(() => getLocalPersonalFinanceData(settings, finance, planning), [settings, finance, planning])
  const homeSummary = useMemo(() => getHomeSummary(data), [data])
  const insight = useMemo(
    () => (isDetailed ? getHomeInsight(data) : undefined),
    [data, isDetailed],
  )
  const [dismissedInsightKey, setDismissedInsightKey] = useState(
    readDismissedInsightKey,
  )
  const visibleInsight =
    insight && insight.key !== dismissedInsightKey ? insight : undefined

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
          <button
            type="button"
            className="glass-control header-control is-primary"
            aria-label="Add transaction"
            onClick={() => setTransactionDraft('expense')}
          >
            <Plus aria-hidden="true" />
          </button>
          {/* Privacy and theme are secondary utilities, so they share one
              recessed cluster instead of competing with Add. */}
          <div className="header-control-cluster">
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
          </div>
          <Link
            to="/profile"
            className="glass-control profile-control"
            aria-label={`Open ${data.profile.name}'s profile`}
          >
            {data.profile.initials}
          </Link>
        </div>
      </header>

      <HomeDensityControl
        value={positionStyle}
        onChange={setFinancialPositionStyle}
      />

      <div className="home-sections">
        <AvailableBalanceHero data={data} summary={homeSummary} />
        <QuickActions
          onAddExpense={() => setTransactionDraft('expense')}
          onAddIncome={() => setTransactionDraft('income')}
        />
        <SafeToSpend summary={homeSummary} />
        {isDetailed ? <MonthlyFlow summary={homeSummary} /> : null}
        {isDetailed ? <PlanningOverview data={data} /> : null}
        <RecentActivity
          data={data}
          limit={isDetailed ? DETAILED_ACTIVITY_LIMIT : SIMPLE_ACTIVITY_LIMIT}
        />
        {visibleInsight ? (
          <FinancialInsight
            insight={visibleInsight}
            onDismiss={() => {
              writeDismissedInsightKey(visibleInsight.key)
              setDismissedInsightKey(visibleInsight.key)
            }}
          />
        ) : null}
      </div>

      {transactionDraft ? (
        <TransactionDialog
          initialType={transactionDraft}
          onClose={() => setTransactionDraft(null)}
        />
      ) : null}
    </div>
  )
}
