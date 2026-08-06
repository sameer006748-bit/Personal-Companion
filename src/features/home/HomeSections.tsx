import { format, parseISO } from 'date-fns'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Briefcase,
  CalendarClock,
  CalendarRange,
  ChevronRight,
  CircleDollarSign,
  Dumbbell,
  Fuel,
  GraduationCap,
  Gift,
  House,
  Info,
  Plug,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Sparkles,
  TrendingUp,
  Utensils,
  Wifi,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router'

import {
  getAccountShare,
  getBalanceTrend,
  getNextCommitment,
  getPlanningSummary,
  getRecentTransactions,
} from '../../lib/financeSelectors'
import type {
  BalanceTrend,
  HomeInsight,
  HomeSummary,
} from '../../lib/financeSelectors'
import type {
  PersonalFinanceData,
  TransactionCategory,
} from '../../models/finance'
import type { FinancialPositionStyle } from '../../models/settings'
import { PrivateAmount } from '../../shared/ui/PrivateAmount'

interface DataSectionProps {
  data: PersonalFinanceData
  summary: HomeSummary
}

// Every expandable card routes through this so placement, typography, icon
// size and interaction stay identical. Cards must never add a second
// bottom-of-card link.
interface SectionViewAllProps {
  to: string
  label: string
}

function SectionViewAll({ to, label }: SectionViewAllProps) {
  return (
    <Link to={to} className="section-view-all" aria-label={label}>
      <span aria-hidden="true">View all</span>
      <ChevronRight aria-hidden="true" />
    </Link>
  )
}

interface HomeSectionHeadingProps {
  eyebrow: string
  title: string
  titleId: string
  viewAll?: SectionViewAllProps
}

function HomeSectionHeading({
  eyebrow,
  title,
  titleId,
  viewAll,
}: HomeSectionHeadingProps) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={titleId}>{title}</h2>
      </div>
      {viewAll ? <SectionViewAll to={viewAll.to} label={viewAll.label} /> : null}
    </div>
  )
}

const DENSITY_OPTIONS: readonly {
  value: FinancialPositionStyle
  label: string
}[] = [
  { value: 'simple', label: 'Simple' },
  { value: 'detailed', label: 'Detailed' },
]

interface HomeDensityControlProps {
  value: FinancialPositionStyle
  onChange: (value: FinancialPositionStyle) => void
}

