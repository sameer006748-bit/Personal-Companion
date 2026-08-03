import { create } from 'zustand'

import { CURRENCY_CODE, type CurrencyCode } from '../models/currency'
import type { AccountId } from '../models/finance'
import {
  archiveAccount as archiveFinanceAccount,
  checkFinanceConsistency,
  createAccount as createFinanceAccount,
  createTransaction as createFinanceTransaction,
  getAccountBalance,
  deleteTransaction as deleteFinanceTransaction,
  loadFinanceState,
  reconcileOnboardingDraft,
  restoreAccount as restoreFinanceAccount,
  saveFinanceState,
  setDefaultAccount as setFinanceDefaultAccount,
  updateAccount as updateFinanceAccount,
  updateTransaction as updateFinanceTransaction,
  type AccountInput,
  type FinanceState,
  type TransactionInput,
} from '../lib/financeCore'
import {
  archiveCommitment as archivePlanningCommitment,
  createCommitment as createPlanningCommitment,
  createPayable as createPlanningPayable,
  createReceivable as createPlanningReceivable,
  deleteCommitment as deletePlanningCommitment,
  deletePayable as deletePlanningPayable,
  deleteReceivable as deletePlanningReceivable,
  findCommitment,
  findPayable,
  findReceivable,
  getPayableRemainingAmount,
  getReceivableRemainingAmount,
  loadPlanningState,
  markCommitmentPaid as markPlanningCommitmentPaid,
  markPayablePaid as markPlanningPayablePaid,
  markReceivableReceived as markPlanningReceivableReceived,
  recordPayablePayment as recordPlanningPayablePayment,
  recordReceivableReceipt as recordPlanningReceivableReceipt,
  restoreCommitment as restorePlanningCommitment,
  savePlanningState,
  updateCommitment as updatePlanningCommitment,
  updatePayable as updatePlanningPayable,
  updateReceivable as updatePlanningReceivable,
  type PlanningContext,
} from '../lib/planningCore'
import {
  appendAssistantMessages as appendStoredAssistantMessages,
  clearStoredAssistantHistory,
  loadAssistantHistory,
  saveAssistantHistory,
  setAssistantHistoryScope,
  type AssistantHistoryState,
} from '../lib/assistantHistory'
import type { AssistantActionBatch, AssistantActionProposal, AssistantActionReceipt, AssistantMessage, AssistantPersonalizationProfile } from '../models/assistant'
import { validateAssistantProposal } from '../lib/assistantFinance'
import { clearAssistantMemory, loadAssistantMemory, saveAssistantMemory, saveMemoryProposal, forgetMemory, setAssistantMemoryScope, type AssistantMemoryState } from '../lib/assistantMemory'
import type { AssistantMemoryProposal } from '../models/assistant'
import { recoverInterruptedRestore } from '../lib/dataSafety'
import type { SyncRecord, SyncRecordType } from '../lib/syncEngine'
import type {
  CommitmentInput,
  PayableInput,
  PlanningState,
  ReceivableInput,
} from '../models/planning'
import {
  createOnboardingDraft,
  DEFAULT_ASSISTANT_PERSONALIZATION,
  getDefaultSettings,
  type AssistantResponseStyle,
  type FinancialPositionStyle,
  type IncomeType,
  type OnboardingDraft,
  type OnboardingStep,
  type ThemePreference,
  type UserSettings,
  loadSettingsWithOrigin,
  loadScopedUserSettings,
  saveSettings,
} from '../models/settings'

export type Theme = 'light' | 'dark'

interface AppState {
  currency: CurrencyCode
  privacyMode: boolean
  theme: Theme
  settings: UserSettings
  finance: FinanceState
  planning: PlanningState
  assistantHistory: AssistantHistoryState
  assistantMemory: AssistantMemoryState
  togglePrivacyMode: () => void
  toggleTheme: () => void
  setThemePreference: (preference: ThemePreference) => void
  updateProfile: (fullName: string, initials: string, incomeType: IncomeType, defaultAccountId: AccountId) => void
  setIncomeType: (incomeType: IncomeType) => void
  setDefaultAccount: (accountId: AccountId) => void
  setFinancialPositionStyle: (style: FinancialPositionStyle) => void
  setHideBalancesOnLaunch: (hide: boolean) => void
  setAssistantResponseStyle: (style: AssistantResponseStyle) => void
  setAssistantCalculations: (include: boolean) => void
  setAssistantSuggestions: (show: boolean) => void
  updateAssistantPersonalization: (profile: AssistantPersonalizationProfile) => void
  previewOnboardingDraft: (draft: OnboardingDraft) => void
  updateOnboardingDraft: (draft: OnboardingDraft, currentStep?: OnboardingStep) => void
  setOnboardingStep: (step: OnboardingStep) => void
  completeOnboarding: () => void
  restartOnboarding: () => void
  createFinanceAccount: (input: AccountInput) => string | undefined
  updateFinanceAccount: (accountId: AccountId, input: AccountInput) => string | undefined
  archiveFinanceAccount: (accountId: AccountId) => string | undefined
  restoreFinanceAccount: (accountId: AccountId) => string | undefined
  setFinanceDefaultAccount: (accountId: AccountId) => string | undefined
  createFinanceTransaction: (input: TransactionInput) => string | undefined
  updateFinanceTransaction: (transactionId: string, input: TransactionInput) => string | undefined
  deleteFinanceTransaction: (transactionId: string) => string | undefined
  createReceivable: (input: ReceivableInput) => string | undefined
  updateReceivable: (id: string, input: ReceivableInput) => string | undefined
  recordReceivableReceipt: (id: string, amount: number) => string | undefined
  markReceivableReceived: (id: string) => string | undefined
  deleteReceivable: (id: string) => string | undefined
  createPayable: (input: PayableInput) => string | undefined
  updatePayable: (id: string, input: PayableInput) => string | undefined
  recordPayablePayment: (id: string, amount: number) => string | undefined
  markPayablePaid: (id: string) => string | undefined
  deletePayable: (id: string) => string | undefined
  createCommitment: (input: CommitmentInput) => string | undefined
  updateCommitment: (id: string, input: CommitmentInput) => string | undefined
  markCommitmentPaid: (id: string) => string | undefined
  archiveCommitment: (id: string) => string | undefined
  restoreCommitment: (id: string) => string | undefined
  deleteCommitment: (id: string) => string | undefined
  // Cross-domain atomic actions
  recordReceivableReceiptIntoAccount: (id: string, amount: number, accountId: AccountId) => string | undefined
  markReceivableReceivedIntoAccount: (id: string, accountId: AccountId) => string | undefined
  recordPayablePaymentFromAccount: (id: string, amount: number, accountId: AccountId) => string | undefined
  markPayablePaidFromAccount: (id: string, accountId: AccountId) => string | undefined
  // Assistant transcript. Kept in the store so the conversation survives leaving
  // the route and unmounting the page, and persisted so it survives a reload and
  // an app restart on the same device.
  appendAssistantMessages: (messages: readonly AssistantMessage[]) => void
  replaceAssistantMessage: (messageId: string, message: AssistantMessage) => void
  clearAssistantHistory: () => void
  saveAssistantMemoryProposal: (proposal: AssistantMemoryProposal) => void
  rejectAssistantMemoryProposal: () => void
  forgetAssistantMemory: (query: string) => void
  clearAssistantMemory: () => void
  setAssistantPersonalizationEnabled: (enabled: boolean) => void
  setActiveUserScope: (userId?: string) => void
  executeAssistantProposal: (proposal: AssistantActionProposal) => { receipt?: AssistantActionReceipt; error?: string }
  // Runs every child of a batch through one commit, or none of them.
  executeAssistantBatch: (batch: AssistantActionBatch) => { receipts?: readonly AssistantActionReceipt[]; error?: string }
  // Republishes state after a verified restore has already been persisted.
  rehydrateFromStorage: () => void
  // Merges cloud-only changes and cloud tombstones decided by the sync planner.
  applySyncPull: (
    pulls: readonly { recordType: SyncRecordType; record: SyncRecord }[],
    deletes: readonly { recordType: SyncRecordType; recordId: string }[],
  ) => void
}

