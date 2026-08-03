import type { User } from '@supabase/supabase-js'

import { ALL_CATEGORIES, type TransactionCategory } from '../models/finance'
import type { FinanceState } from './financeCore'
import type { SyncRecord, SyncRecordType } from './syncEngine'
import type { PlanningState } from '../models/planning'
import type { UserSettings } from '../models/settings'
import { normalizeUserSettings } from '../models/settings'
import { getSupabaseClient } from './supabase'

export interface CloudCounts {
  accounts: number
  transactions: number
  receivables: number
  payables: number
  commitments: number
}

export interface CloudImportPreview extends CloudCounts {
  email: string
}

export interface CloudSnapshot {
  counts: CloudCounts
  accountIds: readonly string[]
  transactionIds: readonly string[]
  receivableIds: readonly string[]
  payableIds: readonly string[]
  commitmentIds: readonly string[]
}

function timestamp(value: string): string {
  return new Date(value).toISOString()
}

function assertRows(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value) || !value.every((row) => typeof row === 'object' && row !== null)) {
    throw new Error('Cloud data could not be validated.')
  }
  return value as readonly Record<string, unknown>[]
}

function rowIds(value: unknown): readonly string[] {
  return assertRows(value).map((row) => {
    if (typeof row.id !== 'string') throw new Error('Cloud data could not be validated.')
    return row.id
  })
}

export function getCloudImportPreview(
  user: User,
  finance: FinanceState,
  planning: PlanningState,
): CloudImportPreview {
  return {
    email: user.email ?? 'your signed-in account',
    accounts: finance.accounts.length,
    transactions: finance.transactions.length,
    receivables: planning.receivables.length,
    payables: planning.payables.length,
    commitments: planning.commitments.length,
  }
}

async function upsertSettings(user: User, settings: UserSettings): Promise<void> {
  const { error } = await getSupabaseClient().from('user_settings').upsert({
    user_id: user.id,
    settings,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) throw error
}

async function upsertProfile(user: User, settings: UserSettings): Promise<void> {
  const { error } = await getSupabaseClient().from('profiles').upsert({
    user_id: user.id,
    full_name: settings.profile.fullName,
    initials: settings.profile.initials,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) throw error
}

export async function upsertLocalState(
  user: User,
  settings: UserSettings,
  finance: FinanceState,
  planning: PlanningState,
): Promise<void> {
  const client = getSupabaseClient()
  await upsertProfile(user, settings)
  await upsertSettings(user, settings)

  if (finance.accounts.length) {
    const { error } = await client.from('finance_accounts').upsert(finance.accounts.map((account) => ({
      user_id: user.id, id: account.id, name: account.name, type: account.type,
      institution_name: account.institutionName ?? null, last_four_digits: account.lastFourDigits ?? null,
      opening_balance: account.openingBalance, is_default: account.isDefault,
      is_archived: account.isArchived, created_at: timestamp(account.createdAt), updated_at: timestamp(account.updatedAt),
    })), { onConflict: 'user_id,id' })
    if (error) throw error
  }
  if (finance.transactions.length) {
    const { error } = await client.from('finance_transactions').upsert(finance.transactions.map((transaction) => ({
      user_id: user.id, id: transaction.id, type: transaction.type, amount: transaction.amount,
      date: transaction.date, title: transaction.title, category_id: transaction.categoryId,
      account_id: transaction.accountId, destination_account_id: transaction.destinationAccountId ?? null,
      person_or_business: transaction.personOrBusiness ?? null, note: transaction.note ?? null,
      status: transaction.status, created_at: timestamp(transaction.createdAt), updated_at: timestamp(transaction.updatedAt),
    })), { onConflict: 'user_id,id' })
    if (error) throw error
  }
  if (planning.receivables.length) {
    const { error } = await client.from('receivables').upsert(planning.receivables.map((record) => ({
      user_id: user.id, id: record.id, counterparty: record.counterparty, original_amount: record.originalAmount,
      received_amount: record.receivedAmount, due_date: record.dueDate, note: record.note ?? null,
      account_id: record.accountId ?? null, created_at: timestamp(record.createdAt), updated_at: timestamp(record.updatedAt),
    })), { onConflict: 'user_id,id' })
    if (error) throw error
  }
  if (planning.payables.length) {
    const { error } = await client.from('payables').upsert(planning.payables.map((record) => ({
      user_id: user.id, id: record.id, counterparty: record.counterparty, original_amount: record.originalAmount,
      paid_amount: record.paidAmount, due_date: record.dueDate, note: record.note ?? null,
      account_id: record.accountId ?? null, created_at: timestamp(record.createdAt), updated_at: timestamp(record.updatedAt),
    })), { onConflict: 'user_id,id' })
    if (error) throw error
  }
  if (planning.commitments.length) {
    const { error } = await client.from('commitments').upsert(planning.commitments.map((record) => ({
      user_id: user.id, id: record.id, label: record.label, category_id: record.category, amount: record.amount,
      frequency: record.frequency, due_date: record.dueDate, note: record.note ?? null, account_id: record.accountId ?? null,
      is_settled: record.isSettled, is_archived: record.isArchived, last_paid_date: record.lastPaidDate ?? null,
      created_at: timestamp(record.createdAt), updated_at: timestamp(record.updatedAt),
    })), { onConflict: 'user_id,id' })
    if (error) throw error
  }
}

export async function readCloudSnapshot(user: User): Promise<CloudSnapshot> {
  const client = getSupabaseClient()
  const [accounts, transactions, receivables, payables, commitments] = await Promise.all([
    client.from('finance_accounts').select('id').eq('user_id', user.id),
    client.from('finance_transactions').select('id').eq('user_id', user.id),
    client.from('receivables').select('id').eq('user_id', user.id),
    client.from('payables').select('id').eq('user_id', user.id),
    client.from('commitments').select('id').eq('user_id', user.id),
  ])
  for (const result of [accounts, transactions, receivables, payables, commitments]) {
    if (result.error) throw result.error
  }
  const accountIds = rowIds(accounts.data)
  const transactionIds = rowIds(transactions.data)
  const receivableIds = rowIds(receivables.data)
  const payableIds = rowIds(payables.data)
  const commitmentIds = rowIds(commitments.data)
  return { counts: { accounts: accountIds.length, transactions: transactionIds.length, receivables: receivableIds.length, payables: payableIds.length, commitments: commitmentIds.length }, accountIds, transactionIds, receivableIds, payableIds, commitmentIds }
}

export async function importLocalState(
  user: User,
  settings: UserSettings,
  finance: FinanceState,
  planning: PlanningState,
): Promise<CloudSnapshot> {
  await upsertLocalState(user, settings, finance, planning)
  const snapshot = await readCloudSnapshot(user)
  const expected = [
    [finance.accounts, snapshot.accountIds], [finance.transactions, snapshot.transactionIds],
    [planning.receivables, snapshot.receivableIds], [planning.payables, snapshot.payableIds],
    [planning.commitments, snapshot.commitmentIds],
  ] as const
  if (expected.some(([records, ids]) => records.some((record) => !ids.includes(record.id)))) {
    throw new Error('Cloud verification did not complete.')
  }
  return snapshot
}

// --- Cloud read-back for restore ---------------------------------------------

function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Cloud data could not be validated.')
  return value
}

function optionalText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  return text(value)
}

