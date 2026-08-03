import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'

import {
  DEFAULT_ACTIVITY_PERIOD,
  formatActivityRange,
  getActivityView,
  getMonthRange,
  validateActivityRange,
  type ActivityCustomRange,
  type ActivityFilter,
  type ActivityItem,
  type ActivityPeriod,
} from '../../lib/activitySelectors'
import { getLocalPersonalFinanceData } from '../../mocks/finance'
import { useAppStore } from '../../store/appStore'
import { TransactionDialog } from '../finance/TransactionDialog'
import { TransactionDetailDialog } from '../finance/TransactionDetailDialog'
import type { FinanceTransaction } from '../../models/finance'
import {
  ActivityEmptyState,
  ActivitySummaryCards,
  ActivityTimeline,
} from './ActivityComponents'

const filterChips: readonly { label: string; value: ActivityFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Income', value: 'income' },
  { label: 'Expense', value: 'expense' },
  { label: 'Transfer', value: 'transfer' },
  { label: 'Receivable', value: 'receivable' },
  { label: 'Payable', value: 'payable' },
  { label: 'Commitment', value: 'commitment' },
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Overdue', value: 'overdue' },
]

const periodOptions: readonly { label: string; value: ActivityPeriod }[] = [
  { label: 'Today', value: 'today' },
  { label: 'This Month', value: 'this-month' },
  { label: 'Custom', value: 'custom' },
]

const emptyTitles: Record<ActivityFilter, string> = {
  all: 'No activity in this period',
  income: 'No income in this period',
  expense: 'No expenses in this period',
  transfer: 'No transfers in this period',
  receivable: 'No receivable records in this period',
  payable: 'No payable records in this period',
  commitment: 'No commitments in this period',
  upcoming: 'Nothing upcoming in this period',
  overdue: 'No overdue items in this period',
}

export function ActivityPage() {
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<ActivityPeriod>(DEFAULT_ACTIVITY_PERIOD)
  const [draftRange, setDraftRange] = useState<ActivityCustomRange | null>(null)
  const [appliedRange, setAppliedRange] = useState<ActivityCustomRange | null>(null)
  const [rangeError, setRangeError] = useState<string | undefined>(undefined)
  const [addingTransaction, setAddingTransaction] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<FinanceTransaction | null>(null)
  const settings = useAppStore((state) => state.settings)
  const finance = useAppStore((state) => state.finance)
  const planning = useAppStore((state) => state.planning)
  const data = useMemo(() => getLocalPersonalFinanceData(settings, finance, planning), [settings, finance, planning])
  const view = useMemo(
    () =>
      getActivityView(data, {
        period,
        custom: appliedRange ?? undefined,
        filter,
        sort: 'newest',
        search,
      }),
    [data, period, appliedRange, filter, search],
  )
  const transactionsById = useMemo(
    () => new Map(data.transactions.map((transaction) => [transaction.id, transaction])),
    [data.transactions],
  )

  const selectPeriod = (next: ActivityPeriod): void => {
    setPeriod(next)
    setRangeError(undefined)

    if (next === 'custom' && !draftRange) {
      setDraftRange(getMonthRange(data.activityReferenceDate))
    }
  }

  const applyCustomRange = (): void => {
    if (!draftRange) {
      return
    }

    const error = validateActivityRange(draftRange.from, draftRange.to)
    setRangeError(error)

    if (!error) {
      setAppliedRange(draftRange)
    }
  }

  const clearCustomRange = (): void => {
    setDraftRange(null)
    setAppliedRange(null)
    setRangeError(undefined)
    setPeriod(DEFAULT_ACTIVITY_PERIOD)
  }

  const openItem = (item: ActivityItem): void => {
    const transaction = transactionsById.get(item.sourceId)

    if (transaction) {
      setSelectedTransaction(transaction)
    }
  }

  const hasSearch = search.trim().length > 0
  const hasAnyRecords =
    data.transactions.length > 0 ||
    data.planningReceivables.length > 0 ||
    data.planningPayables.length > 0 ||
    data.planningCommitments.length > 0
  const rangeLabel = formatActivityRange(view.range)
  const emptyTitle = !hasAnyRecords
    ? 'No activity yet'
    : hasSearch
      ? 'No matching activity'
      : emptyTitles[filter]
  const emptyDescription = !hasAnyRecords
    ? 'Your financial timeline will appear here after you add a transaction, receivable, payable or commitment.'
    : hasSearch
      ? `Nothing matches “${search.trim()}” in ${rangeLabel}. Clear the search or widen the period.`
      : view.periodItems.length > 0
        ? `Other activity exists in ${rangeLabel}. Choose a different filter to see it.`
        : `Nothing was recorded or due in ${rangeLabel}. Try a wider period.`

  return (
    <div className="activity-page">
      <header className="activity-header">
        <div>
          <p className="eyebrow">Financial timeline</p>
          <h1>Activity</h1>
        </div>
        <button type="button" className="glass-control activity-add-button" onClick={() => setAddingTransaction(true)}>
          <Plus aria-hidden="true" />
          Add transaction
        </button>
        <div className="activity-period-selector" role="group" aria-label="Period">
          {periodOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={option.value === period}
              onClick={() => selectPeriod(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {period === 'custom' ? (
        <div className="activity-custom-range">
          <label>
            <span>From</span>
            <input
              type="date"
              value={draftRange?.from ?? ''}
              onChange={(event) =>
                setDraftRange((current) => ({
                  from: event.target.value,
                  to: current?.to ?? event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              value={draftRange?.to ?? ''}
              onChange={(event) =>
                setDraftRange((current) => ({
                  from: current?.from ?? event.target.value,
                  to: event.target.value,
                }))
              }
            />
          </label>
          <div className="activity-custom-range-actions">
            <button type="button" className="glass-control" onClick={applyCustomRange}>
              Apply
            </button>
            <button type="button" className="glass-control" onClick={clearCustomRange}>
              Clear
            </button>
          </div>
          {rangeError ? (
            <p className="activity-range-error" role="alert">
              {rangeError}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="activity-tools">
        <label className="activity-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Search activity</span>
          <input type="search" placeholder="Search activity" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <p className="activity-range-label">{rangeLabel}</p>
      </div>

      <ActivitySummaryCards summary={view.summary} range={view.range} />

      <div className="activity-filter-chips" aria-label="Activity filters">
        {filterChips.map((chip) => (
          <button
            key={chip.value}
            type="button"
            className={chip.value === filter ? 'is-selected' : ''}
            aria-pressed={chip.value === filter}
            onClick={() => setFilter(chip.value)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {view.groups.length > 0 ? (
        <ActivityTimeline groups={view.groups} onSelect={openItem} />
      ) : (
        <ActivityEmptyState title={emptyTitle} description={emptyDescription} />
      )}
      {addingTransaction ? <TransactionDialog onClose={() => setAddingTransaction(false)} /> : null}
      {selectedTransaction ? <TransactionDetailDialog transaction={selectedTransaction} onClose={() => setSelectedTransaction(null)} /> : null}
    </div>
  )
}
