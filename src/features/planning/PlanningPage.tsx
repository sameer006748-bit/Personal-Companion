import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'

import {
  filterPlanningItems,
  getPlanningItems,
  getPlanningSummary,
  getPriorityAttentionItems,
  hasPlanningItems,
  type PlanningFilter,
  type PlanningItemType,
  type PlanningPeriod,
} from '../../lib/financeSelectors'
import { getArchivedCommitments } from '../../lib/planningCore'
import { getLocalPersonalFinanceData } from '../../mocks/finance'
import { useAppStore } from '../../store/appStore'
import {
  PlanningAttention,
  PlanningContent,
  PlanningEmptyState,
  PlanningSummarySurface,
} from './PlanningComponents'
import {
  PlanningItemDetail,
  PlanningItemForm,
  type PlanningFormTarget,
} from './PlanningDialogs'

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

interface DetailTarget {
  type: PlanningItemType
  id: string
}

export function PlanningPage() {
  const [period, setPeriod] = useState<PlanningPeriod>('this-month')
  const [filter, setFilter] = useState<PlanningFilter>('all')
  const [formTarget, setFormTarget] = useState<PlanningFormTarget | undefined>()
  const [detailTarget, setDetailTarget] = useState<DetailTarget | undefined>()

  const settings = useAppStore((state) => state.settings)
  const finance = useAppStore((state) => state.finance)
  const planning = useAppStore((state) => state.planning)
  const data = useMemo(
    () => getLocalPersonalFinanceData(settings, finance, planning),
    [settings, finance, planning],
  )

  const summary = useMemo(() => getPlanningSummary(data), [data])
  const attentionItems = useMemo(
    () => getPriorityAttentionItems(data),
    [data],
  )
  const allItems = useMemo(
    () => getPlanningItems(data, period),
    [data, period],
  )
  const filteredItems = useMemo(
    () => filterPlanningItems(allItems, filter),
    [allItems, filter],
  )
  const hasItems = useMemo(() => hasPlanningItems(filteredItems), [filteredItems])
  const hasAnyItems = useMemo(() => hasPlanningItems(allItems), [allItems])
  const archivedCommitments = useMemo(
    () => getArchivedCommitments(planning),
    [planning],
  )

  function openDetail(type: PlanningItemType, id: string): void {
    setDetailTarget({ type, id })
  }

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
        <div className="planning-header-actions">
          <button
            type="button"
            className="glass-control planning-add-button"
            onClick={() => setFormTarget({ type: 'receivable' })}
          >
            <Plus aria-hidden="true" />
            Add item
          </button>
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
        </div>
      </header>

      <PlanningSummarySurface summary={summary} />

      <PlanningAttention items={attentionItems} onSelect={openDetail} />

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
        <PlanningContent items={filteredItems} onSelect={openDetail} />
      ) : (
        <PlanningEmptyState
          title={!hasAnyItems ? 'Nothing to plan yet' : 'No items match this filter'}
          description={
            !hasAnyItems
              ? 'No receivables, payables, or commitments have been added yet. Use Add item to record your first one.'
              : 'Try a different filter or period to review your financial planning items.'
          }
        />
      )}

      {archivedCommitments.length > 0 ? (
        <section
          className="planning-section glass-surface"
          aria-labelledby="archived-commitments-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">Paused</p>
              <h2 id="archived-commitments-title">Archived commitments</h2>
            </div>
          </div>
          <ul className="planning-list">
            {archivedCommitments.map((item) => (
              <li key={item.id} className="planning-row">
                <button
                  type="button"
                  className="planning-row-trigger planning-open-trigger"
                  onClick={() => openDetail('commitment', item.id)}
                >
                  <span className="planning-row-copy">
                    <strong>{item.label}</strong>
                    <small>Archived · not counted in totals</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {detailTarget ? (
        <PlanningItemDetail
          type={detailTarget.type}
          id={detailTarget.id}
          onClose={() => setDetailTarget(undefined)}
          onEdit={(target) => {
            setDetailTarget(undefined)
            setFormTarget(target)
          }}
        />
      ) : null}

      {formTarget ? (
        <PlanningItemForm
          target={formTarget}
          onClose={() => setFormTarget(undefined)}
        />
      ) : null}
    </div>
  )
}
