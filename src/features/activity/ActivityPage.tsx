import { Search, SlidersHorizontal } from 'lucide-react'

import {
  getActivitySummary,
  getActivityTimelineGroups,
  type ActivityFilter,
} from '../../lib/financeSelectors'
import { personalFinanceData } from '../../mocks/finance'
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

const activitySummary = getActivitySummary(personalFinanceData)
const activityGroups = getActivityTimelineGroups(personalFinanceData, {
  filter: 'all',
  sort: 'newest',
})
const activityAccounts = new Map(
  personalFinanceData.accounts.map((account) => [account.id, account.label]),
)

export function ActivityPage() {
  return (
    <div className="activity-page">
      <header className="activity-header">
        <div>
          <p className="eyebrow">Financial timeline</p>
          <h1>Activity</h1>
        </div>
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
          <input type="search" placeholder="Search activity" />
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
            className={chip.value === 'all' ? 'is-selected' : ''}
            aria-pressed={chip.value === 'all'}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {activityGroups.length > 0 ? (
        <ActivityTimeline groups={activityGroups} accounts={activityAccounts} />
      ) : (
        <ActivityEmptyState
          title="No activity found"
          description="Try a different filter or search term to review your financial timeline."
        />
      )}
    </div>
  )
}
