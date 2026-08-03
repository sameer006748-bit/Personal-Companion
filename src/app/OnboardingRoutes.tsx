import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import type { User } from '@supabase/supabase-js'

import { OnboardingPage } from '../features/onboarding/OnboardingPage'
import { useAppStore } from '../store/appStore'
import { AppShell } from './AppShell'
import { readCloudRestorePayload } from '../lib/cloudRepository'
import { applyStagedRestore, countRecords, validateRestorePayload, type BackupPayload } from '../lib/dataSafety'
import { getFriendlyCloudError, supabase } from '../lib/supabase'

const EMPTY_START_PREFIX = 'personal-companion-empty-device:'

function CloudRecoveryGate({ user }: { user: User }) {
  const navigate = useNavigate()
  const settings = useAppStore((state) => state.settings)
  const finance = useAppStore((state) => state.finance)
  const planning = useAppStore((state) => state.planning)
  const rehydrateFromStorage = useAppStore((state) => state.rehydrateFromStorage)
  const localIsEmpty = useMemo(() => {
    const counts = countRecords(finance, planning)
    return counts.accounts + counts.transactions + counts.receivables + counts.payables + counts.commitments === 0
  }, [finance, planning])
  const hasConfirmedEmptyStart = localStorage.getItem(`${EMPTY_START_PREFIX}${user.id}`) === 'confirmed'
  const [state, setState] = useState<'checking' | 'empty' | 'available' | 'error' | 'restoring'>('checking')
  const [payload, setPayload] = useState<BackupPayload | null>(null)
  const [counts, setCounts] = useState({ accounts: 0, transactions: 0, receivables: 0, payables: 0, commitments: 0 })
  const [error, setError] = useState('')
  const [confirmEmpty, setConfirmEmpty] = useState(false)

  useEffect(() => {
    if (!localIsEmpty || hasConfirmedEmptyStart) return
    let active = true
    void readCloudRestorePayload(user).then((cloud) => {
      if (!active) return
      const nextPayload: BackupPayload = { settings: cloud.settings ?? settings, finance: cloud.finance, planning: cloud.planning }
      const validation = validateRestorePayload(nextPayload)
      const hasCloudData = cloud.counts.accounts + cloud.counts.transactions + cloud.counts.receivables + cloud.counts.payables + cloud.counts.commitments > 0
      if (!validation.ok && hasCloudData) {
        setError(validation.errors[0] ?? 'Cloud data could not be validated.')
        setState('error')
        return
      }
      setPayload(nextPayload)
      setCounts(cloud.counts)
      setState(hasCloudData ? 'available' : 'empty')
    }).catch(() => {
      if (active) {
        setError(getFriendlyCloudError())
        setState('error')
      }
    })
    return () => { active = false }
  }, [hasConfirmedEmptyStart, localIsEmpty, settings, user])

  if (!localIsEmpty || hasConfirmedEmptyStart) return <OnboardingPage />

  if (state === 'checking' || state === 'restoring') {
    return <main className="onboarding-page"><div className="onboarding-shell glass-surface cloud-recovery"><p className="eyebrow">Cloud check</p><h1>{state === 'restoring' ? 'Restoring your device' : 'Checking your cloud data'}</h1><p>Please wait while we verify this signed-in account. Your local data will not be changed without your confirmation.</p></div></main>
  }

  if (state === 'available' && payload) {
    const countItems = Object.entries(counts)
    return <main className="onboarding-page"><div className="onboarding-shell glass-surface cloud-recovery"><p className="eyebrow">Signed-in account</p><h1>Your cloud data is available</h1><p>We found existing data for this account on the cloud. Choose what to do on this device.</p><div className="cloud-metrics">{countItems.map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label.charAt(0).toUpperCase() + label.slice(1)}</span></div>)}</div>{error ? <p className="finance-dialog-error" role="alert">{error}</p> : null}{confirmEmpty ? <div className="cloud-sync-confirm"><p>Starting empty will leave the existing cloud data unchanged, but this device will begin without it. Continue?</p><button type="button" className="finance-dialog-save" onClick={() => { localStorage.setItem(`${EMPTY_START_PREFIX}${user.id}`, 'confirmed'); setState('empty') }}>Start with an empty device</button><button type="button" onClick={() => setConfirmEmpty(false)}>Cancel</button></div> : <div className="cloud-sync-actions"><button type="button" className="finance-dialog-save" onClick={() => { setState('restoring'); const outcome = applyStagedRestore(payload, 'cloud'); if (!outcome.ok) { setError(outcome.error ?? 'The cloud restore could not be completed.'); setState('available'); return }; rehydrateFromStorage(); void navigate(payload.settings.onboarding.status === 'completed' ? '/' : '/onboarding', { replace: true }) }}>Restore this device</button><button type="button" className="auth-secondary" onClick={() => setConfirmEmpty(true)}>Start with an empty device</button></div>}</div></main>
  }

  if (state === 'error') return <main className="onboarding-page"><div className="onboarding-shell glass-surface cloud-recovery"><p className="eyebrow">Cloud check</p><h1>We could not verify your cloud data</h1><p>{error} You can continue with local onboarding; your cloud data remains unchanged.</p><button type="button" className="finance-dialog-save" onClick={() => setState('empty')}>Continue on this device</button></div></main>
  return <OnboardingPage />
}

export function ProtectedAppShell() {
  const onboardingCompleted = useAppStore(
    (state) => state.settings.onboarding.status === 'completed',
  )
  const [user, setUser] = useState<User | null>(null)
  const [sessionReady, setSessionReady] = useState(!supabase)
  const setActiveUserScope = useAppStore((state) => state.setActiveUserScope)

  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        const nextUser = data.session?.user ?? null
        setActiveUserScope(nextUser?.id)
        setUser(nextUser)
        setSessionReady(true)
      }
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null
      setActiveUserScope(nextUser?.id)
      setUser(nextUser)
      setSessionReady(true)
    })
    return () => { active = false; data.subscription.unsubscribe() }
  }, [setActiveUserScope])

  if (!sessionReady) return <main className="onboarding-page"><div className="onboarding-shell glass-surface"><p className="eyebrow">Cloud check</p><h1>Restoring your session</h1><p>Please wait while we check whether this account already has cloud data.</p></div></main>
  if (!onboardingCompleted && user) return <CloudRecoveryGate user={user} />
  return onboardingCompleted ? <AppShell /> : <Navigate to="/onboarding" replace />
}

export function OnboardingRoute() {
  const onboardingCompleted = useAppStore(
    (state) => state.settings.onboarding.status === 'completed',
  )

  return onboardingCompleted ? <Navigate to="/" replace /> : <OnboardingPage />
}
