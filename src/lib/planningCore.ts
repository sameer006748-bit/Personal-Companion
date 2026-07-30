// Authoritative local Planning Data Core.
// Owns persistence, validation, atomic operations, and every status derivation
// for receivables, payables, and recurring commitments. No React, no fixtures.

import {
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  format,
  isValid,
  parseISO,
} from 'date-fns'

import type {
  AccountId,
  PayableStatus,
  PlanningCommitment,
  PlanningCommitmentStatus,
  PlanningPayable,
  PlanningReceivable,
  ReceivableStatus,
} from '../models/finance'
import type {
  CommitmentInput,
  CommitmentRecord,
  PayableInput,
  PayableRecord,
  PlanningFrequency,
  PlanningState,
  ReceivableInput,
  ReceivableRecord,
} from '../models/planning'

export const PLANNING_STORAGE_KEY = 'personal-companion-planning'
const STORAGE_KEY = PLANNING_STORAGE_KEY
const MAX_AMOUNT = 100000000
const MAX_NOTE_LENGTH = 200
const DUE_SOON_DAYS = 3

export interface PlanningResult {
  state: PlanningState
  error?: string
}

export interface PlanningContext {
  today: string
  activeAccountIds: readonly AccountId[]
}

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function now(): string {
  return new Date().toISOString()
}

function normaliseName(value: string): string {
  return value.trim().replaceAll(/\s+/g, ' ')
}

function optionalNote(value: string | undefined): { note?: string } {
  const note = value?.trim()
  return note ? { note } : {}
}

function optionalAccount(value: AccountId | undefined): { accountId?: AccountId } {
  const accountId = value?.trim()
  return accountId ? { accountId } : {}
}

export function emptyPlanningState(): PlanningState {
  return { version: 1, receivables: [], payables: [], commitments: [] }
}

// --- Runtime type guards -----------------------------------------------------

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    isValid(parseISO(value))
  )
}

function isAmount(value: unknown, minimum: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= MAX_AMOUNT
  )
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

export function isPlanningFrequency(value: unknown): value is PlanningFrequency {
  return (
    value === 'weekly' ||
    value === 'monthly' ||
    value === 'quarterly' ||
    value === 'yearly' ||
    value === 'one-time'
  )
}

function isReceivableRecord(value: unknown): value is ReceivableRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.counterparty === 'string' &&
    isAmount(record.originalAmount, 1) &&
    isAmount(record.receivedAmount, 0) &&
    isIsoDate(record.dueDate) &&
    isOptionalString(record.note) &&
    isOptionalString(record.accountId) &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string'
  )
}

function isPayableRecord(value: unknown): value is PayableRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.counterparty === 'string' &&
    isAmount(record.originalAmount, 1) &&
    isAmount(record.paidAmount, 0) &&
    isIsoDate(record.dueDate) &&
    isOptionalString(record.note) &&
    isOptionalString(record.accountId) &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string'
  )
}

function isCommitmentRecord(value: unknown): value is CommitmentRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.label === 'string' &&
    typeof record.category === 'string' &&
    isAmount(record.amount, 1) &&
    isPlanningFrequency(record.frequency) &&
    isIsoDate(record.dueDate) &&
    isOptionalString(record.note) &&
    isOptionalString(record.accountId) &&
    typeof record.isSettled === 'boolean' &&
    typeof record.isArchived === 'boolean' &&
    isOptionalString(record.lastPaidDate) &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string'
  )
}

export function isPlanningState(value: unknown): value is PlanningState {
  if (typeof value !== 'object' || value === null) return false
  const state = value as Record<string, unknown>
  return (
    state.version === 1 &&
    Array.isArray(state.receivables) &&
    state.receivables.every(isReceivableRecord) &&
    Array.isArray(state.payables) &&
    state.payables.every(isPayableRecord) &&
    Array.isArray(state.commitments) &&
    state.commitments.every(isCommitmentRecord)
  )
}

// --- Persistence -------------------------------------------------------------

// Reads persisted planning data only. Corrupted or unknown data falls back to an
// empty state so a stored fixture can never be injected into a real account.
export function loadPlanningState(): PlanningState {
  if (typeof window === 'undefined') {
    return emptyPlanningState()
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (isPlanningState(parsed)) {
        return parsed
      }
    }
  } catch {
    // Unreadable local data falls back to an empty planning state.
  }

  return emptyPlanningState()
}

export function savePlanningState(state: PlanningState): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // The active session stays usable when storage is unavailable.
  }
}

// --- Status derivation -------------------------------------------------------

