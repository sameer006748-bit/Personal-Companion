import { format } from 'date-fns'
import {
  ArrowUpRight,
  Eye,
  EyeOff,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  TrendingUp,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { formatCurrency } from '../lib/formatCurrency'
import { useAppStore } from '../store/appStore'

const ACCOUNTS = [
  { label: 'Cash', amount: 42500, share: 17.22 },
  { label: 'Meezan Bank', amount: 186300, share: 75.49 },
  { label: 'JazzCash', amount: 18000, share: 7.29 },
] as const

interface PrivateAmountProps {
  amount: number
  className?: string
}

function PrivateAmount({ amount, className = '' }: PrivateAmountProps) {
  const privacyMode = useAppStore((state) => state.privacyMode)
  const formattedAmount = formatCurrency(amount)

  return (
    <span
      className={['private-amount', className].join(' ')}
      data-private={privacyMode}
      aria-label={privacyMode ? 'Amount hidden' : formattedAmount}
    >
      {privacyMode
        ? 'PKR \u2022\u2022\u2022\u2022\u2022\u2022'
        : formattedAmount}
    </span>
  )
}

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

export function HomePage() {
  const privacyMode = useAppStore((state) => state.privacyMode)
  const theme = useAppStore((state) => state.theme)
  const togglePrivacyMode = useAppStore((state) => state.togglePrivacyMode)
  const toggleTheme = useAppStore((state) => state.toggleTheme)
  const dateLabel = format(new Date(), 'EEEE, d MMMM')

  return (
    <div className="home-screen">
      <header className="home-header">
        <div className="home-greeting">
          <p>{dateLabel}</p>
          <h1>Good afternoon, Sameer</h1>
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
            aria-label="Open Sameer's profile"
          >
            SK
          </Link>
        </div>
      </header>

      <section
        aria-labelledby="available-balance-title"
        className="balance-hero glass-hero"
      >
        <div aria-hidden="true" className="hero-reflection" />
        <div className="balance-heading">
          <div>
            <p id="available-balance-title" className="eyebrow">
              Available Balance
            </p>
            <PrivateAmount amount={246800} className="balance-total" />
          </div>
          <span className="balance-status">
            <ShieldCheck aria-hidden="true" />
            Comfortable
          </span>
        </div>

        <div className="account-distribution" aria-label="Account distribution">
          <div className="distribution-track" aria-hidden="true">
            {ACCOUNTS.map((account) => (
              <span
                key={account.label}
                style={{ flexBasis: `${account.share}%` }}
              />
            ))}
          </div>
          <dl className="account-list">
            {ACCOUNTS.map((account) => (
              <div key={account.label}>
                <dt>{account.label}</dt>
                <dd>
                  <PrivateAmount amount={account.amount} />
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="financial-position">
          <div>
            <p>Safe to Spend</p>
            <PrivateAmount amount={211200} />
          </div>
          <p>Upcoming commitments remain fully covered.</p>
        </div>
      </section>

      <section className="monthly-flow glass-surface" aria-labelledby="flow-title">
        <div className="flow-heading">
          <div>
            <p className="eyebrow">This month</p>
            <h2 id="flow-title">Monthly Flow</h2>
          </div>
          <TrendingUp aria-hidden="true" />
        </div>
        <dl className="flow-values">
          <div>
            <dt>Money In</dt>
            <dd>
              <PrivateAmount amount={165000} />
            </dd>
          </div>
          <div>
            <dt>Money Out</dt>
            <dd>
              <PrivateAmount amount={80300} />
            </dd>
          </div>
          <div>
            <dt>Net Position</dt>
            <dd>
              <PrivateAmount amount={84700} />
            </dd>
          </div>
        </dl>
        <div className="insight-line">
          <Sparkles aria-hidden="true" />
          <p>
            Income is 32% higher than last month, while essential commitments
            remain covered.
          </p>
        </div>
      </section>

      <Link to="/assistant" className="assistant-entry glass-elevated">
        <span className="assistant-icon">
          <Sparkles aria-hidden="true" />
        </span>
        <span>
          <small>Personal Assistant</small>
          Tell me what happened with your money
        </span>
        <ArrowUpRight aria-hidden="true" />
      </Link>
    </div>
  )
}
