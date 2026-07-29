export type AccountId = 'cash' | 'meezan-bank' | 'jazzcash'

export type TransactionDirection =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'receivable'
  | 'payable'

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

export type TransactionStatus =
  | 'paid'
  | 'received'
  | 'pending'
  | 'overdue'
  | 'transfer'

export type CommitmentStatus = 'paid' | 'overdue'

export type FinancialPosition = 'Comfortable' | 'Tight'

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

export interface PersonalFinanceData {
  reportingMonth: string
  activityReferenceDate: string
  profile: FinanceProfile
  accounts: readonly Account[]
  transactions: readonly FinanceTransaction[]
  receivables: readonly OutstandingItem[]
  payables: readonly OutstandingItem[]
  commitments: readonly Commitment[]
  liquidityReserve: number
  previousMonthIncome: number
}
