// Local-first sync engine. Local writes always win locally and are queued for
// the cloud; nothing is ever overwritten or deleted without either an explicit
// tombstone or an explicit user decision.
//
// Revision model: the cloud `updated_at` of each record at the last successful
// sync is the common base. A record changed locally when its local updatedAt
// differs from that base, and changed in cloud when its cloud updated_at does.
// Both changed with differing material fields is a conflict, never a silent pick.

import type { FinanceState } from './financeCore'
import type { PlanningState } from '../models/planning'

const DEVICE_KEY = 'personal-companion-device-id'
const SYNC_KEY = 'personal-companion-sync-state'
const CONFLICT_KEY = 'personal-companion-sync-conflicts'

export const MAX_RETRIES = 5

export type SyncRecordType =
  | 'account'
  | 'transaction'
  | 'receivable'
  | 'payable'
  | 'commitment'

export type SyncOperationKind = 'upsert' | 'delete'

export interface SyncOperation {
  operationId: string
  kind: SyncOperationKind
  recordType: SyncRecordType
  recordId: string
  mutatedAt: string
  retryCount: number
}

export interface Tombstone {
  recordType: SyncRecordType
  recordId: string
  deletedAt: string
}

export interface SyncState {
  version: 1
  queue: readonly SyncOperation[]
  tombstones: readonly Tombstone[]
  // recordKey -> cloud updated_at observed at the last successful sync
  base: Readonly<Record<string, string>>
  lastSyncedAt?: string | undefined
  lastError?: string | undefined
  settingsPushedAt?: string | undefined
}

export function recordKey(recordType: SyncRecordType, recordId: string): string {
  return `${recordType}:${recordId}`
}

function storage(): Storage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage
}

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// --- Device identity ---------------------------------------------------------

// A random opaque identifier used only to label sync origin. It contains no
// hardware, network, or account information and is not an authentication factor.
export function getDeviceId(): string {
  const store = storage()
  if (!store) return 'unknown-device'
  const existing = store.getItem(DEVICE_KEY)
  if (existing?.trim()) return existing
  const created = makeId('device')
  try {
    store.setItem(DEVICE_KEY, created)
  } catch {
    // A non-persistent id still works for the current session.
  }
  return created
}

// --- Sync state persistence --------------------------------------------------

export function emptySyncState(): SyncState {
  return { version: 1, queue: [], tombstones: [], base: {} }
}

function isSyncState(value: unknown): value is SyncState {
  if (typeof value !== 'object' || value === null) return false
  const state = value as Record<string, unknown>
  return (
    state.version === 1 &&
    Array.isArray(state.queue) &&
    Array.isArray(state.tombstones) &&
    typeof state.base === 'object' &&
    state.base !== null
  )
}

export function loadSyncState(): SyncState {
  const store = storage()
  if (!store) return emptySyncState()
  try {
    const raw = store.getItem(SYNC_KEY)
    if (!raw) return emptySyncState()
    const parsed: unknown = JSON.parse(raw)
    return isSyncState(parsed) ? parsed : emptySyncState()
  } catch {
    return emptySyncState()
  }
}

export function saveSyncState(state: SyncState): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(SYNC_KEY, JSON.stringify(state))
  } catch {
    // Sync metadata is rebuildable; local financial data is never at risk here.
  }
}

export function clearSyncState(): void {
  const store = storage()
  if (!store) return
  store.removeItem(SYNC_KEY)
  store.removeItem(CONFLICT_KEY)
}

// --- Material field projections ----------------------------------------------