function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error('Cloud data could not be validated.')
  }
  return value
}

function flag(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Cloud data could not be validated.')
  return value
}

function isoDate(value: unknown): string {
  return text(value).slice(0, 10)
}

function isoTimestamp(value: unknown): string {
  const parsed = new Date(text(value))
  if (Number.isNaN(parsed.getTime())) throw new Error('Cloud data could not be validated.')
  return parsed.toISOString()
}

function optional<T>(value: T | undefined, key: string): Record<string, T> {
  return value === undefined ? {} : { [key]: value }
}

// Categories are a closed domain union, so a cloud row is only accepted when it
// names a category this build knows.
function category(value: unknown): TransactionCategory {
  const candidate = text(value)
  if (!ALL_CATEGORIES.some((definition) => definition.id === candidate)) {
    throw new Error('Cloud data could not be validated.')
  }
  return candidate as TransactionCategory
}

// Only rows the current user owns and that carry no tombstone are eligible.
function liveRows(value: unknown): readonly Record<string, unknown>[] {
  return assertRows(value).filter((row) => row.deleted_at === null || row.deleted_at === undefined)
}

export interface CloudRestorePayload {
  settings: UserSettings | undefined
  finance: FinanceState
  planning: PlanningState
  counts: CloudCounts
  updatedAt: string | undefined
}

