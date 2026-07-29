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
