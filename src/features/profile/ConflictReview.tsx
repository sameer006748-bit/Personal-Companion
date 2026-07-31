import { AlertTriangle, ArrowRight, Cloud, RefreshCw } from 'lucide-react'

import { SYNC_STATUS_LABELS, isAmountField, type SyncConflict, type SyncStatus } from '../../lib/syncEngine'
import { formatCurrency } from '../../lib/formatCurrency'
import { useAppStore } from '../../store/appStore'

const FIELD_LABELS: Readonly<Record<string, string>> = {
  name: 'Name',
  type: 'Type',
  institutionName: 'Institution',
  lastFourDigits: 'Last four digits',
  openingBalance: 'Opening balance',
  isDefault: 'Default account',
  isArchived: 'Archived',
  amount: 'Amount',
  date: 'Date',
  title: 'Title',
  categoryId: 'Category',
  accountId: 'Account',
  destinationAccountId: 'Destination account',
  personOrBusiness: 'Person or business',
  note: 'Note',
  status: 'Status',
  counterparty: 'Counterparty',
  originalAmount: 'Total amount',
  receivedAmount: 'Received',
  paidAmount: 'Paid',
  dueDate: 'Due date',
  label: 'Name',
  category: 'Category',
  frequency: 'Frequency',
  isSettled: 'Settled',
  lastPaidDate: 'Last paid',
}

const TYPE_LABELS: Readonly<Record<SyncConflict['recordType'], string>> = {
  account: 'Account',
  transaction: 'Transaction',
  receivable: 'Receivable',
  payable: 'Payable',
  commitment: 'Commitment',
}

const KIND_NOTES: Readonly<Record<SyncConflict['kind'], string>> = {
  'edit-edit': 'This record changed on this device and in the cloud.',
  'local-delete-cloud-edit': 'You deleted this here, but it was edited in the cloud.',
  'cloud-delete-local-edit': 'This was deleted in the cloud, but edited here.',
}

function moment(value: string | undefined): string {
  return value ? new Date(value).toLocaleString() : 'Unknown'
}

export function SyncStatusRow({
  status,
  pendingCount,
  lastSyncedAt,
  isSyncing,
  onSyncNow,
}: {
  status: SyncStatus
  pendingCount: number
  lastSyncedAt: string | undefined
  isSyncing: boolean
  onSyncNow: () => void
}) {
  const tone =
    status === 'up-to-date' ? 'is-connected'
      : status === 'failed' || status === 'conflicts' ? 'is-error'
        : 'is-idle'

  return <div className="sync-status-row">
    <span className={`cloud-status ${tone}`}>
      {SYNC_STATUS_LABELS[status]}
      {status === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
    </span>
    <p>{lastSyncedAt ? `Last synced ${moment(lastSyncedAt)}` : 'Not synced yet'}</p>
    <button
      type="button"
      className="auth-secondary"
      disabled={isSyncing || status === 'auth-required' || status === 'local-only'}
      onClick={onSyncNow}
    >
      <RefreshCw aria-hidden="true" /> {isSyncing ? 'Syncing' : 'Sync now'}
    </button>
  </div>
}

function ConflictValue({ field, value }: { field: string; value: unknown }) {
  const privacyMode = useAppStore((state) => state.privacyMode)

  if (value === null || value === undefined || value === '') return <em>Not set</em>
  if (typeof value === 'boolean') return <>{value ? 'Yes' : 'No'}</>
  if (typeof value === 'number' && isAmountField(field)) {
    // Financial values follow the same masking rule as the rest of the app.
    return <>{privacyMode ? '•••••' : formatCurrency(value)}</>
  }
  return <>{typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value)}</>
}

export function ConflictReview({
  conflicts,
  onResolve,
}: {
  conflicts: readonly SyncConflict[]
  onResolve: (conflictId: string, choice: 'local' | 'cloud') => void
}) {
  if (conflicts.length === 0) return null

  return <div className="conflict-review" aria-labelledby="conflict-review-title">
    <div className="conflict-review-header">
      <AlertTriangle aria-hidden="true" />
      <div>
        <h3 id="conflict-review-title">Conflicts need review</h3>
        <p>Both versions are kept until you choose. Nothing is discarded automatically.</p>
      </div>
    </div>

    <ul className="conflict-list">
      {conflicts.map((conflict) => <li key={conflict.conflictId} className="conflict-item">
        <div className="conflict-item-head">
          <span className="conflict-type">{TYPE_LABELS[conflict.recordType]}</span>
          <strong>{conflict.title}</strong>
        </div>
        <p className="conflict-kind">{KIND_NOTES[conflict.kind]}</p>

        <dl className="conflict-times">
          <div><dt>This device</dt><dd>{moment(conflict.localUpdatedAt)}</dd></div>
          <div><dt>Cloud</dt><dd>{moment(conflict.cloudUpdatedAt)}</dd></div>
        </dl>

        {conflict.fields.length ? <table className="conflict-fields">
          <thead><tr><th scope="col">Field</th><th scope="col">This device</th><th scope="col">Cloud</th></tr></thead>
          <tbody>
            {conflict.fields.map((field) => <tr key={field.field}>
              <th scope="row">{FIELD_LABELS[field.field] ?? field.field}</th>
              <td><ConflictValue field={field.field} value={field.local} /></td>
              <td><ConflictValue field={field.field} value={field.cloud} /></td>
            </tr>)}
          </tbody>
        </table> : null}

        <div className="conflict-actions">
          <button type="button" className="finance-dialog-save" onClick={() => onResolve(conflict.conflictId, 'local')}>
            Keep local
          </button>
          <button type="button" className="auth-secondary" onClick={() => onResolve(conflict.conflictId, 'cloud')}>
            <Cloud aria-hidden="true" /> Use cloud
          </button>
          <span className="conflict-later"><ArrowRight aria-hidden="true" /> Decide later</span>
        </div>
      </li>)}
    </ul>
  </div>
}
