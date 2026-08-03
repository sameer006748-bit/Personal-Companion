// Unified Activity read-model.
//
// One normalized timeline drives rows, filters, period selection, search,
// sorting, summary totals and empty states. Everything here is read-only
// projection over the local finance and planning records already in the store;
// no record is mutated, merged or synthesised.
//
// Date handling rule: calendar days are compared as plain `yyyy-MM-dd` strings,
// which sort chronologically, so no UTC shift can occur during filtering. Stored
// ISO timestamps (createdAt/updatedAt) are converted to the user's *local*
// calendar day before they enter the model.

import { endOfMonth, format, parseISO } from 'date-fns'

import { getCategoryLabel } from '../models/finance'
import type {
  AccountId,
  FinanceTransaction,
  PersonalFinanceData,
  PlanningCommitment,
  PlanningPayable,
  PlanningReceivable,
  TransactionCategory,
} from '../models/finance'

// --- Local calendar day helpers ---------------------------------------------

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function formatLocalDay(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function getLocalTodayIso(now: Date = new Date()): string {
  return formatLocalDay(now)
}

// Accepts a date-only value (used verbatim) or a stored ISO timestamp (resolved
// to the local calendar day it happened on). Anything else yields undefined.
export function toCalendarDay(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  if (DATE_ONLY_PATTERN.test(value)) {
    return value
  }

  const parsed = new Date(value)

  return Number.isNaN(parsed.getTime()) ? undefined : formatLocalDay(parsed)
}

// --- Period model ------------------------------------------------------------

export type ActivityPeriod = 'today' | 'this-month' | 'custom'

export const DEFAULT_ACTIVITY_PERIOD: ActivityPeriod = 'this-month'

export interface ActivityDateRange {
  from: string
  to: string
}

export interface ActivityCustomRange {
  from: string
  to: string
}

export function getMonthRange(day: string): ActivityDateRange {
  return {
    from: `${day.slice(0, 7)}-01`,
    to: formatLocalDay(endOfMonth(parseISO(day))),
  }
}

export function validateActivityRange(
  from: string,
  to: string,
): string | undefined {
  if (!DATE_ONLY_PATTERN.test(from) || !DATE_ONLY_PATTERN.test(to)) {
    return 'Choose a valid From and To date.'
  }

  return from > to ? 'From date cannot be after the To date.' : undefined
}

// Resolves the active period into an inclusive local-day range. An invalid or
// incomplete custom range falls back to the current month so the timeline never
// renders against a nonsensical window.
export function resolveActivityRange(
  period: ActivityPeriod,
  today: string,
  custom?: ActivityCustomRange,
): ActivityDateRange {
  if (period === 'today') {
    return { from: today, to: today }
  }

  if (period === 'custom' && custom && !validateActivityRange(custom.from, custom.to)) {
    return { from: custom.from, to: custom.to }
  }

  return getMonthRange(today)
}

export function isDayInRange(day: string, range: ActivityDateRange): boolean {
  return day >= range.from && day <= range.to
}

export function formatActivityRange(range: ActivityDateRange): string {
  const from = parseISO(range.from)
  const to = parseISO(range.to)

  return range.from === range.to
    ? format(from, 'd MMM yyyy')
    : `${format(from, 'd MMM')} – ${format(to, 'd MMM yyyy')}`
}

// --- Normalized timeline item ------------------------------------------------

export type ActivityEventKind =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'receivable-created'
  | 'receivable-settled'
  | 'payable-created'
  | 'payable-settled'
  | 'commitment-upcoming'
  | 'commitment-settled'

export type ActivitySourceKind =
  | 'transaction'
  | 'receivable'
  | 'payable'
  | 'commitment'

export type ActivityMoneyDirection = 'in' | 'out' | 'neutral'

export type ActivityItemStatus =
  | 'paid'
  | 'received'
  | 'pending'
  | 'partially-received'
  | 'partially-paid'
  | 'overdue'
  | 'upcoming'
  | 'due-soon'
  | 'transfer'

export interface ActivityItem {
  /** Stable across renders and unique per event. */
  id: string
  kind: ActivityEventKind
  sourceKind: ActivitySourceKind
  /** Id of the underlying finance or planning record. */
  sourceId: string
  /** Day the event is filed under: drives sorting and grouping. */
  eventDate: string
  /** Day the money is expected to matter (due date for planning rows). */
  effectiveDate: string
  createdDate?: string
  dueDate?: string
  /** Every day that can place this item inside a selected period. */
  periodDates: readonly string[]
  title: string
  subtitle: string
  /** Integer PKR. Outstanding balance for unsettled planning rows. */
  amount: number
  direction: ActivityMoneyDirection
  status: ActivityItemStatus
  statusLabel: string
  category: TransactionCategory
  accountLabel?: string
  counterparty?: string
  note?: string
  searchText: string
  /** True only for ledger events that actually moved an account balance. */
  isCashEvent: boolean
  isOutstanding: boolean
  outstandingAmount: number
  isUpcoming: boolean
  isOverdue: boolean
}

export const ACTIVITY_STATUS_LABELS: Record<ActivityItemStatus, string> = {
  paid: 'Paid',
  received: 'Received',
  pending: 'Pending',
  'partially-received': 'Partially Received',
  'partially-paid': 'Partially Paid',
  overdue: 'Overdue',
  upcoming: 'Upcoming',
  'due-soon': 'Due Soon',
  transfer: 'Transfer',
}

export const ACTIVITY_KIND_LABELS: Record<ActivityEventKind, string> = {
  income: 'Money In',
  expense: 'Money Out',
  transfer: 'Transfer',
  'receivable-created': 'Receivable recorded',
  'receivable-settled': 'Receivable received',
  'payable-created': 'Payable recorded',
  'payable-settled': 'Payable paid',
  'commitment-upcoming': 'Commitment due',
  'commitment-settled': 'Commitment paid',
}

// --- Normalization -----------------------------------------------------------

function buildSearchText(parts: readonly (string | undefined)[]): string {
  return parts
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .toLocaleLowerCase()
}

function uniqueDays(days: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(days.filter((day): day is string => Boolean(day)))]
}

