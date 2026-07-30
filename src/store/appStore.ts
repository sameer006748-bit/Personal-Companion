import { create } from 'zustand'

import { CURRENCY_CODE, type CurrencyCode } from '../models/currency'
import type { AccountId } from '../models/finance'
import {
  archiveAccount as archiveFinanceAccount,
  createAccount as createFinanceAccount,
  createTransaction as createFinanceTransaction,
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

const { settings: initialSettings, origin: initialOrigin } = loadSettingsWithOrigin()
const initialTheme = resolveTheme(initialSettings.appearance.themePreference)
const initialFinance = loadFinanceState(initialSettings, initialOrigin)

export const useAppStore = create<AppState>((set, get) => {
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

  return {
  currency: CURRENCY_CODE,
  privacyMode:
    initialSettings.privacy.hideAmounts || initialSettings.privacy.hideBalancesOnLaunch,
  theme: initialTheme,
  settings: initialSettings,
  finance: initialFinance,
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
  }
})

applyTheme(initialTheme)
