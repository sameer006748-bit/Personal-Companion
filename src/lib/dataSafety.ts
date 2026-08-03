// Authoritative data-safety layer: versioned backup envelopes plus a staged
// restore protocol. Multiple localStorage keys are not transactionally atomic,
// so every restore stages writes behind a rollback bundle and an operation
// marker, then verifies through the production parsers before finalising.

import {
  FINANCE_STORAGE_KEY,
  checkFinanceConsistency,
  getFinanceBalances,
  isFinanceState,
  loadFinanceState,
  type FinanceState,
} from './financeCore'
import {
  PLANNING_STORAGE_KEY,
  checkPlanningConsistency,
  isPlanningState,
  loadPlanningState,
} from './planningCore'
import type { PlanningState } from '../models/planning'
import {
  SETTINGS_STORAGE_KEY,
  isUserSettings,
  normalizeUserSettings,
  loadSettingsWithOrigin,
  type UserSettings,
} from '../models/settings'

export const BACKUP_FORMAT = 'personal-companion-backup'
export const BACKUP_FORMAT_VERSION = 1
export const BACKUP_FILE_SUFFIX = '.personal-companion-backup.json'
export const BACKUP_SENSITIVITY_NOTICE =
  'This backup contains private financial information. Store it securely.'

const ROLLBACK_KEY = 'personal-companion-restore-rollback'
const MARKER_KEY = 'personal-companion-restore-marker'
const HISTORY_KEY = 'personal-companion-recovery-history'

const MANAGED_KEYS = [SETTINGS_STORAGE_KEY, FINANCE_STORAGE_KEY, PLANNING_STORAGE_KEY] as const

export interface BackupCounts {
  accounts: number
  transactions: number
  receivables: number
  payables: number
  commitments: number
}

export interface BackupPayload {
  settings: UserSettings
  finance: FinanceState
  planning: PlanningState
}

export interface BackupEnvelope {
  format: typeof BACKUP_FORMAT
  formatVersion: number
  exportedAt: string
  appVersion: string
  counts: BackupCounts
  checksum: string
  data: BackupPayload
}

export type RestoreSource = 'file' | 'cloud'

// --- Integrity ---------------------------------------------------------------

// Deterministic serialisation so the checksum does not depend on key order.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`
}

// Non-secret FNV-1a integrity digest. This detects accidental corruption and
// casual edits; it is not a signature and is never presented as encryption.
function digest(input: string): string {
  let low = 0x811c9dc5
  let high = 0x01000193
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index)
    low = Math.imul(low ^ code, 0x01000193) >>> 0
    high = Math.imul(high ^ (code + index), 0x85ebca6b) >>> 0
  }
  return `${low.toString(16).padStart(8, '0')}${high.toString(16).padStart(8, '0')}`
}

function checksumOf(payload: BackupPayload): string {
  return digest(stableStringify(payload))
}

export function countRecords(finance: FinanceState, planning: PlanningState): BackupCounts {
  return {
    accounts: finance.accounts.length,
    transactions: finance.transactions.length,
    receivables: planning.receivables.length,
    payables: planning.payables.length,
    commitments: planning.commitments.length,
  }
}

// --- Export ------------------------------------------------------------------

function appVersion(): string {
  const value: unknown = import.meta.env?.VITE_APP_VERSION
  return typeof value === 'string' && value.trim() ? value.trim() : '0.1.0'
}

export function createBackupEnvelope(
  settings: UserSettings,
  finance: FinanceState,
  planning: PlanningState,
): BackupEnvelope {
  // Structural clone strips undefined members so the stored payload and the
  // checksum are computed over exactly the bytes that will be written.
  const data = JSON.parse(JSON.stringify({ settings, finance, planning })) as BackupPayload
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: appVersion(),
    counts: countRecords(data.finance, data.planning),
    checksum: checksumOf(data),
    data,
  }
}

export function buildBackupFileName(exportedAt: string): string {
  const stamp = exportedAt.slice(0, 19).replaceAll(':', '-')
  return `${stamp}${BACKUP_FILE_SUFFIX}`
}

// --- Validation --------------------------------------------------------------

export interface BackupValidation {
  ok: boolean
  errors: readonly string[]
  warnings: readonly string[]
  envelope?: BackupEnvelope
  counts?: BackupCounts
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isCalendarDate(value: unknown): boolean {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !Number.isNaN(new Date(value).getTime())
}

function collectDuplicates(ids: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id)
    seen.add(id)
  }
  return [...duplicates]
}