function getAccountLabels(
  data: PersonalFinanceData,
): ReadonlyMap<AccountId, string> {
  return new Map(data.accounts.map((account) => [account.id, account.label]))
}

function transactionDirection(
  transaction: FinanceTransaction,
): ActivityMoneyDirection {
  if (transaction.direction === 'income' || transaction.direction === 'receivable') {
    return 'in'
  }

  return transaction.direction === 'transfer' ? 'neutral' : 'out'
}

function transactionKind(transaction: FinanceTransaction): ActivityEventKind {
  if (transaction.direction === 'income') return 'income'
  if (transaction.direction === 'transfer') return 'transfer'
  if (transaction.direction === 'receivable') return 'receivable-created'
  if (transaction.direction === 'payable') return 'payable-created'
  return 'expense'
}

function transactionSourceKind(
  transaction: FinanceTransaction,
): ActivitySourceKind {
  if (transaction.direction === 'receivable') return 'receivable'
  if (transaction.direction === 'payable') return 'payable'
  return 'transaction'
}

function transactionSubtitle(
  transaction: FinanceTransaction,
  accounts: ReadonlyMap<AccountId, string>,
  accountLabel: string | undefined,
): string {
  const kindLabel = ACTIVITY_KIND_LABELS[transactionKind(transaction)]
  const destination = transaction.destinationAccountId
    ? accounts.get(transaction.destinationAccountId)
    : undefined
  const route =
    transaction.direction === 'transfer' && destination
      ? `${accountLabel ?? 'Account'} → ${destination}`
      : accountLabel

  return [transaction.counterparty, kindLabel, route]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
}

function toTransactionItem(
  transaction: FinanceTransaction,
  accounts: ReadonlyMap<AccountId, string>,
  today: string,
): ActivityItem {
  const day = toCalendarDay(transaction.date) ?? transaction.date
  const accountLabel = accounts.get(transaction.accountId)
  const kind = transactionKind(transaction)
  const sourceKind = transactionSourceKind(transaction)
  const status = transaction.status as ActivityItemStatus
  const isSettled = status === 'paid' || status === 'received' || status === 'transfer'
  // Only real ledger movement counts as cash flow. Legacy receivable/payable
  // directions describe an obligation, not a completed payment.
  const isCashEvent = sourceKind === 'transaction'

  return {
    id: `transaction:${transaction.id}`,
    kind,
    sourceKind,
    sourceId: transaction.id,
    eventDate: day,
    effectiveDate: day,
    periodDates: [day],
    title: transaction.title,
    subtitle: transactionSubtitle(transaction, accounts, accountLabel),
    amount: transaction.amount,
    direction: transactionDirection(transaction),
    status,
    statusLabel: ACTIVITY_STATUS_LABELS[status] ?? status,
    category: transaction.category,
    ...(accountLabel ? { accountLabel } : {}),
    ...(transaction.counterparty ? { counterparty: transaction.counterparty } : {}),
    ...(transaction.note ? { note: transaction.note } : {}),
    searchText: buildSearchText([
      transaction.title,
      transaction.counterparty,
      transaction.note,
      accountLabel,
      ACTIVITY_KIND_LABELS[kind],
      ACTIVITY_STATUS_LABELS[status],
      getCategoryLabel(transaction.category),
    ]),
    isCashEvent,
    isOutstanding: !isSettled && sourceKind !== 'transaction',
    outstandingAmount: !isSettled && sourceKind !== 'transaction' ? transaction.amount : 0,
    isUpcoming: !isSettled && day >= today,
    isOverdue: !isSettled && day < today,
  }
}

