import type {
  AccountId,
  AccountType,
  LocalAccount,
  LocalTransaction,
  TransactionCategory,
  TransactionStatus,
  TransactionType,
} from '../models/finance'
import type { OnboardingDraft, SettingsOrigin, UserSettings } from '../models/settings'

export interface FinanceState {
  version: 1
  accounts: readonly LocalAccount[]
  transactions: readonly LocalTransaction[]
  migratedFromSettings: boolean
}

export interface AccountInput {
  name: string
  type: AccountType
  institutionName?: string
  lastFourDigits?: string
  openingBalance: number
  makeDefault?: boolean
}

export interface TransactionInput {
  type: TransactionType
  amount: number
  date: string
  title: string
  categoryId: TransactionCategory
  accountId: AccountId
  destinationAccountId?: AccountId
  personOrBusiness?: string
  note?: string
}

export interface FinanceResult {
  state: FinanceState
  error?: string
}

export const FINANCE_STORAGE_KEY = 'personal-companion-finance'
const STORAGE_KEY = FINANCE_STORAGE_KEY
const MAX_AMOUNT = 100000000

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

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= MAX_AMOUNT
}

function isOpeningBalance(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_AMOUNT
}

function isAccountType(value: unknown): value is AccountType {
  return value === 'cash' || value === 'bank' || value === 'wallet' || value === 'savings' || value === 'other'
}

function isCategory(value: unknown): value is TransactionCategory {
  return typeof value === 'string'
}

function isStatus(value: unknown): value is TransactionStatus {
  return value === 'paid' || value === 'received' || value === 'pending' || value === 'overdue' || value === 'transfer'
}

function isAccount(value: unknown): value is LocalAccount {
  if (typeof value !== 'object' || value === null) return false
  const account = value as Record<string, unknown>
  return typeof account.id === 'string' && typeof account.name === 'string' && isAccountType(account.type) && typeof account.openingBalance === 'number' && isOpeningBalance(account.openingBalance) && typeof account.isDefault === 'boolean' && typeof account.isArchived === 'boolean' && typeof account.createdAt === 'string' && typeof account.updatedAt === 'string' && (account.institutionName === undefined || typeof account.institutionName === 'string') && (account.lastFourDigits === undefined || (typeof account.lastFourDigits === 'string' && /^\d{4}$/.test(account.lastFourDigits)))
}

function isTransaction(value: unknown): value is LocalTransaction {
  if (typeof value !== 'object' || value === null) return false
  const transaction = value as Record<string, unknown>
  return typeof transaction.id === 'string' && (transaction.type === 'income' || transaction.type === 'expense' || transaction.type === 'transfer') && typeof transaction.amount === 'number' && isPositiveInteger(transaction.amount) && typeof transaction.date === 'string' && typeof transaction.title === 'string' && isCategory(transaction.categoryId) && typeof transaction.accountId === 'string' && (transaction.destinationAccountId === undefined || typeof transaction.destinationAccountId === 'string') && isStatus(transaction.status) && transaction.isLocal === true && typeof transaction.createdAt === 'string' && typeof transaction.updatedAt === 'string'
}

export function isFinanceState(value: unknown): value is FinanceState {
  if (typeof value !== 'object' || value === null) return false
  const state = value as Record<string, unknown>
  return state.version === 1 && Array.isArray(state.accounts) && state.accounts.every(isAccount) && Array.isArray(state.transactions) && state.transactions.every(isTransaction) && typeof state.migratedFromSettings === 'boolean'
}

function accountTypeFromId(id: AccountId): AccountType {
  if (id === 'cash') return 'cash'
  if (id === 'jazzcash') return 'wallet'
  return 'bank'
}

function freshAccounts(): readonly LocalAccount[] {
  const timestamp = now()
  return [{
    id: 'cash',
    name: 'Cash',
    type: 'cash',
    openingBalance: 0,
    isDefault: true,
    isArchived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }]
}

function legacyAccounts(settings: UserSettings): readonly LocalAccount[] {
  const timestamp = now()
  const balances = settings.finance.accountBalances
  const legacyIds = ['cash', 'meezan-bank', 'jazzcash'] as const
  const legacyNames: Record<(typeof legacyIds)[number], string> = {
    cash: 'Cash',
    'meezan-bank': 'Meezan Bank',
    jazzcash: 'JazzCash',
  }

  const known = legacyIds.filter((id) => balances[id] !== undefined)
  const ids = known.length > 0 ? known : legacyIds

  const accounts = ids.map((id) => ({
    id,
    name: legacyNames[id],
    type: accountTypeFromId(id),
    openingBalance: balances[id] ?? 0,
    isDefault: settings.profile.defaultAccountId === id,
    isArchived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }))

  const defaultId = accounts.find((account) => account.isDefault)?.id ?? accounts[0]!.id
  return withSingleDefault(accounts, defaultId)
}

