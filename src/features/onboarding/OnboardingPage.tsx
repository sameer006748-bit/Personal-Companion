import { useEffect, useRef, useState } from 'react'
import { Landmark, MessageCircleHeart, Moon, ShieldCheck, Sun } from 'lucide-react'
import { useNavigate } from 'react-router'

import {
  OnboardingActions,
  OnboardingChoice,
  OnboardingPrivacyNote,
  OnboardingProgress,
} from './OnboardingComponents'
import { ACCOUNT_TYPE_LABELS, type AccountType } from '../../models/finance'
import {
  createOnboardingDraft,
  type IncomeType,
  type OnboardingDraft,
  type OnboardingStep,
  type ThemePreference,
} from '../../models/settings'
import { PrivateAmount } from '../../shared/ui/PrivateAmount'
import { useAppStore } from '../../store/appStore'

const incomeTypes: readonly { value: IncomeType; label: string }[] = [
  { value: 'variable', label: 'Variable income' },
  { value: 'fixed', label: 'Fixed income' },
  { value: 'mixed', label: 'Mixed income' },
]

const themes: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

type OnboardingErrors = Partial<Record<'fullName' | 'initials' | 'balances', string>>

function deriveInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, 3)
    .join('')
}

function getBalanceTotal(draft: OnboardingDraft): number {
  return Object.values(draft.accountBalances).reduce(
    (total, balance) => total + balance,
    0,
  )
}

function validateDraft(
  draft: OnboardingDraft,
  step: OnboardingStep,
  invalidBalanceIds: ReadonlySet<string> = new Set(),
): OnboardingErrors {
  const errors: OnboardingErrors = {}

  if (step === 2 || step === 5) {
    if (draft.fullName.trim().length === 0) {
      errors.fullName = 'Enter your full name to continue.'
    } else if (draft.fullName.trim().length > 60) {
      errors.fullName = 'Use 60 characters or fewer.'
    }

    if (!/^[A-Z]{1,3}$/.test(draft.initials)) {
      errors.initials = 'Use 1 to 3 uppercase letters.'
    }
  }

  if (step === 3 || step === 5) {
    const balancesAreValid = invalidBalanceIds.size === 0 && Object.values(draft.accountBalances).every(
      (balance) =>
        Number.isInteger(balance) && balance >= 0 && balance <= 100000000,
    )

    if (!balancesAreValid) {
      errors.balances = 'Use whole PKR amounts from 0 to 100,000,000.'
    }
  }

  return errors
}

