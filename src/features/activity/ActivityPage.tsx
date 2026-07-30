import { useMemo, useState } from 'react'
import { Plus, Search, SlidersHorizontal } from 'lucide-react'

import {
  getActivitySummary,
  getActivityTimelineGroups,
  type ActivityFilter,
} from '../../lib/financeSelectors'
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
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Overdue', value: 'overdue' },
]

export function ActivityPage() {
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [search, setSearch] = useState('')
  const [addingTransaction, setAddingTransaction] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<FinanceTransaction | null>(null)
  const settings = useAppStore((state) => state.settings)
  const finance = useAppStore((state) => state.finance)
  const data = useMemo(() => getLocalPersonalFinanceData(settings, finance), [settings, finance])
  const activitySummary = useMemo(() => getActivitySummary(data), [data])
  const activityGroups = useMemo(
    () => getActivityTimelineGroups(data, { filter, sort: 'newest', search }),
    [data, filter, search],
  )
  const activityAccounts = useMemo(
    () => new Map(data.accounts.map((account) => [account.id, account.label])),
    [data.accounts],
  )

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
          <button type="button" aria-pressed="false">
            Today
          </button>
          <button type="button" aria-pressed="true">
            This Month
          </button>
        </div>
      </header>

      <div className="activity-tools">
        <label className="activity-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Search activity</span>
          <input type="search" placeholder="Search activity" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <button type="button" className="glass-control activity-filter-button">
          <SlidersHorizontal aria-hidden="true" />
          Filter
        </button>
      </div>

      <ActivitySummaryCards summary={activitySummary} />

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

      {activityGroups.length > 0 ? (
        <ActivityTimeline groups={activityGroups} accounts={activityAccounts} onSelect={setSelectedTransaction} />
      ) : (
        <ActivityEmptyState
          title={data.transactions.length === 0 ? 'No activity yet' : 'No activity found'}
          description={
            data.transactions.length === 0
              ? 'Your financial activity will appear here after you add a transaction.'
              : 'Try a different filter or search term to review your financial timeline.'
          }
        />
      )}
      {addingTransaction ? <TransactionDialog onClose={() => setAddingTransaction(false)} /> : null}
      {selectedTransaction ? <TransactionDetailDialog transaction={selectedTransaction} onClose={() => setSelectedTransaction(null)} /> : null}
    </div>
  )
}
