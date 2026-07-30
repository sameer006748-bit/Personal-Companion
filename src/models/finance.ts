// Dynamic account and transaction domain models for local-first finance core.

export type AccountId = string

export type AccountType = 'cash' | 'bank' | 'wallet' | 'savings' | 'other'

export type TransactionType = 'income' | 'expense' | 'transfer'

export type TransactionDirection =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'receivable'
  | 'payable'

export type TransactionStatus =
  | 'paid'
  | 'received'
  | 'pending'
  | 'overdue'
  | 'transfer'

export type ReceivableStatus =
  | 'pending'
  | 'partially-received'
  | 'overdue'
  | 'received'

export type PayableStatus = 'pending' | 'partially-paid' | 'overdue' | 'paid'

export type CommitmentStatus = 'paid' | 'overdue'

export type PlanningCommitmentStatus =
  | 'upcoming'
  | 'due-soon'
  | 'paid'
  | 'overdue'

export type FinancialPosition = 'Comfortable' | 'Tight'

// Legacy category type kept for seeded history compatibility.
export type TransactionCategory =
  | 'client-payment'
  | 'consultation'
  | 'housing'
  | 'health'
  | 'utilities'
  | 'groceries'
  | 'shopping'
  | 'dining'
  | 'transport'
  | 'cash-withdrawal'
  | 'medicine'
  | 'electricity'
  | 'entertainment'
  | 'loan'
  | 'transfer'
  // New MVP categories
  | 'salary'
  | 'freelance'
  | 'refund'
  | 'gift'
  | 'other-income'
  | 'rent'
  | 'fuel'
  | 'mobile'
  | 'gym'
  | 'education'
  | 'personal'
  | 'other-expense'
  | 'account-transfer'
  | 'internet'

export interface FinanceProfile {
  name: string
  initials: string
  incomeType: string
}

export interface Account {
  id: AccountId
  label: string
  balance: number
  isDefault: boolean
}

export interface LocalAccount {
  id: AccountId
  name: string
  type: AccountType
  institutionName?: string
  lastFourDigits?: string
  openingBalance: number
  isDefault: boolean
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export interface FinanceTransaction {
  id: string
  title: string
  counterparty?: string
  accountId: AccountId
  date: string
  amount: number
  direction: TransactionDirection
  category: TransactionCategory
  status: TransactionStatus
  isHomeRelevant?: boolean
  isLocal?: boolean
  destinationAccountId?: AccountId
  note?: string
  updatedAt?: string
}

export interface LocalTransaction {
  id: string
  type: TransactionType
  amount: number
  date: string
  title: string
  categoryId: TransactionCategory
  accountId: AccountId
  destinationAccountId?: AccountId
  personOrBusiness?: string
  note?: string
  status: TransactionStatus
  isLocal: true
  createdAt: string
  updatedAt: string
}

export interface OutstandingItem {
  id: string
  label: string
  remainingAmount: number
  isOverdue?: boolean
}

export interface Commitment {
  id: string
  label: string
  amount: number
  dueDate: string
  status: CommitmentStatus
}

export interface PlanningReceivable {
  id: string
  counterparty: string
  originalAmount: number
  receivedAmount: number
  dueDate: string
  status: ReceivableStatus
  note?: string
}

export interface PlanningPayable {
  id: string
  counterparty: string
  originalAmount: number
  paidAmount: number
  dueDate: string
  status: PayableStatus
  note?: string
}

export type CommitmentFrequency = 'monthly' | 'weekly' | 'yearly'

export interface PlanningCommitment {
  id: string
  label: string
  category: TransactionCategory
  amount: number
  frequency: CommitmentFrequency
  dueDate: string
  status: PlanningCommitmentStatus
  accountId?: AccountId
}

export interface PersonalFinanceData {
  reportingMonth: string
  activityReferenceDate: string
  planningReferenceDate: string
  profile: FinanceProfile
  accounts: readonly Account[]
  transactions: readonly FinanceTransaction[]
  receivables: readonly OutstandingItem[]
  payables: readonly OutstandingItem[]
  commitments: readonly Commitment[]
  planningReceivables: readonly PlanningReceivable[]
  planningPayables: readonly PlanningPayable[]
  planningCommitments: readonly PlanningCommitment[]
  liquidityReserve: number
  previousMonthIncome: number
}

// Category metadata for transaction entry.
export interface CategoryDefinition {
  id: TransactionCategory
  label: string
  type: TransactionType | 'any'
}

export const INCOME_CATEGORIES: readonly CategoryDefinition[] = [
  { id: 'client-payment', label: 'Client Payment', type: 'income' },
  { id: 'salary', label: 'Salary', type: 'income' },
  { id: 'freelance', label: 'Freelance', type: 'income' },
  { id: 'consultation', label: 'Consultation', type: 'income' },
  { id: 'refund', label: 'Refund', type: 'income' },
  { id: 'gift', label: 'Gift', type: 'income' },
  { id: 'other-income', label: 'Other Income', type: 'income' },
]

export const EXPENSE_CATEGORIES: readonly CategoryDefinition[] = [
  { id: 'rent', label: 'Rent', type: 'expense' },
  { id: 'groceries', label: 'Groceries', type: 'expense' },
  { id: 'dining', label: 'Dining', type: 'expense' },
  { id: 'fuel', label: 'Fuel', type: 'expense' },
  { id: 'transport', label: 'Transport', type: 'expense' },
  { id: 'shopping', label: 'Shopping', type: 'expense' },
  { id: 'internet', label: 'Internet', type: 'expense' },
  { id: 'mobile', label: 'Mobile', type: 'expense' },
  { id: 'utilities', label: 'Utilities', type: 'expense' },
  { id: 'health', label: 'Health', type: 'expense' },
  { id: 'gym', label: 'Gym', type: 'expense' },
  { id: 'entertainment', label: 'Entertainment', type: 'expense' },
  { id: 'education', label: 'Education', type: 'expense' },
  { id: 'personal', label: 'Personal', type: 'expense' },
  { id: 'other-expense', label: 'Other Expense', type: 'expense' },
]

export const TRANSFER_CATEGORIES: readonly CategoryDefinition[] = [
  { id: 'account-transfer', label: 'Account Transfer', type: 'transfer' },
]

export const ALL_CATEGORIES: readonly CategoryDefinition[] = [
  ...INCOME_CATEGORIES,
  ...EXPENSE_CATEGORIES,
  ...TRANSFER_CATEGORIES,
]

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Cash',
  bank: 'Bank',
  wallet: 'Wallet',
  savings: 'Savings',
  other: 'Other',
}

export function getCategoryLabel(categoryId: TransactionCategory): string {
  return ALL_CATEGORIES.find((cat) => cat.id === categoryId)?.label ?? categoryId
}

export function getAccountTypeLabel(type: AccountType): string {
  return ACCOUNT_TYPE_LABELS[type] ?? type
}