export function getReceivableRemainingAmount(record: ReceivableRecord): number {
  return Math.max(0, record.originalAmount - record.receivedAmount)
}

export function getPayableRemainingAmount(record: PayableRecord): number {
  return Math.max(0, record.originalAmount - record.paidAmount)
}

export function getReceivableStatus(
  record: ReceivableRecord,
  today: string,
): ReceivableStatus {
  if (record.receivedAmount >= record.originalAmount) return 'received'
  if (record.dueDate < today) return 'overdue'
  if (record.receivedAmount > 0) return 'partially-received'
  return 'pending'
}

export function getPayableStatus(
  record: PayableRecord,
  today: string,
): PayableStatus {
  if (record.paidAmount >= record.originalAmount) return 'paid'
  if (record.dueDate < today) return 'overdue'
  if (record.paidAmount > 0) return 'partially-paid'
  return 'pending'
}

export function getCommitmentStatus(
  record: CommitmentRecord,
  today: string,
): PlanningCommitmentStatus {
  if (record.isSettled) return 'paid'
  if (record.dueDate < today) return 'overdue'

  const daysUntilDue = differenceInCalendarDays(
    parseISO(record.dueDate),
    parseISO(today),
  )

  return daysUntilDue <= DUE_SOON_DAYS ? 'due-soon' : 'upcoming'
}

export function getNextDueDate(
  dueDate: string,
  frequency: PlanningFrequency,
): string {
  const base = parseISO(dueDate)

  if (frequency === 'weekly') return format(addWeeks(base, 1), 'yyyy-MM-dd')
  if (frequency === 'monthly') return format(addMonths(base, 1), 'yyyy-MM-dd')
  if (frequency === 'quarterly') return format(addMonths(base, 3), 'yyyy-MM-dd')
  if (frequency === 'yearly') return format(addYears(base, 1), 'yyyy-MM-dd')

  return dueDate
}

// --- Lookups -----------------------------------------------------------------

export function findReceivable(
  state: PlanningState,
  id: string,
): ReceivableRecord | undefined {
  return state.receivables.find((record) => record.id === id)
}

export function findPayable(
  state: PlanningState,
  id: string,
): PayableRecord | undefined {
  return state.payables.find((record) => record.id === id)
}

export function findCommitment(
  state: PlanningState,
  id: string,
): CommitmentRecord | undefined {
  return state.commitments.find((record) => record.id === id)
}

export function getActiveCommitments(
  state: PlanningState,
): readonly CommitmentRecord[] {
  return state.commitments.filter((record) => !record.isArchived)
}

export function getArchivedCommitments(
  state: PlanningState,
): readonly CommitmentRecord[] {
  return state.commitments.filter((record) => record.isArchived)
}

// --- View projection ---------------------------------------------------------

export function toPlanningReceivables(
  state: PlanningState,
  today: string,
): readonly PlanningReceivable[] {
  return state.receivables.map((record) => ({
    id: record.id,
    counterparty: record.counterparty,
    originalAmount: record.originalAmount,
    receivedAmount: record.receivedAmount,
    dueDate: record.dueDate,
    status: getReceivableStatus(record, today),
    ...(record.note ? { note: record.note } : {}),
  }))
}

export function toPlanningPayables(
  state: PlanningState,
  today: string,
): readonly PlanningPayable[] {
  return state.payables.map((record) => ({
    id: record.id,
    counterparty: record.counterparty,
    originalAmount: record.originalAmount,
    paidAmount: record.paidAmount,
    dueDate: record.dueDate,
    status: getPayableStatus(record, today),
    ...(record.note ? { note: record.note } : {}),
  }))
}

export function toPlanningCommitments(
  state: PlanningState,
  today: string,
): readonly PlanningCommitment[] {
  return getActiveCommitments(state).map((record) => ({
    id: record.id,
    label: record.label,
    category: record.category,
    amount: record.amount,
    frequency: record.frequency,
    dueDate: record.dueDate,
    status: getCommitmentStatus(record, today),
    ...(record.accountId ? { accountId: record.accountId } : {}),
  }))
}

// --- Validation --------------------------------------------------------------

function validateAccountReference(
  context: PlanningContext,
  accountId: AccountId | undefined,
): string | undefined {
  const trimmed = accountId?.trim()
  if (!trimmed) return undefined
  return context.activeAccountIds.includes(trimmed)
    ? undefined
    : 'Choose an active account.'
}

function validateNote(note: string | undefined): string | undefined {
  return (note?.trim().length ?? 0) > MAX_NOTE_LENGTH
    ? 'Keep the note under 200 characters.'
    : undefined
}