// Only fields that carry financial meaning. Metadata drift such as updatedAt
// must never be reported to the user as a conflict.
export function materialPayload(recordType: SyncRecordType, record: Record<string, unknown>): string {
  const pick = (keys: readonly string[]): string =>
    JSON.stringify(keys.map((key) => record[key] ?? null))

  if (recordType === 'account') {
    return pick(['name', 'type', 'institutionName', 'lastFourDigits', 'openingBalance', 'isDefault', 'isArchived'])
  }
  if (recordType === 'transaction') {
    return pick(['type', 'amount', 'date', 'title', 'categoryId', 'accountId', 'destinationAccountId', 'personOrBusiness', 'note', 'status'])
  }
  if (recordType === 'receivable') {
    return pick(['counterparty', 'originalAmount', 'receivedAmount', 'dueDate', 'note', 'accountId'])
  }
  if (recordType === 'payable') {
    return pick(['counterparty', 'originalAmount', 'paidAmount', 'dueDate', 'note', 'accountId'])
  }
  return pick(['label', 'category', 'amount', 'frequency', 'dueDate', 'note', 'accountId', 'isSettled', 'isArchived', 'lastPaidDate'])
}

export interface SyncRecord {
  id: string
  updatedAt: string
  [key: string]: unknown
}

export function collectRecords(
  finance: FinanceState,
  planning: PlanningState,
): Readonly<Record<SyncRecordType, readonly SyncRecord[]>> {
  return {
    account: finance.accounts as unknown as readonly SyncRecord[],
    transaction: finance.transactions as unknown as readonly SyncRecord[],
    receivable: planning.receivables as unknown as readonly SyncRecord[],
    payable: planning.payables as unknown as readonly SyncRecord[],
    commitment: planning.commitments as unknown as readonly SyncRecord[],
  }
}

export const SYNC_RECORD_TYPES: readonly SyncRecordType[] = [
  'account',
  'transaction',
  'receivable',
  'payable',
  'commitment',
]

// --- Queue -------------------------------------------------------------------

// Enqueues by (kind, type, id) so replaying a mutation many times still results
// in one cloud write and one local record.
function withOperation(
  queue: readonly SyncOperation[],
  kind: SyncOperationKind,
  recordType: SyncRecordType,
  recordId: string,
  mutatedAt: string,
): readonly SyncOperation[] {
  const others = queue.filter(
    (operation) => !(operation.recordType === recordType && operation.recordId === recordId),
  )
  return [
    ...others,
    { operationId: makeId('op'), kind, recordType, recordId, mutatedAt, retryCount: 0 },
  ]
}

export interface LocalSnapshot {
  finance: FinanceState
  planning: PlanningState
}

// Derives queue operations by diffing published state, so every existing action
// path is covered without touching individual domain operations.
export function enqueueLocalChanges(
  state: SyncState,
  previous: LocalSnapshot,
  next: LocalSnapshot,
): SyncState {
  const before = collectRecords(previous.finance, previous.planning)
  const after = collectRecords(next.finance, next.planning)
  let queue = state.queue
  let tombstones = state.tombstones
  const now = new Date().toISOString()

  for (const recordType of SYNC_RECORD_TYPES) {
    const beforeById = new Map(before[recordType].map((record) => [record.id, record]))
    const afterById = new Map(after[recordType].map((record) => [record.id, record]))

    for (const [id, record] of afterById) {
      const existing = beforeById.get(id)
      if (existing && materialPayload(recordType, existing) === materialPayload(recordType, record)) {
        continue
      }
      queue = withOperation(queue, 'upsert', recordType, id, record.updatedAt || now)
      // A recreated id is no longer deleted.
      tombstones = tombstones.filter(
        (tombstone) => !(tombstone.recordType === recordType && tombstone.recordId === id),
      )
    }

    for (const id of beforeById.keys()) {
      if (afterById.has(id)) continue
      queue = withOperation(queue, 'delete', recordType, id, now)
      tombstones = [
        ...tombstones.filter(
          (tombstone) => !(tombstone.recordType === recordType && tombstone.recordId === id),
        ),
        { recordType, recordId: id, deletedAt: now },
      ]
    }
  }

  if (queue === state.queue && tombstones === state.tombstones) return state
  return { ...state, queue, tombstones }
}