// Deep validation beyond the storage type guards: the guards accept any string
// for calendar dates and timestamps, which a hand-edited backup can abuse.
function validatePayload(payload: BackupPayload): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  const { finance, planning } = payload

  const accountDuplicates = collectDuplicates(finance.accounts.map((account) => account.id))
  if (accountDuplicates.length) errors.push(`Duplicate account ids: ${accountDuplicates.join(', ')}.`)
  const transactionDuplicates = collectDuplicates(finance.transactions.map((item) => item.id))
  if (transactionDuplicates.length) {
    errors.push(`Duplicate transaction ids: ${transactionDuplicates.join(', ')}.`)
  }

  for (const account of finance.accounts) {
    if (!isTimestamp(account.createdAt) || !isTimestamp(account.updatedAt)) {
      errors.push(`Account ${account.id} has an invalid timestamp.`)
    }
  }
  for (const transaction of finance.transactions) {
    if (!isCalendarDate(transaction.date)) {
      errors.push(`Transaction ${transaction.id} has an invalid date.`)
    }
    if (!isTimestamp(transaction.createdAt) || !isTimestamp(transaction.updatedAt)) {
      errors.push(`Transaction ${transaction.id} has an invalid timestamp.`)
    }
  }

  const financeReport = checkFinanceConsistency(finance)
  errors.push(...financeReport.issues)

  const accountsById = new Map(finance.accounts.map((account) => [account.id, account]))
  const activeAccountIds = finance.accounts
    .filter((account) => !account.isArchived)
    .map((account) => account.id)

  const planningRecords = [
    ...planning.receivables.map((record) => ({ kind: 'Receivable', ...record })),
    ...planning.payables.map((record) => ({ kind: 'Payable', ...record })),
    ...planning.commitments.map((record) => ({ kind: 'Commitment', ...record })),
  ]
  for (const record of planningRecords) {
    if (!isTimestamp(record.createdAt) || !isTimestamp(record.updatedAt)) {
      errors.push(`${record.kind} ${record.id} has an invalid timestamp.`)
    }
    if (!record.accountId) continue
    const referenced = accountsById.get(record.accountId)
    if (!referenced) {
      errors.push(`${record.kind} ${record.id} references a missing account.`)
    } else if (referenced.isArchived) {
      warnings.push(`${record.kind} ${record.id} references an archived account.`)
    }
  }

  const planningReport = checkPlanningConsistency(planning, activeAccountIds)
  // Archived-account references are already reported as warnings above.
  errors.push(
    ...planningReport.issues.filter((issue) => !issue.includes('references an unavailable account')),
  )

  if (!accountsById.has(payload.settings.profile.defaultAccountId)) {
    warnings.push('The saved default account is not present; an active default will be used.')
  }

  return { errors, warnings }
}

export function validateBackupEnvelope(raw: unknown): BackupValidation {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, errors: ['This file is not a Personal Companion backup.'], warnings: [] }
  }
  const candidate = raw as Record<string, unknown>

  if (candidate.format !== BACKUP_FORMAT) {
    return { ok: false, errors: ['This file is not a Personal Companion backup.'], warnings: [] }
  }
  if (candidate.formatVersion !== BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      errors: [`Backup format version ${String(candidate.formatVersion)} is not supported.`],
      warnings: [],
    }
  }
  if (!isTimestamp(candidate.exportedAt)) {
    return { ok: false, errors: ['This backup has an invalid export timestamp.'], warnings: [] }
  }

  const data = candidate.data
  if (typeof data !== 'object' || data === null) {
    return { ok: false, errors: ['This backup does not contain any data.'], warnings: [] }
  }
  const payload = data as Record<string, unknown>

  const structural: string[] = []
  const normalizedSettings = normalizeUserSettings(payload.settings)
  if (!normalizedSettings) structural.push('The saved profile and settings are not valid.')
  if (!isFinanceState(payload.finance)) structural.push('The saved Finance records are not valid.')
  if (!isPlanningState(payload.planning)) structural.push('The saved Planning records are not valid.')
  if (structural.length) return { ok: false, errors: structural, warnings: [] }

  const typed = data as BackupPayload
  if (typeof candidate.checksum !== 'string' || candidate.checksum !== checksumOf(typed)) {
    return {
      ok: false,
      errors: ['This backup failed its integrity check and may have been altered.'],
      warnings: [],
    }
  }

  const normalizedTyped: BackupPayload = { ...typed, settings: normalizedSettings! }
  const counts = countRecords(normalizedTyped.finance, normalizedTyped.planning)
  const declared = candidate.counts
  if (typeof declared !== 'object' || declared === null) {
    return { ok: false, errors: ['This backup is missing its record counts.'], warnings: [] }
  }
  const declaredCounts = declared as Record<string, unknown>
  for (const [key, value] of Object.entries(counts)) {
    if (declaredCounts[key] !== value) {
      return {
        ok: false,
        errors: ['This backup does not match its recorded counts and may be incomplete.'],
        warnings: [],
      }
    }
  }

  const { errors, warnings } = validatePayload(normalizedTyped)
  if (errors.length) return { ok: false, errors, warnings, counts }

  return {
    ok: true,
    errors: [],
    warnings,
    counts,
    envelope: {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: candidate.exportedAt,
      appVersion: typeof candidate.appVersion === 'string' ? candidate.appVersion : 'unknown',
      counts,
      checksum: candidate.checksum,
      data: normalizedTyped,
    },
  }
}