export function loadFinanceState(settings: UserSettings, origin: SettingsOrigin = 'legacy'): FinanceState {
  const fallback = (): FinanceState => origin === 'fresh'
    ? { version: 1, accounts: freshAccounts(), transactions: [], migratedFromSettings: false }
    : { version: 1, accounts: legacyAccounts(settings), transactions: [], migratedFromSettings: true }

  if (typeof window === 'undefined') {
    return fallback()
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (isFinanceState(parsed)) return parsed
    }
  } catch {
    // Invalid local data falls back to a safe migration from current settings.
  }

  const initial = fallback()
  saveFinanceState(initial)
  return initial
}

export function saveFinanceState(state: FinanceState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // The active session stays usable when storage is unavailable.
  }
}

export function getActiveAccounts(state: FinanceState): readonly LocalAccount[] {
  return state.accounts.filter((account) => !account.isArchived)
}

export function getArchivedAccounts(state: FinanceState): readonly LocalAccount[] {
  return state.accounts.filter((account) => account.isArchived)
}

export function getAccountBalance(state: FinanceState, accountId: AccountId): number {
  const account = state.accounts.find((item) => item.id === accountId)
  if (!account) return 0
  return state.transactions.reduce((balance, transaction) => {
    if (transaction.type === 'income' && transaction.accountId === accountId) return balance + transaction.amount
    if (transaction.type === 'expense' && transaction.accountId === accountId) return balance - transaction.amount
    if (transaction.type === 'transfer') {
      if (transaction.accountId === accountId) return balance - transaction.amount
      if (transaction.destinationAccountId === accountId) return balance + transaction.amount
    }
    return balance
  }, account.openingBalance)
}

export function getFinanceBalances(state: FinanceState): Readonly<Record<AccountId, number>> {
  return Object.fromEntries(state.accounts.map((account) => [account.id, getAccountBalance(state, account.id)]))
}

function accountExistsAndActive(state: FinanceState, accountId: AccountId): boolean {
  return state.accounts.some((account) => account.id === accountId && !account.isArchived)
}