function settlementSubtitle(
  counterparty: string,
  kind: ActivityEventKind,
  accountLabel: string | undefined,
): string {
  return [counterparty, ACTIVITY_KIND_LABELS[kind], accountLabel]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
}

// Expressed as a percentage on purpose: a raw PKR figure here would bypass
// privacy mode, which masks every amount rendered through PrivateAmount.
function progressNote(
  settled: number,
  original: number,
  verb: 'received' | 'paid',
): string | undefined {
  if (settled <= 0 || settled >= original || original <= 0) {
    return undefined
  }

  return `${Math.min(100, Math.round((settled / original) * 100))}% ${verb}`
}

function toReceivableItems(
  record: PlanningReceivable,
  accounts: ReadonlyMap<AccountId, string>,
  today: string,
): readonly ActivityItem[] {
  const remaining = Math.max(0, record.originalAmount - record.receivedAmount)
  const isSettled = record.status === 'received'
  const createdDay = toCalendarDay(record.createdAt)
  const accountLabel = record.accountId ? accounts.get(record.accountId) : undefined
  const progress = progressNote(record.receivedAmount, record.originalAmount, 'received')
  const search = buildSearchText([
    record.counterparty,
    record.note,
    accountLabel,
    'receivable',
    ACTIVITY_STATUS_LABELS[record.status],
  ])
  const items: ActivityItem[] = []

  // The record-created event. Anchored on the day it was recorded, but also
  // reachable through its due date so an outstanding item never disappears from
  // the period that it is due in.
  items.push({
    id: `receivable-created:${record.id}`,
    kind: 'receivable-created',
    sourceKind: 'receivable',
    sourceId: record.id,
    eventDate: createdDay ?? record.dueDate,
    effectiveDate: record.dueDate,
    ...(createdDay ? { createdDate: createdDay } : {}),
    dueDate: record.dueDate,
    periodDates: uniqueDays([createdDay, record.dueDate]),
    title: record.counterparty,
    subtitle: [
      settlementSubtitle(record.counterparty, 'receivable-created', accountLabel),
      progress,
    ]
      .filter((part): part is string => Boolean(part))
      .join(' · '),
    amount: isSettled ? record.originalAmount : remaining,
    direction: 'in',
    status: record.status,
    statusLabel: ACTIVITY_STATUS_LABELS[record.status],
    category: 'loan',
    ...(accountLabel ? { accountLabel } : {}),
    counterparty: record.counterparty,
    ...(record.note ? { note: record.note } : {}),
    searchText: search,
    isCashEvent: false,
    isOutstanding: !isSettled,
    outstandingAmount: isSettled ? 0 : remaining,
    isUpcoming: !isSettled && record.dueDate >= today,
    isOverdue: !isSettled && record.dueDate < today,
  })

  // Settlement. The domain stores no receipt log, so the record's updatedAt is
  // the only signal for when it was fully received.
  const settledDay = isSettled ? toCalendarDay(record.updatedAt) : undefined

  if (settledDay) {
    items.push({
      id: `receivable-settled:${record.id}`,
      kind: 'receivable-settled',
      sourceKind: 'receivable',
      sourceId: record.id,
      eventDate: settledDay,
      effectiveDate: settledDay,
      ...(createdDay ? { createdDate: createdDay } : {}),
      dueDate: record.dueDate,
      periodDates: [settledDay],
      title: record.counterparty,
      subtitle: settlementSubtitle(
        record.counterparty,
        'receivable-settled',
        accountLabel,
      ),
      amount: record.originalAmount,
      direction: 'in',
      status: 'received',
      statusLabel: ACTIVITY_STATUS_LABELS.received,
      category: 'loan',
      ...(accountLabel ? { accountLabel } : {}),
      counterparty: record.counterparty,
      ...(record.note ? { note: record.note } : {}),
      searchText: search,
      isCashEvent: false,
      isOutstanding: false,
      outstandingAmount: 0,
      isUpcoming: false,
      isOverdue: false,
    })
  }

  return items
}