function resolveTheme(preference: ThemePreference): Theme {
  if (preference === 'light') {
    return 'light'
  }

  if (preference === 'dark') {
    return 'dark'
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}

function persist(settings: UserSettings): void {
  saveSettings(settings)
}

// An interrupted restore is resolved before any state is read, so hydration can
// never observe a mix of pre-restore and post-restore data across the keys.
recoverInterruptedRestore()

const { settings: initialSettings, origin: initialOrigin } = loadSettingsWithOrigin()
const initialTheme = resolveTheme(initialSettings.appearance.themePreference)
const initialFinance = loadFinanceState(initialSettings, initialOrigin)
const initialPlanning = loadPlanningState()
const initialAssistantHistory = loadAssistantHistory()
const initialAssistantMemory = { ...loadAssistantMemory(), enabled: initialSettings.assistant.memoryEnabled }

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// In-flight guard for cross-domain operations. The lock stays in place until
// the current event turn has completed, so a rapid second dispatch cannot
// observe a partially published operation as a new submission.
const inFlight = new Set<string>()
const assistantProposalLocks = new Set<string>()
for (const message of initialAssistantHistory.messages) {
  if (message.proposal?.status === 'executed' && message.receipt) assistantProposalLocks.add(message.proposal.idempotencyKey)
}

// Batch keys are locked separately from child proposal keys so a confirmed batch
// cannot be re-run as a whole, and its children cannot be re-run individually.
const assistantBatchLocks = new Set<string>()
for (const message of initialAssistantHistory.messages) {
  if (message.batch?.status === 'executed' && message.batch.receipts?.length) {
    assistantBatchLocks.add(message.batch.idempotencyKey)
    for (const child of message.batch.proposals) assistantProposalLocks.add(child.idempotencyKey)
  }
}

/**
 * The outcome of applying one proposal to a pair of states, before anything is
 * persisted. `preference: true` marks the settings-only action, which has no
 * financial state to accumulate.
 */
type ApplyProposalResult =
  | { error: string; finance?: never; planning?: never; preference?: never }
  | { preference: true; affectedLabel: string; error?: never; finance?: never; planning?: never }
  | { finance: FinanceState; planning: PlanningState; affectedLabel: string; resultingAmount?: number; error?: never; preference?: never }

function guardOperation(
  key: string,
  fn: () => string | undefined,
): string | undefined {
  if (inFlight.has(key)) return 'Operation already in progress.'
  inFlight.add(key)
  try {
    return fn()
  } finally {
    if (typeof window === 'undefined') {
      inFlight.delete(key)
    } else {
      window.setTimeout(() => inFlight.delete(key), 0)
    }
  }
}

export const useAppStore = create<AppState>((set, get) => {
  function planningContext(): PlanningContext {
    return {
      today: today(),
      activeAccountIds: get()
        .finance.accounts.filter((account) => !account.isArchived)
        .map((account) => account.id),
    }
  }

  // Planning validity is judged against the state the action will actually be
  // applied to, so a batch child sees the accounts its predecessors left behind
  // rather than the state at the start of the batch.
  function planningContextFor(finance: FinanceState): PlanningContext {
    return {
      today: today(),
      activeAccountIds: finance.accounts.filter((account) => !account.isArchived).map((account) => account.id),
    }
  }

  /**
   * Applies one confirmed proposal to the supplied states and returns the next
   * states without committing anything. Single-action execution and batch
   * execution share this, so a batch can accumulate every child and commit once,
   * and an invalid child can abort the whole batch before anything is stored.
   *
   * A preference action changes settings rather than financial state, so it is
   * reported back for the caller to apply and is not part of a batch.
   */
  function applyAssistantProposal(
    proposal: AssistantActionProposal,
    finance: FinanceState,
    planning: PlanningState,
  ): ApplyProposalResult {
    let nextFinance = finance
    let nextPlanning = planning
    let affectedLabel: string
    let resultingAmount: number | undefined

    if (proposal.actionType === 'add-income' || proposal.actionType === 'account-adjustment') {
      const account = finance.accounts.find((item) => item.id === proposal.targetAccountId)
      if (!account) return { error: 'The target account is no longer available.' }
      const result = createFinanceTransaction(finance, {
        type: 'income', amount: proposal.amountPkr, date: proposal.effectiveDate,
        title: proposal.actionType === 'account-adjustment' ? 'Account adjustment' : proposal.description,
        categoryId: 'other-income', accountId: proposal.targetAccountId,
        ...(proposal.personOrBusiness ? { personOrBusiness: proposal.personOrBusiness } : {}),
        note: proposal.note ?? 'Recorded by Assistant after confirmation',
      })
      if (result.error) return { error: result.error }
      nextFinance = result.state
      affectedLabel = account.name
      resultingAmount = getAccountBalance(nextFinance, account.id)
    } else if (proposal.actionType === 'add-expense') {
      const account = finance.accounts.find((item) => item.id === proposal.sourceAccountId)
      if (!account) return { error: 'The source account is no longer available.' }
      const result = createFinanceTransaction(finance, {
        type: 'expense', amount: proposal.amountPkr, date: proposal.effectiveDate,
        title: proposal.description, categoryId: 'other-expense', accountId: proposal.sourceAccountId,
        ...(proposal.personOrBusiness ? { personOrBusiness: proposal.personOrBusiness } : {}),
        note: proposal.note ?? 'Recorded by Assistant after confirmation',
      })
      if (result.error) return { error: result.error }
      nextFinance = result.state
      affectedLabel = account.name
      resultingAmount = getAccountBalance(nextFinance, account.id)
    } else if (proposal.actionType === 'transfer') {
      const source = finance.accounts.find((item) => item.id === proposal.sourceAccountId)
      const destination = finance.accounts.find((item) => item.id === proposal.targetAccountId)
      if (!source || !destination) return { error: 'One of the selected accounts is no longer available.' }
      const result = createFinanceTransaction(finance, {
        type: 'transfer', amount: proposal.amountPkr, date: proposal.effectiveDate,
        title: 'Assistant account transfer', categoryId: 'account-transfer', accountId: proposal.sourceAccountId,
        destinationAccountId: proposal.targetAccountId, note: 'Recorded by Assistant after confirmation',
      })
      if (result.error) return { error: result.error }
      nextFinance = result.state
      affectedLabel = `${source.name} to ${destination.name}`
      resultingAmount = getAccountBalance(nextFinance, destination.id)
    } else if (proposal.actionType === 'receive-receivable') {
      const item = proposal.recordId ? findReceivable(planning, proposal.recordId) : undefined
      if (!item || !proposal.targetAccountId) return { error: 'This receivable is no longer available.' }
      const planningResult = recordPlanningReceivableReceipt(planning, item.id, proposal.amountPkr)
      if (planningResult.error) return { error: planningResult.error }
      const financeResult = createFinanceTransaction(finance, {
        type: 'income', amount: proposal.amountPkr, date: proposal.effectiveDate,
        title: `Receipt from ${item.counterparty}`, categoryId: 'other-income', accountId: proposal.targetAccountId,
        personOrBusiness: item.counterparty, note: 'Recorded by Assistant after confirmation',
      })
      if (financeResult.error) return { error: financeResult.error }
      nextPlanning = planningResult.state
      nextFinance = financeResult.state
      affectedLabel = item.counterparty
      const updated = nextPlanning.receivables.find((entry) => entry.id === item.id)
      resultingAmount = updated ? getReceivableRemainingAmount(updated) : undefined
    } else if (proposal.actionType === 'pay-payable') {
      const item = proposal.recordId ? findPayable(planning, proposal.recordId) : undefined
      if (!item || !proposal.sourceAccountId) return { error: 'This payable is no longer available.' }
      const planningResult = recordPlanningPayablePayment(planning, item.id, proposal.amountPkr)
      if (planningResult.error) return { error: planningResult.error }
      const financeResult = createFinanceTransaction(finance, {
        type: 'expense', amount: proposal.amountPkr, date: proposal.effectiveDate,
        title: `Payment to ${item.counterparty}`, categoryId: 'other-expense', accountId: proposal.sourceAccountId,
        personOrBusiness: item.counterparty, note: 'Recorded by Assistant after confirmation',
      })
      if (financeResult.error) return { error: financeResult.error }
      nextPlanning = planningResult.state
      nextFinance = financeResult.state
      affectedLabel = item.counterparty
      const updated = nextPlanning.payables.find((entry) => entry.id === item.id)
      resultingAmount = updated ? getPayableRemainingAmount(updated) : undefined
    } else if (proposal.actionType === 'add-commitment') {
      const planningResult = createPlanningCommitment(planning, {
        label: proposal.description,
        category: 'other-expense',
        amount: proposal.amountPkr,
        frequency: proposal.commitmentFrequency,
        dueDate: proposal.effectiveDate,
        note: 'Recorded by Assistant after confirmation',
      }, planningContextFor(finance))
      if (planningResult.error) return { error: planningResult.error }
      nextPlanning = planningResult.state
      affectedLabel = proposal.description
    } else if (proposal.actionType === 'add-receivable' || proposal.actionType === 'add-payable') {
      // Creating an obligation records who and how much; it moves no money, so
      // no finance transaction is written and no balance changes.
      const input = {
        counterparty: proposal.counterparty,
        originalAmount: proposal.amountPkr,
        dueDate: proposal.effectiveDate,
        note: 'Recorded by Assistant after confirmation',
      }
      const planningResult = proposal.actionType === 'add-receivable'
        ? createPlanningReceivable(planning, { ...input, receivedAmount: 0 }, planningContextFor(finance))
        : createPlanningPayable(planning, { ...input, paidAmount: 0 }, planningContextFor(finance))
      if (planningResult.error) return { error: planningResult.error }
      nextPlanning = planningResult.state
      affectedLabel = proposal.counterparty
      resultingAmount = proposal.amountPkr
    } else if (proposal.actionType === 'settle-commitment') {
      const item = findCommitment(planning, proposal.recordId)
      if (!item) return { error: 'This commitment is no longer available.' }
      const planningResult = markPlanningCommitmentPaid(planning, item.id, planningContextFor(finance))
      if (planningResult.error) return { error: planningResult.error }
      nextPlanning = planningResult.state
      affectedLabel = item.label
      const updated = findCommitment(nextPlanning, item.id)
      resultingAmount = updated?.isSettled ? 0 : updated?.amount
    } else if (proposal.actionType === 'create-account' || proposal.actionType === 'update-account') {
      const accountInput: AccountInput = {
        name: proposal.accountName,
        type: proposal.accountType,
        openingBalance: proposal.openingBalance,
        ...(proposal.institutionName ? { institutionName: proposal.institutionName } : {}),
        ...(proposal.lastFourDigits ? { lastFourDigits: proposal.lastFourDigits } : {}),
        ...(proposal.makeDefault === undefined ? {} : { makeDefault: proposal.makeDefault }),
      }
      const financeResult = proposal.actionType === 'create-account'
        ? createFinanceAccount(finance, accountInput)
        : updateFinanceAccount(finance, proposal.targetAccountId, accountInput)
      if (financeResult.error) return { error: financeResult.error }
      nextFinance = financeResult.state
      const account = proposal.actionType === 'create-account'
        ? nextFinance.accounts.at(-1)
        : nextFinance.accounts.find((item) => item.id === proposal.targetAccountId)
      affectedLabel = account?.name ?? proposal.accountName
      resultingAmount = account ? getAccountBalance(nextFinance, account.id) : proposal.openingBalance
    } else if (proposal.actionType === 'archive-account' || proposal.actionType === 'restore-account' || proposal.actionType === 'set-default-account') {
      const account = finance.accounts.find((item) => item.id === proposal.targetAccountId)
      if (!account) return { error: 'This account is no longer available.' }
      const financeResult = proposal.actionType === 'archive-account'
        ? archiveFinanceAccount(finance, account.id)
        : proposal.actionType === 'restore-account'
          ? restoreFinanceAccount(finance, account.id)
          : setFinanceDefaultAccount(finance, account.id)
      if (financeResult.error) return { error: financeResult.error }
      nextFinance = financeResult.state
      affectedLabel = account.name
      resultingAmount = getAccountBalance(nextFinance, account.id)
    } else if (proposal.actionType === 'update-transaction') {
      const financeResult = updateFinanceTransaction(finance, proposal.recordId, {
        type: proposal.transactionType,
        amount: proposal.amountPkr,
        date: proposal.effectiveDate,
        title: proposal.description,
        categoryId: proposal.categoryId,
        accountId: proposal.sourceAccountId,
        ...(proposal.targetAccountId ? { destinationAccountId: proposal.targetAccountId } : {}),
        ...(proposal.personOrBusiness ? { personOrBusiness: proposal.personOrBusiness } : {}),
        ...(proposal.note ? { note: proposal.note } : {}),
      })
      if (financeResult.error) return { error: financeResult.error }
      nextFinance = financeResult.state
      affectedLabel = proposal.description
    } else if (proposal.actionType === 'delete-transaction') {
      const financeResult = deleteFinanceTransaction(finance, proposal.recordId)
      if (financeResult.error) return { error: financeResult.error }
      nextFinance = financeResult.state
      affectedLabel = proposal.description
    } else if (proposal.actionType === 'update-receivable' || proposal.actionType === 'update-payable') {
      const planningResult = proposal.actionType === 'update-receivable'
        ? updatePlanningReceivable(planning, proposal.recordId, {
          counterparty: proposal.counterparty,
          originalAmount: proposal.amountPkr,
          receivedAmount: proposal.settledAmount,
          dueDate: proposal.effectiveDate,
          ...(proposal.note ? { note: proposal.note } : {}),
          ...(proposal.targetAccountId ? { accountId: proposal.targetAccountId } : {}),
        }, planningContextFor(finance))
        : updatePlanningPayable(planning, proposal.recordId, {
          counterparty: proposal.counterparty,
          originalAmount: proposal.amountPkr,
          paidAmount: proposal.settledAmount,
          dueDate: proposal.effectiveDate,
          ...(proposal.note ? { note: proposal.note } : {}),
          ...(proposal.targetAccountId ? { accountId: proposal.targetAccountId } : {}),
        }, planningContextFor(finance))
      if (planningResult.error) return { error: planningResult.error }
      nextPlanning = planningResult.state
      affectedLabel = proposal.counterparty
      resultingAmount = Math.max(0, proposal.amountPkr - proposal.settledAmount)
    } else if (proposal.actionType === 'delete-receivable' || proposal.actionType === 'delete-payable') {
      const planningResult = proposal.actionType === 'delete-receivable'
        ? deletePlanningReceivable(planning, proposal.recordId)
        : deletePlanningPayable(planning, proposal.recordId)
      if (planningResult.error) return { error: planningResult.error }
      nextPlanning = planningResult.state
      affectedLabel = proposal.description
    } else if (proposal.actionType === 'update-commitment') {
      const planningResult = updatePlanningCommitment(planning, proposal.recordId, {
        label: proposal.description,
        category: proposal.categoryId,
        amount: proposal.amountPkr,
        frequency: proposal.commitmentFrequency,
        dueDate: proposal.effectiveDate,
        ...(proposal.note ? { note: proposal.note } : {}),
        ...(proposal.targetAccountId ? { accountId: proposal.targetAccountId } : {}),
      }, planningContextFor(finance))
      if (planningResult.error) return { error: planningResult.error }
      nextPlanning = planningResult.state
      affectedLabel = proposal.description
    } else if (proposal.actionType === 'archive-commitment' || proposal.actionType === 'restore-commitment' || proposal.actionType === 'delete-commitment') {
      const planningResult = proposal.actionType === 'archive-commitment'
        ? archivePlanningCommitment(planning, proposal.recordId)
        : proposal.actionType === 'restore-commitment'
          ? restorePlanningCommitment(planning, proposal.recordId)
          : deletePlanningCommitment(planning, proposal.recordId)
      if (planningResult.error) return { error: planningResult.error }
      nextPlanning = planningResult.state
      affectedLabel = proposal.description
    } else if (proposal.actionType === 'update-preference') {
      return { preference: true, affectedLabel: proposal.preferenceKey.replaceAll('-', ' ') }
    } else {
      return { error: 'This action type is not supported.' }
    }

    return { finance: nextFinance, planning: nextPlanning, affectedLabel, ...(resultingAmount === undefined ? {} : { resultingAmount }) }
  }

  /** Applies a confirmed preference proposal through the existing setters. */
  function applyPreferenceProposal(proposal: AssistantActionProposal): string | undefined {
    if (proposal.actionType !== 'update-preference') return 'This action type is not supported.'
    const value = proposal.preferenceValue
    const state = get()
    if (proposal.preferenceKey === 'profile-name' && typeof value === 'string') {
      const name = value.trim()
      const initials = name.split(/\s+/u).map((part) => part.charAt(0).toLocaleUpperCase()).slice(0, 2).join('')
      get().updateProfile(name, initials, state.settings.profile.incomeType, state.settings.profile.defaultAccountId)
    } else if (proposal.preferenceKey === 'income-type' && typeof value === 'string') {
      get().setIncomeType(value as IncomeType)
    } else if (proposal.preferenceKey === 'financial-position-style' && typeof value === 'string') {
      get().setFinancialPositionStyle(value as FinancialPositionStyle)
    } else if (proposal.preferenceKey === 'hide-balances-on-launch' && typeof value === 'boolean') {
      get().setHideBalancesOnLaunch(value)
    } else if (proposal.preferenceKey === 'assistant-response-style' && typeof value === 'string') {
      get().setAssistantResponseStyle(value as AssistantResponseStyle)
    } else if (proposal.preferenceKey === 'assistant-calculations' && typeof value === 'boolean') {
      get().setAssistantCalculations(value)
    } else if (proposal.preferenceKey === 'assistant-suggestions' && typeof value === 'boolean') {
      get().setAssistantSuggestions(value)
    } else if (proposal.preferenceKey === 'theme-preference' && typeof value === 'string') {
      get().setThemePreference(value as ThemePreference)
    } else if (proposal.preferenceKey === 'privacy-mode' && typeof value === 'boolean') {
      if (get().privacyMode !== value) get().togglePrivacyMode()
    } else if (proposal.preferenceKey === 'personalization-enabled' && typeof value === 'boolean') {
      get().setAssistantPersonalizationEnabled(value)
    } else {
      return 'This preference value is not supported.'
    }
    return undefined
  }

  function commitPlanning(result: {
    state: PlanningState
    error?: string
  }): string | undefined {
    if (result.error) return result.error
    savePlanningState(result.state)
    set({ planning: result.state })
    return undefined
  }

  function commitFinance(finance: FinanceState): void {
    const defaultAccountId = finance.accounts.find(
      (account) => !account.isArchived && account.isDefault,
    )?.id
    const settings = defaultAccountId
      ? {
          ...get().settings,
          profile: { ...get().settings.profile, defaultAccountId },
        }
      : get().settings
    saveFinanceState(finance)
    persist(settings)
    set({ finance, settings })
  }

  function commitBoth(
    planning: PlanningState,
    finance: FinanceState,
  ): string | undefined {
    const defaultAccountId = finance.accounts.find(
      (account) => !account.isArchived && account.isDefault,
    )?.id
    const settings = defaultAccountId
      ? {
          ...get().settings,
          profile: { ...get().settings.profile, defaultAccountId },
        }
      : get().settings
    savePlanningState(planning)
    saveFinanceState(finance)
    persist(settings)
    set({ planning, finance, settings })
    return undefined
  }

  return {
  currency: CURRENCY_CODE,
  privacyMode:
    initialSettings.privacy.hideAmounts || initialSettings.privacy.hideBalancesOnLaunch,
  theme: initialTheme,
  settings: initialSettings,
  finance: initialFinance,
  planning: initialPlanning,
  assistantHistory: initialAssistantHistory,
  assistantMemory: initialAssistantMemory,
  togglePrivacyMode: () => {
    const next = !get().privacyMode
    const updated = {
      ...get().settings,
      privacy: { ...get().settings.privacy, hideAmounts: next },
    }
    persist(updated)
    set({ privacyMode: next, settings: updated })
  },
  toggleTheme: () => {
    const current = get().settings.appearance.themePreference
    const next: ThemePreference = current === 'system' ? 'dark' : current === 'dark' ? 'light' : 'system'
    const resolved = resolveTheme(next)
    const updated = {
      ...get().settings,
      appearance: { ...get().settings.appearance, themePreference: next },
    }
    persist(updated)
    applyTheme(resolved)
    set({ theme: resolved, settings: updated })
  },
  setThemePreference: (preference) => {
    const resolved = resolveTheme(preference)
    const updated = {
      ...get().settings,
      appearance: { ...get().settings.appearance, themePreference: preference },
    }
    persist(updated)
    applyTheme(resolved)
    set({ theme: resolved, settings: updated })
  },
  updateProfile: (fullName, initials, incomeType, defaultAccountId) => {
    const updated = {
      ...get().settings,
      profile: { fullName, initials, incomeType, defaultAccountId },
    }
    persist(updated)
    set({ settings: updated })
  },
  setIncomeType: (incomeType) => {
    const updated = {
      ...get().settings,
      profile: { ...get().settings.profile, incomeType },
    }
    persist(updated)
    set({ settings: updated })
  },
  setDefaultAccount: (accountId) => {
    const updated = {
      ...get().settings,
      profile: { ...get().settings.profile, defaultAccountId: accountId },
    }
    persist(updated)
    set({ settings: updated })
  },
  setFinancialPositionStyle: (style) => {
    const updated = {
      ...get().settings,
      finance: { ...get().settings.finance, financialPositionStyle: style },
    }
    persist(updated)
    set({ settings: updated })
  },
  setHideBalancesOnLaunch: (hide) => {
    const updated = {
      ...get().settings,
      privacy: { ...get().settings.privacy, hideBalancesOnLaunch: hide },
    }
    persist(updated)
    set({ settings: updated })
  },
  setAssistantResponseStyle: (style) => {
    const responseLength: AssistantPersonalizationProfile['responseLength'] = style === 'concise' ? 'short' : style
    const updated = {
      ...get().settings,
      assistant: {
        ...get().settings.assistant,
        responseStyle: style,
        personalization: {
          ...get().settings.assistant.personalization,
          responseLength,
        },
      },
    }
    persist(updated)
    set({ settings: updated })
  },
  setAssistantCalculations: (include) => {
    const updated = {
      ...get().settings,
      assistant: { ...get().settings.assistant, includeCalculations: include },
    }
    persist(updated)
    set({ settings: updated })
  },
  setAssistantSuggestions: (show) => {
    const updated = {
      ...get().settings,
      assistant: { ...get().settings.assistant, showSuggestions: show },
    }
    persist(updated)
    set({ settings: updated })
  },
  updateAssistantPersonalization: (profile) => {
    const preferredName = profile.preferredName?.trim().slice(0, 60)
    const normalized: AssistantPersonalizationProfile = {
      ...profile,
      ...(preferredName ? { preferredName } : {}),
      aboutMe: profile.aboutMe.trim().slice(0, 600),
      financialPriorities: profile.financialPriorities.trim().slice(0, 400),
      goalsAndPlans: profile.goalsAndPlans.trim().slice(0, 500),
      advicePreferences: profile.advicePreferences.trim().slice(0, 400),
      thingsToAvoid: profile.thingsToAvoid.trim().slice(0, 300),
    }
    const style: AssistantResponseStyle = normalized.responseLength === 'short' ? 'concise' : normalized.responseLength
    const updated = {
      ...get().settings,
      assistant: {
        ...get().settings.assistant,
        responseStyle: style,
        languageStyle: normalized.language === 'roman-urdu' ? 'roman-urdu' : 'professional',
        personalization: normalized,
      },
    }
    persist(updated)
    set({ settings: updated })
  },
  previewOnboardingDraft: (draft) => {
    const resolved = resolveTheme(draft.themePreference)
    applyTheme(resolved)
    set({ theme: resolved, privacyMode: draft.hideAmounts })
  },
  updateOnboardingDraft: (draft, currentStep) => {
    const resolved = resolveTheme(draft.themePreference)
    const updated = {
      ...get().settings,
      onboarding: {
        version: 1,
        status: 'in-progress' as const,
        currentStep: currentStep ?? get().settings.onboarding.currentStep,
        draft,
      },
    }
    persist(updated)
    applyTheme(resolved)
    set({ theme: resolved, privacyMode: draft.hideAmounts, settings: updated })
  },
  setOnboardingStep: (step) => {
    const currentSettings = get().settings
    const draft = currentSettings.onboarding.draft ?? createOnboardingDraft(currentSettings)
    const updated = {
      ...currentSettings,
      onboarding: {
        version: 1,
        status: 'in-progress' as const,
        currentStep: step,
        draft,
      },
    }
    persist(updated)
    set({ settings: updated })
  },
  completeOnboarding: () => {
    const currentSettings = get().settings
    const currentFinance = get().finance
    const draft = currentSettings.onboarding.draft ?? createOnboardingDraft(currentSettings)
    const resolved = resolveTheme(draft.themePreference)
    const reconciliation = reconcileOnboardingDraft(currentFinance, draft)
    if (reconciliation.error) {
      set({ settings: { ...currentSettings, onboarding: { ...currentSettings.onboarding, currentStep: 3 } } })
      return
    }
    const updated = {
      ...currentSettings,
      profile: {
        fullName: draft.fullName.trim(),
        initials: draft.initials,
        incomeType: draft.incomeType,
        defaultAccountId: reconciliation.defaultAccountId,
      },
      appearance: { themePreference: draft.themePreference },
      privacy: {
        hideAmounts: draft.hideAmounts,
        hideBalancesOnLaunch: draft.hideBalancesOnLaunch,
      },
      finance: {
        ...currentSettings.finance,
        accountBalances: Object.fromEntries(reconciliation.state.accounts.filter((account) => !account.isArchived).map((account) => [account.id, account.openingBalance])),
      },
      onboarding: {
        version: 1,
        status: 'completed' as const,
        currentStep: 5 as OnboardingStep,
        completedAt: new Date().toISOString(),
      },
    }
    persist(updated)
    saveFinanceState(reconciliation.state)
    applyTheme(resolved)
    set({ theme: resolved, privacyMode: draft.hideAmounts, settings: updated, finance: reconciliation.state })
  },
  restartOnboarding: () => {
    const currentSettings = get().settings
    const currentFinance = get().finance
    const draft = createOnboardingDraft({
      profile: currentSettings.profile,
      appearance: currentSettings.appearance,
      privacy: currentSettings.privacy,
      finance: currentSettings.finance,
      accounts: currentFinance.accounts,
    })
    const updated = {
      ...currentSettings,
      onboarding: {
        version: 1,
        status: 'in-progress' as const,
        currentStep: 3 as OnboardingStep,
        draft,
      },
    }
    persist(updated)
    set({ settings: updated })
  },
  createFinanceAccount: (input) => {
    const result = createFinanceAccount(get().finance, input)
    if (result.error) return result.error
    commitFinance(result.state)
    return undefined
  },
  updateFinanceAccount: (accountId, input) => {
    const result = updateFinanceAccount(get().finance, accountId, input)
    if (result.error) return result.error
    commitFinance(result.state)
    return undefined
  },
  archiveFinanceAccount: (accountId) => {
    const result = archiveFinanceAccount(get().finance, accountId)
    if (result.error) return result.error
    commitFinance(result.state)
    return undefined
  },
  restoreFinanceAccount: (accountId) => {
    const result = restoreFinanceAccount(get().finance, accountId)
    if (result.error) return result.error
    commitFinance(result.state)
    return undefined
  },
  setFinanceDefaultAccount: (accountId) => {
    const result = setFinanceDefaultAccount(get().finance, accountId)
    if (result.error) return result.error
    commitFinance(result.state)
    return undefined
  },
  createFinanceTransaction: (input) => {
    const result = createFinanceTransaction(get().finance, input)
    if (result.error) return result.error
    commitFinance(result.state)
    return undefined
  },
  updateFinanceTransaction: (transactionId, input) => {
    const result = updateFinanceTransaction(get().finance, transactionId, input)
    if (result.error) return result.error
    commitFinance(result.state)
    return undefined
  },
  deleteFinanceTransaction: (transactionId) => {
    const result = deleteFinanceTransaction(get().finance, transactionId)
    if (result.error) return result.error
    commitFinance(result.state)
    return undefined
  },
  createReceivable: (input) =>
    commitPlanning(createPlanningReceivable(get().planning, input, planningContext())),
  updateReceivable: (id, input) =>
    commitPlanning(
      updatePlanningReceivable(get().planning, id, input, planningContext()),
    ),
  recordReceivableReceipt: (id, amount) =>
    commitPlanning(recordPlanningReceivableReceipt(get().planning, id, amount)),
  markReceivableReceived: (id) =>
    commitPlanning(markPlanningReceivableReceived(get().planning, id)),
  deleteReceivable: (id) =>
    commitPlanning(deletePlanningReceivable(get().planning, id)),
  createPayable: (input) =>
    commitPlanning(createPlanningPayable(get().planning, input, planningContext())),
  updatePayable: (id, input) =>
    commitPlanning(updatePlanningPayable(get().planning, id, input, planningContext())),
  recordPayablePayment: (id, amount) =>
    commitPlanning(recordPlanningPayablePayment(get().planning, id, amount)),
  markPayablePaid: (id) => commitPlanning(markPlanningPayablePaid(get().planning, id)),
  deletePayable: (id) => commitPlanning(deletePlanningPayable(get().planning, id)),
  createCommitment: (input) =>
    commitPlanning(createPlanningCommitment(get().planning, input, planningContext())),
  updateCommitment: (id, input) =>
    commitPlanning(
      updatePlanningCommitment(get().planning, id, input, planningContext()),
    ),
  markCommitmentPaid: (id) =>
    commitPlanning(markPlanningCommitmentPaid(get().planning, id, planningContext())),
  archiveCommitment: (id) =>
    commitPlanning(archivePlanningCommitment(get().planning, id)),
  restoreCommitment: (id) =>
    commitPlanning(restorePlanningCommitment(get().planning, id)),
  deleteCommitment: (id) => commitPlanning(deletePlanningCommitment(get().planning, id)),
  // Cross-domain actions publish coherent Zustand state. Their separate
  // localStorage writes are best-effort coordinated persistence, not a
  // durable database transaction.
  recordReceivableReceiptIntoAccount: (id, amount, accountId) =>
    guardOperation(`receivable-${id}`, () => {
      const state = get()

      // Re-read latest state inside the guard
      const receivable = findReceivable(state.planning, id)
      if (!receivable) return 'This receivable no longer exists.'
      const planningResult = recordPlanningReceivableReceipt(state.planning, id, amount)
      if (planningResult.error) return planningResult.error

      const account = state.finance.accounts.find(
        (item) => item.id === accountId && !item.isArchived,
      )
      if (!account) return 'Choose an active account.'

      const financeInput: TransactionInput = {
        type: 'income',
        amount,
        date: today(),
        title: `Receipt from ${receivable.counterparty}`,
        categoryId: 'other-income',
        accountId,
        personOrBusiness: receivable.counterparty,
      }
      const financeResult = createFinanceTransaction(state.finance, financeInput)
      if (financeResult.error) return financeResult.error

      return commitBoth(planningResult.state, financeResult.state)
    }),
  markReceivableReceivedIntoAccount: (id, accountId) =>
    guardOperation(`receivable-${id}`, () => {
      const state = get()

      const receivable = findReceivable(state.planning, id)
      if (!receivable) return 'This receivable no longer exists.'
      const remaining = getReceivableRemainingAmount(receivable)
      if (remaining === 0) return 'This receivable is already fully received.'
      const planningResult = markPlanningReceivableReceived(state.planning, id)
      if (planningResult.error) return planningResult.error

      const account = state.finance.accounts.find(
        (item) => item.id === accountId && !item.isArchived,
      )
      if (!account) return 'Choose an active account.'

      const financeInput: TransactionInput = {
        type: 'income',
        amount: remaining,
        date: today(),
        title: `Receipt from ${receivable.counterparty}`,
        categoryId: 'other-income',
        accountId,
        personOrBusiness: receivable.counterparty,
      }
      const financeResult = createFinanceTransaction(state.finance, financeInput)
      if (financeResult.error) return financeResult.error

      return commitBoth(planningResult.state, financeResult.state)
    }),
  recordPayablePaymentFromAccount: (id, amount, accountId) =>
    guardOperation(`payable-${id}`, () => {
      const state = get()

      const payable = findPayable(state.planning, id)
      if (!payable) return 'This payable no longer exists.'
      const planningResult = recordPlanningPayablePayment(state.planning, id, amount)
      if (planningResult.error) return planningResult.error

      const account = state.finance.accounts.find(
        (item) => item.id === accountId && !item.isArchived,
      )
      if (!account) return 'Choose an active account.'
      if (getAccountBalance(state.finance, accountId) < amount) {
        return 'This account does not have enough available balance.'
      }

      const financeInput: TransactionInput = {
        type: 'expense',
        amount,
        date: today(),
        title: `Payment to ${payable.counterparty}`,
        categoryId: 'other-expense',
        accountId,
        personOrBusiness: payable.counterparty,
      }
      const financeResult = createFinanceTransaction(state.finance, financeInput)
      if (financeResult.error) return financeResult.error

      return commitBoth(planningResult.state, financeResult.state)
    }),
  markPayablePaidFromAccount: (id, accountId) =>
    guardOperation(`payable-${id}`, () => {
      const state = get()

      const payable = findPayable(state.planning, id)
      if (!payable) return 'This payable no longer exists.'
      const remaining = getPayableRemainingAmount(payable)
      if (remaining === 0) return 'This payable is already fully paid.'
      const planningResult = markPlanningPayablePaid(state.planning, id)
      if (planningResult.error) return planningResult.error

      const account = state.finance.accounts.find(
        (item) => item.id === accountId && !item.isArchived,
      )
      if (!account) return 'Choose an active account.'
      if (getAccountBalance(state.finance, accountId) < remaining) {
        return 'This account does not have enough available balance.'
      }

      const financeInput: TransactionInput = {
        type: 'expense',
        amount: remaining,
        date: today(),
        title: `Payment to ${payable.counterparty}`,
        categoryId: 'other-expense',
        accountId,
        personOrBusiness: payable.counterparty,
      }
      const financeResult = createFinanceTransaction(state.finance, financeInput)
      if (financeResult.error) return financeResult.error

      return commitBoth(planningResult.state, financeResult.state)
    }),
  executeAssistantProposal: (proposal) => {
    if (assistantProposalLocks.has(proposal.idempotencyKey)) {
      const receipt = get().assistantHistory.messages.find((message) => message.receipt?.proposalId === proposal.proposalId)?.receipt
      return receipt ? { receipt } : { error: 'This proposal was already processed.' }
    }
    assistantProposalLocks.add(proposal.idempotencyKey)
    try {
      const state = get()
      const validationErrors = validateAssistantProposal(proposal, state.finance, state.planning)
      if (validationErrors.length) return { error: validationErrors[0] ?? 'This proposal is not valid.' }

      if (proposal.actionType === 'update-preference') {
        const prefError = applyPreferenceProposal(proposal)
        if (prefError) return { error: prefError }
        const receipt: AssistantActionReceipt = {
          proposalId: proposal.proposalId, actionType: proposal.actionType, amountPkr: proposal.amountPkr,
          affectedLabel: proposal.preferenceKey.replaceAll('-', ' '), completedAt: Date.now(),
        }
        return { receipt }
      }

      const applied = applyAssistantProposal(proposal, state.finance, state.planning)
      if (applied.error !== undefined) return { error: applied.error }
      if (applied.preference) {
        const prefError = applyPreferenceProposal(proposal)
        if (prefError) return { error: prefError }
        const receipt: AssistantActionReceipt = {
          proposalId: proposal.proposalId, actionType: proposal.actionType, amountPkr: proposal.amountPkr,
          affectedLabel: applied.affectedLabel, completedAt: Date.now(),
        }
        return { receipt }
      }
      const { finance: nextFinance, planning: nextPlanning, affectedLabel, resultingAmount } = applied
      const commitError = commitBoth(nextPlanning, nextFinance)
      if (commitError) return { error: commitError }
      const reference = nextFinance === state.finance
        ? undefined
        : nextFinance.transactions[nextFinance.transactions.length - 1]?.id
      const receipt: AssistantActionReceipt = {
        proposalId: proposal.proposalId, actionType: proposal.actionType, amountPkr: proposal.amountPkr,
        affectedLabel, ...(resultingAmount === undefined ? {} : { resultingAmount }),
        completedAt: Date.now(), ...(reference ? { referenceId: reference } : {}),
      }
      return { receipt }
    } finally {
      // Keep this key for the session. The transcript also stores the terminal
      // state, so neither a rapid second click nor a restored proposal can run twice.
    }
  },
  executeAssistantBatch: (batch) => {
    if (assistantBatchLocks.has(batch.idempotencyKey)) {
      const stored = get().assistantHistory.messages.find((message) => message.batch?.batchId === batch.batchId)?.batch
      return stored?.receipts?.length ? { receipts: stored.receipts } : { error: 'This batch was already processed.' }
    }
    if (batch.proposals.length < 2 || batch.proposals.length > 5 || batch.proposals.length !== batch.actionCount) {
      return { error: 'This action set is not valid.' }
    }
    // A child that already ran on its own must not run again inside a batch.
    if (batch.proposals.some((child) => assistantProposalLocks.has(child.idempotencyKey))) {
      return { error: 'One of these actions was already processed.' }
    }
    const ids = new Set(batch.proposals.map((child) => child.proposalId))
    const keys = new Set(batch.proposals.map((child) => child.idempotencyKey))
    if (ids.size !== batch.proposals.length || keys.size !== batch.proposals.length) {
      return { error: 'This action set contains duplicate entries.' }
    }

    assistantBatchLocks.add(batch.idempotencyKey)
    const state = get()
    // Every child is validated and applied against the state its predecessors
    // produced, entirely in memory. Nothing is stored until all of them succeed,
    // so a later failure cannot leave earlier children half-applied.
    let workingFinance = state.finance
    let workingPlanning = state.planning
    const drafts: { proposal: AssistantActionProposal; affectedLabel: string; resultingAmount?: number; referenceId?: string }[] = []

    for (const child of batch.proposals) {
      if (child.actionType === 'update-preference') {
        // A preference change is not financial state and cannot take part in a
        // single atomic commit, so it is never allowed inside a batch.
        assistantBatchLocks.delete(batch.idempotencyKey)
        return { error: 'Preference changes must be confirmed on their own.' }
      }
      const errors = validateAssistantProposal(child, workingFinance, workingPlanning)
      if (errors.length) {
        assistantBatchLocks.delete(batch.idempotencyKey)
        return { error: errors[0] ?? 'One of these actions is not valid.' }
      }
      const applied = applyAssistantProposal(child, workingFinance, workingPlanning)
      if (applied.error || applied.preference || !applied.finance || !applied.planning) {
        assistantBatchLocks.delete(batch.idempotencyKey)
        return { error: applied.error ?? 'One of these actions could not be prepared.' }
      }
      const referenceId = applied.finance === workingFinance
        ? undefined
        : applied.finance.transactions[applied.finance.transactions.length - 1]?.id
      drafts.push({
        proposal: child,
        affectedLabel: applied.affectedLabel,
        ...(applied.resultingAmount === undefined ? {} : { resultingAmount: applied.resultingAmount }),
        ...(referenceId ? { referenceId } : {}),
      })
      workingFinance = applied.finance
      workingPlanning = applied.planning
    }

    // One commit for the whole batch. Reaching here means every child validated
    // and applied cleanly against the accumulated state.
    const commitError = commitBoth(workingPlanning, workingFinance)
    if (commitError) {
      assistantBatchLocks.delete(batch.idempotencyKey)
      return { error: commitError }
    }
    for (const child of batch.proposals) assistantProposalLocks.add(child.idempotencyKey)
    const completedAt = Date.now()
    const receipts: AssistantActionReceipt[] = drafts.map((draft) => ({
      proposalId: draft.proposal.proposalId,
      actionType: draft.proposal.actionType,
      amountPkr: draft.proposal.amountPkr,
      affectedLabel: draft.affectedLabel,
      ...(draft.resultingAmount === undefined ? {} : { resultingAmount: draft.resultingAmount }),
      completedAt,
      ...(draft.referenceId ? { referenceId: draft.referenceId } : {}),
    }))
    return { receipts }
  },
  // The transcript is written on every turn rather than on unmount, so a reload
  // or a closed tab mid-conversation still keeps the last exchange.
  appendAssistantMessages: (messages) => {
    if (!messages.length) return
    const next = appendStoredAssistantMessages(get().assistantHistory, messages)
    saveAssistantHistory(next)
    set({ assistantHistory: next })
  },
  replaceAssistantMessage: (messageId, message) => {
    const history = get().assistantHistory
    if (!history.messages.some((item) => item.id === messageId)) return
    const next = { ...history, messages: history.messages.map((item) => item.id === messageId ? message : item) }
    saveAssistantHistory(next)
    set({ assistantHistory: next })
  },
  // Clears the conversation only. Finance, Planning, settings, the cloud backup,
  // and the session all live elsewhere and are deliberately not referenced here.
  clearAssistantHistory: () => {
    set({ assistantHistory: clearStoredAssistantHistory() })
  },
  saveAssistantMemoryProposal: (proposal) => {
    const next = saveMemoryProposal(get().assistantMemory, proposal)
    saveAssistantMemory(next)
    set({ assistantMemory: next })
  },
  rejectAssistantMemoryProposal: () => undefined,
  forgetAssistantMemory: (query) => {
    const next = forgetMemory(get().assistantMemory, query)
    saveAssistantMemory(next)
    set({ assistantMemory: next })
  },
  clearAssistantMemory: () => set({ assistantMemory: clearAssistantMemory() }),
  setAssistantPersonalizationEnabled: (enabled) => {
    const next = { ...get().assistantMemory, enabled }
    saveAssistantMemory(next)
    const settings = {
      ...get().settings,
      assistant: {
        ...get().settings.assistant,
        personalizationEnabled: enabled,
        memoryEnabled: enabled,
      },
    }
    persist(settings)
    set({ assistantMemory: next, settings })
  },
  setActiveUserScope: (userId) => {
    const current = get()
    const ownerId = current.settings.assistant.ownerId
    const scopedSettings = userId ? loadScopedUserSettings(userId) : undefined
    const migrateLegacy = Boolean(userId && !ownerId)
    setAssistantMemoryScope(userId, migrateLegacy)
    setAssistantHistoryScope(userId, migrateLegacy)
    const sameOwner = userId ? ownerId === userId || ownerId === undefined : ownerId === undefined
    const sourceAssistant = scopedSettings?.assistant ?? (sameOwner ? current.settings.assistant : getDefaultSettings().assistant)
    const personalization = scopedSettings?.assistant.personalization ?? (sameOwner
      ? current.settings.assistant.personalization
      : { ...DEFAULT_ASSISTANT_PERSONALIZATION })
    const assistantWithoutOwner = { ...sourceAssistant }
    delete assistantWithoutOwner.ownerId
    const assistant: UserSettings['assistant'] = {
      ...assistantWithoutOwner,
      responseStyle: personalization.responseLength === 'short' ? 'concise' as const : personalization.responseLength,
      languageStyle: personalization.language === 'roman-urdu' ? 'roman-urdu' : 'professional',
      personalization,
      ...(userId ? { ownerId: userId } : {}),
    }
    const settings = { ...current.settings, assistant }
    const assistantMemory = { ...loadAssistantMemory(), enabled: assistant.memoryEnabled }
    const assistantHistory = loadAssistantHistory()
    persist(settings)
    set({ settings, assistantMemory, assistantHistory })
  },
  rehydrateFromStorage: () => {
    const { settings, origin } = loadSettingsWithOrigin()
    const finance = loadFinanceState(settings, origin)
    const planning = loadPlanningState()
    const assistantMemory = loadAssistantMemory()
    const assistantHistory = loadAssistantHistory()
    const resolved = resolveTheme(settings.appearance.themePreference)
    applyTheme(resolved)
    set({
      settings,
      finance,
      planning,
      assistantMemory,
      assistantHistory,
      theme: resolved,
      privacyMode: settings.privacy.hideAmounts || settings.privacy.hideBalancesOnLaunch,
    })
  },
  applySyncPull: (pulls, deletes) => {
    const state = get()
    let accounts = [...state.finance.accounts]
    let transactions = [...state.finance.transactions]
    let receivables = [...state.planning.receivables]
    let payables = [...state.planning.payables]
    let commitments = [...state.planning.commitments]

    // Cloud rows arrive already mapped and validated by the repository reader.
    const upsert = <T extends { id: string }>(list: T[], record: unknown): T[] => {
      const incoming = record as T
      const index = list.findIndex((item) => item.id === incoming.id)
      if (index === -1) return [...list, incoming]
      const next = [...list]
      next[index] = incoming
      return next
    }

    for (const { recordType, record } of pulls) {
      if (recordType === 'account') accounts = upsert(accounts, record)
      else if (recordType === 'transaction') transactions = upsert(transactions, record)
      else if (recordType === 'receivable') receivables = upsert(receivables, record)
      else if (recordType === 'payable') payables = upsert(payables, record)
      else commitments = upsert(commitments, record)
    }

    for (const { recordType, recordId } of deletes) {
      if (recordType === 'account') accounts = accounts.filter((item) => item.id !== recordId)
      else if (recordType === 'transaction') transactions = transactions.filter((item) => item.id !== recordId)
      else if (recordType === 'receivable') receivables = receivables.filter((item) => item.id !== recordId)
      else if (recordType === 'payable') payables = payables.filter((item) => item.id !== recordId)
      else commitments = commitments.filter((item) => item.id !== recordId)
    }

    const finance: FinanceState = { ...state.finance, accounts, transactions }
    const planning: PlanningState = { ...state.planning, receivables, payables, commitments }

    // A pull that would break domain invariants is refused outright rather than
    // publishing inconsistent financial state.
    if (!checkFinanceConsistency(finance).ok) return

    saveFinanceState(finance)
    savePlanningState(planning)
    set({ finance, planning })
  },
  }
})

applyTheme(initialTheme)
