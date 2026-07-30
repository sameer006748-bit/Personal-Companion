import { useCallback, useMemo, useState } from 'react'
import {
  Check,
  ChevronRight,
  Moon,
  Pencil,
  RotateCcw,
  Sun,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router'

import type { AccountId } from '../../models/finance'
import {
  type AssistantResponseStyle,
  type FinancialPositionStyle,
  type IncomeType,
  type ThemePreference,
} from '../../models/settings'
import { useAppStore } from '../../store/appStore'
import { getActiveAccounts } from '../../lib/financeCore'
import { AccountManagement } from '../finance/AccountManagement'

const incomeTypeLabels: Record<IncomeType, string> = {
  variable: 'Variable income',
  fixed: 'Fixed income',
  mixed: 'Mixed income',
}

const themeLabels: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

const themeIcons: Record<ThemePreference, LucideIcon> = {
  system: Sun,
  light: Sun,
  dark: Moon,
}

const responseStyleLabels: Record<AssistantResponseStyle, string> = {
  concise: 'Concise',
  balanced: 'Balanced',
  detailed: 'Detailed',
}

function deriveInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('')
}

export function ProfilePage() {
  const navigate = useNavigate()
  const settings = useAppStore((state) => state.settings)
  const finance = useAppStore((state) => state.finance)
  const activeAccounts = useMemo(() => getActiveAccounts(finance), [finance])
  const privacyMode = useAppStore((state) => state.privacyMode)
  const togglePrivacyMode = useAppStore((state) => state.togglePrivacyMode)
  const setThemePreference = useAppStore((state) => state.setThemePreference)
  const updateProfile = useAppStore((state) => state.updateProfile)
  const setIncomeType = useAppStore((state) => state.setIncomeType)
  const setDefaultAccount = useAppStore((state) => state.setDefaultAccount)
  const setFinancialPositionStyle = useAppStore((state) => state.setFinancialPositionStyle)
  const setHideBalancesOnLaunch = useAppStore((state) => state.setHideBalancesOnLaunch)
  const setAssistantResponseStyle = useAppStore((state) => state.setAssistantResponseStyle)
  const setAssistantCalculations = useAppStore((state) => state.setAssistantCalculations)
  const setAssistantSuggestions = useAppStore((state) => state.setAssistantSuggestions)
  const restartOnboarding = useAppStore((state) => state.restartOnboarding)

  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(settings.profile.fullName)
  const [editInitials, setEditInitials] = useState(settings.profile.initials)
  const [editIncomeType, setEditIncomeType] = useState<IncomeType>(settings.profile.incomeType)
  const [editDefaultAccount, setEditDefaultAccount] = useState<AccountId>(settings.profile.defaultAccountId)
  const [editNameError, setEditNameError] = useState('')
  const [editInitialsError, setEditInitialsError] = useState('')
  const [savedMessage, setSavedMessage] = useState('')

  const showSaved = useCallback((msg: string) => {
    setSavedMessage(msg)
    window.setTimeout(() => setSavedMessage(''), 1800)
  }, [])

  const handleEditStart = () => {
    setEditName(settings.profile.fullName)
    setEditInitials(settings.profile.initials)
    setEditIncomeType(settings.profile.incomeType)
    setEditDefaultAccount(settings.profile.defaultAccountId)
    setEditNameError('')
    setEditInitialsError('')
    setEditing(true)
  }

  const handleEditCancel = () => {
    setEditing(false)
    setEditNameError('')
    setEditInitialsError('')
  }

  const handleEditSave = () => {
    let valid = true

    if (editName.trim().length === 0) {
      setEditNameError('Name cannot be empty')
      valid = false
    } else {
      setEditNameError('')
    }

    const initials = editInitials.toUpperCase().slice(0, 3)
    const initialsValid = /^[A-Z]{1,3}$/.test(initials)

    if (!initialsValid) {
      setEditInitialsError('1 to 3 uppercase letters')
      valid = false
    } else {
      setEditInitialsError('')
    }

    if (!valid) {
      return
    }

    updateProfile(editName.trim(), initials, editIncomeType, editDefaultAccount)
    setEditing(false)
    showSaved('Profile updated')
  }

  const handleNameChange = (value: string) => {
    setEditName(value)
    if (!editing) {
      const initials = deriveInitials(value)
      if (initials.length > 0) {
        setEditInitials(initials)
      }
    }
  }

  const defaultAccountName = finance.accounts.find((account) => account.id === settings.profile.defaultAccountId)?.name ?? settings.profile.defaultAccountId

  return (
    <div className="profile-page">
      <header className="profile-header">
        <div>
          <p className="eyebrow">Personal settings</p>
          <h1>Profile</h1>
          <p className="profile-subtitle">
            Manage your personal preferences and financial experience.
          </p>
        </div>
      </header>

      {savedMessage && (
        <div className="profile-saved" role="status">
          <Check aria-hidden="true" />
          {savedMessage}
        </div>
      )}

      <section className="profile-identity glass-surface" aria-labelledby="identity-title">
        <div className="profile-identity-top">
          <span className="profile-avatar">{settings.profile.initials}</span>
          <div className="profile-identity-copy">
            <strong>{settings.profile.fullName}</strong>
            <small>{incomeTypeLabels[settings.profile.incomeType]}</small>
          </div>
          <button type="button" className="glass-control profile-edit-button" onClick={handleEditStart} aria-label="Edit profile">
            <Pencil aria-hidden="true" />
          </button>
        </div>
        <dl className="profile-identity-details">
          <div>
            <dt>Currency</dt>
            <dd>PKR</dd>
          </div>
          <div>
            <dt>Default Account</dt>
            <dd>{defaultAccountName}</dd>
          </div>
        </dl>
      </section>

      {editing && (
        <section className="profile-edit glass-surface" aria-labelledby="edit-title">
          <h2 id="edit-title">Edit profile</h2>
          <div className="profile-field">
            <label htmlFor="profile-name">Full name</label>
            <input id="profile-name" type="text" value={editName} onChange={(event) => handleNameChange(event.target.value)} aria-invalid={editNameError.length > 0} aria-describedby={editNameError ? 'profile-name-error' : undefined} />
            {editNameError && <span id="profile-name-error" className="profile-field-error" role="alert">{editNameError}</span>}
          </div>
          <div className="profile-field">
            <label htmlFor="profile-initials">Initials</label>
            <input id="profile-initials" type="text" value={editInitials} onChange={(event) => setEditInitials(event.target.value.toUpperCase().slice(0, 3))} maxLength={3} aria-invalid={editInitialsError.length > 0} aria-describedby={editInitialsError ? 'profile-initials-error' : undefined} />
            {editInitialsError && <span id="profile-initials-error" className="profile-field-error" role="alert">{editInitialsError}</span>}
          </div>
          <div className="profile-field">
            <label htmlFor="profile-income-type">Income type</label>
            <select id="profile-income-type" value={editIncomeType} onChange={(event) => {
              const value = event.target.value
              if (value === 'variable' || value === 'fixed' || value === 'mixed') {
                setEditIncomeType(value)
              }
            }}>
              {(Object.keys(incomeTypeLabels) as IncomeType[]).map((key) => <option key={key} value={key}>{incomeTypeLabels[key]}</option>)}
            </select>
          </div>
          <div className="profile-field">
            <label htmlFor="profile-account">Default account</label>
            <select id="profile-account" value={editDefaultAccount} onChange={(event) => setEditDefaultAccount(event.target.value)}>
              {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </div>
          <div className="profile-edit-actions">
            <button type="button" className="glass-control profile-action-button" onClick={handleEditSave}><Check aria-hidden="true" /> Save</button>
            <button type="button" className="glass-control profile-action-button" onClick={handleEditCancel}>Cancel</button>
          </div>
        </section>
      )}

      <SettingsSection title="Financial preferences" id="finance-preferences">
        <SettingRow label="Currency" locked>PKR</SettingRow>
        <SettingSelectRow label="Income type" value={settings.profile.incomeType} options={incomeTypeLabels} onChange={(value) => { setIncomeType(value as IncomeType); showSaved('Preferences saved') }} />
        <SettingSelectRow label="Default account" value={settings.profile.defaultAccountId} options={Object.fromEntries(activeAccounts.map((account) => [account.id, account.name]))} onChange={(value) => { setDefaultAccount(value); showSaved('Preferences saved') }} />
        <SettingRow label="Month start">1st day of each month</SettingRow>
        <SettingSelectRow label="Financial position style" value={settings.finance.financialPositionStyle} options={{ simple: 'Simple', detailed: 'Detailed' }} onChange={(value) => { setFinancialPositionStyle(value as FinancialPositionStyle); showSaved('Preferences saved') }} />
      </SettingsSection>

      <AccountManagement />

      <SettingsSection title="Appearance" id="appearance">
        <ThemeSelector current={settings.appearance.themePreference} onChange={(value) => { setThemePreference(value); showSaved('Preferences saved') }} />
      </SettingsSection>

      <SettingsSection title="Privacy" id="privacy">
        <ToggleRow label="Hide financial amounts" description="Masks financial values throughout the application." checked={privacyMode} onChange={() => { togglePrivacyMode(); showSaved('Preferences saved') }} />
        <ToggleRow label="Hide balances when the app opens" description="Temporarily hides amounts until you reveal them." checked={settings.privacy.hideBalancesOnLaunch} onChange={(checked) => { setHideBalancesOnLaunch(checked); showSaved('Preferences saved') }} />
      </SettingsSection>

      <SettingsSection title="Assistant preferences" id="assistant-preferences">
        <SettingSelectRow label="Response style" value={settings.assistant.responseStyle} options={responseStyleLabels} onChange={(value) => { setAssistantResponseStyle(value as AssistantResponseStyle); showSaved('Preferences saved') }} />
        <ToggleRow label="Include financial calculations" description="Shows detailed numbers in Assistant responses." checked={settings.assistant.includeCalculations} onChange={(checked) => { setAssistantCalculations(checked); showSaved('Preferences saved') }} />
        <ToggleRow label="Show suggested questions" checked={settings.assistant.showSuggestions} onChange={(checked) => { setAssistantSuggestions(checked); showSaved('Preferences saved') }} />
        <SettingRow label="Language style" locked>Professional English</SettingRow>
      </SettingsSection>

      <SettingsSection title="Data and security" id="data-security">
        <SettingRow label="App lock" status="Not configured" />
        <SettingRow label="Data backup" status="Local only" />
        <SettingRow label="Export personal data" status="Coming later" />
        <RestartOnboardingRow
          onRestart={() => {
            restartOnboarding()
            void navigate('/onboarding')
          }}
        />
        <ClearConversationRow showSaved={showSaved} />
      </SettingsSection>

      <SettingsSection title="About" id="about">
        <SettingRow label="Application">Personal Companion</SettingRow>
        <SettingRow label="Version">0.1.0</SettingRow>
        <SettingRow label="Data mode">Local prototype</SettingRow>
        <SettingRow label="Current currency">PKR</SettingRow>
      </SettingsSection>
    </div>
  )
}

function SettingsSection({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  return (
    <section className="profile-section glass-surface" aria-labelledby={id}>
      <h2 id={id} className="profile-section-title">{title}</h2>
      <div className="profile-section-content">{children}</div>
    </section>
  )
}

function SettingRow({ label, children, status, locked }: { label: string; children?: React.ReactNode; status?: string; locked?: boolean }) {
  return (
    <div className="profile-setting-row">
      <span className="profile-setting-label">
        {label}
        {locked && <span className="profile-locked-badge">Locked</span>}
      </span>
      <span className="profile-setting-value">
        {status ?? children}
        {locked && <ChevronRight aria-hidden="true" className="profile-locked-icon" />}
      </span>
    </div>
  )
}

function SettingSelectRow({ label, value, options, onChange }: { label: string; value: string; options: Record<string, string>; onChange: (value: string) => void }) {
  return (
    <div className="profile-setting-row" role="radiogroup" aria-label={label}>
      <span className="profile-setting-label">{label}</span>
      <div className="profile-option-group">
        {Object.entries(options).map(([key, optionLabel]) => (
          <button key={key} type="button" role="radio" aria-checked={value === key} className={`profile-option ${value === key ? 'is-selected' : ''}`} onClick={() => onChange(key)}>
            {optionLabel}
          </button>
        ))}
      </div>
    </div>
  )
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = `toggle-${label.replaceAll(/\s+/g, '-').toLocaleLowerCase()}`
  return (
    <div className="profile-setting-row toggle-row">
      <span className="profile-setting-label">
        <label htmlFor={id}>{label}</label>
        {description && <span className="profile-setting-desc">{description}</span>}
      </span>
      <button id={id} type="button" role="switch" aria-checked={checked} className={`profile-toggle ${checked ? 'is-active' : ''}`} onClick={() => onChange(!checked)}>
        <span className="profile-toggle-thumb" />
      </button>
    </div>
  )
}

function ThemeSelector({ current, onChange }: { current: ThemePreference; onChange: (value: ThemePreference) => void }) {
  const options: ThemePreference[] = ['system', 'light', 'dark']
  return (
    <div className="profile-setting-row" role="radiogroup" aria-label="Theme">
      <span className="profile-setting-label">Theme</span>
      <div className="profile-option-group">
        {options.map((option) => {
          const Icon = themeIcons[option]
          return (
            <button key={option} type="button" role="radio" aria-checked={current === option} className={`profile-option theme-option ${current === option ? 'is-selected' : ''}`} onClick={() => onChange(option)}>
              <Icon aria-hidden="true" />
              {themeLabels[option]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function RestartOnboardingRow({ onRestart }: { onRestart: () => void }) {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <div className="profile-setting-row clear-row">
        <span className="profile-setting-label">
          Restart onboarding
          <span className="profile-setting-desc">Your current values will stay available to review.</span>
        </span>
        <div className="profile-clear-actions">
          <button type="button" className="glass-control profile-restart-confirm" onClick={onRestart}>
            <RotateCcw aria-hidden="true" />
            Continue
          </button>
          <button type="button" className="glass-control profile-clear-cancel" onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="profile-setting-row">
      <span className="profile-setting-label">
        Restart onboarding
        <span className="profile-setting-desc">Review and update your initial setup.</span>
      </span>
      <button type="button" className="glass-control profile-action-button" onClick={() => setConfirming(true)}>
        <RotateCcw aria-hidden="true" />
        Restart
      </button>
    </div>
  )
}

function ClearConversationRow({ showSaved }: { showSaved: (msg: string) => void }) {
  const [confirming, setConfirming] = useState(false)

  const handleClear = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('personal-companion-conversation')
    }
    setConfirming(false)
    showSaved('Conversation cleared')
  }

  if (confirming) {
    return (
      <div className="profile-setting-row clear-row">
        <span className="profile-setting-label">Clear local conversation</span>
        <div className="profile-clear-actions">
          <button type="button" className="glass-control profile-clear-confirm" onClick={handleClear}><Trash2 aria-hidden="true" /> Confirm</button>
          <button type="button" className="glass-control profile-clear-cancel" onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="profile-setting-row">
      <span className="profile-setting-label">
        Clear local conversation
        <span className="profile-setting-desc">Removes assistant chat history</span>
      </span>
      <button type="button" className="glass-control profile-action-button" onClick={() => setConfirming(true)}>
        <Trash2 aria-hidden="true" />
        Clear
      </button>
    </div>
  )
}