function toPayableItems(
  record: PlanningPayable,
  accounts: ReadonlyMap<AccountId, string>,
  today: string,
): readonly ActivityItem[] {
  const remaining = Math.max(0, record.originalAmount - record.paidAmount)
  const isSettled = record.status === 'paid'
  const createdDay = toCalendarDay(record.createdAt)
  const accountLabel = record.accountId ? accounts.get(record.accountId) : undefined
  const progress = progressNote(record.paidAmount, record.originalAmount, 'paid')
  const search = buildSearchText([
    record.counterparty,
    record.note,
    accountLabel,
    'payable',
    ACTIVITY_STATUS_LABELS[record.status],
  ])
  const items: ActivityItem[] = []

  items.push({
    id: `payable-created:${record.id}`,
    kind: 'payable-created',
    sourceKind: 'payable',
    sourceId: record.id,
    eventDate: createdDay ?? record.dueDate,
    effectiveDate: record.dueDate,
    ...(createdDay ? { createdDate: createdDay } : {}),
    dueDate: record.dueDate,
    periodDates: uniqueDays([createdDay, record.dueDate]),
    title: record.counterparty,
    subtitle: [
      settlementSubtitle(record.counterparty, 'payable-created', accountLabel),
      progress,
    ]
      .filter((part): part is string => Boolean(part))
      .join(' · '),
    amount: isSettled ? record.originalAmount : remaining,
    direction: 'out',
    status: record.status,
    statusLabel: ACTIVITY_STATUS_LABELS[record.status],
    category: 'loan',
    ...(accountLabel ? { accountLabel } : {}),
    counterparty: record.counterparty,
    ...(record.note ? { note: record.note } : {}),
    searchText: search,
    isCashEvent: false,
    isOutstanding: !isSettled,
    outstandingAmount: isSettled ? 0 : remaining,
    isUpcoming: !isSettled && record.dueDate >= today,
    isOverdue: !isSettled && record.dueDate < today,
  })

  const settledDay = isSettled ? toCalendarDay(record.updatedAt) : undefined

  if (settledDay) {
    items.push({
      id: `payable-settled:${record.id}`,
      kind: 'payable-settled',
      sourceKind: 'payable',
      sourceId: record.id,
      eventDate: settledDay,
      effectiveDate: settledDay,
      ...(createdDay ? { createdDate: createdDay } : {}),
      dueDate: record.dueDate,
      periodDates: [settledDay],
      title: record.counterparty,
      subtitle: settlementSubtitle(record.counterparty, 'payable-settled', accountLabel),
      amount: record.originalAmount,
      direction: 'out',
      status: 'paid',
      statusLabel: ACTIVITY_STATUS_LABELS.paid,
      category: 'loan',
      ...(accountLabel ? { accountLabel } : {}),
      counterparty: record.counterparty,
      ...(record.note ? { note: record.note } : {}),
      searchText: search,
      isCashEvent: false,
      isOutstanding: false,
      outstandingAmount: 0,
      isUpcoming: false,
      isOverdue: false,
    })
  }

  return items
}

