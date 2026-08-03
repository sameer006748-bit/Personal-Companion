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
import type { AssistantMemory, AssistantPersonalizationProfile } from '../../models/assistant'
import {
  PERSONALIZATION_LIMITS,
  type AssistantResponseStyle,
  type FinancialPositionStyle,
  type IncomeType,
  type ThemePreference,
} from '../../models/settings'
import { useAppStore } from '../../store/appStore'
import { AI_DATA_DISCLOSURE, isAiAssistantEnabled, setAiAssistantEnabled } from '../../lib/assistantClient'
import { getActiveAccounts } from '../../lib/financeCore'
import { activeMemories, memoryLayer } from '../../lib/assistantMemory'
import { AccountManagement } from '../finance/AccountManagement'
import { CloudSyncSection } from './CloudSyncSection'

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
  const updateAssistantPersonalization = useAppStore((state) => state.updateAssistantPersonalization)
  const restartOnboarding = useAppStore((state) => state.restartOnboarding)
  const assistantMemory = useAppStore((state) => state.assistantMemory)
  const clearAssistantMemory = useAppStore((state) => state.clearAssistantMemory)
  const setAssistantPersonalizationEnabled = useAppStore((state) => state.setAssistantPersonalizationEnabled)
  const forgetAssistantMemory = useAppStore((state) => state.forgetAssistantMemory)

  const [aiEnabled, setAiEnabled] = useState(() => isAiAssistantEnabled())
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(settings.profile.fullName)
  const [editInitials, setEditInitials] = useState(settings.profile.initials)
  const [editIncomeType, setEditIncomeType] = useState<IncomeType>(settings.profile.incomeType)
  const [editDefaultAccount, setEditDefaultAccount] = useState<AccountId>(settings.profile.defaultAccountId)
  const [editNameError, setEditNameError] = useState('')
  const [editInitialsError, setEditInitialsError] = useState('')
  const [savedMessage, setSavedMessage] = useState('')
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview')

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
      <nav className="profile-tabs glass-surface" aria-label="Profile sections">
        {profileTabs.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? 'is-active' : ''} aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
      </nav>

      {activeTab === 'overview' ? <>
        <section className="profile-identity glass-surface" aria-labelledby="identity-title">
          <div className="profile-identity-top"><span className="profile-avatar">{settings.profile.initials}</span><div className="profile-identity-copy"><strong>{settings.profile.fullName}</strong><small>{incomeTypeLabels[settings.profile.incomeType]}</small></div><button type="button" className="glass-control profile-edit-button" onClick={handleEditStart} aria-label="Edit profile"><Pencil aria-hidden="true" /></button></div>
          <dl className="profile-identity-details"><div><dt>Currency</dt><dd>PKR</dd></div><div><dt>Default Account</dt><dd>{defaultAccountName}</dd></div></dl>
        </section>
        {editing ? <section className="profile-edit glass-surface" aria-labelledby="edit-title">
          <h2 id="edit-title">Edit profile</h2>
          <div className="profile-field"><label htmlFor="profile-name">Full name</label><input id="profile-name" type="text" value={editName} onChange={(event) => handleNameChange(event.target.value)} aria-invalid={editNameError.length > 0} aria-describedby={editNameError ? 'profile-name-error' : undefined} />{editNameError ? <span id="profile-name-error" className="profile-field-error" role="alert">{editNameError}</span> : null}</div>
          <div className="profile-field"><label htmlFor="profile-initials">Initials</label><input id="profile-initials" type="text" value={editInitials} onChange={(event) => setEditInitials(event.target.value.toUpperCase().slice(0, 3))} maxLength={3} aria-invalid={editInitialsError.length > 0} aria-describedby={editInitialsError ? 'profile-initials-error' : undefined} />{editInitialsError ? <span id="profile-initials-error" className="profile-field-error" role="alert">{editInitialsError}</span> : null}</div>
          <div className="profile-field"><label htmlFor="profile-income-type">Income type</label><select id="profile-income-type" value={editIncomeType} onChange={(event) => { const value = event.target.value; if (value === 'variable' || value === 'fixed' || value === 'mixed') setEditIncomeType(value) }}>{(Object.keys(incomeTypeLabels) as IncomeType[]).map((key) => <option key={key} value={key}>{incomeTypeLabels[key]}</option>)}</select></div>
          <div className="profile-field"><label htmlFor="profile-account">Default account</label><select id="profile-account" value={editDefaultAccount} onChange={(event) => setEditDefaultAccount(event.target.value)}>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>
          <div className="profile-edit-actions"><button type="button" className="glass-control profile-action-button" onClick={handleEditSave}><Check aria-hidden="true" /> Save</button><button type="button" className="glass-control profile-action-button" onClick={handleEditCancel}>Cancel</button></div>
        </section> : null}
        <SettingsSection title="Financial preferences" id="finance-preferences"><SettingRow label="Currency" locked>PKR</SettingRow><SettingSelectRow label="Income type" value={settings.profile.incomeType} options={incomeTypeLabels} onChange={(value) => { setIncomeType(value as IncomeType); showSaved('Preferences saved') }} /><SettingSelectRow label="Default account" value={settings.profile.defaultAccountId} options={Object.fromEntries(activeAccounts.map((account) => [account.id, account.name]))} onChange={(value) => { setDefaultAccount(value); showSaved('Preferences saved') }} /><SettingRow label="Month start">1st day of each month</SettingRow><SettingSelectRow label="Financial position style" value={settings.finance.financialPositionStyle} options={{ simple: 'Simple', detailed: 'Detailed' }} onChange={(value) => { setFinancialPositionStyle(value as FinancialPositionStyle); showSaved('Preferences saved') }} /></SettingsSection>
      </> : null}

      {activeTab === 'accounts' ? <AccountManagement /> : null}

      {activeTab === 'personalization' ? <>
        <PersonalizationForm initial={settings.assistant.personalization} onSave={(profile) => { updateAssistantPersonalization(profile); showSaved('Personalization saved') }} />
        <SettingsSection title="Memory Controls" id="personalization-memory-controls"><ToggleRow label="Use personalization" description="Uses only memories you explicitly save for this user." checked={assistantMemory.enabled} onChange={setAssistantPersonalizationEnabled} /><SettingRow label="Active saved memories" status={String(activeMemories(assistantMemory).length)} /><p className="profile-setting-desc">Financial records are never stored as conversational memory.</p><div className="profile-setting-row"><span className="profile-setting-label">Review or delete saved memories</span><button type="button" className="glass-control profile-action-button" onClick={() => setActiveTab('assistant-memory')}>Manage memories</button></div></SettingsSection>
      </> : null}

      {activeTab === 'assistant-memory' ? <>
        <SettingsSection title="Assistant preferences" id="assistant-preferences"><SettingSelectRow label="Response style" value={settings.assistant.responseStyle} options={responseStyleLabels} onChange={(value) => { setAssistantResponseStyle(value as AssistantResponseStyle); showSaved('Preferences saved') }} /><ToggleRow label="Include financial calculations" description="Shows supporting calculations when they materially help." checked={settings.assistant.includeCalculations} onChange={(checked) => { setAssistantCalculations(checked); showSaved('Preferences saved') }} /><ToggleRow label="Show suggested questions" checked={settings.assistant.showSuggestions} onChange={(checked) => { setAssistantSuggestions(checked); showSaved('Preferences saved') }} /><SettingRow label="Preferred language" status={settings.assistant.personalization.language === 'roman-urdu' ? 'Roman Urdu' : 'English'} /><ToggleRow label="Use the AI assistant" description="When off, supported answers stay on this device." checked={aiEnabled} onChange={(checked) => { setAiAssistantEnabled(checked); setAiEnabled(checked); showSaved(checked ? 'AI assistant enabled' : 'AI assistant disabled') }} /><div className="assistant-ai-disclosure"><p>Turning this on sends, for each question:</p><ul>{AI_DATA_DISCLOSURE.map((line) => <li key={line}>{line}</li>)}</ul><p>Financial records remain authoritative on this device. This AI choice applies to this device only.</p></div></SettingsSection>
        <MemorySection enabled={assistantMemory.enabled} memories={activeMemories(assistantMemory)} onEnabled={setAssistantPersonalizationEnabled} onForget={forgetAssistantMemory} onClear={clearAssistantMemory} />
      </> : null}

      {activeTab === 'appearance-privacy' ? <>
        <SettingsSection title="Appearance" id="appearance"><ThemeSelector current={settings.appearance.themePreference} onChange={(value) => { setThemePreference(value); showSaved('Preferences saved') }} /></SettingsSection>
        <SettingsSection title="Privacy" id="privacy"><ToggleRow label="Hide financial amounts" description="Masks financial values throughout the application." checked={privacyMode} onChange={() => { togglePrivacyMode(); showSaved('Preferences saved') }} /><ToggleRow label="Hide balances when the app opens" description="Temporarily hides amounts until you reveal them." checked={settings.privacy.hideBalancesOnLaunch} onChange={(checked) => { setHideBalancesOnLaunch(checked); showSaved('Preferences saved') }} /></SettingsSection>
        <SettingsSection title="Data and security" id="data-security"><SettingRow label="App lock" status="Not configured" /><SettingRow label="Data backup" status="Local and cloud settings" /><RestartOnboardingRow onRestart={() => { restartOnboarding(); void navigate('/onboarding') }} /><ClearConversationRow showSaved={showSaved} /></SettingsSection>
        <CloudSyncSection />
        <SettingsSection title="About" id="about"><SettingRow label="Application">Personal Companion</SettingRow><SettingRow label="Version">0.1.0</SettingRow><SettingRow label="Current currency">PKR</SettingRow></SettingsSection>
      </> : null}
    </div>
  )
}

