import { format, parseISO } from 'date-fns'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CircleDollarSign,
  FileSearch,
  Fuel,
  House,
  ReceiptText,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Utensils,
  type LucideIcon,
} from 'lucide-react'

import type {
  ActivitySummary,
  ActivityTimelineGroup,
} from '../../lib/financeSelectors'
import type {
  AccountId,
  TransactionCategory,
  TransactionDirection,
  TransactionStatus,
} from '../../models/finance'
import { PrivateAmount } from '../../shared/ui/PrivateAmount'

interface ActivitySummaryCardsProps {
  summary: ActivitySummary
}

const summaryCards: readonly {
  key: keyof ActivitySummary
  label: string
  icon: LucideIcon
  tone: 'income' | 'expense' | 'receive' | 'pay'
}[] = [
  { key: 'moneyIn', label: 'Money In', icon: TrendingUp, tone: 'income' },
  { key: 'moneyOut', label: 'Money Out', icon: TrendingDown, tone: 'expense' },
  {
    key: 'receivables',
    label: 'Receivables',
    icon: ArrowDownLeft,
    tone: 'receive',
  },
  { key: 'payables', label: 'Payables', icon: ArrowUpRight, tone: 'pay' },
]

export function ActivitySummaryCards({ summary }: ActivitySummaryCardsProps) {
  return (
    <section className="activity-summary" aria-label="Quick summary">
      {summaryCards.map((card) => {
        const Icon = card.icon

        return (
          <article key={card.key} className="activity-summary-card glass-surface">
            <Icon aria-hidden="true" className={`summary-${card.tone}`} />
            <span>{card.label}</span>
            <PrivateAmount amount={summary[card.key]} />
          </article>
        )
      })}
    </section>
  )
}

const categoryIcons: Record<TransactionCategory, LucideIcon> = {
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
  transfer: ArrowLeftRight,
}

const directionLabels: Record<TransactionDirection, string> = {
  income: 'Money In',
  expense: 'Money Out',
  transfer: 'Transfer',
  receivable: 'Receivable',
  payable: 'Payable',
}

const statusLabels: Record<TransactionStatus, string> = {
  paid: 'Paid',
  received: 'Received',
  pending: 'Pending',
  overdue: 'Overdue',
  transfer: 'Transfer',
}

function getAmountSign(direction: TransactionDirection): string {
  if (direction === 'income' || direction === 'receivable') {
    return '+'
  }

  if (direction === 'transfer') {
    return '↔ '
  }

  return '-'
}

interface ActivityTimelineProps {
  groups: readonly ActivityTimelineGroup[]
  accounts: ReadonlyMap<AccountId, string>
}

export function ActivityTimeline({ groups, accounts }: ActivityTimelineProps) {
  return (
    <section className="activity-timeline" aria-labelledby="timeline-title">
      <div className="activity-section-heading">
        <div>
          <p className="eyebrow">Financial timeline</p>
          <h2 id="timeline-title">What happened recently</h2>
        </div>
      </div>
      {groups.map((group) => (
        <div key={group.id} className="timeline-group">
          <h3>{group.label}</h3>
          <ul className="timeline-list">
            {group.transactions.map((transaction) => {
              const Icon = categoryIcons[transaction.category]
              const accountLabel = accounts.get(transaction.accountId) ?? 'Account'

              return (
                <li key={transaction.id} className="timeline-row">
                  <span
                    className={[
                      'timeline-icon',
                      `direction-${transaction.direction}`,
                    ].join(' ')}
                  >
                    <Icon aria-hidden="true" />
                  </span>
                  <span className="timeline-copy">
                    <strong>{transaction.title}</strong>
                    <small>
                      {transaction.counterparty
                        ? `${transaction.counterparty} · `
                        : ''}
                      {directionLabels[transaction.direction]} · {accountLabel}
                    </small>
                  </span>
                  <span className="timeline-meta">
                    <time dateTime={transaction.date}>
                      {format(parseISO(transaction.date), 'd MMM')}
                    </time>
                    <span className={`timeline-status status-${transaction.status}`}>
                      {statusLabels[transaction.status]}
                    </span>
                    <PrivateAmount
                      amount={transaction.amount}
                      sign={getAmountSign(transaction.direction)}
                    />
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}

interface ActivityEmptyStateProps {
  title: string
  description: string
}

export function ActivityEmptyState({
  title,
  description,
}: ActivityEmptyStateProps) {
  return (
    <section className="activity-empty-state glass-surface">
      <FileSearch aria-hidden="true" />
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </section>
  )
}
