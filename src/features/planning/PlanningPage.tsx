import { useMemo, useState } from 'react'

import {
  filterPlanningItems,
  getPlanningItems,
  getPlanningSummary,
  getPriorityAttentionItems,
  hasPlanningItems,
  type PlanningFilter,
  type PlanningPeriod,
} from '../../lib/financeSelectors'
import { personalFinanceData } from '../../mocks/finance'
import {
  PlanningAttention,
  PlanningContent,
  PlanningEmptyState,
  PlanningSummarySurface,
} from './PlanningComponents'

const filterChips: readonly { label: string; value: PlanningFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Receivables', value: 'receivables' },
  { label: 'Payables', value: 'payables' },
  { label: 'Commitments', value: 'commitments' },
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Completed', value: 'completed' },
]

const periodLabels: Record<PlanningPeriod, string> = {
  'this-month': 'This Month',
  'next-30-days': 'Next 30 Days',
}

export function PlanningPage() {
  const [period, setPeriod] = useState<PlanningPeriod>('this-month')
  const [filter, setFilter] = useState<PlanningFilter>('all')

  const summary = useMemo(() => getPlanningSummary(personalFinanceData), [])
  const attentionItems = useMemo(
    () => getPriorityAttentionItems(personalFinanceData),
    [],
  )
  const allItems = useMemo(
    () => getPlanningItems(personalFinanceData, period),
    [period],
  )
  const filteredItems = useMemo(
    () => filterPlanningItems(allItems, filter),
    [allItems, filter],
  )
  const hasItems = useMemo(() => hasPlanningItems(filteredItems), [filteredItems])

  return (
    <div className="planning-page">
      <header className="planning-header">
        <div>
          <p className="eyebrow">Financial planning</p>
          <h1>Planning</h1>
          <p className="planning-subtitle">
            Track receivables, payables, and commitments before they need action.
          </p>
        </div>
        <div
          className="planning-period-selector"
          role="group"
          aria-label="Period"
        >
          {(Object.keys(periodLabels) as PlanningPeriod[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {periodLabels[value]}
            </button>
          ))}
        </div>
      </header>

      <PlanningSummarySurface summary={summary} />

      <PlanningAttention items={attentionItems} />

      <div
        className="planning-filter-chips"
        aria-label="Planning filters"
      >
        {filterChips.map((chip) => (
          <button
            key={chip.value}
            type="button"
            className={filter === chip.value ? 'is-selected' : ''}
            aria-pressed={filter === chip.value}
            onClick={() => setFilter(chip.value)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {hasItems ? (
        <PlanningContent items={filteredItems} />
      ) : (
        <PlanningEmptyState
          title="No items match this filter"
          description="Try a different filter or period to review your financial planning items."
        />
      )}
    </div>
  )
}