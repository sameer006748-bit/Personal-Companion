import { format, parseISO } from 'date-fns'
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  CircleDollarSign,
  FileSearch,
  House,
  ReceiptText,
  Repeat,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'

import type {
  PlanningAttentionItem,
  PlanningCommitmentView,
  PlanningItems,
  PlanningItemType,
  PlanningPayableView,
  PlanningReceivableView,
  PlanningSummary,
} from '../../lib/financeSelectors'
import { getPlanningStatusLabel } from '../../lib/financeSelectors'
import type { TransactionCategory } from '../../models/finance'
import { PrivateAmount } from '../../shared/ui/PrivateAmount'

const categoryIcons: Partial<Record<TransactionCategory, LucideIcon>> = {
  'client-payment': TrendingUp,
  consultation: CircleDollarSign,
  housing: House,
  health: ReceiptText,
  utilities: ReceiptText,
  groceries: ReceiptText,
  shopping: ReceiptText,
  dining: ReceiptText,
  transport: ReceiptText,
  'cash-withdrawal': ArrowDownLeft,
  medicine: ReceiptText,
  electricity: ReceiptText,
  entertainment: ReceiptText,
  loan: CircleDollarSign,
  transfer: Repeat,
}

function getCategoryIcon(category: TransactionCategory): LucideIcon {
  return categoryIcons[category] ?? ReceiptText
}

const attentionTypeIcons: Record<PlanningItemType, LucideIcon> = {
  receivable: ArrowDownLeft,
  payable: ArrowUpRight,
  commitment: CalendarClock,
}

const attentionTypeLabels: Record<PlanningItemType, string> = {
  receivable: 'Receivable',
  payable: 'Payable',
  commitment: 'Commitment',
}

interface PlanningSummaryProps {
  summary: PlanningSummary
}

export function PlanningSummarySurface({ summary }: PlanningSummaryProps) {
  const isPositiveNet = summary.netOutstanding >= 0

  return (
    <section
      className="planning-summary glass-surface"
      aria-labelledby="planning-summary-title"
    >
      <div className="planning-summary-heading">
        <div>
          <p className="eyebrow">Outstanding position</p>
          <h2 id="planning-summary-title">Net Position</h2>
        </div>
        <span
          className={`planning-net-badge ${isPositiveNet ? 'is-positive' : 'is-negative'}`}
        >
          {isPositiveNet ? 'Positive' : 'Negative'}
        </span>
      </div>

      <div className="planning-summary-grid">
        <div className="planning-summary-item receive">
          <p>To Receive</p>
          <PrivateAmount amount={summary.toReceive} />
        </div>
        <div className="planning-summary-item pay">
          <p>To Pay</p>
          <PrivateAmount amount={summary.toPay} />
        </div>
        <div className="planning-summary-item upcoming">
          <p>Upcoming</p>
          <PrivateAmount amount={summary.upcomingCommitments} />
        </div>
        <div className="planning-summary-item overdue">
          <p>Overdue</p>
          <PrivateAmount amount={summary.overdue} />
        </div>
      </div>

      <div className="planning-net-position">
        <span>Net Outstanding</span>
        <PrivateAmount
          amount={summary.netOutstanding}
          sign={isPositiveNet ? '+ ' : '- '}
        />
      </div>
    </section>
  )
}

interface PlanningAttentionProps {
  items: readonly PlanningAttentionItem[]
}

