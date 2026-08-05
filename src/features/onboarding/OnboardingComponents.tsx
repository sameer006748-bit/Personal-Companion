import { ArrowLeft, ArrowRight, Check, LockKeyhole } from 'lucide-react'
import type { ReactNode } from 'react'

import type { OnboardingStep } from '../../models/settings'

const stepLabels: Record<OnboardingStep, string> = {
  1: 'Welcome',
  2: 'About you',
  3: 'Your money',
  4: 'Preferences',
  5: 'Review',
}

interface OnboardingProgressProps {
  currentStep: OnboardingStep
}

export function OnboardingProgress({ currentStep }: OnboardingProgressProps) {
  return (
    <div className="onboarding-progress" aria-label={`Step ${currentStep} of 5: ${stepLabels[currentStep]}`}>
      <div className="onboarding-progress-copy">
        <span>{stepLabels[currentStep]}</span>
        <span>Step {currentStep} of 5</span>
      </div>
      <div className="onboarding-progress-track" aria-hidden="true">
        <span style={{ width: `${(currentStep / 5) * 100}%` }} />
      </div>
    </div>
  )
}

interface OnboardingActionsProps {
  step: OnboardingStep
  onBack: () => void
  onContinue: () => void
  isFinish?: boolean
}

export function OnboardingActions({
  step,
  onBack,
  onContinue,
  isFinish = false,
}: OnboardingActionsProps) {
  return (
    <footer className={`onboarding-actions${step === 1 ? ' onboarding-actions--welcome' : ''}`}>
      {step > 1 ? (
        <button type="button" className="glass-control onboarding-secondary-action" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Back
        </button>
      ) : <span />}
      <button type="button" className="onboarding-primary-action" onClick={onContinue}>
        {isFinish ? <Check aria-hidden="true" /> : null}
        {isFinish ? 'Finish setup' : step === 1 ? 'Get started' : 'Continue'}
        {!isFinish && step !== 1 ? <ArrowRight aria-hidden="true" /> : null}
      </button>
    </footer>
  )
}

interface OnboardingChoiceProps {
  label: string
  selected: boolean
  onClick: () => void
  children?: ReactNode
}

export function OnboardingChoice({
  label,
  selected,
  onClick,
  children,
}: OnboardingChoiceProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`glass-control onboarding-choice ${selected ? 'is-selected' : ''}`}
      onClick={onClick}
    >
      {children ?? label}
    </button>
  )
}

export function OnboardingPrivacyNote() {
  return (
    <p className="onboarding-privacy-note">
      <LockKeyhole aria-hidden="true" />
      Your setup is stored locally on this device during this prototype stage.
    </p>
  )
}
