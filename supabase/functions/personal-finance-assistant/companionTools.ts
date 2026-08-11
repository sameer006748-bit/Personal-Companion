/**
 * The business tool surface: schemas, entity resolution, and deterministic
 * executors. These are the app's side of the boundary — they decide what is
 * true and what is a valid action. The provider decides only which of them to
 * call and how to word the result.
 *
 * Read tools return authoritative app facts from the bounded client snapshot.
 * Proposal tools build validated drafts and never execute a write.
 */

import {
  addAuthoritativeToolResult,
  NumericProvenanceFailure,
  verifyCalculationRequest,
  type NumericProvenanceLedger,
} from './numericProvenance.ts'

export const VERIFIED_CALCULATION_TOOL = 'calculate_verified'
export const MAX_TEXT_CHARS = 1_200

export function cleanText(value: unknown, limit: number): string {
  if (typeof value !== 'string') return ''
  let cleaned = ''
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    const hidden = code < 0x20 || (code >= 0x7f && code <= 0x9f) ||
      (code >= 0x200b && code <= 0x200f) || (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2060 && code <= 0x206f)
    cleaned += hidden ? ' ' : character
  }
  return cleaned.replaceAll(/\s+/gu, ' ').trim().slice(0, limit)
}

/** Personalization is user prose, so markdown and structural markers are stripped too. */
export function cleanPersonalizationText(value: unknown, limit: number): string {
  return cleanText(value, limit * 2)
    .replaceAll(/[`*_#~<>]/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim()
    .slice(0, limit)
}

export function safeId(value: unknown): string {
  const id = cleanText(value, 100)
  return /^[a-zA-Z0-9:_-]{1,100}$/u.test(id) ? id : ''
}

export function safeNumber(value: unknown, minimum = -100_000_000, maximum = 100_000_000): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
    ? Math.round(value)
    : undefined
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export interface AccountContext { id: string; name: string; type: string; balance: number }
export interface TransactionContext {
  id: string
  title: string
  amount: number
  date: string
  direction: string
  accountId: string
  counterparty?: string
}
export interface FinancialRecordContext {
  id: string
  label: string
  amount: number
  dueDate?: string
  status?: string
  accountId?: string
  frequency?: string
}
export interface ManagedAccountContext extends AccountContext {
  openingBalance: number
  isDefault: boolean
  isArchived: boolean
  institutionName?: string
  lastFourDigits?: string
}
export interface ManagedTransactionContext {
  id: string
  type: 'income' | 'expense' | 'transfer'
  amount: number
  date: string
  title: string
  categoryId: string
  accountId: string
  destinationAccountId?: string
  personOrBusiness?: string
  note?: string
}
export interface ManagedPlanningContext {
  id: string
  counterparty: string
  originalAmount: number
  settledAmount: number
  dueDate: string
  note?: string
  accountId?: string
}
export interface ManagedCommitmentContext {
  id: string
  label: string
  categoryId: string
  amount: number
  frequency: string
  dueDate: string
  note?: string
  accountId?: string
  isSettled: boolean
  isArchived: boolean
}
export interface FinanceContext {
  currency: 'PKR'
  today: string
  accounts: AccountContext[]
  summary: Record<string, number>
  financialPosition: 'Comfortable' | 'Tight'
  accountDistribution: { accountId: string; label: string; balance: number; sharePercent: number }[]
  recentTransactions: TransactionContext[]
  receivables: FinancialRecordContext[]
  payables: FinancialRecordContext[]
  commitments: FinancialRecordContext[]
  managedAccounts: ManagedAccountContext[]
  managedTransactions: ManagedTransactionContext[]
  managedReceivables: ManagedPlanningContext[]
  managedPayables: ManagedPlanningContext[]
  managedCommitments: ManagedCommitmentContext[]
}

// Nothing crossing the network is trusted, so the already-bounded client
// snapshot is re-bounded here before any tool can read it.
export function parseAccounts(value: unknown): AccountContext[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 20).flatMap((candidate) => {
    const item = record(candidate)
    const id = safeId(item.id)
    const name = cleanText(item.name, 80)
    const type = cleanText(item.type, 30).toLocaleLowerCase()
    const balance = safeNumber(item.balance)
    return id && name && balance !== undefined ? [{ id, name, type: type || 'other', balance }] : []
  })
}

export function parseSummary(value: unknown): Record<string, number> {
  const input = record(value)
  const keys = [
    'totalBalance', 'cashBalance', 'monthlyIncome', 'monthlyExpenses',
    'netMonthlyCashFlow', 'receivables', 'payables', 'commitments',
    'overdueItems', 'safeToSpend', 'overdueTotal', 'upcomingItems',
  ]
  const output: Record<string, number> = {}
  for (const key of keys) {
    const number = safeNumber(input[key])
    if (number !== undefined) output[key] = number
  }
  return output
}

export function parseTransactions(value: unknown): TransactionContext[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 50).flatMap((candidate) => {
    const item = record(candidate)
    const id = safeId(item.id)
    const title = cleanText(item.title, 100)
    const amount = safeNumber(item.amount, 0)
    const date = cleanText(item.date, 10)
    const direction = cleanText(item.direction, 30)
    const accountId = safeId(item.accountId)
    const counterparty = cleanText(item.counterparty, 80)
    return id && title && amount !== undefined && /^\d{4}-\d{2}-\d{2}$/u.test(date) && accountId
      ? [{ id, title, amount, date, direction, accountId, ...(counterparty ? { counterparty } : {}) }]
      : []
  })
}

export function parseAccountDistribution(value: unknown): FinanceContext['accountDistribution'] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 20).flatMap((candidate) => {
    const item = record(candidate)
    const accountId = safeId(item.accountId)
    const label = cleanText(item.label, 80)
    const balance = safeNumber(item.balance)
    const sharePercent = safeNumber(item.sharePercent, -10_000, 10_000)
    return accountId && label && balance !== undefined && sharePercent !== undefined
      ? [{ accountId, label, balance, sharePercent }]
      : []
  })
}

export function parseManagedAccounts(value: unknown): ManagedAccountContext[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 20).flatMap((candidate) => {
    const item = record(candidate)
    const id = safeId(item.id)
    const name = cleanText(item.name, 80)
    const type = cleanText(item.type, 20)
    const openingBalance = safeNumber(item.openingBalance, 0)
    const balance = safeNumber(item.balance)
    const institutionName = cleanText(item.institutionName, 80)
    const lastFourDigits = cleanText(item.lastFourDigits, 4)
    if (!id || !name || !new Set(['cash', 'bank', 'wallet', 'savings', 'other']).has(type) || openingBalance === undefined || balance === undefined) return []
    return [{ id, name, type, openingBalance, balance, isDefault: item.isDefault === true, isArchived: item.isArchived === true, ...(institutionName ? { institutionName } : {}), ...(lastFourDigits ? { lastFourDigits } : {}) }]
  })
}

export function parseManagedTransactions(value: unknown): ManagedTransactionContext[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 50).flatMap((candidate) => {
    const item = record(candidate)
    const id = safeId(item.id)
    const type = cleanText(item.type, 20)
    const amount = safeNumber(item.amount, 1)
    const date = cleanText(item.date, 10)
    const title = cleanText(item.title, 120)
    const categoryId = cleanText(item.categoryId, 40)
    const accountId = safeId(item.accountId)
    const destinationAccountId = safeId(item.destinationAccountId)
    const personOrBusiness = cleanText(item.personOrBusiness, 80)
    const note = cleanText(item.note, 240)
    if (!id || !new Set(['income', 'expense', 'transfer']).has(type) || amount === undefined || !/^\d{4}-\d{2}-\d{2}$/u.test(date) || !title || !categoryId || !accountId) return []
    return [{ id, type: type as ManagedTransactionContext['type'], amount, date, title, categoryId, accountId, ...(destinationAccountId ? { destinationAccountId } : {}), ...(personOrBusiness ? { personOrBusiness } : {}), ...(note ? { note } : {}) }]
  })
}

export function parseManagedPlanning(value: unknown, settledKey: 'receivedAmount' | 'paidAmount'): ManagedPlanningContext[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 50).flatMap((candidate) => {
    const item = record(candidate)
    const id = safeId(item.id)
    const counterparty = cleanText(item.counterparty, 80)
    const originalAmount = safeNumber(item.originalAmount, 1)
    const settledAmount = safeNumber(item[settledKey], 0)
    const dueDate = cleanText(item.dueDate, 10)
    const note = cleanText(item.note, 240)
    const accountId = safeId(item.accountId)
    if (!id || !counterparty || originalAmount === undefined || settledAmount === undefined || !/^\d{4}-\d{2}-\d{2}$/u.test(dueDate)) return []
    return [{ id, counterparty, originalAmount, settledAmount, dueDate, ...(note ? { note } : {}), ...(accountId ? { accountId } : {}) }]
  })
}

export function parseManagedCommitments(value: unknown): ManagedCommitmentContext[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 50).flatMap((candidate) => {
    const item = record(candidate)
    const id = safeId(item.id)
    const label = cleanText(item.label, 100)
    const categoryId = cleanText(item.category, 40)
    const amount = safeNumber(item.amount, 1)
    const frequency = cleanText(item.frequency, 20)
    const dueDate = cleanText(item.dueDate, 10)
    const note = cleanText(item.note, 240)
    const accountId = safeId(item.accountId)
    if (!id || !label || !categoryId || amount === undefined || !new Set(['weekly', 'monthly', 'quarterly', 'yearly', 'one-time']).has(frequency) || !/^\d{4}-\d{2}-\d{2}$/u.test(dueDate)) return []
    return [{ id, label, categoryId, amount, frequency, dueDate, ...(note ? { note } : {}), ...(accountId ? { accountId } : {}), isSettled: item.isSettled === true, isArchived: item.isArchived === true }]
  })
}

export function parseFinancialRecords(value: unknown): FinancialRecordContext[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 10).flatMap((candidate) => {
    const item = record(candidate)
    const id = safeId(item.id)
    const label = cleanText(item.label, 100)
    const amount = safeNumber(item.amount, 0)
    const dueDate = cleanText(item.dueDate, 10)
    const status = cleanText(item.status, 30)
    const accountId = safeId(item.accountId)
    const frequency = cleanText(item.frequency, 30)
    return id && label && amount !== undefined
      ? [{ id, label, amount, ...(dueDate ? { dueDate } : {}), ...(status ? { status } : {}), ...(accountId ? { accountId } : {}), ...(frequency ? { frequency } : {}) }]
      : []
  })
}

export function parseFinanceContext(value: unknown, today: string): FinanceContext {
  const financeInput = record(value)
  return {
    currency: 'PKR',
    today,
    accounts: parseAccounts(financeInput.accounts),
    summary: parseSummary(financeInput.summary),
    financialPosition: financeInput.financialPosition === 'Comfortable' ? 'Comfortable' : 'Tight',
    accountDistribution: parseAccountDistribution(financeInput.accountDistribution),
    recentTransactions: parseTransactions(financeInput.recentTransactions),
    receivables: parseFinancialRecords(financeInput.receivables),
    payables: parseFinancialRecords(financeInput.payables),
    commitments: parseFinancialRecords(financeInput.commitments),
    managedAccounts: parseManagedAccounts(financeInput.managedAccounts),
    managedTransactions: parseManagedTransactions(financeInput.managedTransactions),
    managedReceivables: parseManagedPlanning(financeInput.managedReceivables, 'receivedAmount'),
    managedPayables: parseManagedPlanning(financeInput.managedPayables, 'paidAmount'),
    managedCommitments: parseManagedCommitments(financeInput.managedCommitments),
  }
}

function stringProperty(description: string): Record<string, unknown> {
  return { type: 'string', description }
}
function numberProperty(): Record<string, unknown> { return { type: 'integer', minimum: 1, maximum: 10 } }
function amountProperty(): Record<string, unknown> { return { type: 'integer', minimum: 1, maximum: 100_000_000 } }
function nonNegativeAmountProperty(): Record<string, unknown> { return { type: 'integer', minimum: 0, maximum: 100_000_000 } }
function booleanProperty(): Record<string, unknown> { return { type: 'boolean' } }
function dateProperty(): Record<string, unknown> { return { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } }
function proposalProperties(accountKey: string): Record<string, unknown> {
  return {
    amountPkr: amountProperty(),
    [accountKey]: stringProperty('Active account display name or type'),
    description: stringProperty('Short description'),
    effectiveDate: dateProperty(),
    personOrBusiness: stringProperty('Counterparty name (person, business, or source)'),
    note: stringProperty('Optional extra context or purpose'),
  }
}
function tool(name: string, description: string, properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return { type: 'function', function: { name, description, parameters: { type: 'object', additionalProperties: false, properties, required } } }
}

/** Every business/data capability. The provider receives this whole list on every round. */
export const BUSINESS_TOOL_DEFINITIONS = [
  tool('get_available_accounts', 'List safe active account labels and types, plus account types that are not present. Use get_account_balance for an amount.', {}),
  tool('get_account_balance', 'Get one authoritative account balance. Returns not_found or ambiguous explicitly.', { accountLabel: stringProperty('Account display name or type') }, ['accountLabel']),
  tool('get_total_balance', 'Get the authoritative total balance.', {}),
  tool('get_cash_balance', 'Get the authoritative balance across cash accounts.', {}),
  tool('get_account_distribution', 'Get each active account balance and its deterministic share of the current total.', {}),
  tool('get_income_total', 'Get the authoritative current reporting-month income total.', {}),
  tool('get_expense_total', 'Get the authoritative current reporting-month expense total.', {}),
  tool('get_financial_position', 'Get the deterministic local financial-position label with its supporting totals.', {}),
  tool('get_safe_to_spend', 'Get the locally calculated safe-to-spend amount.', {}),
  tool('get_recent_transactions', 'Search the bounded current transaction snapshot by title or counterparty, or get the most recent results.', { limit: numberProperty(), query: stringProperty('Optional title or counterparty filter') }),
  tool('get_receivables', 'Get outstanding receivables.', {}),
  tool('get_payables', 'Get outstanding payables.', {}),
  tool('get_commitments', 'Get active commitments.', {}),
  tool('get_overdue_items', 'Get overdue receivables, payables, and commitments.', {}),
  tool('get_financial_summary', 'Get the authoritative bounded financial summary.', {}),
  tool('find_financial_record', 'Find a matching account, transaction, receivable, payable, or commitment.', { query: stringProperty('Natural record label or counterparty') }, ['query']),
  tool('find_domain_record', 'Find a current editable or archived domain record before preparing an update, delete, archive, restore, or default-account action.', { entityType: { type: 'string', enum: ['account', 'transaction', 'receivable', 'payable', 'commitment'] }, query: stringProperty('Record label, counterparty, title, or current id') }, ['entityType', 'query']),
  tool('get_largest_expenses', 'Get the largest recent expenses, so spending can be explained from records rather than estimated.', { limit: numberProperty() }),
  tool('get_upcoming_dues', 'Get receivables, payables, and commitments due within a number of days.', { withinDays: { type: 'integer', minimum: 1, maximum: 90 } }),
  tool('check_affordability', 'Check what giving or spending an amount would leave, using the locally calculated safe-to-spend figure. Use this before advising on whether something is affordable.', { amountPkr: amountProperty() }, ['amountPkr']),
  tool('compare_payment_options', 'Deterministically compare two user-proposed payment amounts against current balance, safe-to-spend, and a known payable or commitment.', { recordType: { type: 'string', enum: ['payable', 'commitment'] }, recordQuery: stringProperty('Known payable counterparty or commitment label'), firstAmountPkr: amountProperty(), secondAmountPkr: amountProperty() }, ['recordType', 'recordQuery', 'firstAmountPkr', 'secondAmountPkr']),
  tool('assess_payment_delay', 'Report the current deterministic effect of delaying a known payable or commitment without inventing fees or future income.', { recordType: { type: 'string', enum: ['payable', 'commitment'] }, recordQuery: stringProperty('Known payable counterparty or commitment label') }, ['recordType', 'recordQuery']),
  tool('propose_income', 'Prepare an income preview without recording it.', proposalProperties('targetAccountLabel'), ['amountPkr', 'targetAccountLabel']),
  tool('propose_expense', 'Prepare an expense preview without recording it.', proposalProperties('sourceAccountLabel'), ['amountPkr', 'sourceAccountLabel']),
  tool('propose_transfer', 'Prepare a transfer preview without recording it.', { amountPkr: amountProperty(), sourceAccountLabel: stringProperty('Source account'), targetAccountLabel: stringProperty('Destination account'), description: stringProperty('Short description'), effectiveDate: dateProperty() }, ['amountPkr', 'sourceAccountLabel', 'targetAccountLabel']),
  tool('propose_account_adjustment', 'Prepare an account adjustment preview without recording it.', proposalProperties('targetAccountLabel'), ['amountPkr', 'targetAccountLabel']),
  tool('propose_receivable', 'Prepare a preview for a NEW record of money someone owes the user. Use this when no receivable exists yet for that person.', { counterparty: stringProperty('Person or party who owes the user'), amountPkr: amountProperty(), dueDate: dateProperty(), description: stringProperty('Short description') }, ['counterparty', 'amountPkr']),
  tool('propose_payable', 'Prepare a preview for a NEW record of money the user owes someone. Use this when the user says they have to give money to someone and no payable exists yet.', { counterparty: stringProperty('Person or party the user owes'), amountPkr: amountProperty(), dueDate: dateProperty(), description: stringProperty('Short description') }, ['counterparty', 'amountPkr']),
  tool('propose_receivable_payment', 'Prepare a receipt preview against an EXISTING receivable without recording it.', { recordQuery: stringProperty('Receivable counterparty or label'), targetAccountLabel: stringProperty('Destination account'), amountPkr: amountProperty(), effectiveDate: dateProperty() }, ['recordQuery', 'targetAccountLabel']),
  tool('propose_payable_payment', 'Prepare a payment preview against an EXISTING payable without recording it.', { recordQuery: stringProperty('Payable counterparty or label'), sourceAccountLabel: stringProperty('Source account'), amountPkr: amountProperty(), effectiveDate: dateProperty() }, ['recordQuery', 'sourceAccountLabel']),
  tool('propose_commitment', 'Prepare a commitment preview without recording it.', { label: stringProperty('Commitment label'), amountPkr: amountProperty(), frequency: { type: 'string', enum: ['weekly', 'monthly', 'quarterly', 'yearly', 'one-time'] }, dueDate: dateProperty() }, ['label', 'amountPkr', 'frequency', 'dueDate']),
  tool('propose_commitment_settlement', 'Prepare a preview to mark an EXISTING commitment paid without recording it or moving account money.', { recordQuery: stringProperty('Commitment label') }, ['recordQuery']),
  tool('propose_account_create', 'Prepare a preview to create an account.', { accountName: stringProperty('New account name'), accountType: { type: 'string', enum: ['cash', 'bank', 'wallet', 'savings', 'other'] }, openingBalance: nonNegativeAmountProperty(), institutionName: stringProperty('Optional institution name'), lastFourDigits: stringProperty('Optional final four digits'), makeDefault: booleanProperty() }, ['accountName', 'accountType', 'openingBalance']),
  tool('propose_account_update', 'Prepare a preview to update an existing account; omitted fields keep their current values.', { accountQuery: stringProperty('Current account name'), accountName: stringProperty('New account name'), accountType: { type: 'string', enum: ['cash', 'bank', 'wallet', 'savings', 'other'] }, openingBalance: nonNegativeAmountProperty(), institutionName: stringProperty('Institution name'), lastFourDigits: stringProperty('Final four digits'), makeDefault: booleanProperty() }, ['accountQuery']),
  tool('propose_account_state', 'Prepare a preview to archive, restore, or make an existing account the default.', { accountQuery: stringProperty('Current account name'), operation: { type: 'string', enum: ['archive', 'restore', 'set-default'] } }, ['accountQuery', 'operation']),
  tool('propose_transaction_update', 'Prepare a preview to update an existing local transaction; omitted fields keep current values.', { transactionQuery: stringProperty('Transaction title or id'), transactionType: { type: 'string', enum: ['income', 'expense', 'transfer'] }, amountPkr: amountProperty(), description: stringProperty('Transaction title'), effectiveDate: dateProperty(), categoryId: stringProperty('Existing supported category id'), sourceAccountLabel: stringProperty('Source account'), targetAccountLabel: stringProperty('Destination account for transfer'), personOrBusiness: stringProperty('Optional counterparty'), note: stringProperty('Optional note') }, ['transactionQuery']),
  tool('propose_transaction_delete', 'Prepare a preview to delete an existing local transaction.', { transactionQuery: stringProperty('Transaction title or id') }, ['transactionQuery']),
  tool('propose_planning_update', 'Prepare a preview to update an existing receivable or payable; omitted fields keep current values.', { recordType: { type: 'string', enum: ['receivable', 'payable'] }, recordQuery: stringProperty('Counterparty or id'), counterparty: stringProperty('Updated counterparty'), originalAmountPkr: amountProperty(), settledAmountPkr: nonNegativeAmountProperty(), dueDate: dateProperty(), accountLabel: stringProperty('Optional linked active account'), note: stringProperty('Optional note') }, ['recordType', 'recordQuery']),
  tool('propose_planning_delete', 'Prepare a preview to delete an existing receivable or payable.', { recordType: { type: 'string', enum: ['receivable', 'payable'] }, recordQuery: stringProperty('Counterparty or id') }, ['recordType', 'recordQuery']),
  tool('propose_commitment_update', 'Prepare a preview to update an existing commitment; omitted fields keep current values.', { recordQuery: stringProperty('Commitment label or id'), label: stringProperty('Updated label'), amountPkr: amountProperty(), categoryId: stringProperty('Existing supported category id'), frequency: { type: 'string', enum: ['weekly', 'monthly', 'quarterly', 'yearly', 'one-time'] }, dueDate: dateProperty(), accountLabel: stringProperty('Optional linked active account'), note: stringProperty('Optional note') }, ['recordQuery']),
  tool('propose_commitment_state', 'Prepare a preview to archive, restore, or delete an existing commitment.', { recordQuery: stringProperty('Commitment label or id'), operation: { type: 'string', enum: ['archive', 'restore', 'delete'] } }, ['recordQuery', 'operation']),
  tool('propose_preference_update', 'Prepare a preview to update one existing profile or app preference.', { preferenceKey: { type: 'string', enum: ['profile-name', 'income-type', 'financial-position-style', 'hide-balances-on-launch', 'assistant-response-style', 'assistant-calculations', 'assistant-suggestions', 'theme-preference', 'privacy-mode', 'personalization-enabled'] }, stringValue: stringProperty('String value when the preference is textual'), booleanValue: booleanProperty() }, ['preferenceKey']),
  tool('propose_memory_candidate', 'Prepare a memory candidate that still requires user consent.', { category: { type: 'string', enum: ['communication_preference', 'financial_goal', 'person_alias', 'account_preference', 'routine_preference', 'app_preference', 'user_defined_fact'] }, summary: stringProperty('Durable fact, maximum 180 characters'), normalizedValue: stringProperty('Compact normalized value'), displayLabel: stringProperty('Short user-facing label'), reason: stringProperty('Why this could help later'), sensitivity: { type: 'string', enum: ['normal', 'sensitive'] }, retention: { type: 'string', enum: ['short', 'long', 'permanent'] } }, ['category', 'summary', 'normalizedValue', 'displayLabel', 'reason']),
] as const

/**
 * A pure deterministic arithmetic capability, offered like any other tool.
 * Nothing forces it: the provider chooses it when it wants a number checked.
 */
export const REASONING_TOOL_DEFINITIONS = [
  tool(
    VERIFIED_CALCULATION_TOOL,
    'Deterministically calculate a derived number from provenance-typed operands. Use whole_units for a complete purchasable-item count.',
    {
      operation: {
        type: 'string',
        enum: ['add', 'subtract', 'multiply', 'divide', 'whole_units', 'percentage_of', 'increase_by_percentage', 'decrease_by_percentage', 'difference', 'remaining', 'average'],
      },
      operands: {
        type: 'array',
        minItems: 2,
        maxItems: 12,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            value: { type: 'number' },
            unit: { type: 'string', enum: ['PKR', 'PERCENT', 'SCALAR'] },
            provenance: { type: 'string', enum: ['APP_AUTHORITATIVE', 'USER_CURRENT_CONVERSATIONAL', 'USER_PRIOR_CONVERSATIONAL'] },
          },
          required: ['value', 'unit', 'provenance'],
        },
      },
      unit: { type: 'string', enum: ['PKR', 'PERCENT', 'SCALAR'] },
    },
    ['operation', 'operands', 'unit'],
  ),
] as const

/** The complete surface, in one list, resent on every provider round. */
export const ALL_TOOL_DEFINITIONS = [...BUSINESS_TOOL_DEFINITIONS, ...REASONING_TOOL_DEFINITIONS]

export const ALL_TOOL_NAMES: ReadonlySet<string> = new Set(
  ALL_TOOL_DEFINITIONS.map((definition) => String(record(definition.function).name)),
)

export const REASONING_TOOL_NAMES: ReadonlySet<string> = new Set([VERIFIED_CALCULATION_TOOL])

export const PROPOSAL_TOOL_NAMES: ReadonlySet<string> = new Set([
  'propose_income',
  'propose_expense',
  'propose_transfer',
  'propose_account_adjustment',
  'propose_receivable',
  'propose_payable',
  'propose_receivable_payment',
  'propose_payable_payment',
  'propose_commitment',
  'propose_commitment_settlement',
  'propose_account_create',
  'propose_account_update',
  'propose_account_state',
  'propose_transaction_update',
  'propose_transaction_delete',
  'propose_planning_update',
  'propose_planning_delete',
  'propose_commitment_update',
  'propose_commitment_state',
  'propose_preference_update',
  'propose_memory_candidate',
])

/** Proposal tools that draft a financial action. Memory is consent, not finance. */
export const ACTION_TOOL_NAMES: ReadonlySet<string> = new Set(
  [...PROPOSAL_TOOL_NAMES].filter((name) => name !== 'propose_memory_candidate'),
)

function normalise(value: string): string {
  return value.toLocaleLowerCase().replaceAll(/[^a-z0-9\s]/gu, ' ').replaceAll(/\s+/gu, ' ').trim()
}

function resolveAccount(context: FinanceContext, queryValue: unknown): Record<string, unknown> {
  const requestedLabel = cleanText(queryValue, 80)
  const query = normalise(requestedLabel)
  const exact = context.accounts.filter((account) => normalise(account.name) === query || account.type === query)
  const matches = exact.length ? exact : context.accounts.filter((account) => normalise(account.name).includes(query) || query.includes(normalise(account.name)))
  const availableAccounts = context.accounts.map(({ id, name, type }) => ({ id, name, type }))
  if (!query || matches.length === 0) return { status: 'not_found', entity: 'account', requestedLabel, availableAccounts }
  if (matches.length > 1) return { status: 'ambiguous', entity: 'account', requestedLabel, matches: matches.map(({ id, name, type }) => ({ id, name, type })) }
  return { status: 'found', entity: 'account', account: matches[0] }
}

function resolveFinancialRecord(items: FinancialRecordContext[], queryValue: unknown, entity: string): Record<string, unknown> {
  const requestedLabel = cleanText(queryValue, 100)
  const query = normalise(requestedLabel)
  const exact = items.filter((item) => normalise(item.label) === query || item.id === requestedLabel)
  const matches = exact.length ? exact : items.filter((item) => normalise(item.label).includes(query) || query.includes(normalise(item.label)))
  if (!query || matches.length === 0) return { status: 'not_found', entity, requestedLabel, availableOptions: items.slice(0, 5).map(({ id, label }) => ({ id, label })) }
  if (matches.length > 1) return { status: 'ambiguous', entity, requestedLabel, matches: matches.slice(0, 5) }
  return { status: 'found', entity, record: matches[0] }
}

function resolveManagedRecord<T extends { id: string }>(
  items: readonly T[],
  queryValue: unknown,
  entity: string,
  labelOf: (item: T) => string,
): Record<string, unknown> {
  const requestedLabel = cleanText(queryValue, 120)
  const query = normalise(requestedLabel)
  const exact = items.filter((item) => item.id === requestedLabel || normalise(labelOf(item)) === query)
  const matches = exact.length
    ? exact
    : items.filter((item) => query && (normalise(labelOf(item)).includes(query) || query.includes(normalise(labelOf(item)))))
  if (!query || matches.length === 0) return { status: 'not_found', entity, requestedLabel, availableOptions: items.slice(0, 8).map((item) => ({ id: item.id, label: labelOf(item) })) }
  if (matches.length > 1) return { status: 'ambiguous', entity, requestedLabel, matches: matches.slice(0, 8) }
  return { status: 'found', entity, record: matches[0] }
}

export interface ActionDraft {
  actionType: string
  amountPkr: number
  description: string
  effectiveDate: string
  summary: string
  targetAccountId?: string
  sourceAccountId?: string
  recordId?: string
  commitmentFrequency?: string
  counterparty?: string
  accountName?: string
  accountType?: string
  openingBalance?: number
  settledAmount?: number
  institutionName?: string
  lastFourDigits?: string
  makeDefault?: boolean
  transactionType?: string
  categoryId?: string
  personOrBusiness?: string
  note?: string
  preferenceKey?: string
  preferenceValue?: string | boolean
}
export interface MemoryDraft { category: string; summary: string; normalizedValue: string; displayLabel: string; reason: string; sensitivity?: string; retention?: string }
export interface ToolExecutionResult { result: Record<string, unknown>; action?: ActionDraft; memory?: MemoryDraft }

function foundAccount(result: Record<string, unknown>): AccountContext | undefined {
  return result.status === 'found' ? result.account as AccountContext : undefined
}
function foundRecord(result: Record<string, unknown>): FinancialRecordContext | undefined {
  return result.status === 'found' ? result.record as FinancialRecordContext : undefined
}
function proposalAmount(args: Record<string, unknown>, fallback?: number): number | undefined {
  return typeof args.amountPkr === 'number' && Number.isSafeInteger(args.amountPkr) &&
      args.amountPkr >= 1 && args.amountPkr <= 100_000_000
    ? args.amountPkr
    : fallback
}
function proposalDate(args: Record<string, unknown>, context: FinanceContext, key = 'effectiveDate'): string | undefined {
  const date = cleanText(args[key], 10) || context.today
  return /^\d{4}-\d{2}-\d{2}$/u.test(date) ? date : undefined
}

/** Deterministic arithmetic over provenance-typed operands. Operands must already be in the ledger. */
export function executeVerifiedCalculation(args: Record<string, unknown>, ledger: NumericProvenanceLedger): ToolExecutionResult {
  try {
    const verified = verifyCalculationRequest(args, ledger)
    return {
      result: {
        status: 'ok',
        calculation: {
          operation: verified.operation,
          operands: verified.operands.map(({ value, provenance, unit }) => ({ value, provenance, unit })),
          result: verified.result,
          unit: verified.unit,
        },
        result_value: verified.result,
        unit: verified.unit,
        provenance: 'DERIVED_VERIFIED',
      },
    }
  } catch (error) {
    if (!(error instanceof NumericProvenanceFailure)) throw error
    return { result: { status: 'invalid_arguments', error: error.code } }
  }
}

export function executeBusinessTool(name: string, args: Record<string, unknown>, context: FinanceContext): ToolExecutionResult {
  if (name === 'get_available_accounts') {
    const availableAccounts = context.accounts.map(({ id, name: accountName, type }) => ({ id, name: accountName, type }))
    const presentTypes = new Set(context.accounts.map((account) => account.type))
    const unavailableAccountTypes = ['cash', 'bank', 'wallet', 'savings', 'other']
      .filter((type) => !presentTypes.has(type))
    return { result: { status: 'ok', availableAccounts, unavailableAccountTypes } }
  }
  if (name === 'get_account_balance') return { result: resolveAccount(context, args.accountLabel) }
  if (name === 'get_total_balance') return { result: { status: 'ok', currency: 'PKR', totalBalance: context.summary.totalBalance ?? 0 } }
  if (name === 'get_cash_balance') {
    const cashAccounts = context.accounts.filter((account) => account.type === 'cash')
    return { result: cashAccounts.length ? { status: 'ok', currency: 'PKR', cashBalance: context.summary.cashBalance ?? 0, accounts: cashAccounts } : { status: 'not_found', entity: 'account', requestedLabel: 'cash', availableAccounts: context.accounts.map(({ id, name: accountName, type }) => ({ id, name: accountName, type })) } }
  }
  if (name === 'get_account_distribution') return { result: { status: 'ok', currency: 'PKR', accounts: context.accountDistribution } }
  if (name === 'get_income_total') return { result: { status: 'ok', currency: 'PKR', monthlyIncome: context.summary.monthlyIncome ?? 0 } }
  if (name === 'get_expense_total') return { result: { status: 'ok', currency: 'PKR', monthlyExpenses: context.summary.monthlyExpenses ?? 0 } }
  if (name === 'get_financial_position') {
    return {
      result: {
        status: 'ok',
        currency: 'PKR',
        financialPosition: context.financialPosition,
        totalBalance: context.summary.totalBalance ?? 0,
        safeToSpend: context.summary.safeToSpend ?? 0,
        outstandingPayables: context.summary.payables ?? 0,
        remainingCommitments: context.summary.commitments ?? 0,
      },
    }
  }
  if (name === 'get_safe_to_spend') return { result: { status: 'ok', currency: 'PKR', safeToSpend: context.summary.safeToSpend ?? 0 } }
  if (name === 'get_financial_summary') return { result: { status: 'ok', currency: 'PKR', ...context.summary } }
  if (name === 'get_recent_transactions') {
    const query = normalise(cleanText(args.query, 100))
    const limit = safeNumber(args.limit, 1, 10) ?? 10
    const items = query ? context.recentTransactions.filter((item) => normalise(`${item.title} ${item.counterparty ?? ''}`).includes(query)) : context.recentTransactions
    return { result: { status: items.length ? 'ok' : 'not_found', transactions: items.slice(0, limit) } }
  }
  if (name === 'get_receivables') return { result: { status: context.receivables.length ? 'ok' : 'not_found', receivables: context.receivables } }
  if (name === 'get_payables') return { result: { status: context.payables.length ? 'ok' : 'not_found', payables: context.payables } }
  if (name === 'get_commitments') return { result: { status: context.commitments.length ? 'ok' : 'not_found', commitments: context.commitments } }
  if (name === 'get_overdue_items') {
    const items = [...context.receivables, ...context.payables, ...context.commitments].filter((item) => item.status === 'overdue')
    return { result: { status: items.length ? 'ok' : 'not_found', overdueItems: items } }
  }
  if (name === 'find_financial_record') {
    const query = normalise(cleanText(args.query, 100))
    const matches = [
      ...context.accounts.map((item) => ({ entity: 'account', ...item, label: item.name })),
      ...context.recentTransactions.map((item) => ({ entity: 'transaction', ...item, label: item.title })),
      ...context.receivables.map((item) => ({ entity: 'receivable', ...item })),
      ...context.payables.map((item) => ({ entity: 'payable', ...item })),
      ...context.commitments.map((item) => ({ entity: 'commitment', ...item })),
    ].filter((item) => query && normalise(item.label).includes(query)).slice(0, 5)
    return { result: { status: matches.length > 1 ? 'ambiguous' : matches.length === 1 ? 'found' : 'not_found', query: cleanText(args.query, 100), matches } }
  }
  if (name === 'find_domain_record') {
    const entity = cleanText(args.entityType, 20)
    if (entity === 'account') return { result: resolveManagedRecord(context.managedAccounts, args.query, entity, (item) => item.name) }
    if (entity === 'transaction') return { result: resolveManagedRecord(context.managedTransactions, args.query, entity, (item) => item.title) }
    if (entity === 'receivable') return { result: resolveManagedRecord(context.managedReceivables, args.query, entity, (item) => item.counterparty) }
    if (entity === 'payable') return { result: resolveManagedRecord(context.managedPayables, args.query, entity, (item) => item.counterparty) }
    if (entity === 'commitment') return { result: resolveManagedRecord(context.managedCommitments, args.query, entity, (item) => item.label) }
    return { result: { status: 'invalid_arguments' } }
  }
  if (name === 'get_largest_expenses') {
    const limit = safeNumber(args.limit, 1, 10) ?? 5
    const expenses = context.recentTransactions
      .filter((item) => item.direction === 'out' || item.direction === 'expense')
      .sort((left, right) => right.amount - left.amount)
      .slice(0, limit)
    return { result: { status: expenses.length ? 'ok' : 'not_found', currency: 'PKR', expenses } }
  }
  if (name === 'get_upcoming_dues') {
    const withinDays = safeNumber(args.withinDays, 1, 90) ?? 7
    const cutoff = new Date(`${context.today}T00:00:00Z`)
    cutoff.setUTCDate(cutoff.getUTCDate() + withinDays)
    const horizon = cutoff.toISOString().slice(0, 10)
    const items = [
      ...context.receivables.map((item) => ({ entity: 'receivable', ...item })),
      ...context.payables.map((item) => ({ entity: 'payable', ...item })),
      ...context.commitments.map((item) => ({ entity: 'commitment', ...item })),
    ].filter((item) => item.dueDate !== undefined && item.dueDate <= horizon)
    return { result: { status: items.length ? 'ok' : 'not_found', withinDays, horizon, currency: 'PKR', items } }
  }
  if (name === 'check_affordability') {
    // Deterministic, from the same locally calculated figures the app shows.
    const amount = proposalAmount(args)
    if (!amount) return { result: { status: 'invalid_arguments' } }
    const safeToSpend = context.summary.safeToSpend ?? 0
    const totalBalance = context.summary.totalBalance ?? 0
    return {
      result: {
        status: 'ok',
        currency: 'PKR',
        amountPkr: amount,
        safeToSpend,
        totalBalance,
        remainingAfterSafeToSpend: safeToSpend - amount,
        remainingAfterTotalBalance: totalBalance - amount,
        withinSafeToSpend: amount <= safeToSpend,
        outstandingPayables: context.summary.payables ?? 0,
        remainingCommitments: context.summary.commitments ?? 0,
        overdueItems: context.summary.overdueItems ?? 0,
        overdueTotal: context.summary.overdueTotal ?? 0,
        upcomingItems: context.summary.upcomingItems ?? 0,
      },
    }
  }
  if (name === 'compare_payment_options') {
    const recordType = cleanText(args.recordType, 20)
    const items = recordType === 'payable' ? context.payables : recordType === 'commitment' ? context.commitments : []
    const recordResult = resolveFinancialRecord(items, args.recordQuery, recordType)
    const item = foundRecord(recordResult)
    if (!item) return { result: recordResult }
    const firstAmount = safeNumber(args.firstAmountPkr, 1, 100_000_000)
    const secondAmount = safeNumber(args.secondAmountPkr, 1, 100_000_000)
    if (!firstAmount || !secondAmount) return { result: { status: 'invalid_arguments' } }
    const totalBalance = context.summary.totalBalance ?? 0
    const safeToSpend = context.summary.safeToSpend ?? 0
    const option = (amountPkr: number) => ({
      amountPkr,
      remainingTotalBalance: totalBalance - amountPkr,
      remainingSafeToSpend: safeToSpend - amountPkr,
      remainingObligation: Math.max(0, item.amount - amountPkr),
      withinCurrentBalance: amountPkr <= totalBalance,
      withinSafeToSpend: amountPkr <= safeToSpend,
    })
    return {
      result: {
        status: 'ok',
        currency: 'PKR',
        record: item,
        firstOption: option(firstAmount),
        secondOption: option(secondAmount),
        outstandingPayables: context.summary.payables ?? 0,
        remainingCommitments: context.summary.commitments ?? 0,
        overdueTotal: context.summary.overdueTotal ?? 0,
      },
    }
  }
  if (name === 'assess_payment_delay') {
    const recordType = cleanText(args.recordType, 20)
    const items = recordType === 'payable' ? context.payables : recordType === 'commitment' ? context.commitments : []
    const recordResult = resolveFinancialRecord(items, args.recordQuery, recordType)
    const item = foundRecord(recordResult)
    if (!item) return { result: recordResult }
    return {
      result: {
        status: 'ok',
        currency: 'PKR',
        record: item,
        isAlreadyOverdue: item.status === 'overdue',
        remainsOutstandingPkr: item.amount,
        knownRecordedPenaltyPkr: 0,
        uncertainty: 'No future fee, penalty, or income is stored; only the current obligation is known.',
        overdueTotal: context.summary.overdueTotal ?? 0,
        safeToSpend: context.summary.safeToSpend ?? 0,
      },
    }
  }
  if (name === 'propose_memory_candidate') {
    const categories = new Set(['communication_preference', 'financial_goal', 'person_alias', 'account_preference', 'routine_preference', 'app_preference', 'user_defined_fact'])
    const sensitivity = cleanText(args.sensitivity, 20)
    const retention = cleanText(args.retention, 20)
    const memory: MemoryDraft = {
      category: cleanText(args.category, 40),
      summary: cleanText(args.summary, 180),
      normalizedValue: cleanText(args.normalizedValue, 120),
      displayLabel: cleanText(args.displayLabel, 80),
      reason: cleanText(args.reason, 160),
      ...(sensitivity === 'normal' || sensitivity === 'sensitive' ? { sensitivity } : {}),
      ...(retention === 'short' || retention === 'long' || retention === 'permanent' ? { retention } : {}),
    }
    if (!categories.has(memory.category) || !memory.summary || !memory.normalizedValue || !memory.displayLabel || !memory.reason) return { result: { status: 'invalid_arguments' } }
    return { result: { status: 'proposed', memory }, memory }
  }
  if (name === 'propose_receivable' || name === 'propose_payable') {
    // A brand-new obligation. No account is involved because nothing moves yet.
    const owedToUser = name === 'propose_receivable'
    const counterparty = cleanText(args.counterparty, 60)
    const amount = proposalAmount(args)
    const dueDate = proposalDate(args, context, 'dueDate')
    if (!counterparty || !amount || !dueDate) return { result: { status: 'invalid_arguments' } }
    const formatted = amount.toLocaleString('en-PK')
    const action: ActionDraft = {
      actionType: owedToUser ? 'add-receivable' : 'add-payable',
      amountPkr: amount,
      description: cleanText(args.description, 120) || (owedToUser ? `Owed by ${counterparty}` : `Owed to ${counterparty}`),
      effectiveDate: dueDate,
      counterparty,
      summary: owedToUser
        ? `Record that ${counterparty} owes you PKR ${formatted}, due ${dueDate}.`
        : `Record that you owe ${counterparty} PKR ${formatted}, due ${dueDate}.`,
    }
    return { result: { status: 'proposed', preview: action }, action }
  }
  if (name === 'propose_commitment') {
    const amount = proposalAmount(args)
    const dueDate = proposalDate(args, context, 'dueDate')
    const label = cleanText(args.label, 100)
    const frequency = cleanText(args.frequency, 20)
    if (!amount || !dueDate || !label || !new Set(['weekly', 'monthly', 'quarterly', 'yearly', 'one-time']).has(frequency)) return { result: { status: 'invalid_arguments' } }
    const action: ActionDraft = { actionType: 'add-commitment', amountPkr: amount, description: label, effectiveDate: dueDate, commitmentFrequency: frequency, summary: `Add a ${frequency} PKR ${amount.toLocaleString('en-PK')} commitment due ${dueDate}.` }
    return { result: { status: 'proposed', preview: action }, action }
  }
  if (name === 'propose_commitment_settlement') {
    const recordResult = resolveFinancialRecord(context.commitments, args.recordQuery, 'commitment')
    const item = foundRecord(recordResult)
    if (!item) return { result: recordResult }
    const action: ActionDraft = {
      actionType: 'settle-commitment',
      amountPkr: item.amount,
      description: item.label,
      effectiveDate: context.today,
      recordId: item.id,
      summary: `Mark the ${item.label} commitment of PKR ${item.amount.toLocaleString('en-PK')} as paid.`,
    }
    return { result: { status: 'proposed', preview: action }, action }
  }

  const amount = proposalAmount(args)
  const effectiveDate = proposalDate(args, context)
  if (name === 'propose_transfer') {
    const sourceResult = resolveAccount(context, args.sourceAccountLabel)
    const targetResult = resolveAccount(context, args.targetAccountLabel)
    const source = foundAccount(sourceResult)
    const target = foundAccount(targetResult)
    if (!source) return { result: sourceResult }
    if (!target) return { result: targetResult }
    if (!amount || !effectiveDate || source.id === target.id) return { result: { status: 'invalid_arguments' } }
    const action: ActionDraft = { actionType: 'transfer', amountPkr: amount, description: cleanText(args.description, 120) || 'Account transfer', effectiveDate, sourceAccountId: source.id, targetAccountId: target.id, summary: `Transfer PKR ${amount.toLocaleString('en-PK')} from ${source.name} to ${target.name}.` }
    return { result: { status: 'proposed', preview: action }, action }
  }
  if (name === 'propose_receivable_payment' || name === 'propose_payable_payment') {
    const receiving = name === 'propose_receivable_payment'
    const recordResult = resolveFinancialRecord(receiving ? context.receivables : context.payables, args.recordQuery, receiving ? 'receivable' : 'payable')
    const item = foundRecord(recordResult)
    if (!item) return { result: recordResult }
    const accountResult = resolveAccount(context, receiving ? args.targetAccountLabel : args.sourceAccountLabel)
    const account = foundAccount(accountResult)
    if (!account) return { result: accountResult }
    const resolvedAmount = amount ?? item.amount
    if (!resolvedAmount || !effectiveDate || resolvedAmount > item.amount) return { result: { status: 'invalid_arguments', maximumAmountPkr: item.amount } }
    const action: ActionDraft = receiving
      ? { actionType: 'receive-receivable', amountPkr: resolvedAmount, description: `Receipt from ${item.label}`, effectiveDate, targetAccountId: account.id, recordId: item.id, summary: `Receive PKR ${resolvedAmount.toLocaleString('en-PK')} from ${item.label} into ${account.name}.` }
      : { actionType: 'pay-payable', amountPkr: resolvedAmount, description: `Payment to ${item.label}`, effectiveDate, sourceAccountId: account.id, recordId: item.id, summary: `Pay PKR ${resolvedAmount.toLocaleString('en-PK')} to ${item.label} from ${account.name}.` }
    return { result: { status: 'proposed', preview: action }, action }
  }
  if (name === 'propose_income' || name === 'propose_expense' || name === 'propose_account_adjustment') {
    const accountKey = name === 'propose_expense' ? 'sourceAccountLabel' : 'targetAccountLabel'
    const accountResult = resolveAccount(context, args[accountKey])
    const account = foundAccount(accountResult)
    if (!account) return { result: accountResult }
    if (!amount || !effectiveDate) return { result: { status: 'invalid_arguments' } }
    const actionType = name === 'propose_income' ? 'add-income' : name === 'propose_expense' ? 'add-expense' : 'account-adjustment'
    const personOrBusiness = cleanText(args.personOrBusiness, 60)
    const note = cleanText(args.note, 160)
    const description = cleanText(args.description, 120) ||
      (personOrBusiness
        ? actionType === 'add-income' ? `Income from ${personOrBusiness}` : actionType === 'add-expense' ? `Payment to ${personOrBusiness}` : `Adjustment (${personOrBusiness})`
        : actionType === 'add-income' ? 'Assistant-recorded income' : actionType === 'add-expense' ? 'Assistant-recorded expense' : 'Account adjustment')
    const formatted = amount.toLocaleString('en-PK')
    const party = personOrBusiness ? ` (${personOrBusiness})` : ''
    const action: ActionDraft = {
      actionType,
      amountPkr: amount,
      description,
      effectiveDate,
      ...(actionType === 'add-expense' ? { sourceAccountId: account.id } : { targetAccountId: account.id }),
      // Counterparty and purpose carry through so the preview shows who and why.
      ...(personOrBusiness && actionType !== 'account-adjustment' ? { personOrBusiness } : {}),
      ...(note ? { note } : {}),
      summary: actionType === 'add-income'
        ? `Record PKR ${formatted} as income in ${account.name}${party}.`
        : actionType === 'add-expense'
          ? `Record a PKR ${formatted} expense from ${account.name}${party}.`
          : `Add PKR ${formatted} to ${account.name} as an account adjustment.`,
    }
    return { result: { status: 'proposed', preview: action }, action }
  }
  // NOTE: propose_account_create/update/state, propose_transaction_update/delete,
  // propose_planning_update/delete, propose_commitment_update/state and
  // propose_preference_update are declared in the schema list but have no
  // executor branch, exactly as in the previous implementation. They fall
  // through to unsupported_tool below, and the provider is told so in its
  // result. Implementing them is a business-tool change, not an orchestration
  // change, so this rebuild deliberately preserves current behavior.
  return { result: { status: 'unsupported_tool' } }
}

/**
 * The one entry point the loop calls. Read results feed the provenance ledger so
 * `calculate_verified` can accept them as APP_AUTHORITATIVE operands; proposal
 * results never do, because a preview is not a record.
 */
export function executeCompanionTool(
  name: string,
  args: Record<string, unknown>,
  context: FinanceContext,
  ledger: NumericProvenanceLedger,
): ToolExecutionResult {
  if (name === VERIFIED_CALCULATION_TOOL) return executeVerifiedCalculation(args, ledger)
  const execution = executeBusinessTool(name, args, context)
  if (!PROPOSAL_TOOL_NAMES.has(name)) addAuthoritativeToolResult(ledger, name, execution.result)
  return execution
}
