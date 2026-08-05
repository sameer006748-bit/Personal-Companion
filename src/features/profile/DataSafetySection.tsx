import { useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { AlertTriangle, CloudDownload, Download, ShieldCheck, Upload } from 'lucide-react'

import { readCloudRestorePayload } from '../../lib/cloudRepository'
import {
  BACKUP_SENSITIVITY_NOTICE,
  applyStagedRestore,
  buildBackupFileName,
  countRecords,
  createBackupEnvelope,
  parseBackupFile,
  readRecoveryHistory,
  recordBackupExported,
  validateRestorePayload,
  type BackupCounts,
  type BackupPayload,
  type RestoreSource,
} from '../../lib/dataSafety'
import { getFriendlyCloudError, supabase } from '../../lib/supabase'
import { useAppStore } from '../../store/appStore'

const EMPTY_CLOUD_PHRASE = 'REPLACE'

interface PendingRestore {
  source: RestoreSource
  payload: BackupPayload
  counts: BackupCounts
  warnings: readonly string[]
  capturedAt?: string | undefined
  isEmptyCloud: boolean
}

const countLabels: readonly (readonly [keyof BackupCounts, string])[] = [
  ['accounts', 'Accounts'],
  ['transactions', 'Transactions'],
  ['receivables', 'Receivables'],
  ['payables', 'Payables'],
  ['commitments', 'Commitments'],
]

export function DataSafetySection({ user }: { user: User | null }) {
  const settings = useAppStore((state) => state.settings)
  const finance = useAppStore((state) => state.finance)
  const planning = useAppStore((state) => state.planning)
  const rehydrateFromStorage = useAppStore((state) => state.rehydrateFromStorage)

  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<PendingRestore | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [typedConfirmation, setTypedConfirmation] = useState('')
  const [history, setHistory] = useState(() => readRecoveryHistory())

  const localCounts = useMemo(() => countRecords(finance, planning), [finance, planning])

  function reset() {
    setPending(null)
    setTypedConfirmation('')
    if (fileInput.current) fileInput.current.value = ''
  }

  function exportBackup() {
    setError('')
    setNotice('')
    const envelope = createBackupEnvelope(settings, finance, planning)
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = buildBackupFileName(envelope.exportedAt)
    link.click()
    URL.revokeObjectURL(url)
    recordBackupExported()
    setHistory(readRecoveryHistory())
    setNotice(`Backup created. ${BACKUP_SENSITIVITY_NOTICE}`)
  }

  async function chooseFile(file: File) {
    setError('')
    setNotice('')
    const validation = parseBackupFile(await file.text())
    if (!validation.ok || !validation.envelope) {
      setError(validation.errors[0] ?? 'This backup could not be validated.')
      reset()
      return
    }
    setPending({
      source: 'file',
      payload: validation.envelope.data,
      counts: validation.envelope.counts,
      warnings: validation.warnings,
      capturedAt: validation.envelope.exportedAt,
      isEmptyCloud: false,
    })
  }

  async function loadCloud() {
    if (!user) return
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const cloud = await readCloudRestorePayload(user)
      const payload: BackupPayload = {
        settings: cloud.settings ?? settings,
        finance: cloud.finance,
        planning: cloud.planning,
      }
      const isEmptyCloud = cloud.counts.accounts === 0 && cloud.counts.transactions === 0
      const validation = validateRestorePayload(payload)
      if (!validation.ok && !isEmptyCloud) {
        setError(validation.errors[0] ?? 'Cloud data could not be validated.')
        return
      }
      setPending({
        source: 'cloud',
        payload,
        counts: cloud.counts,
        warnings: validation.warnings,
        capturedAt: cloud.updatedAt,
        isEmptyCloud,
      })
    } catch {
      setError(getFriendlyCloudError())
    } finally {
      setBusy(false)
    }
  }

  function confirmRestore() {
    if (!pending) return
    setBusy(true)
    setError('')
    const outcome = applyStagedRestore(pending.payload, pending.source)
    setBusy(false)
    setHistory(readRecoveryHistory())
    if (!outcome.ok) {
      setError(
        outcome.rolledBack
          ? `${outcome.error ?? 'The restore could not be completed.'} Your previous data was kept.`
          : (outcome.error ?? 'The restore could not be completed.'),
      )
      reset()
      return
    }
    rehydrateFromStorage()
    setNotice(
      pending.source === 'cloud'
        ? 'Cloud data restored and verified. Your cloud records are unchanged.'
        : 'Backup restored and verified.',
    )
    reset()
  }

  const requiresTypedConfirmation = pending?.isEmptyCloud === true
  const canConfirm =
    pending !== null &&
    !busy &&
    (!requiresTypedConfirmation || typedConfirmation.trim().toUpperCase() === EMPTY_CLOUD_PHRASE)

  return <section className="profile-settings-section glass-surface data-safety" aria-labelledby="data-safety-title">
    <div className="cloud-sync-header">
      <div><p className="eyebrow">Protection</p><h2 id="data-safety-title">Data Safety</h2></div>
      <span className="cloud-status is-idle">{localCounts.accounts + localCounts.transactions} local records</span>
    </div>

    <p className="cloud-sync-note">{BACKUP_SENSITIVITY_NOTICE} Backups are plain JSON and are not encrypted.</p>

    <div className="cloud-metrics">
      {countLabels.map(([key, label]) => <div key={key}>
        <strong>{localCounts[key]}</strong>
        <span>{localCounts[key] === 1 ? label.slice(0, -1) : label}</span>
      </div>)}
    </div>

    {pending ? <div className="cloud-sync-confirm data-safety-preview">
      <h3>Review before restoring</h3>
      <p>
        {pending.source === 'cloud' ? 'Cloud data' : 'Backup file'}
        {pending.capturedAt ? ` from ${new Date(pending.capturedAt).toLocaleString()}` : ''}
      </p>
      <table className="data-safety-table">
        <thead><tr><th scope="col">Record</th><th scope="col">Now</th><th scope="col">Incoming</th></tr></thead>
        <tbody>
          {countLabels.map(([key, label]) => <tr key={key}>
            <th scope="row">{label}</th>
            <td>{localCounts[key]}</td>
            <td>{pending.counts[key]}</td>
          </tr>)}
        </tbody>
      </table>

      {pending.warnings.length ? <ul className="data-safety-warnings">
        {pending.warnings.map((warning) => <li key={warning}><AlertTriangle aria-hidden="true" /> {warning}</li>)}
      </ul> : null}

      {requiresTypedConfirmation ? <div className="data-safety-danger" role="alert">
        <p>
          <AlertTriangle aria-hidden="true" /> This cloud account has no financial records. Restoring it
          will replace your {localCounts.transactions} local transactions and {localCounts.accounts} accounts.
          Export a backup first.
        </p>
        <label htmlFor="empty-cloud-confirm">Type {EMPTY_CLOUD_PHRASE} to continue</label>
        <input
          id="empty-cloud-confirm"
          type="text"
          value={typedConfirmation}
          autoComplete="off"
          onChange={(event) => setTypedConfirmation(event.target.value)}
        />
      </div> : <p className="data-safety-replace-note">
        This replaces the data on this device. Your previous data is kept until the restore is verified.
      </p>}

      <div className="cloud-sync-actions">
        <button type="button" className="finance-dialog-save is-destructive" disabled={!canConfirm} onClick={confirmRestore}>
          {busy ? 'Restoring' : 'Replace local data'}
        </button>
        <button type="button" disabled={busy} onClick={reset}>Cancel</button>
      </div>
    </div> : <div className="cloud-sync-actions">
      <button type="button" className="finance-dialog-save" onClick={exportBackup}>
        <Download aria-hidden="true" /> Export backup
      </button>
      <button type="button" className="auth-secondary" onClick={() => fileInput.current?.click()}>
        <Upload aria-hidden="true" /> Restore from backup
      </button>
      {user ? <button type="button" className="auth-secondary" disabled={busy} onClick={() => void loadCloud()}>
        <CloudDownload aria-hidden="true" /> {busy ? 'Loading cloud' : 'Restore from cloud'}
      </button> : null}
    </div>}

    <input
      ref={fileInput}
      type="file"
      accept="application/json,.json"
      className="visually-hidden-input"
      aria-label="Choose a backup file"
      onChange={(event) => {
        const file = event.target.files?.[0]
        if (file) void chooseFile(file)
      }}
    />

    {!user && supabase ? <p className="cloud-sync-note">Sign in to restore from cloud.</p> : null}

    {history.lastBackupAt || history.lastRestoreAt || history.lastFailure ? <dl className="data-safety-history">
      {history.lastBackupAt ? <div><dt>Last backup</dt><dd>{new Date(history.lastBackupAt).toLocaleString()}</dd></div> : null}
      {history.lastRestoreAt ? <div>
        <dt>Last restore</dt>
        <dd>{new Date(history.lastRestoreAt).toLocaleString()}{history.lastRestoreSource ? ` (${history.lastRestoreSource})` : ''}</dd>
      </div> : null}
      {history.lastFailure ? <div>
        <dt>Last issue</dt>
        <dd>{history.lastFailure.message}</dd>
      </div> : null}
    </dl> : null}

    {notice ? <p className="data-safety-notice" role="status"><ShieldCheck aria-hidden="true" /> {notice}</p> : null}
    {error ? <p className="finance-dialog-error" role="alert">{error}</p> : null}
  </section>
}
