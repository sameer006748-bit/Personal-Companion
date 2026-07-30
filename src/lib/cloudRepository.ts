import type { User } from '@supabase/supabase-js'

import type { FinanceState } from './financeCore'
import type { PlanningState } from '../models/planning'
import type { UserSettings } from '../models/settings'
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