export function markSettingsDirty(state: SyncState): SyncState {
  return { ...state, settingsPushedAt: undefined }
}

// --- Conflicts ---------------------------------------------------------------

export interface ConflictField {
  field: string
  local: unknown
  cloud: unknown
}

export type ConflictKind = 'edit-edit' | 'local-delete-cloud-edit' | 'cloud-delete-local-edit'

export interface SyncConflict {
  conflictId: string
  recordType: SyncRecordType
  recordId: string
  kind: ConflictKind
  title: string
  localUpdatedAt?: string | undefined
  cloudUpdatedAt?: string | undefined
  fields: readonly ConflictField[]
  localRecord?: SyncRecord | undefined
  cloudRecord?: SyncRecord | undefined
  detectedAt: string
}

function isConflictArray(value: unknown): value is SyncConflict[] {
  return Array.isArray(value)
}

export function loadConflicts(): readonly SyncConflict[] {
  const store = storage()
  if (!store) return []
  try {
    const raw = store.getItem(CONFLICT_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return isConflictArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveConflicts(conflicts: readonly SyncConflict[]): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(CONFLICT_KEY, JSON.stringify(conflicts))
  } catch {
    // Conflicts are re-detected on the next sync run.
  }
}

const FIELD_LABELS: Readonly<Record<SyncRecordType, readonly string[]>> = {
  account: ['name', 'type', 'institutionName', 'lastFourDigits', 'openingBalance', 'isDefault', 'isArchived'],
  transaction: ['type', 'amount', 'date', 'title', 'categoryId', 'accountId', 'destinationAccountId', 'personOrBusiness', 'note', 'status'],
  receivable: ['counterparty', 'originalAmount', 'receivedAmount', 'dueDate', 'note', 'accountId'],
  payable: ['counterparty', 'originalAmount', 'paidAmount', 'dueDate', 'note', 'accountId'],
  commitment: ['label', 'category', 'amount', 'frequency', 'dueDate', 'note', 'accountId', 'isSettled', 'isArchived', 'lastPaidDate'],
}

const AMOUNT_FIELDS = new Set([
  'openingBalance',
  'amount',
  'originalAmount',
  'receivedAmount',
  'paidAmount',
])

export function isAmountField(field: string): boolean {
  return AMOUNT_FIELDS.has(field)
}

function changedFields(
  recordType: SyncRecordType,
  local: SyncRecord,
  cloud: SyncRecord,
): readonly ConflictField[] {
  return FIELD_LABELS[recordType]
    .filter((field) => JSON.stringify(local[field] ?? null) !== JSON.stringify(cloud[field] ?? null))
    .map((field) => ({ field, local: local[field] ?? null, cloud: cloud[field] ?? null }))
}

export function describeRecord(recordType: SyncRecordType, record: SyncRecord): string {
  const text = (value: unknown): string => (typeof value === 'string' && value.trim() ? value : '')
  if (recordType === 'account') return text(record.name) || 'Account'
  if (recordType === 'transaction') return text(record.title) || 'Transaction'
  if (recordType === 'commitment') return text(record.label) || 'Commitment'
  return text(record.counterparty) || (recordType === 'receivable' ? 'Receivable' : 'Payable')
}

// --- Sync planning -----------------------------------------------------------

export interface SyncPlan {
  pushes: readonly { recordType: SyncRecordType; recordId: string }[]
  deletes: readonly { recordType: SyncRecordType; recordId: string }[]
  pulls: readonly { recordType: SyncRecordType; record: SyncRecord }[]
  pullDeletes: readonly { recordType: SyncRecordType; recordId: string }[]
  conflicts: readonly SyncConflict[]
  nextBase: Record<string, string>
}

export interface CloudRecordSet {
  records: Readonly<Record<SyncRecordType, readonly SyncRecord[]>>
  // Tombstoned cloud rows, which are the only cause of a local delete on pull.
  deletedKeys: readonly string[]
}

// Pure decision function. It never mutates state, so it is fully testable and
// the caller controls every write.
export function planSync(
  syncState: SyncState,
  local: LocalSnapshot,
  cloud: CloudRecordSet,
): SyncPlan {
  const localRecords = collectRecords(local.finance, local.planning)
  const pushes: { recordType: SyncRecordType; recordId: string }[] = []
  const deletes: { recordType: SyncRecordType; recordId: string }[] = []
  const pulls: { recordType: SyncRecordType; record: SyncRecord }[] = []
  const pullDeletes: { recordType: SyncRecordType; recordId: string }[] = []
  const conflicts: SyncConflict[] = []
  const nextBase: Record<string, string> = { ...syncState.base }
  const detectedAt = new Date().toISOString()
  const deletedKeys = new Set(cloud.deletedKeys)

  const tombstoneByKey = new Map(
    syncState.tombstones.map((tombstone) => [recordKey(tombstone.recordType, tombstone.recordId), tombstone]),
  )

  for (const recordType of SYNC_RECORD_TYPES) {
    const localById = new Map(localRecords[recordType].map((record) => [record.id, record]))
    const cloudById = new Map(cloud.records[recordType].map((record) => [record.id, record]))
    const ids = new Set([...localById.keys(), ...cloudById.keys()])

    for (const id of ids) {
      const key = recordKey(recordType, id)
      const base = syncState.base[key]
      const localRecord = localById.get(id)
      const cloudRecord = cloudById.get(id)
      const isCloudDeleted = deletedKeys.has(key)
      const localTombstone = tombstoneByKey.get(key)

      // Local deletion, recorded as an explicit tombstone.
      if (!localRecord && localTombstone) {
        if (isCloudDeleted || !cloudRecord) {
          delete nextBase[key]
          continue
        }
        const cloudChanged = base !== undefined && cloudRecord.updatedAt !== base
        if (cloudChanged) {
          conflicts.push({
            conflictId: `${key}`,
            recordType,
            recordId: id,
            kind: 'local-delete-cloud-edit',
            title: describeRecord(recordType, cloudRecord),
            cloudUpdatedAt: cloudRecord.updatedAt,
            fields: [],
            cloudRecord,
            detectedAt,
          })
          continue
        }
        deletes.push({ recordType, recordId: id })
        continue
      }

      // Cloud tombstone. Only an explicit tombstone can remove local data.
      if (isCloudDeleted && localRecord) {
        const localChanged = base !== undefined && localRecord.updatedAt !== base
        if (localChanged || base === undefined) {
          conflicts.push({
            conflictId: `${key}`,
            recordType,
            recordId: id,
            kind: 'cloud-delete-local-edit',
            title: describeRecord(recordType, localRecord),
            localUpdatedAt: localRecord.updatedAt,
            fields: [],
            localRecord,
            detectedAt,
          })
          continue
        }
        pullDeletes.push({ recordType, recordId: id })
        delete nextBase[key]
        continue
      }

      if (localRecord && !cloudRecord) {
        // A record absent from cloud without a tombstone is new local data, or
        // data this device has never uploaded. Never treated as a deletion.
        pushes.push({ recordType, recordId: id })
        continue
      }

      if (!localRecord && cloudRecord) {
        if (isCloudDeleted) {
          delete nextBase[key]
          continue
        }
        // Cloud-only record with no local tombstone is a genuine cloud addition.
        pulls.push({ recordType, record: cloudRecord })
        nextBase[key] = cloudRecord.updatedAt
        continue
      }

      if (!localRecord || !cloudRecord) continue

      const localMaterial = materialPayload(recordType, localRecord)
      const cloudMaterial = materialPayload(recordType, cloudRecord)

      if (localMaterial === cloudMaterial) {
        // Identical payloads are never a conflict even if metadata differs.
        nextBase[key] = cloudRecord.updatedAt
        continue
      }

      const localChanged = base === undefined || localRecord.updatedAt !== base
      const cloudChanged = base === undefined || cloudRecord.updatedAt !== base

      if (localChanged && !cloudChanged) {
        pushes.push({ recordType, recordId: id })
        continue
      }
      if (cloudChanged && !localChanged) {
        pulls.push({ recordType, record: cloudRecord })
        nextBase[key] = cloudRecord.updatedAt
        continue
      }

      conflicts.push({
        conflictId: `${key}`,
        recordType,
        recordId: id,
        kind: 'edit-edit',
        title: describeRecord(recordType, localRecord),
        localUpdatedAt: localRecord.updatedAt,
        cloudUpdatedAt: cloudRecord.updatedAt,
        fields: changedFields(recordType, localRecord, cloudRecord),
        localRecord,
        cloudRecord,
        detectedAt,
      })
    }
  }

  return { pushes, deletes, pulls, pullDeletes, conflicts, nextBase }
}

// --- Retry -------------------------------------------------------------------

// Exponential backoff with jitter so repeated failures do not synchronise
// across devices or hammer the backend.
export function retryDelayMs(retryCount: number): number {
  const base = Math.min(30000, 1000 * 2 ** retryCount)
  return base + Math.floor(Math.random() * 400)
}

export function bumpRetries(
  state: SyncState,
  failed: readonly { recordType: SyncRecordType; recordId: string }[],
  message: string,
): SyncState {
  const failedKeys = new Set(failed.map((item) => recordKey(item.recordType, item.recordId)))
  const queue = state.queue
    .map((operation) =>
      failedKeys.has(recordKey(operation.recordType, operation.recordId))
        ? { ...operation, retryCount: operation.retryCount + 1 }
        : operation,
    )
    .filter((operation) => operation.retryCount <= MAX_RETRIES)
  return { ...state, queue, lastError: message }
}

export function clearCompleted(
  state: SyncState,
  completed: readonly { recordType: SyncRecordType; recordId: string }[],
): SyncState {
  const doneKeys = new Set(completed.map((item) => recordKey(item.recordType, item.recordId)))
  return {
    ...state,
    queue: state.queue.filter(
      (operation) => !doneKeys.has(recordKey(operation.recordType, operation.recordId)),
    ),
  }
}

// --- Status ------------------------------------------------------------------

export type SyncStatus =
  | 'local-only'
  | 'auth-required'
  | 'offline'
  | 'syncing'
  | 'pending'
  | 'conflicts'
  | 'failed'
  | 'up-to-date'

export const SYNC_STATUS_LABELS: Readonly<Record<SyncStatus, string>> = {
  'local-only': 'Local only',
  'auth-required': 'Authentication required',
  offline: 'Offline',
  syncing: 'Syncing',
  pending: 'Local changes pending',
  conflicts: 'Conflicts need review',
  failed: 'Sync failed',
  'up-to-date': 'Up to date',
}

export interface SyncStatusInput {
  isConfigured: boolean
  isAuthenticated: boolean
  isOnline: boolean
  isSyncing: boolean
  pendingCount: number
  conflictCount: number
  hasError: boolean
  verified: boolean
}

// "Up to date" is only reported once the queue is empty, no conflicts remain,
// and the last run verified its cloud read-back.
export function deriveSyncStatus(input: SyncStatusInput): SyncStatus {
  if (!input.isConfigured) return 'local-only'
  if (!input.isAuthenticated) return 'auth-required'
  if (input.isSyncing) return 'syncing'
  if (!input.isOnline) return 'offline'
  if (input.conflictCount > 0) return 'conflicts'
  if (input.hasError) return 'failed'
  if (input.pendingCount > 0) return 'pending'
  return input.verified ? 'up-to-date' : 'pending'
}
