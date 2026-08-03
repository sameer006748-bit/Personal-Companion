import { format, parseISO } from 'date-fns'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CalendarClock,
  CircleDollarSign,
  FileSearch,
  Fuel,
  Handshake,
  House,
  ReceiptText,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Utensils,
  type LucideIcon,
} from 'lucide-react'

import { formatActivityRange } from '../../lib/activitySelectors'
import type {
  ActivityDateRange,
  ActivityEventKind,
  ActivityItem,
  ActivityMoneyDirection,
  ActivitySummary,
  ActivityTimelineGroup,
} from '../../lib/activitySelectors'
import type { TransactionCategory } from '../../models/finance'
import { PrivateAmount } from '../../shared/ui/PrivateAmount'

interface ActivitySummaryCardsProps {
  summary: ActivitySummary
  range: ActivityDateRange
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

export function ActivitySummaryCards({ summary, range }: ActivitySummaryCardsProps) {
  return (
    <section
      className="activity-summary"
      aria-label={`Summary for ${formatActivityRange(range)}`}
    >
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

const categoryIcons: Partial<Record<TransactionCategory, LucideIcon>> = {
  'client-payment': TrendingUp,
  consultation: CircleDollarSign,
  housing: House,
  rent: House,
  health: ReceiptText,
  utilities: ReceiptText,
  groceries: ShoppingBag,
  shopping: ShoppingBag,
  dining: Utensils,
  transport: Fuel,
  fuel: Fuel,
  'cash-withdrawal': ArrowDownLeft,
  medicine: ReceiptText,
  electricity: ReceiptText,
  entertainment: ReceiptText,
  loan: CircleDollarSign,
  transfer: ArrowLeftRight,
  'account-transfer': ArrowLeftRight,
}

const kindIcons: Partial<Record<ActivityEventKind, LucideIcon>> = {
  transfer: ArrowLeftRight,
  'receivable-created': Handshake,
  'receivable-settled': ArrowDownLeft,
  'payable-created': Handshake,
  'payable-settled': ArrowUpRight,
  'commitment-upcoming': CalendarClock,
  'commitment-settled': CalendarClock,
}

function getItemIcon(item: ActivityItem): LucideIcon {
  return (
    kindIcons[item.kind] ?? categoryIcons[item.category] ?? ReceiptText
  )
}

function getAmountSign(direction: ActivityMoneyDirection): string {
  if (direction === 'in') return '+'
  if (direction === 'neutral') return '↔ '
  return '-'
}

interface ActivityTimelineProps {
  groups: readonly ActivityTimelineGroup[]
  onSelect?: (item: ActivityItem) => void
}

export function ActivityTimeline({ groups, onSelect }: ActivityTimelineProps) {
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
            {group.items.map((item) => {
              const Icon = getItemIcon(item)
              const isSelectable = item.sourceKind === 'transaction' && Boolean(onSelect)

              return (
                <li
                  key={item.id}
                  className="timeline-row"
                  {...(isSelectable ? { onClick: () => onSelect?.(item) } : {})}
                >
                  <span
                    className={['timeline-icon', `direction-${item.direction}`].join(' ')}
                  >
                    <Icon aria-hidden="true" />
                  </span>
                  <span className="timeline-copy">
                    <strong>{item.title}</strong>
                    <small>{item.subtitle}</small>
                  </span>
                  <span className="timeline-meta">
                    <time dateTime={item.eventDate}>
                      {format(parseISO(item.eventDate), 'd MMM')}
                    </time>
                    <span className={`timeline-status status-${item.status}`}>
                      {item.statusLabel}
                    </span>
                    <PrivateAmount
                      amount={item.amount}
                      sign={getAmountSign(item.direction)}
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
