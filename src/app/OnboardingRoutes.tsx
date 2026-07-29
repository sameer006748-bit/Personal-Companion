import { Navigate } from 'react-router'

import { OnboardingPage } from '../features/onboarding/OnboardingPage'
import { useAppStore } from '../store/appStore'
import { AppShell } from './AppShell'

export function ProtectedAppShell() {
  const onboardingCompleted = useAppStore(
    (state) => state.settings.onboarding.status === 'completed',
  )

  return onboardingCompleted ? <AppShell /> : <Navigate to="/onboarding" replace />
}

export function OnboardingRoute() {
  const onboardingCompleted = useAppStore(
    (state) => state.settings.onboarding.status === 'completed',
  )

  return onboardingCompleted ? <Navigate to="/" replace /> : <OnboardingPage />
}
