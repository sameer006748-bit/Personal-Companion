import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  isWithinInterval,
  parseISO,
  startOfMonth,
} from 'date-fns'

import type {
  Account,
  AccountId,
  FinanceTransaction,
  FinancialPosition,
  PayableStatus,
  PersonalFinanceData,
  PlanningCommitment,
  PlanningCommitmentStatus,
  PlanningPayable,
  PlanningReceivable,
  ReceivableStatus,
  TransactionCategory,
} from '../models/finance'
import { PLANNING_FREQUENCY_LABELS } from '../models/planning'

export interface HomeSummary {
  totalAvailable: number
  monthlyIncome: number
  monthlyExpenses: number
  netMonthlyPosition: number
  outstandingReceivables: number
  outstandingPayables: number
  remainingCommitments: number
  safeToSpend: number
  financialPosition: FinancialPosition
}

export interface ExpenseDriver {
  label: string
  amount: number
}

export type ActivityFilter =
  | 'all'
  | 'income'
  | 'expense'
  | 'transfer'
  | 'receivable'
  | 'payable'
  | 'upcoming'
  | 'overdue'

export type ActivitySort = 'newest' | 'oldest'

export interface ActivityQuery {
  filter?: ActivityFilter
  sort?: ActivitySort
  search?: string
}

export interface ActivityTimelineGroup {
  id: string
  label: 'Today' | 'Yesterday' | 'Earlier This Week' | 'Earlier This Month'
  transactions: readonly FinanceTransaction[]
}

export interface ActivitySummary {
  moneyIn: number
  moneyOut: number
  receivables: number
  payables: number
}

function sumAmounts<T>(items: readonly T[], getAmount: (item: T) => number): number {
  return items.reduce((total, item) => total + getAmount(item), 0)
}

export function getTotalAvailable(data: PersonalFinanceData): number {
  return sumAmounts(data.accounts, (account) => account.balance)
}

export function getMonthlyTransactions(
  data: PersonalFinanceData,
): readonly FinanceTransaction[] {
  return data.transactions.filter(
    (transaction) =>
      transaction.date.startsWith(data.reportingMonth) &&
      transaction.isHomeRelevant !== false,
  )
}

export function getMonthlyIncome(data: PersonalFinanceData): number {
  return sumAmounts(
    getMonthlyTransactions(data).filter(
      (transaction) => transaction.direction === 'income',
    ),
    (transaction) => transaction.amount,
  )
}

export function getMonthlyExpenses(data: PersonalFinanceData): number {
  return sumAmounts(
    getMonthlyTransactions(data).filter(
      (transaction) => transaction.direction === 'expense',
    ),
    (transaction) => transaction.amount,
  )
}

export function getNetMonthlyPosition(data: PersonalFinanceData): number {
  return getMonthlyIncome(data) - getMonthlyExpenses(data)
}

