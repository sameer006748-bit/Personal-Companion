import { format, parseISO } from 'date-fns'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  CircleDollarSign,
  Fuel,
  House,
  ReceiptText,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Utensils,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router'

import {
  getAccountShare,
  getFinancialInsight,
  getMonthlyTransactions,
  getNextCommitment,
  getRecentTransactions,
} from '../../lib/financeSelectors'
import type { HomeSummary } from '../../lib/financeSelectors'
import type {
  PersonalFinanceData,
  TransactionCategory,
} from '../../models/finance'
import { PrivateAmount } from '../../shared/ui/PrivateAmount'

interface DataSectionProps {
  data: PersonalFinanceData
  summary: HomeSummary
}

export function AvailableBalanceHero({ data, summary }: DataSectionProps) {
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

      <div className="financial-position">
        <div>
          <p>Safe to Spend</p>
          <PrivateAmount amount={summary.safeToSpend} />
        </div>
        <p>
          {summary.remainingCommitments > 0
            ? 'Upcoming commitments remain fully covered.'
            : 'No upcoming commitments recorded.'}
        </p>
      </div>
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

export function OutstandingPosition({ summary }: Pick<DataSectionProps, 'summary'>) {
  return (
    <section
      className="outstanding-position glass-surface"
      aria-labelledby="outstanding-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Planning overview</p>
          <h2 id="outstanding-title">Outstanding Position</h2>
        </div>
      </div>
      <div className="outstanding-list">
        <Link to="/planning" className="outstanding-row">
          <span className="outstanding-icon receive-icon">
            <ArrowDownLeft aria-hidden="true" />
          </span>
          <span className="outstanding-copy">
            <strong>Outstanding Receivables</strong>
            <small>Expected from others</small>
          </span>
          <span className="outstanding-amount">
            <PrivateAmount amount={summary.outstandingReceivables} />
            <ArrowUpRight aria-hidden="true" />
          </span>
        </Link>
        <Link to="/planning" className="outstanding-row">
          <span className="outstanding-icon pay-icon">
            <ArrowUpRight aria-hidden="true" />
          </span>
          <span className="outstanding-copy">
            <strong>Outstanding Payables</strong>
            <small>Due to others</small>
          </span>
          <span className="outstanding-amount">
            <PrivateAmount amount={summary.outstandingPayables} />
            <ArrowUpRight aria-hidden="true" />
          </span>
        </Link>
      </div>
    </section>
  )
}

export function NextCommitment({ data }: Pick<DataSectionProps, 'data'>) {
  const commitment = getNextCommitment(data)

  if (!commitment) {
    return null
  }

  const isOverdue = commitment.status === 'overdue'
  const dueLabel = format(parseISO(commitment.dueDate), 'd MMM')

  return (
    <section className="next-commitment glass-surface" aria-labelledby="next-title">
      <div className="section-heading compact-heading">
        <div>
          <p className="eyebrow">Next commitment</p>
          <h2 id="next-title">{commitment.label}</h2>
        </div>
        {isOverdue ? <span className="overdue-badge">Overdue</span> : null}
      </div>
      <div className="commitment-details">
        <span className="commitment-icon">
          <CalendarClock aria-hidden="true" />
        </span>
        <span>
          {isOverdue ? `Overdue since ${dueLabel}` : `Due ${dueLabel}`}
          {commitment.accountLabel ? ` · ${commitment.accountLabel}` : ''}
        </span>
        <PrivateAmount amount={commitment.amount} />
      </div>
    </section>
  )
}

export function FinancialInsight({ data }: Pick<DataSectionProps, 'data'>) {
  const hasActivity = getMonthlyTransactions(data).length > 0

  return (
    <section className="financial-insight glass-surface" aria-labelledby="insight-title">
      <Sparkles aria-hidden="true" />
      <div>
        <p className="eyebrow">Financial insight</p>
        <h2 id="insight-title">{hasActivity ? 'A clear month so far' : 'Nothing recorded yet'}</h2>
        <p>{getFinancialInsight(data)}</p>
      </div>
    </section>
  )
}

const categoryIcons: Partial<Record<TransactionCategory, LucideIcon>> = {
  'client-payment': TrendingUp,
  consultation: CircleDollarSign,
  housing: House,
  health: ReceiptText,
  utilities: ReceiptText,
  groceries: ShoppingBag,
  shopping: ShoppingBag,
  dining: Utensils,
  transport: Fuel,
  'cash-withdrawal': ArrowDownLeft,
  medicine: ReceiptText,
  electricity: ReceiptText,
  entertainment: ReceiptText,
  loan: CircleDollarSign,
  transfer: ArrowUpRight,
}

function getCategoryIcon(category: TransactionCategory): LucideIcon {
  return categoryIcons[category] ?? ReceiptText
}

export function RecentActivity({ data }: Pick<DataSectionProps, 'data'>) {
  const accounts = new Map(data.accounts.map((account) => [account.id, account]))
  const transactions = getRecentTransactions(data)

  return (
    <section className="recent-activity glass-surface" aria-labelledby="activity-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Latest updates</p>
          <h2 id="activity-title">Recent Activity</h2>
        </div>
      </div>
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

export function AssistantEntry() {
  return (
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
  )
}