function validateReceivableInput(
  input: ReceivableInput,
  context: PlanningContext,
): string | undefined {
  if (!normaliseName(input.counterparty)) return 'Enter who owes you.'
  if (!isAmount(input.originalAmount, 1)) {
    return 'Enter a whole PKR amount from 1 to 100,000,000.'
  }
  const received = input.receivedAmount ?? 0
  if (!isAmount(received, 0)) {
    return 'Already received must be a whole PKR amount of zero or more.'
  }
  if (received > input.originalAmount) {
    return 'Already received cannot be more than the total amount.'
  }
  if (!isIsoDate(input.dueDate)) return 'Choose a valid due date.'
  return validateNote(input.note) ?? validateAccountReference(context, input.accountId)
}

function validatePayableInput(
  input: PayableInput,
  context: PlanningContext,
): string | undefined {
  if (!normaliseName(input.counterparty)) return 'Enter who you need to pay.'
  if (!isAmount(input.originalAmount, 1)) {
    return 'Enter a whole PKR amount from 1 to 100,000,000.'
  }
  const paid = input.paidAmount ?? 0
  if (!isAmount(paid, 0)) {
    return 'Already paid must be a whole PKR amount of zero or more.'
  }
  if (paid > input.originalAmount) {
    return 'Already paid cannot be more than the total amount.'
  }
  if (!isIsoDate(input.dueDate)) return 'Choose a valid due date.'
  return validateNote(input.note) ?? validateAccountReference(context, input.accountId)
}

function validateCommitmentInput(
  input: CommitmentInput,
  context: PlanningContext,
): string | undefined {
  if (!normaliseName(input.label)) return 'Enter a commitment name.'
  if (!isAmount(input.amount, 1)) {
    return 'Enter a whole PKR amount from 1 to 100,000,000.'
  }
  if (!isPlanningFrequency(input.frequency)) return 'Choose how often this repeats.'
  if (!isIsoDate(input.dueDate)) return 'Choose a valid due date.'
  if (!input.category) return 'Choose a category.'
  return validateNote(input.note) ?? validateAccountReference(context, input.accountId)
}

// --- Receivable operations ---------------------------------------------------