function StepTitle({
  title,
  children,
  headingRef,
}: {
  title: string
  children: React.ReactNode
  headingRef: React.RefObject<HTMLHeadingElement | null>
}) {
  return (
    <div className="onboarding-step-heading">
      <h1 ref={headingRef} tabIndex={-1}>{title}</h1>
      <p>{children}</p>
    </div>
  )
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const settings = useAppStore((state) => state.settings)
  const updateOnboardingDraft = useAppStore((state) => state.updateOnboardingDraft)
  const setOnboardingStep = useAppStore((state) => state.setOnboardingStep)
  const completeOnboarding = useAppStore((state) => state.completeOnboarding)
  const previewOnboardingDraft = useAppStore((state) => state.previewOnboardingDraft)
  const [errors, setErrors] = useState<OnboardingErrors>({})
  const [balanceDrafts, setBalanceDrafts] = useState<Record<string, string>>({})
  const headingRef = useRef<HTMLHeadingElement>(null)
  const step = settings.onboarding.currentStep
  const draft = settings.onboarding.draft ?? createOnboardingDraft(settings)
  const accountDrafts = draft.accounts ?? [{ id: 'cash', name: 'Cash', type: 'cash' as const, openingBalance: draft.accountBalances.cash ?? 0, isDefault: true }]

  useEffect(() => {
    previewOnboardingDraft(draft)
  }, [previewOnboardingDraft, draft])

  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  function updateDraft(next: OnboardingDraft) {
    setErrors({})
    updateOnboardingDraft(next)
  }

  function updateStep(nextStep: OnboardingStep) {
    setErrors({})
    setOnboardingStep(nextStep)
  }

  function handleContinue() {
    const validationErrors = validateDraft(draft, step, new Set(Object.keys(balanceDrafts).filter((id) => balanceDrafts[id] === '')))

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    if (step === 5) {
      completeOnboarding()
      void navigate('/', { replace: true })
      return
    }

    updateStep((step + 1) as OnboardingStep)
  }

  function handleBack() {
    if (step > 1) {
      updateStep((step - 1) as OnboardingStep)
    }
  }

  function handleNameChange(value: string) {
    const initials = draft.initialsManuallyEdited
      ? draft.initials
      : deriveInitials(value)
    updateDraft({ ...draft, fullName: value, initials })
  }

  return (
    <main className="onboarding-page" aria-labelledby="onboarding-title">
      <div className="onboarding-shell glass-surface">
        <div className="onboarding-brand">
          <span>Personal Companion</span>
          {step > 1 ? <OnboardingProgress currentStep={step} /> : null}
        </div>

        {step === 1 ? (
          <section className="onboarding-welcome">
            <img
              className="onboarding-welcome-icon"
              src="/icons/app-icon-512.png"
              width={512}
              height={512}
              alt=""
            />
            <p className="eyebrow">Personal Companion</p>
            <StepTitle title="Your money. Clearly understood." headingRef={headingRef}>
              Track your money, plan what is due, and talk to a companion that understands your financial life.
            </StepTitle>
            <ul className="onboarding-trust-points">
              <li><Landmark aria-hidden="true" /><span>Your accounts and planning in one place</span></li>
              <li><ShieldCheck aria-hidden="true" /><span>Actions always require your confirmation</span></li>
              <li><MessageCircleHeart aria-hidden="true" /><span>Private, personalized and built around you</span></li>
            </ul>
            <OnboardingPrivacyNote />
          </section>
        ) : null}

        {step === 2 ? (
          <section className="onboarding-step">
            <StepTitle title="Tell us about you" headingRef={headingRef}>
              A few details make your overview feel personal from the start.
            </StepTitle>
            <div className="onboarding-field">
              <label htmlFor="onboarding-full-name">Full name</label>
              <input
                id="onboarding-full-name"
                value={draft.fullName}
                maxLength={60}
                autoComplete="name"
                onChange={(event) => handleNameChange(event.target.value)}
                aria-invalid={Boolean(errors.fullName)}
                aria-describedby={errors.fullName ? 'onboarding-name-error' : undefined}
              />
              {errors.fullName ? <span id="onboarding-name-error" className="onboarding-error" role="alert">{errors.fullName}</span> : null}
            </div>
            <div className="onboarding-field">
              <label htmlFor="onboarding-initials">Initials</label>
              <input
                id="onboarding-initials"
                value={draft.initials}
                maxLength={3}
                onChange={(event) => updateDraft({
                  ...draft,
                  initials: event.target.value.toUpperCase().replaceAll(/[^A-Z]/g, '').slice(0, 3),
                  initialsManuallyEdited: true,
                })}
                aria-invalid={Boolean(errors.initials)}
                aria-describedby={errors.initials ? 'onboarding-initials-error' : undefined}
              />
              {errors.initials ? <span id="onboarding-initials-error" className="onboarding-error" role="alert">{errors.initials}</span> : null}
            </div>
            <fieldset className="onboarding-field onboarding-choice-field">
              <legend>Income type</legend>
              <div className="onboarding-choice-group" role="radiogroup" aria-label="Income type">
                {incomeTypes.map((incomeType) => (
                  <OnboardingChoice
                    key={incomeType.value}
                    label={incomeType.label}
                    selected={draft.incomeType === incomeType.value}
                    onClick={() => updateDraft({ ...draft, incomeType: incomeType.value })}
                  />
                ))}
              </div>
            </fieldset>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="onboarding-step">
            <StepTitle title="Your everyday money" headingRef={headingRef}>
              Add the amounts currently available in your everyday accounts.
            </StepTitle>
            <div className="onboarding-balance-list" aria-describedby={errors.balances ? 'onboarding-balances-error' : undefined}>
              {accountDrafts.map((account) => (
                <div key={account.id} className="onboarding-balance-field">
                  <label htmlFor={`onboarding-balance-${account.id}`}>Account name<input value={account.name} onChange={(event) => updateDraft({ ...draft, accounts: accountDrafts.map((item) => item.id === account.id ? { ...item, name: event.target.value } : item) })} /></label>
                  <div>
                    <span>PKR</span>
                    <input
                      id={`onboarding-balance-${account.id}`}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={9}
                      autoComplete="off"
                      value={balanceDrafts[account.id] ?? String(account.openingBalance)}
                      onFocus={(event) => { if (event.target.value === '0') event.target.select() }}
                      onChange={(event) => { const raw = event.target.value; if (raw !== '' && !/^\d+$/.test(raw)) return; setBalanceDrafts((current) => ({ ...current, [account.id]: raw })); if (raw === '') return; const balance = Number(raw); updateDraft({ ...draft, accountBalances: { ...draft.accountBalances, [account.id]: balance }, accounts: accountDrafts.map((item) => item.id === account.id ? { ...item, openingBalance: balance } : item) }) }}
                    />
                  </div>
                  <select aria-label={`${account.name || 'Account'} type`} value={account.type} onChange={(event) => updateDraft({ ...draft, accounts: accountDrafts.map((item) => item.id === account.id ? { ...item, type: event.target.value as AccountType } : item) })}>{(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((type) => <option key={type} value={type}>{ACCOUNT_TYPE_LABELS[type]}</option>)}</select>
                  {accountDrafts.length > 1 ? <button type="button" onClick={() => { const remaining = accountDrafts.filter((item) => item.id !== account.id); updateDraft({ ...draft, accounts: remaining.map((item, index) => ({ ...item, isDefault: item.isDefault || (account.isDefault && index === 0) })), defaultAccountId: remaining.find((item) => item.isDefault)?.id ?? remaining[0]!.id }) }}>Remove</button> : null}
                </div>
              ))}
            </div>
            {errors.balances ? <span id="onboarding-balances-error" className="onboarding-error" role="alert">{errors.balances}</span> : null}
            <div className="onboarding-total glass-control">
              <span>Currently available</span>
              <PrivateAmount amount={getBalanceTotal(draft)} />
            </div>
            <fieldset className="onboarding-field onboarding-choice-field">
              <legend>Default account</legend>
              <div className="onboarding-choice-group" role="radiogroup" aria-label="Default account">
                {accountDrafts.map((account) => (
                  <OnboardingChoice
                    key={account.id}
                    label={account.name || 'Unnamed account'}
                    selected={account.isDefault}
                    onClick={() => updateDraft({ ...draft, defaultAccountId: account.id, accounts: accountDrafts.map((item) => ({ ...item, isDefault: item.id === account.id })) })}
                  />
              ))}
            </div>
            <button type="button" className="glass-control onboarding-add-account" onClick={() => updateDraft({ ...draft, accounts: [...accountDrafts, { id: `onboarding-${Date.now()}`, name: '', type: 'bank', openingBalance: 0, isDefault: false }] })}>Add another account</button>
            </fieldset>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="onboarding-step">
            <StepTitle title="Choose your preferences" headingRef={headingRef}>
              You can change these anytime from your Profile settings.
            </StepTitle>
            <fieldset className="onboarding-field onboarding-choice-field">
              <legend>Appearance</legend>
              <div className="onboarding-choice-group" role="radiogroup" aria-label="Appearance">
                {themes.map((theme) => (
                  <OnboardingChoice
                    key={theme.value}
                    label={theme.label}
                    selected={draft.themePreference === theme.value}
                    onClick={() => updateDraft({ ...draft, themePreference: theme.value })}
                  >
                    {theme.value === 'dark' ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
                    {theme.label}
                  </OnboardingChoice>
                ))}
              </div>
            </fieldset>
            <div className="onboarding-preference-row">
              <div>
                <strong>Hide financial amounts</strong>
                <span>Masks financial values throughout the application.</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={draft.hideAmounts}
                className={`onboarding-toggle ${draft.hideAmounts ? 'is-active' : ''}`}
                onClick={() => updateDraft({ ...draft, hideAmounts: !draft.hideAmounts })}
              >
                <span />
              </button>
            </div>
            <div className="onboarding-preference-row">
              <div>
                <strong>Hide balances when the app opens</strong>
                <span>Temporarily hides amounts until you reveal them.</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={draft.hideBalancesOnLaunch}
                className={`onboarding-toggle ${draft.hideBalancesOnLaunch ? 'is-active' : ''}`}
                onClick={() => updateDraft({
                  ...draft,
                  hideBalancesOnLaunch: !draft.hideBalancesOnLaunch,
                })}
              >
                <span />
              </button>
            </div>
          </section>
        ) : null}

        {step === 5 ? (
          <section className="onboarding-step">
            <StepTitle title="Review your setup" headingRef={headingRef}>
              Check the essentials, then your personal overview is ready.
            </StepTitle>
            <dl className="onboarding-review">
              <div><dt>Full name</dt><dd>{draft.fullName}</dd></div>
              <div><dt>Initials</dt><dd>{draft.initials}</dd></div>
              <div><dt>Income type</dt><dd>{incomeTypes.find((incomeType) => incomeType.value === draft.incomeType)?.label}</dd></div>
              <div><dt>Default account</dt><dd>{accountDrafts.find((account) => account.isDefault)?.name}</dd></div>
            </dl>
            <section className="onboarding-review-balances" aria-labelledby="review-balances-title">
              <h2 id="review-balances-title">Starting balances</h2>
              {accountDrafts.map((account) => (
                <div key={account.id}>
                  <span>{account.name || 'Unnamed account'} · {ACCOUNT_TYPE_LABELS[account.type]}{account.isDefault ? ' · Default' : ''}</span>
                  <PrivateAmount amount={account.openingBalance} />
                </div>
              ))}
              <div className="onboarding-review-total">
                <span>Total available</span>
                <PrivateAmount amount={getBalanceTotal(draft)} />
              </div>
            </section>
            <dl className="onboarding-review onboarding-review-preferences">
              <div><dt>Theme</dt><dd>{themes.find((theme) => theme.value === draft.themePreference)?.label}</dd></div>
              <div><dt>Privacy</dt><dd>{draft.hideAmounts ? 'Hide amounts' : 'Amounts visible'}</dd></div>
            </dl>
          </section>
        ) : null}

        <OnboardingActions
          step={step}
          onBack={handleBack}
          onContinue={handleContinue}
          isFinish={step === 5}
        />
      </div>
    </main>
  )
}