// Reads and writes the canonical Profile "Financial position style" setting.
// Home deliberately holds no density state of its own. The group is labelled
// for assistive tech only: a visible "Detail" caption beside two self-
// describing options was pure redundancy on screen.
export function HomeDensityControl({ value, onChange }: HomeDensityControlProps) {
  return (
    <div className="home-density">
      <div
        className="home-density-group"
        role="radiogroup"
        aria-label="Home detail level"
      >
        {DENSITY_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className={value === option.value ? 'is-selected' : ''}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function getTrendDirection(trend: BalanceTrend): 'up' | 'down' | 'flat' {
  if (trend.change > 0) {
    return 'up'
  }

  if (trend.change < 0) {
    return 'down'
  }

  return 'flat'
}

function BalanceTrendChart({ trend }: { trend: BalanceTrend }) {
  if (!trend.hasHistory || trend.points.length < 2) {
    return (
      <div className="balance-trend is-empty">
        <div className="trend-flatline" aria-hidden="true" />
        <p>
          Record a few more days of activity and your balance trend will appear
          here.
        </p>
      </div>
    )
  }

  const balances = trend.points.map((point) => point.balance)
  const lowest = Math.min(...balances)
  const highest = Math.max(...balances)
  const range = highest - lowest
  const step = 100 / (trend.points.length - 1)
  const coordinates = trend.points.map((point, index) => {
    const x = index * step
    const y = range === 0 ? 50 : 94 - ((point.balance - lowest) / range) * 88

    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  const line = `M${coordinates.join(' L')}`
  const direction = getTrendDirection(trend)
  const firstDay = trend.points[0]?.date
  const lastDay = trend.points[trend.points.length - 1]?.date

  return (
    <div className={`balance-trend is-${direction}`}>
      <svg
        className="trend-chart"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Balance history over the last ${trend.windowDays} days. Net movement across the window is ${
          direction === 'up'
            ? 'an increase'
            : direction === 'down'
              ? 'a decrease'
              : 'no change'
        }. The amount shown above remains the current available balance.`}
      >
        <path className="trend-area" d={`${line} L100,100 L0,100 Z`} />
        <path
          className="trend-line"
          d={line}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* The signed figure is movement across the window, not the current
          balance, so it is always labelled. An unlabelled negative amount
          under a positive hero total reads as a negative balance. */}
      <div className="trend-meta">
        <span className="trend-range">
          {firstDay && lastDay
            ? `${format(parseISO(firstDay), 'd MMM')} – ${format(parseISO(lastDay), 'd MMM')}`
            : `Last ${trend.windowDays} days`}
        </span>
        <span className="trend-change">
          <span className="trend-change-label">Net movement</span>
          <PrivateAmount
            amount={Math.abs(trend.change)}
            sign={direction === 'up' ? '+' : direction === 'down' ? '-' : ''}
          />
        </span>
      </div>
    </div>
  )
}

export function AvailableBalanceHero({ data, summary }: DataSectionProps) {
  const trend = getBalanceTrend(data)

  return (
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
          <PrivateAmount amount={summary.totalAvailable} className="balance-total" />
        </div>
        <span className="balance-status">
          <CircleDollarSign aria-hidden="true" />
          {summary.financialPosition}
        </span>
      </div>

      <BalanceTrendChart trend={trend} />

      {data.accounts.length > 0 ? (
        <div className="account-distribution" aria-label="Account distribution">
          <div className="distribution-track" aria-hidden="true">
            {data.accounts.map((account) => (
              <span
                key={account.id}
                style={{
                  flexBasis: `${getAccountShare(account, summary.totalAvailable)}%`,
                }}
              />
            ))}
          </div>
          <dl className="account-list">
            {data.accounts.map((account) => (
              <div key={account.id}>
                <dt>{account.label}</dt>
                <dd>
                  <PrivateAmount amount={account.balance} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </section>
  )
}

interface QuickActionsProps {
  onAddExpense: () => void
  onAddIncome: () => void
}

// Visible labels stay single-word so the row survives 360px at 130% text
// scale on one line; the full action name is kept as the accessible name.
export function QuickActions({ onAddExpense, onAddIncome }: QuickActionsProps) {
  return (
    <nav className="quick-actions" aria-label="Quick actions">
      <button
        type="button"
        className="quick-action glass-surface"
        data-tone="expense"
        aria-label="Add expense"
        onClick={onAddExpense}
      >
        <span className="quick-action-icon" aria-hidden="true">
          <ArrowUpRight />
        </span>
        Expense
      </button>
      <button
        type="button"
        className="quick-action glass-surface"
        data-tone="income"
        aria-label="Add income"
        onClick={onAddIncome}
      >
        <span className="quick-action-icon" aria-hidden="true">
          <ArrowDownLeft />
        </span>
        Income
      </button>
      <Link
        to="/planning"
        className="quick-action glass-surface"
        data-tone="plan"
        aria-label="Open planning"
      >
        <span className="quick-action-icon" aria-hidden="true">
          <CalendarRange />
        </span>
        Plan
      </Link>
      <Link
        to="/assistant"
        className="quick-action glass-surface"
        data-tone="assistant"
        aria-label="Open assistant"
      >
        <span className="quick-action-icon" aria-hidden="true">
          <Sparkles />
        </span>
        Assistant
      </Link>
    </nav>
  )
}

export function SafeToSpend({ summary }: Pick<DataSectionProps, 'summary'>) {
  return (
    <section
      className="safe-to-spend glass-elevated"
      aria-labelledby="safe-to-spend-title"
    >
      <div className="safe-to-spend-copy">
        <p id="safe-to-spend-title" className="eyebrow">
          Safe to Spend
        </p>
        <PrivateAmount
          amount={summary.safeToSpend}
          className="safe-to-spend-amount"
        />
        <p className="safe-to-spend-note">
          Left after bills and upcoming commitments
        </p>
      </div>
      <span className="safe-to-spend-mark" aria-hidden="true">
        <ShieldCheck />
      </span>
    </section>
  )
}

export function MonthlyFlow({ summary }: Pick<DataSectionProps, 'summary'>) {
  const spendShare =
    summary.monthlyIncome === 0
      ? 0
      : Math.min(100, (summary.monthlyExpenses / summary.monthlyIncome) * 100)

  return (
    <section className="monthly-flow glass-surface" aria-labelledby="flow-title">
      <HomeSectionHeading
        eyebrow="This month"
        title="Monthly Flow"
        titleId="flow-title"
        viewAll={{ to: '/activity', label: 'View all activity for this month' }}
      />
      <dl className="flow-values">
        <div>
          <dt>Money In</dt>
          <dd>
            <PrivateAmount amount={summary.monthlyIncome} />
          </dd>
        </div>
        <div>
          <dt>Money Out</dt>
          <dd>
            <PrivateAmount amount={summary.monthlyExpenses} />
          </dd>
        </div>
        <div>
          <dt>Net Position</dt>
          <dd>
            <PrivateAmount amount={summary.netMonthlyPosition} />
          </dd>
        </div>
      </dl>
      <div
        className="flow-proportion"
        role="img"
        aria-label={`Money out is ${Math.round(spendShare)}% of money in`}
      >
        <span style={{ width: `${spendShare}%` }} />
      </div>
    </section>
  )
}

export function PlanningOverview({ data }: Pick<DataSectionProps, 'data'>) {
  const planning = getPlanningSummary(data)
  const nextCommitment = getNextCommitment(data)
  const hasPlanningRecords =
    planning.toReceive > 0 ||
    planning.toPay > 0 ||
    planning.upcomingCommitments > 0 ||
    planning.overdueCount > 0

  return (
    <section
      className="planning-overview glass-surface"
      aria-labelledby="planning-overview-title"
    >
      <HomeSectionHeading
        eyebrow="Planning overview"
        title="Receivables & Payables"
        titleId="planning-overview-title"
        viewAll={{ to: '/planning', label: 'View all planning items' }}
      />
      {hasPlanningRecords ? (
        <>
          <dl className="planning-figures">
            <div data-tone="income">
              <dt>To receive</dt>
              <dd>
                <PrivateAmount amount={planning.toReceive} />
              </dd>
            </div>
            <div data-tone="expense">
              <dt>To pay</dt>
              <dd>
                <PrivateAmount amount={planning.toPay} />
              </dd>
            </div>
            <div data-tone="plan">
              <dt>Upcoming</dt>
              <dd>
                <PrivateAmount amount={planning.upcomingCommitments} />
              </dd>
            </div>
          </dl>
          {planning.overdueCount > 0 ? (
            <p className="planning-overdue">
              <span className="overdue-badge">
                {planning.overdueCount} overdue
              </span>
              <PrivateAmount amount={planning.overdue} />
            </p>
          ) : null}
          {nextCommitment ? (
            <p className="planning-next">
              <CalendarClock aria-hidden="true" />
              <span>
                Next: {nextCommitment.label} ·{' '}
                {nextCommitment.status === 'overdue'
                  ? `overdue since ${format(parseISO(nextCommitment.dueDate), 'd MMM')}`
                  : `due ${format(parseISO(nextCommitment.dueDate), 'd MMM')}`}
              </span>
              <PrivateAmount amount={nextCommitment.amount} />
            </p>
          ) : null}
        </>
      ) : (
        <p className="empty-state-note">
          No receivables, payables or commitments recorded yet.
        </p>
      )}
    </section>
  )
}

// Semantic category tones. Icons carry the category colour; the amount keeps
// the income/expense colour, so a salary row reads gold on the icon and green
// on the amount without either signal being lost.
const categoryIcons: Partial<Record<TransactionCategory, LucideIcon>> = {
  'client-payment': Briefcase,
  consultation: Briefcase,
  salary: Briefcase,
  freelance: Briefcase,
  refund: Banknote,
  gift: Gift,
  'other-income': Banknote,
  housing: House,
  rent: House,
  health: ReceiptText,
  medicine: ReceiptText,
  utilities: Plug,
  electricity: Plug,
  internet: Wifi,
  mobile: Smartphone,
  groceries: ShoppingCart,
  shopping: ShoppingCart,
  dining: Utensils,
  transport: Fuel,
  fuel: Fuel,
  gym: Dumbbell,
  education: GraduationCap,
  entertainment: Sparkles,
  personal: ReceiptText,
  'other-expense': ReceiptText,
  'cash-withdrawal': ArrowDownLeft,
  loan: CircleDollarSign,
  transfer: ArrowUpRight,
  'account-transfer': ArrowUpRight,
}

const categoryTones: Partial<Record<TransactionCategory, string>> = {
  'client-payment': 'salary',
  consultation: 'salary',
  salary: 'salary',
  freelance: 'salary',
  refund: 'income',
  gift: 'income',
  'other-income': 'income',
  groceries: 'groceries',
  shopping: 'groceries',
  dining: 'expense',
  transport: 'expense',
  fuel: 'expense',
  housing: 'bills',
  rent: 'bills',
  utilities: 'bills',
  electricity: 'bills',
  internet: 'bills',
  mobile: 'bills',
  health: 'bills',
  medicine: 'bills',
  gym: 'plan',
  education: 'plan',
  entertainment: 'plan',
}

function getCategoryIcon(category: TransactionCategory): LucideIcon {
  return categoryIcons[category] ?? ReceiptText
}

function getCategoryTone(category: TransactionCategory): string {
  return categoryTones[category] ?? 'neutral'
}

interface RecentActivityProps {
  data: PersonalFinanceData
  limit: number
}

export function RecentActivity({ data, limit }: RecentActivityProps) {
  const accounts = new Map(data.accounts.map((account) => [account.id, account]))
  const transactions = getRecentTransactions(data, limit)

  return (
    <section className="recent-activity glass-surface" aria-labelledby="activity-title">
      <HomeSectionHeading
        eyebrow="Latest updates"
        title="Recent Activity"
        titleId="activity-title"
        viewAll={{ to: '/activity', label: 'View all activity' }}
      />
      {transactions.length === 0 ? (
        <p className="empty-state-note">No transactions recorded yet.</p>
      ) : (
        <ul className="activity-list">
          {transactions.map((transaction) => {
            const Icon = getCategoryIcon(transaction.category)
            const account = accounts.get(transaction.accountId)
            const isIncome = transaction.direction === 'income'

            return (
              <li key={transaction.id} className="activity-row">
                <span
                  className={[
                    'activity-icon',
                    isIncome ? 'activity-income' : 'activity-expense',
                  ].join(' ')}
                  data-tone={getCategoryTone(transaction.category)}
                >
                  <Icon aria-hidden="true" />
                </span>
                <span className="activity-copy">
                  <strong>{transaction.title}</strong>
                  <small>
                    {transaction.counterparty ? `${transaction.counterparty} · ` : ''}
                    {isIncome ? 'Money In' : 'Money Out'}
                    {' · '}
                    {account?.label ?? 'Account'}
                  </small>
                </span>
                <span className="activity-meta">
                  <time dateTime={transaction.date}>
                    {format(parseISO(transaction.date), 'd MMM')}
                  </time>
                  <PrivateAmount
                    amount={transaction.amount}
                    sign={isIncome ? '+' : '-'}
                  />
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

const insightIcons: Record<HomeInsight['tone'], LucideIcon> = {
  attention: CalendarClock,
  caution: Info,
  positive: TrendingUp,
}

interface FinancialInsightProps {
  insight: HomeInsight
  onDismiss: () => void
}

export function FinancialInsight({ insight, onDismiss }: FinancialInsightProps) {
  const Icon = insightIcons[insight.tone]

  return (
    <section
      className="home-insight glass-surface"
      data-tone={insight.tone}
      aria-labelledby="insight-title"
    >
      <span className="home-insight-icon" aria-hidden="true">
        <Icon />
      </span>
      <div className="home-insight-copy">
        <h2 id="insight-title">{insight.title}</h2>
        <p>{insight.message}</p>
        <PrivateAmount amount={insight.amount} className="home-insight-amount" />
      </div>
      <button
        type="button"
        className="home-insight-dismiss"
        aria-label="Dismiss this insight"
        onClick={onDismiss}
      >
        <X aria-hidden="true" />
      </button>
    </section>
  )
}