function validateAccountInput(state: FinanceState, input: AccountInput, existingId?: AccountId): string | undefined {
  const name = normaliseName(input.name)
  if (!name) return 'Enter an account name.'
  if (!isOpeningBalance(input.openingBalance)) return 'Use a whole PKR opening balance from 0 to 100,000,000.'
  if (input.lastFourDigits && !/^\d{4}$/.test(input.lastFourDigits)) return 'Last four digits must contain exactly four numbers.'
  if (state.accounts.some((account) => !account.isArchived && account.id !== existingId && account.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return 'An active account already uses this name.'
  return undefined
}

function withSingleDefault(accounts: readonly LocalAccount[], defaultId: AccountId): readonly LocalAccount[] {
  return accounts.map((account) => ({ ...account, isDefault: !account.isArchived && account.id === defaultId }))
}

export function createAccount(state: FinanceState, input: AccountInput): FinanceResult {
  const error = validateAccountInput(state, input)
  if (error) return { state, error }
  const timestamp = now()
  const active = getActiveAccounts(state)
  const id = makeId('account')
  const account: LocalAccount = { id, name: normaliseName(input.name), type: input.type, ...(input.institutionName?.trim() ? { institutionName: input.institutionName.trim() } : {}), ...(input.lastFourDigits ? { lastFourDigits: input.lastFourDigits } : {}), openingBalance: input.openingBalance, isDefault: active.length === 0 || input.makeDefault === true, isArchived: false, createdAt: timestamp, updatedAt: timestamp }
  const accounts = account.isDefault ? withSingleDefault([...state.accounts, account], id) : [...state.accounts, account]
  return { state: { ...state, accounts } }
}

export function updateAccount(state: FinanceState, accountId: AccountId, input: AccountInput): FinanceResult {
  const existing = state.accounts.find((account) => account.id === accountId)
  if (!existing) return { state, error: 'This account no longer exists.' }
  const error = validateAccountInput(state, input, accountId)
  if (error) return { state, error }
  const updatedAccount: LocalAccount = { ...existing, name: normaliseName(input.name), type: input.type, ...(input.institutionName?.trim() ? { institutionName: input.institutionName.trim() } : {}), ...(input.lastFourDigits ? { lastFourDigits: input.lastFourDigits } : {}), openingBalance: input.openingBalance, updatedAt: now() }
  let accounts: readonly LocalAccount[] = state.accounts.map((account) => account.id === accountId ? updatedAccount : account)
  if (input.makeDefault) accounts = withSingleDefault(accounts, accountId)
  return { state: { ...state, accounts } }
}

export function setDefaultAccount(state: FinanceState, accountId: AccountId): FinanceResult {
  if (!accountExistsAndActive(state, accountId)) return { state, error: 'Choose an active account as the default.' }
  return { state: { ...state, accounts: withSingleDefault(state.accounts, accountId) } }
}

export function archiveAccount(state: FinanceState, accountId: AccountId): FinanceResult {
  const account = state.accounts.find((item) => item.id === accountId)
  if (!account || account.isArchived) return { state, error: 'This account is not available to archive.' }
  if (account.isDefault && getActiveAccounts(state).length > 1) return { state, error: 'Set another active account as default before archiving this one.' }
  if (account.isDefault) return { state, error: 'Keep at least one active default account.' }
  return { state: { ...state, accounts: state.accounts.map((item) => item.id === accountId ? { ...item, isArchived: true, updatedAt: now() } : item) } }
}

export function restoreAccount(state: FinanceState, accountId: AccountId): FinanceResult {
  const account = state.accounts.find((item) => item.id === accountId)
  if (!account?.isArchived) return { state, error: 'This account is not available to restore.' }
  if (state.accounts.some((item) => !item.isArchived && item.id !== accountId && item.name.toLocaleLowerCase() === account.name.toLocaleLowerCase())) return { state, error: 'Rename the active account with the same name before restoring this one.' }
  const hasDefault = getActiveAccounts(state).some((item) => item.isDefault)
  return { state: { ...state, accounts: state.accounts.map((item) => item.id === accountId ? { ...item, isArchived: false, isDefault: !hasDefault, updatedAt: now() } : item) } }
}

function validateTransaction(state: FinanceState, input: TransactionInput): string | undefined {
  if (!isPositiveInteger(input.amount)) return 'Enter a whole PKR amount greater than zero.'
  if (!input.date || !input.title.trim()) return 'Add a date and title.'
  if (!accountExistsAndActive(state, input.accountId)) return 'Choose an active account.'
  if (input.type === 'transfer') {
    if (!input.destinationAccountId?.trim() || !accountExistsAndActive(state, input.destinationAccountId)) return 'Choose an active destination account.'
    if (input.destinationAccountId === input.accountId) return 'Choose a different destination account.'
  }
  if (input.type === 'expense' || input.type === 'transfer') {
    if (getAccountBalance(state, input.accountId) < input.amount) return 'This account does not have enough available balance.'
  }
  return undefined
}

function toLocalTransaction(input: TransactionInput, id = makeId('transaction'), createdAt = now()): LocalTransaction {
  const timestamp = now()
  return { id, type: input.type, amount: input.amount, date: input.date, title: normaliseName(input.title), categoryId: input.type === 'transfer' ? 'account-transfer' : input.categoryId, accountId: input.accountId, ...(input.destinationAccountId ? { destinationAccountId: input.destinationAccountId } : {}), ...(input.personOrBusiness?.trim() ? { personOrBusiness: input.personOrBusiness.trim() } : {}), ...(input.note?.trim() ? { note: input.note.trim() } : {}), status: input.type === 'income' ? 'received' : input.type === 'expense' ? 'paid' : 'transfer', isLocal: true, createdAt, updatedAt: timestamp }
}

export function createTransaction(state: FinanceState, input: TransactionInput): FinanceResult {
  const error = validateTransaction(state, input)
  if (error) return { state, error }
  return { state: { ...state, transactions: [...state.transactions, toLocalTransaction(input)] } }
}

export function updateTransaction(state: FinanceState, transactionId: string, input: TransactionInput): FinanceResult {
  const existing = state.transactions.find((transaction) => transaction.id === transactionId)
  if (!existing) return { state, error: 'Only locally created transactions can be edited.' }
  const withoutExisting: FinanceState = { ...state, transactions: state.transactions.filter((transaction) => transaction.id !== transactionId) }
  const error = validateTransaction(withoutExisting, input)
  if (error) return { state, error }
  const replacement = toLocalTransaction(input, existing.id, existing.createdAt)
  return { state: { ...withoutExisting, transactions: [...withoutExisting.transactions, replacement] } }
}

export function deleteTransaction(state: FinanceState, transactionId: string): FinanceResult {
  if (!state.transactions.some((transaction) => transaction.id === transactionId)) return { state, error: 'Only locally created transactions can be deleted.' }
  return { state: { ...state, transactions: state.transactions.filter((transaction) => transaction.id !== transactionId) } }
}

export interface OnboardingReconciliationResult {
  state: FinanceState
  defaultAccountId: AccountId
  error?: string
}

function validateOnboardingAccounts(draft: OnboardingDraft): string | undefined {
  const accounts = draft.accounts ?? []
  if (accounts.length === 0) return 'Add at least one account to finish setup.'

  const seenNames = new Set<string>()
  let hasDefault = false

  for (const account of accounts) {
    const name = normaliseName(account.name)
    if (!name) return 'Every account needs a name.'
    if (!isAccountType(account.type)) return `Account type for ${name || 'an account'} is not supported.`
    if (!isOpeningBalance(account.openingBalance)) return `Opening balance for ${name} must be a whole PKR amount from 0 to 100,000,000.`
    const key = name.toLocaleLowerCase()
    if (seenNames.has(key)) return 'Account names must be unique. Use a different name.'
    seenNames.add(key)
    if (account.isDefault) hasDefault = true
  }

  if (!hasDefault) return 'Choose one account as the default.'
  return undefined
}

export function reconcileOnboardingDraft(
  current: FinanceState,
  draft: OnboardingDraft,
): OnboardingReconciliationResult {
  const error = validateOnboardingAccounts(draft)
  if (error) return { state: current, defaultAccountId: draft.defaultAccountId, error }

  const draftAccounts = draft.accounts ?? []
  const timestamp = now()
  const existingById = new Map(current.accounts.map((account) => [account.id, account]))
  const referencedAccountIds = new Set<AccountId>()
  for (const transaction of current.transactions) {
    referencedAccountIds.add(transaction.accountId)
    if (transaction.destinationAccountId) referencedAccountIds.add(transaction.destinationAccountId)
  }

  const keptAccounts: LocalAccount[] = []
  const seenIds = new Set<AccountId>()

  for (const draftAccount of draftAccounts) {
    const existing = draftAccount.existingAccountId ? existingById.get(draftAccount.existingAccountId) : undefined
    const id = existing?.id ?? draftAccount.id
    if (seenIds.has(id)) continue
    seenIds.add(id)
    keptAccounts.push({
      id,
      name: normaliseName(draftAccount.name),
      type: draftAccount.type,
      ...(existing?.institutionName ? { institutionName: existing.institutionName } : {}),
      ...(existing?.lastFourDigits ? { lastFourDigits: existing.lastFourDigits } : {}),
      openingBalance: draftAccount.openingBalance,
      isDefault: draftAccount.isDefault,
      isArchived: false,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    })
  }

  const keptIds = new Set(keptAccounts.map((account) => account.id))
  const archivedExtras: LocalAccount[] = []
  for (const account of current.accounts) {
    if (keptIds.has(account.id)) continue
    if (referencedAccountIds.has(account.id)) {
      archivedExtras.push({ ...account, isArchived: true, isDefault: false, updatedAt: timestamp })
    }
  }

  const defaultAccount = keptAccounts.find((account) => account.isDefault) ?? keptAccounts[0]
  if (!defaultAccount) return { state: current, defaultAccountId: draft.defaultAccountId, error: 'Add at least one account to finish setup.' }

  const accounts = withSingleDefault([...keptAccounts, ...archivedExtras], defaultAccount.id)
  const state: FinanceState = { ...current, accounts, migratedFromSettings: false }
  return { state, defaultAccountId: defaultAccount.id }
}

export interface FinanceConsistencyReport {
  ok: boolean
  issues: readonly string[]
}

export function checkFinanceConsistency(state: FinanceState): FinanceConsistencyReport {
  const issues: string[] = []
  const active = getActiveAccounts(state)

  if (active.length === 0) issues.push('At least one active account is required.')
  const defaults = active.filter((account) => account.isDefault)
  if (defaults.length === 0) issues.push('Exactly one active account must be the default.')
  if (defaults.length > 1) issues.push('Only one active account can be the default.')

  const seenNames = new Set<string>()
  for (const account of active) {
    const key = account.name.toLocaleLowerCase()
    if (seenNames.has(key)) issues.push(`Duplicate active account name: ${account.name}.`)
    seenNames.add(key)
  }

  const accountIds = new Set(state.accounts.map((account) => account.id))
  for (const transaction of state.transactions) {
    if (!accountIds.has(transaction.accountId)) issues.push(`Transaction ${transaction.id} references a missing account.`)
    if (transaction.type === 'transfer' && transaction.destinationAccountId && !accountIds.has(transaction.destinationAccountId)) {
      issues.push(`Transfer ${transaction.id} references a missing destination account.`)
    }
  }

  return { ok: issues.length === 0, issues }
}
