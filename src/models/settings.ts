import type { AccountId, AccountType } from './finance'
import type { AssistantPersonalizationProfile } from './assistant'

export type ThemePreference = 'system' | 'light' | 'dark'

export type IncomeType = 'variable' | 'fixed' | 'mixed'

export type FinancialPositionStyle = 'simple' | 'detailed'

export type AssistantResponseStyle = 'concise' | 'balanced' | 'detailed'

export type OnboardingStep = 1 | 2 | 3 | 4 | 5

export type OnboardingStatus = 'in-progress' | 'completed'

export type AccountBalances = Record<AccountId, number>

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
  accountBalances: AccountBalances
}

export interface AssistantSettings {
  responseStyle: AssistantResponseStyle
  includeCalculations: boolean
  showSuggestions: boolean
  languageStyle: string
  personalizationEnabled: boolean
  memoryEnabled: boolean
  personalization: AssistantPersonalizationProfile
  ownerId?: string
}

export interface OnboardingDraft {
  fullName: string
  initials: string
  initialsManuallyEdited: boolean
  incomeType: IncomeType
  defaultAccountId: AccountId
  accountBalances: AccountBalances
  themePreference: ThemePreference
  hideAmounts: boolean
  hideBalancesOnLaunch: boolean
  accounts?: readonly OnboardingAccountDraft[]
}

export interface OnboardingAccountDraft {
  id: AccountId
  name: string
  type: AccountType
  openingBalance: number
  isDefault: boolean
  existingAccountId?: AccountId
}

export interface OnboardingSettings {
  version: number
  status: OnboardingStatus
  currentStep: OnboardingStep
  completedAt?: string
  draft?: OnboardingDraft
}

export interface UserSettings {
  version: number
  profile: ProfileSettings
  appearance: AppearanceSettings
  privacy: PrivacySettings
  finance: FinanceSettings
  assistant: AssistantSettings
  onboarding: OnboardingSettings
}

interface LegacyAssistantSettings {
  responseStyle: AssistantResponseStyle
  includeCalculations: boolean
  showSuggestions: boolean
  languageStyle: string
}

interface LegacyUserSettings {
  version: number
  profile: ProfileSettings
  appearance: AppearanceSettings
  privacy: PrivacySettings
  finance: Omit<FinanceSettings, 'accountBalances'>
  assistant: LegacyAssistantSettings
  onboarding?: OnboardingSettings
}

export const SETTINGS_STORAGE_KEY = 'personal-companion-settings'
const STORAGE_KEY = SETTINGS_STORAGE_KEY
const CURRENT_VERSION = 3
const ONBOARDING_VERSION = 1

export const PERSONALIZATION_LIMITS = {
  preferredName: 60,
  aboutMe: 600,
  financialPriorities: 400,
  goalsAndPlans: 500,
  advicePreferences: 400,
  thingsToAvoid: 300,
} as const

export const DEFAULT_ASSISTANT_PERSONALIZATION: AssistantPersonalizationProfile = {
  aboutMe: '',
  language: 'english',
  responseLength: 'balanced',
  tone: 'friendly',
  financialCoaching: 'balanced',
  riskTolerance: 'moderate',
  financialPriorities: '',
  goalsAndPlans: '',
  advicePreferences: '',
  thingsToAvoid: '',
  proactiveSuggestions: false,
}

const defaultAccountBalances: AccountBalances = {
  cash: 0,
}

function cloneBalances(balances: AccountBalances): AccountBalances {
  return { ...balances }
}

export interface OnboardingDraftSource {
  profile: UserSettings['profile']
  appearance: UserSettings['appearance']
  privacy: UserSettings['privacy']
  finance: UserSettings['finance']
  accounts?: readonly {
    id: AccountId
    name: string
    type: AccountType
    openingBalance: number
    isDefault: boolean
    isArchived: boolean
  }[]
}