function toCommitmentItems(
  record: PlanningCommitment,
  accounts: ReadonlyMap<AccountId, string>,
  today: string,
): readonly ActivityItem[] {
  const createdDay = toCalendarDay(record.createdAt)
  const accountLabel = record.accountId ? accounts.get(record.accountId) : undefined
  const isSettled = record.status === 'paid'
  const search = buildSearchText([
    record.label,
    record.note,
    accountLabel,
    'commitment',
    ACTIVITY_STATUS_LABELS[record.status],
    getCategoryLabel(record.category),
  ])
  const items: ActivityItem[] = []

  // A commitment's due date rolls forward on every payment, so the live due
  // date — not the original creation day — is the meaningful timeline anchor.
  if (!isSettled) {
    items.push({
      id: `commitment-upcoming:${record.id}`,
      kind: 'commitment-upcoming',
      sourceKind: 'commitment',
      sourceId: record.id,
      eventDate: record.dueDate,
      effectiveDate: record.dueDate,
      ...(createdDay ? { createdDate: createdDay } : {}),
      dueDate: record.dueDate,
      periodDates: uniqueDays([createdDay, record.dueDate]),
      title: record.label,
      subtitle: [ACTIVITY_KIND_LABELS['commitment-upcoming'], accountLabel]
        .filter((part): part is string => Boolean(part))
        .join(' · '),
      amount: record.amount,
      direction: 'out',
      status: record.status,
      statusLabel: ACTIVITY_STATUS_LABELS[record.status],
      category: record.category,
      ...(accountLabel ? { accountLabel } : {}),
      ...(record.note ? { note: record.note } : {}),
      searchText: search,
      isCashEvent: false,
      isOutstanding: true,
      outstandingAmount: record.amount,
      isUpcoming: record.dueDate >= today,
      isOverdue: record.dueDate < today,
    })
  }

  // Only the most recent settlement is retained by the domain (lastPaidDate),
  // so recurring commitments contribute at most one settled row.
  const settledDay =
    toCalendarDay(record.lastPaidDate) ??
    (isSettled ? toCalendarDay(record.updatedAt) : undefined)

  if (settledDay) {
    items.push({
      id: `commitment-settled:${record.id}`,
      kind: 'commitment-settled',
      sourceKind: 'commitment',
      sourceId: record.id,
      eventDate: settledDay,
      effectiveDate: settledDay,
      ...(createdDay ? { createdDate: createdDay } : {}),
      periodDates: [settledDay],
      title: record.label,
      subtitle: [ACTIVITY_KIND_LABELS['commitment-settled'], accountLabel]
        .filter((part): part is string => Boolean(part))
        .join(' · '),
      amount: record.amount,
      direction: 'out',
      status: 'paid',
      statusLabel: ACTIVITY_STATUS_LABELS.paid,
      category: record.category,
      ...(accountLabel ? { accountLabel } : {}),
      ...(record.note ? { note: record.note } : {}),
      searchText: search,
      isCashEvent: false,
      isOutstanding: false,
      outstandingAmount: 0,
      isUpcoming: false,
      isOverdue: false,
    })
  }

  return items
}

// The single source of truth for the Activity page. Rows, filters, search and
// every summary total are derived from this list and nothing else.
export function getActivityItems(
  data: PersonalFinanceData,
  today: string = data.activityReferenceDate,
): readonly ActivityItem[] {
  const accounts = getAccountLabels(data)
  const items: ActivityItem[] = []

  data.transactions.forEach((transaction) => {
    items.push(toTransactionItem(transaction, accounts, today))
  })

  data.planningReceivables.forEach((record) => {
    items.push(...toReceivableItems(record, accounts, today))
  })

  data.planningPayables.forEach((record) => {
    items.push(...toPayableItems(record, accounts, today))
  })

  data.planningCommitments.forEach((record) => {
    items.push(...toCommitmentItems(record, accounts, today))
  })

  return items
}

// --- Period, filter, search, sort -------------------------------------------

export type ActivityFilter =
  | 'all'
  | 'income'
  | 'expense'
  | 'transfer'
  | 'receivable'
  | 'payable'
  | 'commitment'
  | 'upcoming'
  | 'overdue'

export type ActivitySort = 'newest' | 'oldest'

export function filterActivityByRange(
  items: readonly ActivityItem[],
  range: ActivityDateRange,
): readonly ActivityItem[] {
  return items.filter((item) =>
    item.periodDates.some((day) => isDayInRange(day, range)),
  )
}

export function matchesActivityFilter(
  item: ActivityItem,
  filter: ActivityFilter,
): boolean {
  if (filter === 'all') return true
  if (filter === 'upcoming') return item.isUpcoming
  if (filter === 'overdue') return item.isOverdue
  if (filter === 'income') return item.kind === 'income'
  if (filter === 'expense') return item.kind === 'expense'
  if (filter === 'transfer') return item.kind === 'transfer'

  return item.sourceKind === filter
}

export function matchesActivitySearch(item: ActivityItem, search: string): boolean {
  return search.length === 0 || item.searchText.includes(search)
}