type ProfileTab = 'overview' | 'accounts' | 'personalization' | 'assistant-memory' | 'appearance-privacy'

const profileTabs: readonly { id: ProfileTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'personalization', label: 'Personalization' },
  { id: 'assistant-memory', label: 'Assistant & Memory' },
  { id: 'appearance-privacy', label: 'Appearance & Privacy' },
]

function PersonalizationForm({ initial, onSave }: { initial: AssistantPersonalizationProfile; onSave: (profile: AssistantPersonalizationProfile) => void }) {
  const [draft, setDraft] = useState(() => ({ ...initial }))
  const update = <Key extends keyof AssistantPersonalizationProfile>(key: Key, value: AssistantPersonalizationProfile[Key]) => setDraft((current) => ({ ...current, [key]: value }))
  return <SettingsSection title="Personalization" id="personalization">
    <p className="profile-section-intro">Tell the companion what helps. These preferences guide wording and relevance, never financial facts or safety rules.</p>
    <div className="personalization-group"><h3>Identity & About Me</h3><TextField id="preferred-name" label="Preferred name" value={draft.preferredName ?? ''} limit={PERSONALIZATION_LIMITS.preferredName} onChange={(value) => update('preferredName', value)} /><TextField id="about-me" label="About me" value={draft.aboutMe} limit={PERSONALIZATION_LIMITS.aboutMe} multiline onChange={(value) => update('aboutMe', value)} /></div>
    <div className="personalization-group"><h3>Communication Style</h3><SettingSelectRow label="Preferred language" value={draft.language} options={{ 'roman-urdu': 'Roman Urdu', english: 'English' }} onChange={(value) => update('language', value as AssistantPersonalizationProfile['language'])} /><SettingSelectRow label="Response length" value={draft.responseLength} options={{ short: 'Concise', balanced: 'Balanced', detailed: 'Detailed' }} onChange={(value) => update('responseLength', value as AssistantPersonalizationProfile['responseLength'])} /><SettingSelectRow label="Conversation tone" value={draft.tone} options={{ friendly: 'Friendly', direct: 'Direct', gentle: 'Gentle', strict: 'Strict / accountability' }} onChange={(value) => update('tone', value as AssistantPersonalizationProfile['tone'])} /></div>
    <div className="personalization-group"><h3>Financial Coaching & Risk</h3><SettingSelectRow label="Coaching style" value={draft.financialCoaching} options={{ conservative: 'Conservative', balanced: 'Balanced', 'growth-oriented': 'Growth-oriented' }} onChange={(value) => update('financialCoaching', value as AssistantPersonalizationProfile['financialCoaching'])} /><SettingSelectRow label="Risk tolerance" value={draft.riskTolerance} options={{ low: 'Low', moderate: 'Moderate', high: 'High' }} onChange={(value) => update('riskTolerance', value as AssistantPersonalizationProfile['riskTolerance'])} /></div>
    <div className="personalization-group"><h3>Priorities & Goals</h3><TextField id="financial-priorities" label="Financial priorities" value={draft.financialPriorities} limit={PERSONALIZATION_LIMITS.financialPriorities} multiline onChange={(value) => update('financialPriorities', value)} /><TextField id="goals-plans" label="Goals and plans" value={draft.goalsAndPlans} limit={PERSONALIZATION_LIMITS.goalsAndPlans} multiline onChange={(value) => update('goalsAndPlans', value)} /></div>
    <details className="personalization-advanced"><summary>Advanced communication preferences</summary><TextField id="advice-preferences" label="Advice preferences" value={draft.advicePreferences} limit={PERSONALIZATION_LIMITS.advicePreferences} multiline onChange={(value) => update('advicePreferences', value)} /><TextField id="things-to-avoid" label="Things to avoid" value={draft.thingsToAvoid} limit={PERSONALIZATION_LIMITS.thingsToAvoid} multiline onChange={(value) => update('thingsToAvoid', value)} /></details>
    <div className="profile-edit-actions"><button type="button" className="assistant-action-confirm" onClick={() => onSave(draft)}><Check aria-hidden="true" /> Save personalization</button></div>
  </SettingsSection>
}

