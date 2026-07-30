// Local-first planning domain models: receivables, payables, recurring commitments.
// Records store facts only. Every status is derived centrally in lib/planningCore.

import type { AccountId, CommitmentFrequency, TransactionCategory } from './finance'

export type PlanningFrequency = CommitmentFrequency

export interface ReceivableRecord {
  id: string
  counterparty: string
  originalAmount: number
  receivedAmount: number
  dueDate: string
  note?: string
  accountId?: AccountId
  createdAt: string
  updatedAt: string
}

export interface PayableRecord {
  id: string
  counterparty: string
  originalAmount: number
  paidAmount: number
  dueDate: string
  note?: string
  accountId?: AccountId
  createdAt: string
  updatedAt: string
}

export interface CommitmentRecord {
  id: string
  label: string
  category: TransactionCategory
  amount: number
  frequency: PlanningFrequency
  dueDate: string
  note?: string
  accountId?: AccountId
  isSettled: boolean
  isArchived: boolean
  lastPaidDate?: string
  createdAt: string
  updatedAt: string
}

export interface PlanningState {
  version: 1
  receivables: readonly ReceivableRecord[]
  payables: readonly PayableRecord[]
  commitments: readonly CommitmentRecord[]
}

export interface ReceivableInput {
  counterparty: string
  originalAmount: number
  receivedAmount?: number
  dueDate: string
  note?: string
  accountId?: AccountId
}

export interface PayableInput {
  counterparty: string
  originalAmount: number
  paidAmount?: number
  dueDate: string
  note?: string
  accountId?: AccountId
}

export interface CommitmentInput {
  label: string
  category: TransactionCategory
  amount: number
  frequency: PlanningFrequency
  dueDate: string
  note?: string
  accountId?: AccountId
}

export const PLANNING_FREQUENCIES: readonly PlanningFrequency[] = [
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
  'one-time',
]

export const PLANNING_FREQUENCY_LABELS: Record<PlanningFrequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  'one-time': 'One Time',
}

export function getPlanningFrequencyLabel(frequency: PlanningFrequency): string {
  return PLANNING_FREQUENCY_LABELS[frequency] ?? frequency
}