// Reads the authenticated user's full cloud state and maps it into local domain
// shapes. RLS scopes every query; the explicit user_id filter is defence in depth.
export async function readCloudRestorePayload(user: User): Promise<CloudRestorePayload> {
  const client = getSupabaseClient()
  const [settingsRow, accounts, transactions, receivables, payables, commitments] = await Promise.all([
    client.from('user_settings').select('settings,updated_at').eq('user_id', user.id).maybeSingle(),
    client.from('finance_accounts').select('*').eq('user_id', user.id),
    client.from('finance_transactions').select('*').eq('user_id', user.id),
    client.from('receivables').select('*').eq('user_id', user.id),
    client.from('payables').select('*').eq('user_id', user.id),
    client.from('commitments').select('*').eq('user_id', user.id),
  ])
  for (const result of [settingsRow, accounts, transactions, receivables, payables, commitments]) {
    if (result.error) throw result.error
  }

  const accountRows = liveRows(accounts.data)
  const transactionRows = liveRows(transactions.data)
  const receivableRows = liveRows(receivables.data)
  const payableRows = liveRows(payables.data)
  const commitmentRows = liveRows(commitments.data)

  const financeState: FinanceState = {
    version: 1,
    migratedFromSettings: false,
    accounts: accountRows.map((row) => ({
      id: text(row.id),
      name: text(row.name),
      type: text(row.type) as FinanceState['accounts'][number]['type'],
      ...optional(optionalText(row.institution_name), 'institutionName'),
      ...optional(optionalText(row.last_four_digits), 'lastFourDigits'),
      openingBalance: integer(row.opening_balance),
      isDefault: flag(row.is_default),
      isArchived: flag(row.is_archived),
      createdAt: isoTimestamp(row.created_at),
      updatedAt: isoTimestamp(row.updated_at),
    })),
    transactions: transactionRows.map((row) => ({
      id: text(row.id),
      type: text(row.type) as FinanceState['transactions'][number]['type'],
      amount: integer(row.amount),
      date: isoDate(row.date),
      title: text(row.title),
      categoryId: category(row.category_id),
      accountId: text(row.account_id),
      ...optional(optionalText(row.destination_account_id), 'destinationAccountId'),
      ...optional(optionalText(row.person_or_business), 'personOrBusiness'),
      ...optional(optionalText(row.note), 'note'),
      status: text(row.status) as FinanceState['transactions'][number]['status'],
      isLocal: true,
      createdAt: isoTimestamp(row.created_at),
      updatedAt: isoTimestamp(row.updated_at),
    })),
  }

  const planningState: PlanningState = {
    version: 1,
    receivables: receivableRows.map((row) => ({
      id: text(row.id),
      counterparty: text(row.counterparty),
      originalAmount: integer(row.original_amount),
      receivedAmount: integer(row.received_amount),
      dueDate: isoDate(row.due_date),
      ...optional(optionalText(row.note), 'note'),
      ...optional(optionalText(row.account_id), 'accountId'),
      createdAt: isoTimestamp(row.created_at),
      updatedAt: isoTimestamp(row.updated_at),
    })),
    payables: payableRows.map((row) => ({
      id: text(row.id),
      counterparty: text(row.counterparty),
      originalAmount: integer(row.original_amount),
      paidAmount: integer(row.paid_amount),
      dueDate: isoDate(row.due_date),
      ...optional(optionalText(row.note), 'note'),
      ...optional(optionalText(row.account_id), 'accountId'),
      createdAt: isoTimestamp(row.created_at),
      updatedAt: isoTimestamp(row.updated_at),
    })),
    commitments: commitmentRows.map((row) => ({
      id: text(row.id),
      label: text(row.label),
      category: category(row.category_id),
      amount: integer(row.amount),
      frequency: text(row.frequency) as PlanningState['commitments'][number]['frequency'],
      dueDate: isoDate(row.due_date),
      ...optional(optionalText(row.note), 'note'),
      ...optional(optionalText(row.account_id), 'accountId'),
      isSettled: flag(row.is_settled),
      isArchived: flag(row.is_archived),
      ...optional(optionalText(row.last_paid_date), 'lastPaidDate'),
      createdAt: isoTimestamp(row.created_at),
      updatedAt: isoTimestamp(row.updated_at),
    })),
  }

  const storedSettings: unknown = settingsRow.data?.settings
  const updatedAt = typeof settingsRow.data?.updated_at === 'string' ? settingsRow.data.updated_at : undefined

  return {
    settings: normalizeUserSettings(storedSettings),
    finance: financeState,
    planning: planningState,
    counts: {
      accounts: financeState.accounts.length,
      transactions: financeState.transactions.length,
      receivables: planningState.receivables.length,
      payables: planningState.payables.length,
      commitments: planningState.commitments.length,
    },
    updatedAt,
  }
}

// --- Sync transport ----------------------------------------------------------

const TABLES: Readonly<Record<SyncRecordType, string>> = {
  account: 'finance_accounts',
  transaction: 'finance_transactions',
  receivable: 'receivables',
  payable: 'payables',
  commitment: 'commitments',
}