export function PlanningAttention({ items }: PlanningAttentionProps) {
  if (items.length === 0) {
    return null
  }

  return (
    <section
      className="planning-attention glass-surface"
      aria-labelledby="attention-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Priority</p>
          <h2 id="attention-title">Needs your attention</h2>
        </div>
        <AlertCircle aria-hidden="true" className="attention-icon" />
      </div>
      <ul className="attention-list">
        {items.map((item) => {
          const Icon = attentionTypeIcons[item.type]
          const statusLabel = getPlanningStatusLabel(item.type, item.status)

          return (
            <li key={`${item.type}-${item.id}`} className="attention-row">
              <span className={`attention-type-icon type-${item.type}`}>
                <Icon aria-hidden="true" />
              </span>
              <span className="attention-copy">
                <strong>{item.title}</strong>
                <small>
                  {attentionTypeLabels[item.type]}
                  {item.accountLabel ? ` · ${item.accountLabel}` : ''}
                </small>
              </span>
              <span className="attention-meta">
                <span className="attention-overdue">
                  {item.overdueDays === 0
                    ? 'Due today'
                    : `${item.overdueDays}d overdue`}
                </span>
                <span className={`planning-status status-${item.status}`}>
                  {statusLabel}
                </span>
                <PrivateAmount amount={item.amount} />
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

interface PlanningReceivablesProps {
  receivables: readonly PlanningReceivableView[]
}

export function PlanningReceivablesSection({ receivables }: PlanningReceivablesProps) {
  if (receivables.length === 0) {
    return null
  }

  return (
    <section
      className="planning-section glass-surface"
      aria-labelledby="receivables-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Incoming</p>
          <h2 id="receivables-title">Money to receive</h2>
        </div>
        <ArrowDownLeft aria-hidden="true" className="section-icon receive" />
      </div>
      <ul className="planning-list">
        {receivables.map((item) => (
          <li key={item.id} className="planning-row">
            <span className="planning-row-copy">
              <strong>{item.counterparty}</strong>
              <small>
                <time dateTime={item.dueDate}>
                  {format(parseISO(item.dueDate), 'd MMM yyyy')}
                </time>
                {item.note ? ` · ${item.note}` : ''}
              </small>
            </span>
            <span className="planning-row-amounts">
              <span className="planning-row-remaining">
                <small>Remaining</small>
                <PrivateAmount amount={item.remainingAmount} />
              </span>
              <span className="planning-row-original">
                <small>of</small>
                <PrivateAmount amount={item.originalAmount} />
              </span>
              <span className={`planning-status status-${item.status}`}>
                {getPlanningStatusLabel('receivable', item.status)}
              </span>
            </span>
            {item.progress > 0 && item.progress < 100 && (
              <span
                className="planning-progress"
                role="img"
                aria-label={`${item.progress}% received`}
              >
                <span style={{ width: `${item.progress}%` }} />
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

interface PlanningPayablesProps {
  payables: readonly PlanningPayableView[]
}

export function PlanningPayablesSection({ payables }: PlanningPayablesProps) {
  if (payables.length === 0) {
    return null
  }

  return (
    <section
      className="planning-section glass-surface"
      aria-labelledby="payables-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Outgoing</p>
          <h2 id="payables-title">Money to pay</h2>
        </div>
        <ArrowUpRight aria-hidden="true" className="section-icon pay" />
      </div>
      <ul className="planning-list">
        {payables.map((item) => (
          <li key={item.id} className="planning-row">
            <span className="planning-row-copy">
              <strong>{item.counterparty}</strong>
              <small>
                <time dateTime={item.dueDate}>
                  {format(parseISO(item.dueDate), 'd MMM yyyy')}
                </time>
                {item.note ? ` · ${item.note}` : ''}
              </small>
            </span>
            <span className="planning-row-amounts">
              <span className="planning-row-remaining">
                <small>Remaining</small>
                <PrivateAmount amount={item.remainingAmount} />
              </span>
              <span className="planning-row-original">
                <small>of</small>
                <PrivateAmount amount={item.originalAmount} />
              </span>
              <span className={`planning-status status-${item.status}`}>
                {getPlanningStatusLabel('payable', item.status)}
              </span>
            </span>
            {item.progress > 0 && item.progress < 100 && (
              <span
                className="planning-progress"
                role="img"
                aria-label={`${item.progress}% paid`}
              >
                <span style={{ width: `${item.progress}%` }} />
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

interface PlanningCommitmentsProps {
  commitments: readonly PlanningCommitmentView[]
}

export function PlanningCommitmentsSection({
  commitments,
}: PlanningCommitmentsProps) {
  if (commitments.length === 0) {
    return null
  }

  return (
    <section
      className="planning-section glass-surface"
      aria-labelledby="commitments-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Recurring</p>
          <h2 id="commitments-title">Regular commitments</h2>
        </div>
        <Repeat aria-hidden="true" className="section-icon" />
      </div>
      <ul className="planning-list">
        {commitments.map((item) => {
          const Icon = getCategoryIcon(item.category)

          return (
            <li key={item.id} className="planning-row commitment-row">
              <span className="planning-row-copy">
                <span className="commitment-category-icon">
                  <Icon aria-hidden="true" />
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <small>
                    {item.frequency}
                    {item.accountLabel ? ` · ${item.accountLabel}` : ''}
                    {' · '}
                    <time dateTime={item.dueDate}>
                      {format(parseISO(item.dueDate), 'd MMM yyyy')}
                    </time>
                  </small>
                </span>
              </span>
              <span className="planning-row-amounts">
                <PrivateAmount amount={item.amount} />
                <span className={`planning-status status-${item.status}`}>
                  {getPlanningStatusLabel('commitment', item.status)}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

interface PlanningEmptyStateProps {
  title: string
  description: string
}

export function PlanningEmptyState({
  title,
  description,
}: PlanningEmptyStateProps) {
  return (
    <section className="planning-empty-state glass-surface">
      <FileSearch aria-hidden="true" />
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </section>
  )
}

interface PlanningContentProps {
  items: PlanningItems
}

export function PlanningContent({ items }: PlanningContentProps) {
  return (
    <div className="planning-content">
      <PlanningReceivablesSection receivables={items.receivables} />
      <PlanningPayablesSection payables={items.payables} />
      <PlanningCommitmentsSection commitments={items.commitments} />
    </div>
  )
}