export function parseBackupFile(text: string): BackupValidation {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['This file is not valid JSON.'], warnings: [] }
  }
  return validateBackupEnvelope(parsed)
}

// Validates a payload assembled from cloud rows using the same rules as a file.
export function validateRestorePayload(payload: BackupPayload): BackupValidation {
  const structural: string[] = []
  if (!isUserSettings(payload.settings)) structural.push('The cloud profile and settings are not valid.')
  if (!isFinanceState(payload.finance)) structural.push('The cloud Finance records are not valid.')
  if (!isPlanningState(payload.planning)) structural.push('The cloud Planning records are not valid.')
  if (structural.length) return { ok: false, errors: structural, warnings: [] }

  const counts = countRecords(payload.finance, payload.planning)
  const { errors, warnings } = validatePayload(payload)
  if (errors.length) return { ok: false, errors, warnings, counts }
  return { ok: true, errors: [], warnings, counts }
}

// --- Staged restore ----------------------------------------------------------

interface RollbackBundle {
  capturedAt: string
  values: Record<string, string | null>
}

interface RestoreMarker {
  startedAt: string
  source: RestoreSource
  expected: BackupCounts
}

function storage(): Storage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage
}

function readJson<T>(key: string, guard: (value: unknown) => value is T): T | undefined {
  const store = storage()
  if (!store) return undefined
  try {
    const raw = store.getItem(key)
    if (!raw) return undefined
    const parsed: unknown = JSON.parse(raw)
    return guard(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function isRollbackBundle(value: unknown): value is RollbackBundle {
  if (typeof value !== 'object' || value === null) return false
  const bundle = value as Record<string, unknown>
  if (typeof bundle.capturedAt !== 'string' || typeof bundle.values !== 'object' || bundle.values === null) {
    return false
  }
  return Object.values(bundle.values as Record<string, unknown>).every(
    (item) => item === null || typeof item === 'string',
  )
}

function isRestoreMarker(value: unknown): value is RestoreMarker {
  if (typeof value !== 'object' || value === null) return false
  const marker = value as Record<string, unknown>
  return (
    typeof marker.startedAt === 'string' &&
    (marker.source === 'file' || marker.source === 'cloud') &&
    typeof marker.expected === 'object' &&
    marker.expected !== null
  )
}

function captureRollback(store: Storage): RollbackBundle {
  const values: Record<string, string | null> = {}
  for (const key of MANAGED_KEYS) values[key] = store.getItem(key)
  return { capturedAt: new Date().toISOString(), values }
}

function applyRollback(store: Storage, bundle: RollbackBundle): void {
  for (const key of MANAGED_KEYS) {
    const value = bundle.values[key]
    if (value === null || value === undefined) store.removeItem(key)
    else store.setItem(key, value)
  }
}

function writeStaged(store: Storage, payload: BackupPayload): void {
  store.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload.settings))
  store.setItem(FINANCE_STORAGE_KEY, JSON.stringify(payload.finance))
  store.setItem(PLANNING_STORAGE_KEY, JSON.stringify(payload.planning))
}

function sameIds(expected: readonly { id: string }[], actual: readonly { id: string }[]): boolean {
  if (expected.length !== actual.length) return false
  const actualIds = new Set(actual.map((record) => record.id))
  return expected.every((record) => actualIds.has(record.id))
}

// Reads the staged data back through the production parsers and proves the
// restore is faithful: identical record identity and identical derived balances.
function verifyStaged(payload: BackupPayload): string | undefined {
  const { settings, origin } = loadSettingsWithOrigin()
  if (origin === 'fresh') return 'The restored settings could not be read back.'

  const finance = loadFinanceState(settings, origin)
  const planning = loadPlanningState()

  if (!sameIds(payload.finance.accounts, finance.accounts)) {
    return 'The restored accounts could not be verified.'
  }
  if (!sameIds(payload.finance.transactions, finance.transactions)) {
    return 'The restored transactions could not be verified.'
  }
  if (
    !sameIds(payload.planning.receivables, planning.receivables) ||
    !sameIds(payload.planning.payables, planning.payables) ||
    !sameIds(payload.planning.commitments, planning.commitments)
  ) {
    return 'The restored Planning records could not be verified.'
  }

  const expectedBalances = getFinanceBalances(payload.finance)
  const actualBalances = getFinanceBalances(finance)
  for (const [accountId, balance] of Object.entries(expectedBalances)) {
    if (actualBalances[accountId] !== balance) return 'The restored balances could not be verified.'
  }

  const report = checkFinanceConsistency(finance)
  if (!report.ok) return 'The restored Finance data is not consistent.'

  return undefined
}

export interface RestoreOutcome {
  ok: boolean
  error?: string
  rolledBack: boolean
  restored?: BackupPayload
}

export function applyStagedRestore(payload: BackupPayload, source: RestoreSource): RestoreOutcome {
  const store = storage()
  if (!store) return { ok: false, error: 'Local storage is unavailable.', rolledBack: false }

  const validation = validateRestorePayload(payload)
  if (!validation.ok) {
    return { ok: false, error: validation.errors[0] ?? 'This data could not be validated.', rolledBack: false }
  }

  const rollback = captureRollback(store)
  const expected = countRecords(payload.finance, payload.planning)

  try {
    store.setItem(ROLLBACK_KEY, JSON.stringify(rollback))
    store.setItem(
      MARKER_KEY,
      JSON.stringify({ startedAt: new Date().toISOString(), source, expected } satisfies RestoreMarker),
    )
  } catch {
    store.removeItem(MARKER_KEY)
    store.removeItem(ROLLBACK_KEY)
    return { ok: false, error: 'There is not enough storage space to restore safely.', rolledBack: false }
  }

  try {
    writeStaged(store, payload)
    const failure = verifyStaged(payload)
    if (failure) {
      applyRollback(store, rollback)
      recordFailure(failure)
      return { ok: false, error: failure, rolledBack: true }
    }
  } catch {
    applyRollback(store, rollback)
    const message = 'The restore could not be completed. Your previous data has been kept.'
    recordFailure(message)
    return { ok: false, error: message, rolledBack: true }
  } finally {
    store.removeItem(MARKER_KEY)
    store.removeItem(ROLLBACK_KEY)
  }

  recordRestored(source)
  return { ok: true, rolledBack: false, restored: payload }
}

// --- Interrupted restore recovery -------------------------------------------

export type RecoveryAction = 'none' | 'rolled-back' | 'finalized'

// Runs before any store hydration. A surviving marker means the process died
// mid-restore, so the previous state is reinstated rather than leaving mixed
// Finance, Planning, and settings data behind.
export function recoverInterruptedRestore(): RecoveryAction {
  const store = storage()
  if (!store) return 'none'

  const marker = readJson(MARKER_KEY, isRestoreMarker)
  if (!marker) {
    // A rollback bundle without a marker is a finalisation leftover.
    store.removeItem(ROLLBACK_KEY)
    return 'none'
  }

  const rollback = readJson(ROLLBACK_KEY, isRollbackBundle)
  if (rollback) {
    applyRollback(store, rollback)
    store.removeItem(MARKER_KEY)
    store.removeItem(ROLLBACK_KEY)
    recordFailure('A restore was interrupted, so your previous data was kept.')
    return 'rolled-back'
  }

  // No rollback bundle survives, so the staged data is all that remains. It is
  // only kept when it reads back as complete and self-consistent.
  const { settings, origin } = loadSettingsWithOrigin()
  const finance = loadFinanceState(settings, origin)
  const planning = loadPlanningState()
  const counts = countRecords(finance, planning)
  const matches = Object.entries(marker.expected).every(
    ([key, value]) => counts[key as keyof BackupCounts] === value,
  )

  store.removeItem(MARKER_KEY)
  store.removeItem(ROLLBACK_KEY)

  if (matches && origin !== 'fresh' && checkFinanceConsistency(finance).ok) {
    recordRestored(marker.source)
    return 'finalized'
  }

  recordFailure('A restore was interrupted and could not be completed.')
  return 'rolled-back'
}

// --- Recovery history --------------------------------------------------------

export interface RecoveryHistory {
  lastBackupAt?: string
  lastRestoreAt?: string
  lastRestoreSource?: RestoreSource
  lastFailure?: { at: string; message: string }
}

function isRecoveryHistory(value: unknown): value is RecoveryHistory {
  return typeof value === 'object' && value !== null
}

export function readRecoveryHistory(): RecoveryHistory {
  return readJson(HISTORY_KEY, isRecoveryHistory) ?? {}
}

function writeHistory(update: RecoveryHistory): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(HISTORY_KEY, JSON.stringify({ ...readRecoveryHistory(), ...update }))
  } catch {
    // History is convenience metadata; failing to record it is not an error.
  }
}

export function recordBackupExported(): void {
  writeHistory({ lastBackupAt: new Date().toISOString() })
}

function recordRestored(source: RestoreSource): void {
  writeHistory({ lastRestoreAt: new Date().toISOString(), lastRestoreSource: source })
}

function recordFailure(message: string): void {
  writeHistory({ lastFailure: { at: new Date().toISOString(), message } })
}
