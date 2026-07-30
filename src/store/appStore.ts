import { create } from 'zustand'

import { CURRENCY_CODE, type CurrencyCode } from '../models/currency'
import type { AccountId } from '../models/finance'
import {
  archiveAccount as archiveFinanceAccount,
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
import { recoverInterruptedRestore } from '../lib/dataSafety'
import type {
  CommitmentInput,
  PayableInput,
  PlanningState,
  ReceivableInput,
} from '../models/planning'
import {
  createOnboardingDraft,
  type AssistantResponseStyle,
  type FinancialPositionStyle,
  type IncomeType,
  type OnboardingDraft,
  type OnboardingStep,
  type ThemePreference,
  type UserSettings,
  loadSettingsWithOrigin,
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
  // Republishes state after a verified restore has already been persisted.
  rehydrateFromStorage: () => void
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

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// In-flight guard for cross-domain operations. The lock stays in place until
// the current event turn has completed, so a rapid second dispatch cannot
// observe a partially published operation as a new submission.
const inFlight = new Set<string>()

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
    const updated = {
      ...get().settings,
      assistant: { ...get().settings.assistant, responseStyle: style },
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
  rehydrateFromStorage: () => {
    const { settings, origin } = loadSettingsWithOrigin()
    const finance = loadFinanceState(settings, origin)
    const planning = loadPlanningState()
    const resolved = resolveTheme(settings.appearance.themePreference)
    applyTheme(resolved)
    set({
      settings,
      finance,
      planning,
      theme: resolved,
      privacyMode: settings.privacy.hideAmounts || settings.privacy.hideBalancesOnLaunch,
    })
  },
  }
})

applyTheme(initialTheme)
