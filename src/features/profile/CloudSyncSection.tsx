import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import type { User } from '@supabase/supabase-js'
import { Cloud, LogOut, RefreshCw, ShieldCheck } from 'lucide-react'

import { getCloudImportPreview, importLocalState } from '../../lib/cloudRepository'
import { checkCloudConnection, getCloudConfiguration, getFriendlyCloudError, supabase } from '../../lib/supabase'
import { useAppStore } from '../../store/appStore'
import { DataSafetySection } from './DataSafetySection'

export function CloudSyncSection() {
  const navigate = useNavigate()
  const settings = useAppStore((state) => state.settings)
  const finance = useAppStore((state) => state.finance)
  const planning = useAppStore((state) => state.planning)
  const configuration = getCloudConfiguration()
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState(configuration.message)
  const [error, setError] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(() => window.localStorage.getItem('personal-companion-last-cloud-sync'))

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => data.subscription.unsubscribe()
  }, [])

  const preview = useMemo(() => user ? getCloudImportPreview(user, finance, planning) : undefined, [finance, planning, user])
  const hasSynced = lastSync !== null
  const maskEmail = (value: string) => {
    const [local, domain] = value.split('@')
    return local && domain ? `${local.slice(0, 2)}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}` : value
  }

  async function retry() {
    setError('')
    const result = await checkCloudConnection()
    setStatus(result.message)
    if (result.state === 'error') setError(result.message)
  }

  async function importNow() {
    if (!user) return
    setIsImporting(true)
    setError('')
    try {
      await importLocalState(user, settings, finance, planning)
      const value = new Date().toISOString()
      window.localStorage.setItem('personal-companion-last-cloud-sync', value)
      setLastSync(value)
      setStatus('Cloud data verified')
      setConfirming(false)
    } catch {
      setError(getFriendlyCloudError())
    } finally {
      setIsImporting(false)
    }
  }

  async function signOut() {
    if (!supabase) return
    setError('')
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError(getFriendlyCloudError())
  }

  return <section className="profile-settings-section glass-surface cloud-sync" aria-labelledby="cloud-sync-title">
    <div className="cloud-sync-header"><div><p className="eyebrow">Connection</p><h2 id="cloud-sync-title">Cloud &amp; Sync</h2></div><span className={`cloud-status ${error ? 'is-error' : user ? 'is-connected' : 'is-idle'}`}>{error ? 'Needs attention' : user ? 'Connected' : supabase ? 'Signed out' : 'Local only'}</span></div>
    {!supabase ? <p className="cloud-sync-note">{configuration.message}. Local functionality is unchanged.</p> : null}
    {supabase && !user ? <><p className="cloud-sync-note">{status}. Local data remains available on this device.</p><div className="cloud-sync-actions"><button type="button" className="finance-dialog-save" onClick={() => void navigate('/auth')}>Connect / Sign in</button><button type="button" className="auth-secondary" onClick={() => void retry()}><RefreshCw aria-hidden="true" /> Retry connection</button></div></> : null}
    {user && preview ? <><div className="cloud-account"><span><Cloud aria-hidden="true" /></span><div><strong>Connected</strong><small>{maskEmail(preview.email)}</small></div><p>{lastSync ? `Last synced ${new Date(lastSync).toLocaleString()}` : 'Sync not started'}</p></div><div className="cloud-metrics">{([{ label: 'Accounts', value: preview.accounts }, { label: 'Transactions', value: preview.transactions }, { label: 'Receivables', value: preview.receivables }, { label: 'Payables', value: preview.payables }, { label: 'Commitments', value: preview.commitments }]).map((metric) => <div key={metric.label}><strong>{metric.value}</strong><span>{metric.value === 1 ? metric.label.slice(0, -1) : metric.label}</span></div>)}</div>{confirming ? <div className="cloud-sync-confirm"><p>Import these local records to {maskEmail(preview.email)}? Local data will remain on this device.</p><button type="button" className="finance-dialog-save" disabled={isImporting} onClick={() => void importNow()}>{isImporting ? 'Importing' : 'Confirm import'}</button><button type="button" disabled={isImporting} onClick={() => setConfirming(false)}>Cancel</button></div> : <div className="cloud-sync-actions">{!hasSynced ? <button type="button" className="finance-dialog-save" onClick={() => setConfirming(true)}>Import local data</button> : <span className="cloud-import-complete"><ShieldCheck aria-hidden="true" /> Import complete</span>}<button type="button" className="auth-secondary" onClick={() => setConfirming(true)}><RefreshCw aria-hidden="true" /> Sync now</button><button type="button" className="cloud-sign-out" onClick={() => void signOut()}><LogOut aria-hidden="true" /> Sign out</button></div>}</> : null}
    {error ? <p className="finance-dialog-error" role="alert">{error}</p> : null}
    <DataSafetySection user={user} />
  </section>
}