function TextField({ id, label, value, limit, multiline = false, onChange }: { id: string; label: string; value: string; limit: number; multiline?: boolean; onChange: (value: string) => void }) {
  return <div className="profile-field personalization-field"><label htmlFor={id}>{label}</label>{multiline ? <textarea id={id} rows={3} value={value} maxLength={limit} onChange={(event) => onChange(event.target.value)} /> : <input id={id} type="text" value={value} maxLength={limit} onChange={(event) => onChange(event.target.value)} />}<small>{value.length}/{limit}</small></div>
}

function MemorySection({ enabled, memories, onEnabled, onForget, onClear }: { enabled: boolean; memories: readonly AssistantMemory[]; onEnabled: (value: boolean) => void; onForget: (value: string) => void; onClear: () => void }) {
  const [confirming, setConfirming] = useState(false)
  return <SettingsSection title="Personalization and memory" id="personalization-memory">
    <ToggleRow label="Use personalization" description="Uses only memories you explicitly save on this device." checked={enabled} onChange={onEnabled} />
    <SettingRow label="Active saved memories" status={String(memories.length)} />
    <p className="profile-setting-desc">Financial records are never stored as conversational memory.</p>
    {memories.length ? <div className="memory-list">{memories.map((memory) => <div key={memory.memoryId}><span><strong>{memory.displayLabel}</strong><small>{memory.summary}</small><small>{memory.category.replaceAll('_', ' ')} · {memoryLayer(memory.category)} layer</small></span><button type="button" className="glass-control" onClick={() => onForget(memory.displayLabel)}>Delete</button></div>)}</div> : <p className="profile-setting-desc">No saved memories yet.</p>}
    {confirming ? <div className="profile-setting-row clear-row"><span className="profile-setting-label">Clear all personal memories<span className="profile-setting-desc">Finance, chat history, backup, and sign-in will remain unchanged.</span></span><div className="profile-clear-actions"><button type="button" className="glass-control profile-clear-confirm" onClick={() => { onClear(); setConfirming(false) }}>Confirm</button><button type="button" className="glass-control profile-clear-cancel" onClick={() => setConfirming(false)}>Cancel</button></div></div> : <div className="profile-setting-row"><span className="profile-setting-label">Clear all personal memories</span><button type="button" className="glass-control profile-action-button" onClick={() => setConfirming(true)}><Trash2 aria-hidden="true" /> Clear</button></div>}
  </SettingsSection>
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
