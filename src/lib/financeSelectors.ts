import { differenceInCalendarDays, parseISO } from 'date-fns'

import type {
  Account,
  Commitment,
  FinanceTransaction,
  FinancialPosition,
  PersonalFinanceData,
} from '../models/finance'

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

export function getOutstandingReceivables(data: PersonalFinanceData): number {
  return sumAmounts(data.receivables, (item) => item.remainingAmount)
}

export function getOutstandingPayables(data: PersonalFinanceData): number {
  return sumAmounts(data.payables, (item) => item.remainingAmount)
}

export function getRemainingCommitments(data: PersonalFinanceData): number {
  return sumAmounts(
    data.commitments.filter((commitment) => commitment.status !== 'paid'),
    (commitment) => commitment.amount,
  )
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

export function getNextCommitment(
  data: PersonalFinanceData,
): Commitment | undefined {
  return data.commitments
    .filter((commitment) => commitment.status !== 'paid')
    .sort((first, second) => first.dueDate.localeCompare(second.dueDate))[0]
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