export function createOnboardingDraft(settings: OnboardingDraftSource): OnboardingDraft {
  const activeAccounts = settings.accounts?.filter((account) => !account.isArchived) ?? []
const accountDrafts: readonly OnboardingAccountDraft[] = activeAccounts.length > 0
  ? activeAccounts.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      openingBalance: account.openingBalance,
      isDefault: account.isDefault,
      existingAccountId: account.id,
    }))
  : [{
      id: 'cash',
      name: 'Cash',
      type: 'cash',
      openingBalance: 0,
      isDefault: true,
    }]

  const defaultAccountId = accountDrafts.find((account) => account.isDefault)?.id ?? accountDrafts[0]?.id ?? settings.profile.defaultAccountId

  return {
    fullName: settings.profile.fullName,
    initials: settings.profile.initials,
    initialsManuallyEdited: false,
    incomeType: settings.profile.incomeType,
    defaultAccountId,
    accountBalances: Object.fromEntries(accountDrafts.map((account) => [account.id, account.openingBalance])),
    themePreference: settings.appearance.themePreference,
    hideAmounts: settings.privacy.hideAmounts,
    hideBalancesOnLaunch: settings.privacy.hideBalancesOnLaunch,
    accounts: accountDrafts,
  }
}

const defaultSettings: UserSettings = {
  version: CURRENT_VERSION,
  profile: {
    fullName: 'New user',
    initials: 'NU',
    incomeType: 'variable',
    defaultAccountId: 'cash',
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
    accountBalances: defaultAccountBalances,
  },
  assistant: {
    responseStyle: 'balanced',
    includeCalculations: true,
    showSuggestions: true,
    languageStyle: 'professional',
    personalizationEnabled: true,
    memoryEnabled: true,
    personalization: { ...DEFAULT_ASSISTANT_PERSONALIZATION },
  },
  onboarding: {
    version: ONBOARDING_VERSION,
    status: 'in-progress',
    currentStep: 1,
  },
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAccountId(value: unknown): value is AccountId {
  return typeof value === 'string' && value.trim().length > 0
}

function isIncomeType(value: unknown): value is IncomeType {
  return value === 'variable' || value === 'fixed' || value === 'mixed'
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

function isBalances(value: unknown): value is AccountBalances {
  if (!isObject(value)) {
    return false
  }

  const entries = Object.entries(value)

  if (entries.length === 0) {
    return false
  }

  return entries.every(([, balance]) => {
    return typeof balance === 'number' && Number.isInteger(balance) && balance >= 0
  })
}

function isBoundedString(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.length <= limit
}

function isAssistantPersonalization(value: unknown): value is AssistantPersonalizationProfile {
  if (!isObject(value)) return false
  return (value.preferredName === undefined || isBoundedString(value.preferredName, PERSONALIZATION_LIMITS.preferredName)) &&
    isBoundedString(value.aboutMe, PERSONALIZATION_LIMITS.aboutMe) &&
    (value.language === 'english' || value.language === 'roman-urdu') &&
    (value.responseLength === 'short' || value.responseLength === 'balanced' || value.responseLength === 'detailed') &&
    (value.tone === 'friendly' || value.tone === 'direct' || value.tone === 'gentle' || value.tone === 'strict') &&
    (value.financialCoaching === 'conservative' || value.financialCoaching === 'balanced' || value.financialCoaching === 'growth-oriented') &&
    (value.riskTolerance === 'low' || value.riskTolerance === 'moderate' || value.riskTolerance === 'high') &&
    isBoundedString(value.financialPriorities, PERSONALIZATION_LIMITS.financialPriorities) &&
    isBoundedString(value.goalsAndPlans, PERSONALIZATION_LIMITS.goalsAndPlans) &&
    isBoundedString(value.advicePreferences, PERSONALIZATION_LIMITS.advicePreferences) &&
    isBoundedString(value.thingsToAvoid, PERSONALIZATION_LIMITS.thingsToAvoid) &&
    typeof value.proactiveSuggestions === 'boolean'
}

function hasValidSharedSettings(value: unknown): value is Omit<UserSettings, 'version' | 'onboarding'> {
  if (!isObject(value) || !isObject(value.profile) || !isObject(value.appearance) || !isObject(value.privacy) || !isObject(value.finance) || !isObject(value.assistant)) {
    return false
  }

  const { profile, appearance, privacy, finance, assistant } = value

  return (
    typeof profile.fullName === 'string' &&
    profile.fullName.trim().length > 0 &&
    typeof profile.initials === 'string' &&
    /^[A-Z]{1,3}$/.test(profile.initials) &&
    isIncomeType(profile.incomeType) &&
    isAccountId(profile.defaultAccountId) &&
    isThemePreference(appearance.themePreference) &&
    typeof privacy.hideAmounts === 'boolean' &&
    typeof privacy.hideBalancesOnLaunch === 'boolean' &&
    finance.currency === 'PKR' &&
    typeof finance.monthStartDay === 'number' &&
    typeof finance.financialPositionStyle === 'string' &&
    typeof assistant.responseStyle === 'string' &&
    typeof assistant.includeCalculations === 'boolean' &&
    typeof assistant.showSuggestions === 'boolean' &&
    typeof assistant.languageStyle === 'string' &&
    typeof assistant.personalizationEnabled === 'boolean' &&
    typeof assistant.memoryEnabled === 'boolean' &&
    isAssistantPersonalization(assistant.personalization)
    && (assistant.ownerId === undefined || (typeof assistant.ownerId === 'string' && assistant.ownerId.length <= 100))
  )
}

function isDraft(value: unknown): value is OnboardingDraft {
  if (!isObject(value)) {
    return false
  }

  return (
    typeof value.fullName === 'string' &&
    value.fullName.trim().length > 0 &&
    typeof value.initials === 'string' &&
    /^[A-Z]{1,3}$/.test(value.initials) &&
    typeof value.initialsManuallyEdited === 'boolean' &&
    isIncomeType(value.incomeType) &&
    isAccountId(value.defaultAccountId) &&
    isBalances(value.accountBalances) &&
    isThemePreference(value.themePreference) &&
    typeof value.hideAmounts === 'boolean' &&
    typeof value.hideBalancesOnLaunch === 'boolean'
  )
}

function isOnboarding(value: unknown): value is OnboardingSettings {
  if (!isObject(value)) {
    return false
  }

  const validStep = value.currentStep === 1 || value.currentStep === 2 || value.currentStep === 3 || value.currentStep === 4 || value.currentStep === 5
  const validStatus = value.status === 'in-progress' || value.status === 'completed'
  const validCompletedAt = value.completedAt === undefined || typeof value.completedAt === 'string'
  const validDraft = value.draft === undefined || isDraft(value.draft)

  return value.version === ONBOARDING_VERSION && validStep && validStatus && validCompletedAt && validDraft
}

function isValidSettings(value: unknown): value is UserSettings {
  const onboarding = isObject(value) ? value.onboarding : undefined

  return (
    isObject(value) &&
    value.version === CURRENT_VERSION &&
    hasValidSharedSettings(value) &&
    isBalances(value.finance.accountBalances) &&
    isOnboarding(onboarding)
  )
}

export function isUserSettings(value: unknown): value is UserSettings {
  return isValidSettings(value)
}

function isLegacySettings(value: unknown): value is LegacyUserSettings {
  if (!isObject(value) || (value.version !== 1 && value.version !== 2) ||
      !isObject(value.profile) || !isObject(value.appearance) || !isObject(value.privacy) ||
      !isObject(value.finance) || !isObject(value.assistant)) return false
  const { profile, appearance, privacy, finance, assistant } = value
  return typeof profile.fullName === 'string' && profile.fullName.trim().length > 0 &&
    typeof profile.initials === 'string' && /^[A-Z]{1,3}$/.test(profile.initials) &&
    isIncomeType(profile.incomeType) && isAccountId(profile.defaultAccountId) &&
    isThemePreference(appearance.themePreference) && typeof privacy.hideAmounts === 'boolean' &&
    typeof privacy.hideBalancesOnLaunch === 'boolean' && finance.currency === 'PKR' &&
    typeof finance.monthStartDay === 'number' && typeof finance.financialPositionStyle === 'string' &&
    typeof assistant.responseStyle === 'string' && typeof assistant.includeCalculations === 'boolean' &&
    typeof assistant.showSuggestions === 'boolean' && typeof assistant.languageStyle === 'string'
}

function migrateLegacySettings(settings: LegacyUserSettings): UserSettings {
  const legacyFinance: unknown = settings.finance
  const legacyBalances = isObject(legacyFinance) && isBalances(legacyFinance.accountBalances)
    ? legacyFinance.accountBalances
    : defaultAccountBalances

  return {
    ...settings,
    version: CURRENT_VERSION,
    finance: {
      ...settings.finance,
      accountBalances: cloneBalances(legacyBalances),
    },
    assistant: {
      ...settings.assistant,
      personalizationEnabled: true,
      memoryEnabled: true,
      personalization: {
        ...DEFAULT_ASSISTANT_PERSONALIZATION,
        language: settings.assistant.languageStyle.toLocaleLowerCase().includes('roman') ? 'roman-urdu' : 'english',
        responseLength: settings.assistant.responseStyle === 'concise' ? 'short' : settings.assistant.responseStyle,
        proactiveSuggestions: settings.assistant.showSuggestions,
      },
    },
    onboarding: settings.onboarding && isOnboarding(settings.onboarding)
      ? settings.onboarding
      : {
          version: ONBOARDING_VERSION,
          status: 'completed',
          currentStep: 5,
          completedAt: new Date().toISOString(),
        },
  }
}

export function normalizeUserSettings(value: unknown): UserSettings | undefined {
  if (isValidSettings(value)) return cloneSettings(value)
  if (isLegacySettings(value)) return migrateLegacySettings(value)
  return undefined
}

function cloneSettings(settings: UserSettings): UserSettings {
  return {
    ...settings,
    profile: { ...settings.profile },
    appearance: { ...settings.appearance },
    privacy: { ...settings.privacy },
    finance: {
      ...settings.finance,
      accountBalances: cloneBalances(settings.finance.accountBalances),
    },
    assistant: { ...settings.assistant, personalization: { ...settings.assistant.personalization } },
    onboarding: {
      ...settings.onboarding,
      ...(settings.onboarding.draft
        ? {
            draft: {
              ...settings.onboarding.draft,
              accountBalances: cloneBalances(settings.onboarding.draft.accountBalances),
            },
          }
        : {}),
    },
  }
}

export type SettingsOrigin = 'fresh' | 'existing' | 'legacy'

export interface LoadedSettings {
  settings: UserSettings
  origin: SettingsOrigin
}

export function loadSettingsWithOrigin(): LoadedSettings {
  if (typeof window === 'undefined') {
    return { settings: cloneSettings(defaultSettings), origin: 'fresh' }
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return { settings: cloneSettings(defaultSettings), origin: 'fresh' }
    }

    const parsed: unknown = JSON.parse(raw)

    const normalized = normalizeUserSettings(parsed)
    if (normalized) {
      if (parsed && typeof parsed === 'object' && (parsed as { version?: unknown }).version === CURRENT_VERSION) {
        return { settings: normalized, origin: 'existing' }
      }
      const migrated = normalized
      saveSettings(migrated)
      return { settings: migrated, origin: 'legacy' }
    }
  } catch {
    // Storage is unavailable or the saved value is invalid; use safe defaults.
  }

  return { settings: cloneSettings(defaultSettings), origin: 'fresh' }
}

export function loadSettings(): UserSettings {
  return loadSettingsWithOrigin().settings
}

export function saveSettings(settings: UserSettings): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const serialized = JSON.stringify(settings)
    window.localStorage.setItem(STORAGE_KEY, serialized)
    if (settings.assistant.ownerId) window.localStorage.setItem(`${STORAGE_KEY}:${settings.assistant.ownerId}`, serialized)
  } catch {
    // Storage full or unavailable; the current session remains usable.
  }
}

export function loadScopedUserSettings(userId: string): UserSettings | undefined {
  if (typeof window === 'undefined' || !userId.trim()) return undefined
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY}:${userId}`)
    return raw ? normalizeUserSettings(JSON.parse(raw)) : undefined
  } catch {
    return undefined
  }
}

export function getDefaultSettings(): UserSettings {
  return cloneSettings(defaultSettings)
}