export function createReceivable(
  state: PlanningState,
  input: ReceivableInput,
  context: PlanningContext,
): PlanningResult {
  const error = validateReceivableInput(input, context)
  if (error) return { state, error }

  const timestamp = now()
  const record: ReceivableRecord = {
    id: makeId('receivable'),
    counterparty: normaliseName(input.counterparty),
    originalAmount: input.originalAmount,
    receivedAmount: input.receivedAmount ?? 0,
    dueDate: input.dueDate,
    ...optionalNote(input.note),
    ...optionalAccount(input.accountId),
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  return { state: { ...state, receivables: [...state.receivables, record] } }
}

export function updateReceivable(
  state: PlanningState,
  id: string,
  input: ReceivableInput,
  context: PlanningContext,
): PlanningResult {
  const existing = findReceivable(state, id)
  if (!existing) return { state, error: 'This receivable no longer exists.' }

  const error = validateReceivableInput(input, context)
  if (error) return { state, error }

  const updated: ReceivableRecord = {
    id: existing.id,
    counterparty: normaliseName(input.counterparty),
    originalAmount: input.originalAmount,
    receivedAmount: input.receivedAmount ?? 0,
    dueDate: input.dueDate,
    ...optionalNote(input.note),
    ...optionalAccount(input.accountId),
    createdAt: existing.createdAt,
    updatedAt: now(),
  }

  return {
    state: {
      ...state,
      receivables: state.receivables.map((record) =>
        record.id === id ? updated : record,
      ),
    },
  }
}

export function recordReceivableReceipt(
  state: PlanningState,
  id: string,
  amount: number,
): PlanningResult {
  const existing = findReceivable(state, id)
  if (!existing) return { state, error: 'This receivable no longer exists.' }
  if (!isAmount(amount, 1)) {
    return { state, error: 'Enter a whole PKR amount greater than zero.' }
  }

  const remaining = getReceivableRemainingAmount(existing)
  if (remaining === 0) {
    return { state, error: 'This receivable is already fully received.' }
  }
  if (amount > remaining) {
    return { state, error: 'That is more than the remaining amount.' }
  }

  const updated: ReceivableRecord = {
    ...existing,
    receivedAmount: existing.receivedAmount + amount,
    updatedAt: now(),
  }

  return {
    state: {
      ...state,
      receivables: state.receivables.map((record) =>
        record.id === id ? updated : record,
      ),
    },
  }
}

export function markReceivableReceived(
  state: PlanningState,
  id: string,
): PlanningResult {
  const existing = findReceivable(state, id)
  if (!existing) return { state, error: 'This receivable no longer exists.' }
  if (getReceivableRemainingAmount(existing) === 0) {
    return { state, error: 'This receivable is already fully received.' }
  }

  const updated: ReceivableRecord = {
    ...existing,
    receivedAmount: existing.originalAmount,
    updatedAt: now(),
  }

  return {
    state: {
      ...state,
      receivables: state.receivables.map((record) =>
        record.id === id ? updated : record,
      ),
    },
  }
}

export function deleteReceivable(state: PlanningState, id: string): PlanningResult {
  if (!findReceivable(state, id)) {
    return { state, error: 'This receivable no longer exists.' }
  }

  return {
    state: {
      ...state,
      receivables: state.receivables.filter((record) => record.id !== id),
    },
  }
}

// --- Payable operations ------------------------------------------------------

export function createPayable(
  state: PlanningState,
  input: PayableInput,
  context: PlanningContext,
): PlanningResult {
  const error = validatePayableInput(input, context)
  if (error) return { state, error }

  const timestamp = now()
  const record: PayableRecord = {
    id: makeId('payable'),
    counterparty: normaliseName(input.counterparty),
    originalAmount: input.originalAmount,
    paidAmount: input.paidAmount ?? 0,
    dueDate: input.dueDate,
    ...optionalNote(input.note),
    ...optionalAccount(input.accountId),
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  return { state: { ...state, payables: [...state.payables, record] } }
}

export function updatePayable(
  state: PlanningState,
  id: string,
  input: PayableInput,
  context: PlanningContext,
): PlanningResult {
  const existing = findPayable(state, id)
  if (!existing) return { state, error: 'This payable no longer exists.' }

  const error = validatePayableInput(input, context)
  if (error) return { state, error }

  const updated: PayableRecord = {
    id: existing.id,
    counterparty: normaliseName(input.counterparty),
    originalAmount: input.originalAmount,
    paidAmount: input.paidAmount ?? 0,
    dueDate: input.dueDate,
    ...optionalNote(input.note),
    ...optionalAccount(input.accountId),
    createdAt: existing.createdAt,
    updatedAt: now(),
  }

  return {
    state: {
      ...state,
      payables: state.payables.map((record) => (record.id === id ? updated : record)),
    },
  }
}

export function recordPayablePayment(
  state: PlanningState,
  id: string,
  amount: number,
): PlanningResult {
  const existing = findPayable(state, id)
  if (!existing) return { state, error: 'This payable no longer exists.' }
  if (!isAmount(amount, 1)) {
    return { state, error: 'Enter a whole PKR amount greater than zero.' }
  }

  const remaining = getPayableRemainingAmount(existing)
  if (remaining === 0) {
    return { state, error: 'This payable is already fully paid.' }
  }
  if (amount > remaining) {
    return { state, error: 'That is more than the remaining amount.' }
  }

  const updated: PayableRecord = {
    ...existing,
    paidAmount: existing.paidAmount + amount,
    updatedAt: now(),
  }

  return {
    state: {
      ...state,
      payables: state.payables.map((record) => (record.id === id ? updated : record)),
    },
  }
}

export function markPayablePaid(state: PlanningState, id: string): PlanningResult {
  const existing = findPayable(state, id)
  if (!existing) return { state, error: 'This payable no longer exists.' }
  if (getPayableRemainingAmount(existing) === 0) {
    return { state, error: 'This payable is already fully paid.' }
  }

  const updated: PayableRecord = {
    ...existing,
    paidAmount: existing.originalAmount,
    updatedAt: now(),
  }

  return {
    state: {
      ...state,
      payables: state.payables.map((record) => (record.id === id ? updated : record)),
    },
  }
}

export function deletePayable(state: PlanningState, id: string): PlanningResult {
  if (!findPayable(state, id)) {
    return { state, error: 'This payable no longer exists.' }
  }

  return {
    state: {
      ...state,
      payables: state.payables.filter((record) => record.id !== id),
    },
  }
}

// --- Commitment operations ---------------------------------------------------

export function createCommitment(
  state: PlanningState,
  input: CommitmentInput,
  context: PlanningContext,
): PlanningResult {
  const error = validateCommitmentInput(input, context)
  if (error) return { state, error }

  const timestamp = now()
  const record: CommitmentRecord = {
    id: makeId('commitment'),
    label: normaliseName(input.label),
    category: input.category,
    amount: input.amount,
    frequency: input.frequency,
    dueDate: input.dueDate,
    ...optionalNote(input.note),
    ...optionalAccount(input.accountId),
    isSettled: false,
    isArchived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  return { state: { ...state, commitments: [...state.commitments, record] } }
}

export function updateCommitment(
  state: PlanningState,
  id: string,
  input: CommitmentInput,
  context: PlanningContext,
): PlanningResult {
  const existing = findCommitment(state, id)
  if (!existing) return { state, error: 'This commitment no longer exists.' }

  const error = validateCommitmentInput(input, context)
  if (error) return { state, error }

  const updated: CommitmentRecord = {
    id: existing.id,
    label: normaliseName(input.label),
    category: input.category,
    amount: input.amount,
    frequency: input.frequency,
    dueDate: input.dueDate,
    ...optionalNote(input.note),
    ...optionalAccount(input.accountId),
    isSettled: input.frequency === 'one-time' ? existing.isSettled : false,
    isArchived: existing.isArchived,
    ...(existing.lastPaidDate ? { lastPaidDate: existing.lastPaidDate } : {}),
    createdAt: existing.createdAt,
    updatedAt: now(),
  }

  return {
    state: {
      ...state,
      commitments: state.commitments.map((record) =>
        record.id === id ? updated : record,
      ),
    },
  }
}

// Marks the current occurrence as handled. Recurring commitments move to their
// next due date; a one-time commitment is completed and gets no new due date.
export function markCommitmentPaid(
  state: PlanningState,
  id: string,
  context: PlanningContext,
): PlanningResult {
  const existing = findCommitment(state, id)
  if (!existing) return { state, error: 'This commitment no longer exists.' }
  if (existing.isArchived) {
    return { state, error: 'Restore this commitment before marking it paid.' }
  }
  if (existing.isSettled) {
    return { state, error: 'This commitment is already marked paid.' }
  }

  const isOneTime = existing.frequency === 'one-time'
  const updated: CommitmentRecord = {
    ...existing,
    isSettled: isOneTime,
    dueDate: isOneTime
      ? existing.dueDate
      : getNextDueDate(existing.dueDate, existing.frequency),
    lastPaidDate: context.today,
    updatedAt: now(),
  }

  return {
    state: {
      ...state,
      commitments: state.commitments.map((record) =>
        record.id === id ? updated : record,
      ),
    },
  }
}

export function archiveCommitment(state: PlanningState, id: string): PlanningResult {
  const existing = findCommitment(state, id)
  if (!existing || existing.isArchived) {
    return { state, error: 'This commitment is not available to archive.' }
  }

  return {
    state: {
      ...state,
      commitments: state.commitments.map((record) =>
        record.id === id
          ? { ...record, isArchived: true, updatedAt: now() }
          : record,
      ),
    },
  }
}

export function restoreCommitment(state: PlanningState, id: string): PlanningResult {
  const existing = findCommitment(state, id)
  if (!existing?.isArchived) {
    return { state, error: 'This commitment is not available to restore.' }
  }

  return {
    state: {
      ...state,
      commitments: state.commitments.map((record) =>
        record.id === id
          ? { ...record, isArchived: false, updatedAt: now() }
          : record,
      ),
    },
  }
}

export function deleteCommitment(state: PlanningState, id: string): PlanningResult {
  if (!findCommitment(state, id)) {
    return { state, error: 'This commitment no longer exists.' }
  }

  return {
    state: {
      ...state,
      commitments: state.commitments.filter((record) => record.id !== id),
    },
  }
}

// --- Consistency -------------------------------------------------------------

export interface PlanningConsistencyReport {
  ok: boolean
  issues: readonly string[]
}

export function checkPlanningConsistency(
  state: PlanningState,
  activeAccountIds: readonly AccountId[],
): PlanningConsistencyReport {
  const issues: string[] = []
  const seen = new Set<string>()

  const trackId = (id: string, label: string): void => {
    if (seen.has(id)) issues.push(`Duplicate ${label} id: ${id}.`)
    seen.add(id)
  }

  state.receivables.forEach((record) => {
    trackId(record.id, 'receivable')
    if (record.receivedAmount > record.originalAmount) {
      issues.push(`Receivable ${record.id} records more received than owed.`)
    }
  })

  state.payables.forEach((record) => {
    trackId(record.id, 'payable')
    if (record.paidAmount > record.originalAmount) {
      issues.push(`Payable ${record.id} records more paid than owed.`)
    }
  })

  state.commitments.forEach((record) => {
    trackId(record.id, 'commitment')
    if (record.accountId && !activeAccountIds.includes(record.accountId)) {
      issues.push(`Commitment ${record.id} references an unavailable account.`)
    }
  })

  return { ok: issues.length === 0, issues }
}
