import { create } from 'zustand'

import { CURRENCY_CODE, type CurrencyCode } from '../models/currency'
import type { AccountId } from '../models/finance'
import {
  type AssistantResponseStyle,
  type FinancialPositionStyle,
  type IncomeType,
  type ThemePreference,
  type UserSettings,
  loadSettings,
  saveSettings,
} from '../models/settings'

export type Theme = 'light' | 'dark'

interface AppState {
  currency: CurrencyCode
  privacyMode: boolean
  theme: Theme
  settings: UserSettings
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

function persistAndApply(settings: UserSettings): void {
  saveSettings(settings)
}

const initialSettings = loadSettings()
const initialTheme = resolveTheme(initialSettings.appearance.themePreference)

export const useAppStore = create<AppState>((set, get) => ({
  currency: CURRENCY_CODE,
  privacyMode: initialSettings.privacy.hideAmounts,
  theme: initialTheme,
  settings: initialSettings,
  togglePrivacyMode: () => {
    const next = !get().privacyMode
    const updated = { ...get().settings, privacy: { ...get().settings.privacy, hideAmounts: next } }
    persistAndApply(updated)
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
    persistAndApply(updated)
    applyTheme(resolved)
    set({ theme: resolved, settings: updated })
  },
  setThemePreference: (preference: ThemePreference) => {
    const resolved = resolveTheme(preference)
    const updated = {
      ...get().settings,
      appearance: { ...get().settings.appearance, themePreference: preference },
    }
    persistAndApply(updated)
    applyTheme(resolved)
    set({ theme: resolved, settings: updated })
  },
  updateProfile: (fullName: string, initials: string, incomeType: IncomeType, defaultAccountId: AccountId) => {
    const updated = {
      ...get().settings,
      profile: { fullName, initials, incomeType, defaultAccountId },
    }
    persistAndApply(updated)
    set({ settings: updated })
  },
  setIncomeType: (incomeType: IncomeType) => {
    const updated = {
      ...get().settings,
      profile: { ...get().settings.profile, incomeType },
    }
    persistAndApply(updated)
    set({ settings: updated })
  },
  setDefaultAccount: (accountId: AccountId) => {
    const updated = {
      ...get().settings,
      profile: { ...get().settings.profile, defaultAccountId: accountId },
    }
    persistAndApply(updated)
    set({ settings: updated })
  },
  setFinancialPositionStyle: (style: FinancialPositionStyle) => {
    const updated = {
      ...get().settings,
      finance: { ...get().settings.finance, financialPositionStyle: style },
    }
    persistAndApply(updated)
    set({ settings: updated })
  },
  setHideBalancesOnLaunch: (hide: boolean) => {
    const updated = {
      ...get().settings,
      privacy: { ...get().settings.privacy, hideBalancesOnLaunch: hide },
    }
    persistAndApply(updated)
    set({ settings: updated })
  },
  setAssistantResponseStyle: (style: AssistantResponseStyle) => {
    const updated = {
      ...get().settings,
      assistant: { ...get().settings.assistant, responseStyle: style },
    }
    persistAndApply(updated)
    set({ settings: updated })
  },
  setAssistantCalculations: (include: boolean) => {
    const updated = {
      ...get().settings,
      assistant: { ...get().settings.assistant, includeCalculations: include },
    }
    persistAndApply(updated)
    set({ settings: updated })
  },
  setAssistantSuggestions: (show: boolean) => {
    const updated = {
      ...get().settings,
      assistant: { ...get().settings.assistant, showSuggestions: show },
    }
    persistAndApply(updated)
    set({ settings: updated })
  },
}))

applyTheme(initialTheme)