export function sortActivityItems(
  items: readonly ActivityItem[],
  sort: ActivitySort = 'newest',
): readonly ActivityItem[] {
  return [...items].sort((first, second) => {
    const byDate = first.eventDate.localeCompare(second.eventDate)
    const order = byDate === 0 ? first.id.localeCompare(second.id) : byDate

    return sort === 'newest' ? -order : order
  })
}

export interface ActivityQuery {
  period?: ActivityPeriod
  custom?: ActivityCustomRange | undefined
  filter?: ActivityFilter
  sort?: ActivitySort
  search?: string
}

export interface ActivityView {
  /** Period-scoped rows before category and search narrowing. */
  periodItems: readonly ActivityItem[]
  /** Rows actually rendered. */
  items: readonly ActivityItem[]
  groups: readonly ActivityTimelineGroup[]
  summary: ActivitySummary
  range: ActivityDateRange
}

// --- Grouping ----------------------------------------------------------------

export interface ActivityTimelineGroup {
  id: string
  label: string
  items: readonly ActivityItem[]
}

const WEEK_DAYS = 7

function daysBetween(from: string, to: string): number {
  return Math.round(
    (parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000,
  )
}

export function getActivityGroupLabel(day: string, today: string): string {
  if (day > today) return 'Upcoming'
  if (day === today) return 'Today'

  const difference = daysBetween(day, today)

  if (difference === 1) return 'Yesterday'
  if (difference <= WEEK_DAYS) return 'Earlier This Week'
  if (day.slice(0, 7) === today.slice(0, 7)) return 'Earlier This Month'

  return format(parseISO(day), 'MMMM yyyy')
}

export function groupActivityItems(
  items: readonly ActivityItem[],
  today: string,
): readonly ActivityTimelineGroup[] {
  const groups = new Map<string, ActivityItem[]>()

  items.forEach((item) => {
    const label = getActivityGroupLabel(item.eventDate, today)
    const bucket = groups.get(label)

    if (bucket) {
      bucket.push(item)
      return
    }

    groups.set(label, [item])
  })

  return [...groups.entries()].map(([label, bucket]) => ({
    id: label.toLocaleLowerCase().replaceAll(' ', '-'),
    label,
    items: bucket,
  }))
}

// --- Summary -----------------------------------------------------------------

export interface ActivitySummary {
  moneyIn: number
  moneyOut: number
  receivables: number
  payables: number
}

function sumBy(
  items: readonly ActivityItem[],
  amount: (item: ActivityItem) => number,
): number {
  return items.reduce((total, item) => total + amount(item), 0)
}

// Summary follows the selected period only — category chips and search narrow
// the list, never the totals. Because both derive from the same period-scoped
// item list, a card can never show a total that the matching filter cannot
// account for.
export function getActivitySummary(
  periodItems: readonly ActivityItem[],
): ActivitySummary {
  return {
    // Actual ledger movement only. An outstanding receivable is not money in
    // and an outstanding payable is not money out.
    moneyIn: sumBy(periodItems, (item) =>
      item.isCashEvent && item.direction === 'in' ? item.amount : 0,
    ),
    moneyOut: sumBy(periodItems, (item) =>
      item.isCashEvent && item.direction === 'out' ? item.amount : 0,
    ),
    // Settled rows carry an outstanding amount of zero, so an original record
    // and its settlement can never be counted twice.
    receivables: sumBy(periodItems, (item) =>
      item.sourceKind === 'receivable' ? item.outstandingAmount : 0,
    ),
    payables: sumBy(periodItems, (item) =>
      item.sourceKind === 'payable' ? item.outstandingAmount : 0,
    ),
  }
}

// --- Composed view -----------------------------------------------------------

export function getActivityView(
  data: PersonalFinanceData,
  query: ActivityQuery = {},
): ActivityView {
  const today = data.activityReferenceDate
  const range = resolveActivityRange(
    query.period ?? DEFAULT_ACTIVITY_PERIOD,
    today,
    query.custom,
  )
  const search = query.search?.trim().toLocaleLowerCase() ?? ''
  const periodItems = filterActivityByRange(getActivityItems(data, today), range)
  const items = sortActivityItems(
    periodItems
      .filter((item) => matchesActivityFilter(item, query.filter ?? 'all'))
      .filter((item) => matchesActivitySearch(item, search)),
    query.sort ?? 'newest',
  )

  return {
    periodItems,
    items,
    groups: groupActivityItems(items, today),
    summary: getActivitySummary(periodItems),
    range,
  }
}
