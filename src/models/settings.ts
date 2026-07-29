import type { AccountId } from './finance'

export type ThemePreference = 'system' | 'light' | 'dark'

export type IncomeType = 'variable' | 'fixed' | 'mixed'

export type FinancialPositionStyle = 'simple' | 'detailed'

export type AssistantResponseStyle = 'concise' | 'balanced' | 'detailed'

export interface ProfileSettings {
  fullName: string
  initials: string
  incomeType: IncomeType
  defaultAccountId: AccountId
}

export interface AppearanceSettings {
  themePreference: ThemePreference
}

export interface PrivacySettings {
  hideAmounts: boolean
  hideBalancesOnLaunch: boolean
}

export interface FinanceSettings {
  currency: string
  monthStartDay: number
  financialPositionStyle: FinancialPositionStyle
}

export interface AssistantSettings {
  responseStyle: AssistantResponseStyle
  includeCalculations: boolean
  showSuggestions: boolean
  languageStyle: string
}

export interface UserSettings {
  version: number
  profile: ProfileSettings
  appearance: AppearanceSettings
  privacy: PrivacySettings
  finance: FinanceSettings
  assistant: AssistantSettings
}

const STORAGE_KEY = 'personal-companion-settings'
const CURRENT_VERSION = 1

const defaultSettings: UserSettings = {
  version: CURRENT_VERSION,
  profile: {
    fullName: 'Sameer',
    initials: 'SK',
    incomeType: 'variable',
    defaultAccountId: 'meezan-bank',
  },
  appearance: {
    themePreference: 'system',
  },
  privacy: {
    hideAmounts: false,
    hideBalancesOnLaunch: false,
  },
  finance: {
    currency: 'PKR',
    monthStartDay: 1,
    financialPositionStyle: 'simple',
  },
  assistant: {
    responseStyle: 'balanced',
    includeCalculations: true,
    showSuggestions: true,
    languageStyle: 'professional',
  },
}

function isValidSettings(value: unknown): value is UserSettings {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const obj = value as Record<string, unknown>

  if (obj.version !== CURRENT_VERSION) {
    return false
  }

  if (typeof obj.profile !== 'object' || obj.profile === null) {
    return false
  }

  const profile = obj.profile as Record<string, unknown>

  if (typeof profile.fullName !== 'string' || profile.fullName.length === 0) {
    return false
  }

  if (typeof profile.initials !== 'string' || profile.initials.length === 0) {
    return false
  }

  if (typeof profile.incomeType !== 'string') {
    return false
  }

  if (typeof profile.defaultAccountId !== 'string') {
    return false
  }

  if (typeof obj.appearance !== 'object' || obj.appearance === null) {
    return false
  }

  const appearance = obj.appearance as Record<string, unknown>

  if (typeof appearance.themePreference !== 'string') {
    return false
  }

  if (typeof obj.privacy !== 'object' || obj.privacy === null) {
    return false
  }

  const privacy = obj.privacy as Record<string, unknown>

  if (typeof privacy.hideAmounts !== 'boolean') {
    return false
  }

  if (typeof privacy.hideBalancesOnLaunch !== 'boolean') {
    return false
  }

  if (typeof obj.finance !== 'object' || obj.finance === null) {
    return false
  }

  if (typeof obj.assistant !== 'object' || obj.assistant === null) {
    return false
  }

  return true
}

export function loadSettings(): UserSettings {
  if (typeof window === 'undefined') {
    return { ...defaultSettings }
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return { ...defaultSettings }
    }

    const parsed: unknown = JSON.parse(raw)

    if (!isValidSettings(parsed)) {
      return { ...defaultSettings }
    }

    return parsed
  } catch {
    return { ...defaultSettings }
  }
}

export function saveSettings(settings: UserSettings): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function getDefaultSettings(): UserSettings {
  return { ...defaultSettings }
}