export function getLargestExpenseDrivers(
  data: PersonalFinanceData,
  limit = 6,
): readonly ExpenseDriver[] {
  const totals = new Map<string, number>()

  getMonthlyTransactions(data)
    .filter((transaction) => transaction.direction === 'expense')
    .forEach((transaction) => {
      totals.set(
        transaction.title,
        (totals.get(transaction.title) ?? 0) + transaction.amount,
      )
    })

  return [...totals.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((first, second) => second.amount - first.amount)
    .slice(0, limit)
}

export function getOutstandingReceivables(data: PersonalFinanceData): number {
  return getOutstandingPlanningReceivables(data)
}

export function getOutstandingPayables(data: PersonalFinanceData): number {
  return getOutstandingPlanningPayables(data)
}

export function getRemainingCommitments(data: PersonalFinanceData): number {
  return getUpcomingCommitmentsTotal(data)
}

export function getSafeToSpend(data: PersonalFinanceData): number {
  return Math.max(
    0,
    getTotalAvailable(data) - getRemainingCommitments(data) - data.liquidityReserve,
  )
}

export function getFinancialPosition(
  data: PersonalFinanceData,
): FinancialPosition {
  if (data.liquidityReserve === 0) {
    return getSafeToSpend(data) > 0 ? 'Comfortable' : 'Tight'
  }

  return getSafeToSpend(data) >= data.liquidityReserve * 4
    ? 'Comfortable'
    : 'Tight'
}

export function getRecentTransactions(
  data: PersonalFinanceData,
  limit = 5,
): readonly FinanceTransaction[] {
  return data.transactions
    .filter((transaction) => transaction.isHomeRelevant !== false)
    .sort((first, second) => second.date.localeCompare(first.date))
    .slice(0, limit)
}

export interface NextCommitmentView {
  id: string
  label: string
  amount: number
  dueDate: string
  status: PlanningCommitmentStatus
  accountLabel?: string | undefined
}

export function getNextCommitment(
  data: PersonalFinanceData,
): NextCommitmentView | undefined {
  const next = [...data.planningCommitments]
    .filter((commitment) => isCommitmentOutstanding(commitment.status))
    .sort((first, second) => first.dueDate.localeCompare(second.dueDate))[0]

  if (!next) {
    return undefined
  }

  return {
    id: next.id,
    label: next.label,
    amount: next.amount,
    dueDate: next.dueDate,
    status: next.status,
    accountLabel: getAccountLabel(data, next.accountId),
  }
}

export function getAccountShare(account: Account, totalAvailable: number): number {
  return totalAvailable === 0 ? 0 : (account.balance / totalAvailable) * 100
}

export function getIncomeGrowthPercentage(data: PersonalFinanceData): number {
  if (data.previousMonthIncome === 0) {
    return 0
  }

  return Math.round(
    ((getMonthlyIncome(data) - data.previousMonthIncome) /
      data.previousMonthIncome) *
      100,
  )
}

export function getFinancialInsight(data: PersonalFinanceData): string {
  if (getMonthlyTransactions(data).length === 0) {
    return 'No transactions recorded yet. Your monthly insight will appear once you add activity.'
  }

  if (data.previousMonthIncome === 0) {
    const net = getNetMonthlyPosition(data)
    return net >= 0
      ? 'Income exceeds recorded spending so far this month.'
      : 'Recorded spending exceeds income so far this month.'
  }

  return `Income is ${getIncomeGrowthPercentage(data)}% higher than last month, while essential commitments remain covered.`
}

export function getHomeSummary(data: PersonalFinanceData): HomeSummary {
  return {
    totalAvailable: getTotalAvailable(data),
    monthlyIncome: getMonthlyIncome(data),
    monthlyExpenses: getMonthlyExpenses(data),
    netMonthlyPosition: getNetMonthlyPosition(data),
    outstandingReceivables: getOutstandingReceivables(data),
    outstandingPayables: getOutstandingPayables(data),
    remainingCommitments: getRemainingCommitments(data),
    safeToSpend: getSafeToSpend(data),
    financialPosition: getFinancialPosition(data),
  }
}

export function getActivitySummary(data: PersonalFinanceData): ActivitySummary {
  return {
    moneyIn: getMonthlyIncome(data),
    moneyOut: getMonthlyExpenses(data),
    receivables: getOutstandingReceivables(data),
    payables: getOutstandingPayables(data),
  }
}

function matchesActivityFilter(
  transaction: FinanceTransaction,
  filter: ActivityFilter,
): boolean {
  if (filter === 'all') {
    return true
  }

  if (filter === 'upcoming') {
    return transaction.status === 'pending'
  }

  if (filter === 'overdue') {
    return transaction.status === 'overdue'
  }

  return transaction.direction === filter
}

function matchesActivitySearch(
  transaction: FinanceTransaction,
  accountLabel: string,
  search: string,
): boolean {
  if (search.length === 0) {
    return true
  }

  return [
    transaction.title,
    transaction.counterparty ?? '',
    transaction.direction,
    transaction.status,
    accountLabel,
  ].some((value) => value.toLocaleLowerCase().includes(search))
}

export function getActivityTransactions(
  data: PersonalFinanceData,
  query: ActivityQuery = {},
): readonly FinanceTransaction[] {
  const filter = query.filter ?? 'all'
  const sort = query.sort ?? 'newest'
  const search = query.search?.trim().toLocaleLowerCase() ?? ''
  const accounts = new Map(data.accounts.map((account) => [account.id, account.label]))

  return [...data.transactions]
    .filter((transaction) => matchesActivityFilter(transaction, filter))
    .filter((transaction) =>
      matchesActivitySearch(
        transaction,
        accounts.get(transaction.accountId) ?? transaction.accountId,
        search,
      ),
    )
    .sort((first, second) => {
      const order = first.date.localeCompare(second.date)
      return sort === 'newest' ? -order : order
    })
}

function getActivityGroupLabel(
  transactionDate: string,
  referenceDate: string,
): ActivityTimelineGroup['label'] {
  const dayDifference = differenceInCalendarDays(
    parseISO(referenceDate),
    parseISO(transactionDate),
  )

  if (dayDifference <= 0) {
    return 'Today'
  }

  if (dayDifference === 1) {
    return 'Yesterday'
  }

  if (dayDifference <= 7) {
    return 'Earlier This Week'
  }

  return 'Earlier This Month'
}

export function getActivityTimelineGroups(
  data: PersonalFinanceData,
  query: ActivityQuery = {},
): readonly ActivityTimelineGroup[] {
  const groups = new Map<string, ActivityTimelineGroup>()

  getActivityTransactions(data, query).forEach((transaction) => {
    const label = getActivityGroupLabel(
      transaction.date,
      data.activityReferenceDate,
    )
    const group = groups.get(label)

    if (group) {
      group.transactions = [...group.transactions, transaction]
      return
    }

    groups.set(label, {
      id: label.toLocaleLowerCase().replaceAll(' ', '-'),
      label,
      transactions: [transaction],
    })
  })

  return [...groups.values()]
}

export type PlanningPeriod = 'this-month' | 'next-30-days'

export type PlanningFilter =
  | 'all'
  | 'receivables'
  | 'payables'
  | 'commitments'
  | 'upcoming'
  | 'overdue'
  | 'completed'

export type PlanningItemType = 'receivable' | 'payable' | 'commitment'

export type PlanningItemStatus =
  | ReceivableStatus
  | PayableStatus
  | PlanningCommitmentStatus

export interface PlanningSummary {
  toReceive: number
  toPay: number
  upcomingCommitments: number
  overdue: number
  netOutstanding: number
  overdueCount: number
  upcomingCount: number
}

export interface PlanningAttentionItem {
  id: string
  title: string
  type: PlanningItemType
  amount: number
  dueDate: string
  status: PlanningItemStatus
  accountLabel?: string | undefined
  overdueDays: number
}

export interface PlanningReceivableView {
  id: string
  counterparty: string
  originalAmount: number
  receivedAmount: number
  remainingAmount: number
  dueDate: string
  status: ReceivableStatus
  note?: string | undefined
  progress: number
}

export interface PlanningPayableView {
  id: string
  counterparty: string
  originalAmount: number
  paidAmount: number
  remainingAmount: number
  dueDate: string
  status: PayableStatus
  note?: string | undefined
  progress: number
}

export interface PlanningCommitmentView {
  id: string
  label: string
  category: TransactionCategory
  amount: number
  frequency: string
  dueDate: string
  status: PlanningCommitmentStatus
  accountLabel?: string | undefined
}

export interface PlanningItems {
  receivables: readonly PlanningReceivableView[]
  payables: readonly PlanningPayableView[]
  commitments: readonly PlanningCommitmentView[]
}

const receivableStatusLabels: Record<ReceivableStatus, string> = {
  pending: 'Pending',
  'partially-received': 'Partially Received',
  overdue: 'Overdue',
  received: 'Received',
}

const payableStatusLabels: Record<PayableStatus, string> = {
  pending: 'Pending',
  'partially-paid': 'Partially Paid',
  overdue: 'Overdue',
  paid: 'Paid',
}

const commitmentStatusLabels: Record<PlanningCommitmentStatus, string> = {
  upcoming: 'Upcoming',
  'due-soon': 'Due Soon',
  paid: 'Paid',
  overdue: 'Overdue',
}

const frequencyLabels: Record<PlanningCommitment['frequency'], string> =
  PLANNING_FREQUENCY_LABELS

export function getPlanningStatusLabel(
  type: PlanningItemType,
  status: PlanningItemStatus,
): string {
  if (type === 'receivable') {
    return receivableStatusLabels[status as ReceivableStatus]
  }

  if (type === 'payable') {
    return payableStatusLabels[status as PayableStatus]
  }

  return commitmentStatusLabels[status as PlanningCommitmentStatus]
}

const completedReceivableStatuses: readonly ReceivableStatus[] = ['received']
const completedPayableStatuses: readonly PayableStatus[] = ['paid']
const completedCommitmentStatuses: readonly PlanningCommitmentStatus[] = ['paid']

function isReceivableOutstanding(status: ReceivableStatus): boolean {
  return !completedReceivableStatuses.includes(status)
}

function isPayableOutstanding(status: PayableStatus): boolean {
  return !completedPayableStatuses.includes(status)
}

function isCommitmentOutstanding(status: PlanningCommitmentStatus): boolean {
  return !completedCommitmentStatuses.includes(status)
}

function isReceivableCompleted(status: ReceivableStatus): boolean {
  return completedReceivableStatuses.includes(status)
}

function isPayableCompleted(status: PayableStatus): boolean {
  return completedPayableStatuses.includes(status)
}

function isCommitmentCompleted(status: PlanningCommitmentStatus): boolean {
  return completedCommitmentStatuses.includes(status)
}

function getReceivableRemaining(item: PlanningReceivable): number {
  return Math.max(0, item.originalAmount - item.receivedAmount)
}

function getPayableRemaining(item: PlanningPayable): number {
  return Math.max(0, item.originalAmount - item.paidAmount)
}

function getProgress(
  settled: number,
  original: number,
): number {
  if (original <= 0) {
    return 0
  }

  return Math.min(100, Math.round((settled / original) * 100))
}

export function getReceivableProgress(item: PlanningReceivable): number {
  return getProgress(item.receivedAmount, item.originalAmount)
}

export function getPayableProgress(item: PlanningPayable): number {
  return getProgress(item.paidAmount, item.originalAmount)
}

export function getOutstandingReceivableItems(
  data: PersonalFinanceData,
): readonly PlanningReceivableView[] {
  return sortByUrgency(
    data.planningReceivables
      .filter((item) => isReceivableOutstanding(item.status))
      .map((item) => ({
        id: item.id,
        counterparty: item.counterparty,
        originalAmount: item.originalAmount,
        receivedAmount: item.receivedAmount,
        remainingAmount: getReceivableRemaining(item),
        dueDate: item.dueDate,
        status: item.status,
        note: item.note,
        progress: getReceivableProgress(item),
      })),
  )
}

export function getOutstandingPayableItems(
  data: PersonalFinanceData,
): readonly PlanningPayableView[] {
  return sortByUrgency(
    data.planningPayables
      .filter((item) => isPayableOutstanding(item.status))
      .map((item) => ({
        id: item.id,
        counterparty: item.counterparty,
        originalAmount: item.originalAmount,
        paidAmount: item.paidAmount,
        remainingAmount: getPayableRemaining(item),
        dueDate: item.dueDate,
        status: item.status,
        note: item.note,
        progress: getPayableProgress(item),
      })),
  )
}

export function getOutstandingPlanningReceivables(
  data: PersonalFinanceData,
): number {
  return sumAmounts(
    data.planningReceivables.filter((item) => isReceivableOutstanding(item.status)),
    (item) => getReceivableRemaining(item),
  )
}

export function getOutstandingPlanningPayables(
  data: PersonalFinanceData,
): number {
  return sumAmounts(
    data.planningPayables.filter((item) => isPayableOutstanding(item.status)),
    (item) => getPayableRemaining(item),
  )
}

export function getNetOutstandingPosition(data: PersonalFinanceData): number {
  return (
    getOutstandingPlanningReceivables(data) - getOutstandingPlanningPayables(data)
  )
}

export function getUpcomingCommitmentsTotal(
  data: PersonalFinanceData,
): number {
  return sumAmounts(
    data.planningCommitments.filter((item) =>
      isCommitmentOutstanding(item.status),
    ),
    (item) => item.amount,
  )
}

export function getOverdueTotal(data: PersonalFinanceData): number {
  const overdueReceivables = sumAmounts(
    data.planningReceivables.filter((item) => item.status === 'overdue'),
    (item) => getReceivableRemaining(item),
  )
  const overduePayables = sumAmounts(
    data.planningPayables.filter((item) => item.status === 'overdue'),
    (item) => getPayableRemaining(item),
  )
  const overdueCommitments = sumAmounts(
    data.planningCommitments.filter((item) => item.status === 'overdue'),
    (item) => item.amount,
  )

  return overdueReceivables + overduePayables + overdueCommitments
}

export function getOverdueCount(data: PersonalFinanceData): number {
  const overdueReceivables = data.planningReceivables.filter(
    (item) => item.status === 'overdue',
  ).length
  const overduePayables = data.planningPayables.filter(
    (item) => item.status === 'overdue',
  ).length
  const overdueCommitments = data.planningCommitments.filter(
    (item) => item.status === 'overdue',
  ).length

  return overdueReceivables + overduePayables + overdueCommitments
}

export function getUpcomingCount(data: PersonalFinanceData): number {
  const upcomingReceivables = data.planningReceivables.filter(
    (item) => item.status === 'pending',
  ).length
  const upcomingPayables = data.planningPayables.filter(
    (item) => item.status === 'pending',
  ).length
  const upcomingCommitments = data.planningCommitments.filter(
    (item) => item.status === 'upcoming' || item.status === 'due-soon',
  ).length

  return upcomingReceivables + upcomingPayables + upcomingCommitments
}

export function getPlanningSummary(data: PersonalFinanceData): PlanningSummary {
  return {
    toReceive: getOutstandingPlanningReceivables(data),
    toPay: getOutstandingPlanningPayables(data),
    upcomingCommitments: getUpcomingCommitmentsTotal(data),
    overdue: getOverdueTotal(data),
    netOutstanding: getNetOutstandingPosition(data),
    overdueCount: getOverdueCount(data),
    upcomingCount: getUpcomingCount(data),
  }
}

function getAccountLabel(
  data: PersonalFinanceData,
  accountId: AccountId | undefined,
): string | undefined {
  if (!accountId) {
    return undefined
  }

  return data.accounts.find((account) => account.id === accountId)?.label
}

function getOverdueDays(dueDate: string, referenceDate: string): number {
  return Math.max(
    0,
    differenceInCalendarDays(parseISO(referenceDate), parseISO(dueDate)),
  )
}

export function getPriorityAttentionItems(
  data: PersonalFinanceData,
  limit = 3,
): readonly PlanningAttentionItem[] {
  const referenceDate = data.planningReferenceDate
  const items: PlanningAttentionItem[] = []

  data.planningReceivables
    .filter((item) => item.status === 'overdue')
    .forEach((item) => {
      items.push({
        id: item.id,
        title: item.counterparty,
        type: 'receivable',
        amount: getReceivableRemaining(item),
        dueDate: item.dueDate,
        status: item.status,
        overdueDays: getOverdueDays(item.dueDate, referenceDate),
      })
    })

  data.planningPayables
    .filter((item) => item.status === 'overdue')
    .forEach((item) => {
      items.push({
        id: item.id,
        title: item.counterparty,
        type: 'payable',
        amount: getPayableRemaining(item),
        dueDate: item.dueDate,
        status: item.status,
        overdueDays: getOverdueDays(item.dueDate, referenceDate),
      })
    })

  data.planningCommitments
    .filter((item) => item.status === 'overdue')
    .forEach((item) => {
      items.push({
        id: item.id,
        title: item.label,
        type: 'commitment',
        amount: item.amount,
        dueDate: item.dueDate,
        status: item.status,
        accountLabel: getAccountLabel(data, item.accountId),
        overdueDays: getOverdueDays(item.dueDate, referenceDate),
      })
    })

  return items
    .sort((first, second) => second.overdueDays - first.overdueDays)
    .slice(0, limit)
}

export function getAssistantAttentionItems(
  data: PersonalFinanceData,
): readonly PlanningAttentionItem[] {
  const referenceDate = data.planningReferenceDate
  const overdueReceivables = data.planningReceivables
    .filter((item) => item.status === 'overdue')
    .map((item) => ({
      id: item.id,
      title: item.counterparty,
      type: 'receivable' as const,
      amount: getReceivableRemaining(item),
      dueDate: item.dueDate,
      status: item.status,
      overdueDays: getOverdueDays(item.dueDate, referenceDate),
    }))
  const overduePayables = data.planningPayables
    .filter((item) => item.status === 'overdue')
    .map((item) => ({
      id: item.id,
      title: item.counterparty,
      type: 'payable' as const,
      amount: getPayableRemaining(item),
      dueDate: item.dueDate,
      status: item.status,
      overdueDays: getOverdueDays(item.dueDate, referenceDate),
    }))
  const overdueCommitments = data.planningCommitments
    .filter((item) => item.status === 'overdue')
    .map((item) => ({
      id: item.id,
      title: item.label,
      type: 'commitment' as const,
      amount: item.amount,
      dueDate: item.dueDate,
      status: item.status,
      accountLabel: getAccountLabel(data, item.accountId),
      overdueDays: getOverdueDays(item.dueDate, referenceDate),
    }))

  return [...overdueReceivables, ...overduePayables, ...overdueCommitments]
}

export function getItemsDueWithin7Days(
  data: PersonalFinanceData,
): readonly {
  id: string
  title: string
  type: PlanningItemType
  dueDate: string
  amount: number
}[] {
  const referenceDate = parseISO(data.planningReferenceDate)
  const horizon = addDays(referenceDate, 7)
  const items: {
    id: string
    title: string
    type: PlanningItemType
    dueDate: string
    amount: number
  }[] = []

  data.planningReceivables
    .filter((item) => isReceivableOutstanding(item.status))
    .forEach((item) => {
      const due = parseISO(item.dueDate)
      if (isWithinInterval(due, { start: referenceDate, end: horizon })) {
        items.push({
          id: item.id,
          title: item.counterparty,
          type: 'receivable',
          dueDate: item.dueDate,
          amount: getReceivableRemaining(item),
        })
      }
    })

  data.planningPayables
    .filter((item) => isPayableOutstanding(item.status))
    .forEach((item) => {
      const due = parseISO(item.dueDate)
      if (isWithinInterval(due, { start: referenceDate, end: horizon })) {
        items.push({
          id: item.id,
          title: item.counterparty,
          type: 'payable',
          dueDate: item.dueDate,
          amount: getPayableRemaining(item),
        })
      }
    })

  data.planningCommitments
    .filter((item) => isCommitmentOutstanding(item.status))
    .forEach((item) => {
      const due = parseISO(item.dueDate)
      if (isWithinInterval(due, { start: referenceDate, end: horizon })) {
        items.push({
          id: item.id,
          title: item.label,
          type: 'commitment',
          dueDate: item.dueDate,
          amount: item.amount,
        })
      }
    })

  return items.sort((first, second) =>
    first.dueDate.localeCompare(second.dueDate),
  )
}

function isInPeriod(date: string, period: PlanningPeriod, referenceDate: string): boolean {
  const parsed = parseISO(date)
  const reference = parseISO(referenceDate)

  if (period === 'this-month') {
    return isWithinInterval(parsed, {
      start: startOfMonth(reference),
      end: endOfMonth(reference),
    })
  }

  return isWithinInterval(parsed, {
    start: reference,
    end: addDays(reference, 30),
  })
}

function filterReceivablesByPeriod(
  items: readonly PlanningReceivable[],
  period: PlanningPeriod,
  referenceDate: string,
): readonly PlanningReceivable[] {
  return items.filter((item) => isInPeriod(item.dueDate, period, referenceDate))
}

function filterPayablesByPeriod(
  items: readonly PlanningPayable[],
  period: PlanningPeriod,
  referenceDate: string,
): readonly PlanningPayable[] {
  return items.filter((item) => isInPeriod(item.dueDate, period, referenceDate))
}

function filterCommitmentsByPeriod(
  items: readonly PlanningCommitment[],
  period: PlanningPeriod,
  referenceDate: string,
): readonly PlanningCommitment[] {
  return items.filter((item) => isInPeriod(item.dueDate, period, referenceDate))
}

const urgencyRank: Record<PlanningItemStatus, number> = {
  overdue: 0,
  'partially-received': 1,
  'partially-paid': 1,
  'due-soon': 2,
  pending: 3,
  upcoming: 3,
  received: 4,
  paid: 4,
}

function sortByUrgency<T extends { dueDate: string; status: PlanningItemStatus }>(
  items: readonly T[],
): readonly T[] {
  return [...items].sort((first, second) => {
    const urgencyDiff = urgencyRank[first.status] - urgencyRank[second.status]

    if (urgencyDiff !== 0) {
      return urgencyDiff
    }

    return first.dueDate.localeCompare(second.dueDate)
  })
}

export function getPlanningReceivables(
  data: PersonalFinanceData,
  period: PlanningPeriod = 'this-month',
): readonly PlanningReceivableView[] {
  const filtered = filterReceivablesByPeriod(
    data.planningReceivables,
    period,
    data.planningReferenceDate,
  )

  return sortByUrgency(
    filtered.map((item) => ({
      id: item.id,
      counterparty: item.counterparty,
      originalAmount: item.originalAmount,
      receivedAmount: item.receivedAmount,
      remainingAmount: getReceivableRemaining(item),
      dueDate: item.dueDate,
      status: item.status,
      note: item.note,
      progress: getReceivableProgress(item),
    })),
  )
}

export function getPlanningPayables(
  data: PersonalFinanceData,
  period: PlanningPeriod = 'this-month',
): readonly PlanningPayableView[] {
  const filtered = filterPayablesByPeriod(
    data.planningPayables,
    period,
    data.planningReferenceDate,
  )

  return sortByUrgency(
    filtered.map((item) => ({
      id: item.id,
      counterparty: item.counterparty,
      originalAmount: item.originalAmount,
      paidAmount: item.paidAmount,
      remainingAmount: getPayableRemaining(item),
      dueDate: item.dueDate,
      status: item.status,
      note: item.note,
      progress: getPayableProgress(item),
    })),
  )
}

export function getPlanningCommitments(
  data: PersonalFinanceData,
  period: PlanningPeriod = 'this-month',
): readonly PlanningCommitmentView[] {
  const filtered = filterCommitmentsByPeriod(
    data.planningCommitments,
    period,
    data.planningReferenceDate,
  )

  return sortByUrgency(
    filtered.map((item) => ({
      id: item.id,
      label: item.label,
      category: item.category,
      amount: item.amount,
      frequency: frequencyLabels[item.frequency],
      dueDate: item.dueDate,
      status: item.status,
      accountLabel: getAccountLabel(data, item.accountId),
    })),
  )
}

export function getPlanningItems(
  data: PersonalFinanceData,
  period: PlanningPeriod = 'this-month',
): PlanningItems {
  return {
    receivables: getPlanningReceivables(data, period),
    payables: getPlanningPayables(data, period),
    commitments: getPlanningCommitments(data, period),
  }
}

export function filterPlanningItems(
  items: PlanningItems,
  filter: PlanningFilter,
): PlanningItems {
  if (filter === 'all') {
    return items
  }

  if (filter === 'receivables') {
    return { ...items, payables: [], commitments: [] }
  }

  if (filter === 'payables') {
    return { ...items, receivables: [], commitments: [] }
  }

  if (filter === 'commitments') {
    return { ...items, receivables: [], payables: [] }
  }

  if (filter === 'upcoming') {
    return {
      receivables: items.receivables.filter((item) => item.status === 'pending'),
      payables: items.payables.filter((item) => item.status === 'pending'),
      commitments: items.commitments.filter(
        (item) => item.status === 'upcoming' || item.status === 'due-soon',
      ),
    }
  }

  if (filter === 'overdue') {
    return {
      receivables: items.receivables.filter((item) => item.status === 'overdue'),
      payables: items.payables.filter((item) => item.status === 'overdue'),
      commitments: items.commitments.filter((item) => item.status === 'overdue'),
    }
  }

  if (filter === 'completed') {
    return {
      receivables: items.receivables.filter((item) =>
        isReceivableCompleted(item.status),
      ),
      payables: items.payables.filter((item) =>
        isPayableCompleted(item.status),
      ),
      commitments: items.commitments.filter((item) =>
        isCommitmentCompleted(item.status),
      ),
    }
  }

  return items
}

export function hasPlanningItems(items: PlanningItems): boolean {
  return (
    items.receivables.length > 0 ||
    items.payables.length > 0 ||
    items.commitments.length > 0
  )
}