function toRow(
  user: User,
  recordType: SyncRecordType,
  record: Record<string, unknown>,
): Record<string, unknown> {
  const base = { user_id: user.id, id: record.id, deleted_at: null }
  if (recordType === 'account') {
    return {
      ...base, name: record.name, type: record.type,
      institution_name: record.institutionName ?? null, last_four_digits: record.lastFourDigits ?? null,
      opening_balance: record.openingBalance, is_default: record.isDefault, is_archived: record.isArchived,
      created_at: timestamp(String(record.createdAt)), updated_at: timestamp(String(record.updatedAt)),
    }
  }
  if (recordType === 'transaction') {
    return {
      ...base, type: record.type, amount: record.amount, date: record.date, title: record.title,
      category_id: record.categoryId, account_id: record.accountId,
      destination_account_id: record.destinationAccountId ?? null,
      person_or_business: record.personOrBusiness ?? null, note: record.note ?? null, status: record.status,
      created_at: timestamp(String(record.createdAt)), updated_at: timestamp(String(record.updatedAt)),
    }
  }
  if (recordType === 'receivable') {
    return {
      ...base, counterparty: record.counterparty, original_amount: record.originalAmount,
      received_amount: record.receivedAmount, due_date: record.dueDate, note: record.note ?? null,
      account_id: record.accountId ?? null,
      created_at: timestamp(String(record.createdAt)), updated_at: timestamp(String(record.updatedAt)),
    }
  }
  if (recordType === 'payable') {
    return {
      ...base, counterparty: record.counterparty, original_amount: record.originalAmount,
      paid_amount: record.paidAmount, due_date: record.dueDate, note: record.note ?? null,
      account_id: record.accountId ?? null,
      created_at: timestamp(String(record.createdAt)), updated_at: timestamp(String(record.updatedAt)),
    }
  }
  return {
    ...base, label: record.label, category_id: record.category, amount: record.amount,
    frequency: record.frequency, due_date: record.dueDate, note: record.note ?? null,
    account_id: record.accountId ?? null, is_settled: record.isSettled, is_archived: record.isArchived,
    last_paid_date: record.lastPaidDate ?? null,
    created_at: timestamp(String(record.createdAt)), updated_at: timestamp(String(record.updatedAt)),
  }
}

// Upserts on (user_id,id) so replaying the same operation converges to one row.
export async function pushRecords(
  user: User,
  recordType: SyncRecordType,
  records: readonly Record<string, unknown>[],
): Promise<void> {
  if (!records.length) return
  const { error } = await getSupabaseClient()
    .from(TABLES[recordType])
    .upsert(records.map((record) => toRow(user, recordType, record)), { onConflict: 'user_id,id' })
  if (error) throw error
}

// Deletion is a tombstone, never a row removal, so other devices can observe it.
export async function tombstoneRecords(
  user: User,
  recordType: SyncRecordType,
  recordIds: readonly string[],
): Promise<void> {
  if (!recordIds.length) return
  const stamp = new Date().toISOString()
  const { error } = await getSupabaseClient()
    .from(TABLES[recordType])
    .update({ deleted_at: stamp, updated_at: stamp })
    .eq('user_id', user.id)
    .in('id', recordIds)
  if (error) throw error
}

export interface CloudSyncRead {
  records: Record<SyncRecordType, readonly SyncRecord[]>
  deletedKeys: string[]
}

// Reads live rows plus tombstone keys. Cloud `updated_at` is the revision used
// for conflict detection, so it is preserved verbatim on each record.
export async function readCloudForSync(user: User): Promise<CloudSyncRead> {
  const payload = await readCloudRestorePayload(user)
  const client = getSupabaseClient()

  const deletedKeys: string[] = []
  await Promise.all(
    (Object.keys(TABLES) as SyncRecordType[]).map(async (recordType) => {
      const { data, error } = await client
        .from(TABLES[recordType])
        .select('id')
        .eq('user_id', user.id)
        .not('deleted_at', 'is', null)
      if (error) throw error
      for (const row of assertRows(data)) {
        if (typeof row.id === 'string') deletedKeys.push(`${recordType}:${row.id}`)
      }
    }),
  )

  return {
    records: {
      account: payload.finance.accounts as unknown as readonly SyncRecord[],
      transaction: payload.finance.transactions as unknown as readonly SyncRecord[],
      receivable: payload.planning.receivables as unknown as readonly SyncRecord[],
      payable: payload.planning.payables as unknown as readonly SyncRecord[],
      commitment: payload.planning.commitments as unknown as readonly SyncRecord[],
    },
    deletedKeys,
  }
}

// Confirms a pushed record is actually present and untombstoned in the cloud.
export async function verifyPushed(
  user: User,
  recordType: SyncRecordType,
  recordIds: readonly string[],
): Promise<boolean> {
  if (!recordIds.length) return true
  const { data, error } = await getSupabaseClient()
    .from(TABLES[recordType])
    .select('id,deleted_at')
    .eq('user_id', user.id)
    .in('id', recordIds)
  if (error) throw error
  const live = new Set(
    assertRows(data)
      .filter((row) => row.deleted_at === null || row.deleted_at === undefined)
      .map((row) => String(row.id)),
  )
  return recordIds.every((id) => live.has(id))
}

export async function pushSettings(user: User, settings: UserSettings): Promise<void> {
  await upsertProfile(user, settings)
  await upsertSettings(user, settings)
}
