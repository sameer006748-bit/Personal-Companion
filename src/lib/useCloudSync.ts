// Sync orchestration and the React surface state. One run at a time, foreground
// only: no service worker, no realtime subscriptions, no polling.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'

import {
  pushRecords,
  pushSettings,
  readCloudForSync,
  tombstoneRecords,
  verifyPushed,
} from './cloudRepository'
import { getCloudConfiguration, supabase } from './supabase'
import {
  SYNC_RECORD_TYPES,
  bumpRetries,
  clearCompleted,
  collectRecords,
  deriveSyncStatus,
  enqueueLocalChanges,
  loadConflicts,
  loadSyncState,
  planSync,
  recordKey,
  saveConflicts,
  saveSyncState,
  type LocalSnapshot,
  type SyncConflict,
  type SyncRecord,
  type SyncRecordType,
  type SyncState,
  type SyncStatus,
} from './syncEngine'
import { useAppStore } from '../store/appStore'

const DEBOUNCE_MS = 1200

export interface SyncSurface {
  status: SyncStatus
  pendingCount: number
  conflicts: readonly SyncConflict[]
  lastSyncedAt: string | undefined
  lastError: string | undefined
  isSyncing: boolean
  syncNow: () => void
  resolveConflict: (conflictId: string, choice: 'local' | 'cloud') => void
}

interface RunResult {
  state: SyncState
  conflicts: readonly SyncConflict[]
  verified: boolean
  error?: string
}

function recordById(
  local: LocalSnapshot,
  recordType: SyncRecordType,
  recordId: string,
): SyncRecord | undefined {
  return collectRecords(local.finance, local.planning)[recordType].find(
    (record) => record.id === recordId,
  )
}

// Applies one sync cycle. Pulls are handed to the caller so domain state stays
// owned by the store rather than being written from here.
async function runSync(
  user: User,
  local: LocalSnapshot,
  syncState: SyncState,
  settings: Parameters<typeof pushSettings>[1],
  applyPulls: (plan: ReturnType<typeof planSync>) => void,
): Promise<RunResult> {
  const cloud = await readCloudForSync(user)
  const plan = planSync(syncState, local, cloud)

  const completed: { recordType: SyncRecordType; recordId: string }[] = []
  let verified = true

  for (const recordType of SYNC_RECORD_TYPES) {
    const pushIds = plan.pushes.filter((item) => item.recordType === recordType).map((item) => item.recordId)
    if (pushIds.length) {
      const records = pushIds
        .map((id) => recordById(local, recordType, id))
        .filter((record): record is SyncRecord => record !== undefined)
      await pushRecords(user, recordType, records)
      const ok = await verifyPushed(user, recordType, records.map((record) => String(record.id)))
      if (!ok) verified = false
      else completed.push(...pushIds.map((recordId) => ({ recordType, recordId })))
    }

    const deleteIds = plan.deletes.filter((item) => item.recordType === recordType).map((item) => item.recordId)
    if (deleteIds.length) {
      await tombstoneRecords(user, recordType, deleteIds)
      completed.push(...deleteIds.map((recordId) => ({ recordType, recordId })))
    }
  }

  if (!syncState.settingsPushedAt) {
    await pushSettings(user, settings)
  }

  // Pulls and cloud tombstones are applied by the store owner.
  if (plan.pulls.length || plan.pullDeletes.length) applyPulls(plan)

  let next = clearCompleted(syncState, completed)

  // Re-read revisions for everything just pushed so the next run has a correct
  // common base and does not report a phantom conflict.
  const confirmed = await readCloudForSync(user)
  const nextBase: Record<string, string> = { ...plan.nextBase }
  for (const recordType of SYNC_RECORD_TYPES) {
    for (const record of confirmed.records[recordType]) {
      nextBase[recordKey(recordType, String(record.id))] = record.updatedAt
    }
  }
  for (const key of confirmed.deletedKeys) delete nextBase[key]

  next = {
    ...next,
    base: nextBase,
    settingsPushedAt: new Date().toISOString(),
    ...(verified && next.queue.length === 0 && plan.conflicts.length === 0
      ? { lastSyncedAt: new Date().toISOString(), lastError: undefined }
      : {}),
  }

  return { state: next, conflicts: plan.conflicts, verified }
}

export function useCloudSync(user: User | null): SyncSurface {
  const settings = useAppStore((state) => state.settings)
  const finance = useAppStore((state) => state.finance)
  const planning = useAppStore((state) => state.planning)
  const applySyncPull = useAppStore((state) => state.applySyncPull)

  const [syncState, setSyncState] = useState<SyncState>(() => loadSyncState())
  const [conflicts, setConflicts] = useState<readonly SyncConflict[]>(() => loadConflicts())
  const [isSyncing, setIsSyncing] = useState(false)
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [verified, setVerified] = useState(false)

  // Refs keep the sync routine stable while always reading current values.
  const running = useRef(false)
  const latest = useRef({ settings, finance, planning, syncState, user })
  const previousSnapshot = useRef<LocalSnapshot>({ finance, planning })

  useEffect(() => {
    latest.current = { settings, finance, planning, syncState, user }
  })

  const isConfigured = getCloudConfiguration().state === 'configured'

  const persist = useCallback((next: SyncState) => {
    saveSyncState(next)
    setSyncState(next)
  }, [])

  // Local mutations enqueue operations regardless of connectivity.
  useEffect(() => {
    const previous = previousSnapshot.current
    if (previous.finance === finance && previous.planning === planning) return
    previousSnapshot.current = { finance, planning }
    const timer = window.setTimeout(() => {
      const next = enqueueLocalChanges(latest.current.syncState, previous, { finance, planning })
      if (next !== latest.current.syncState) {
        setVerified(false)
        persist(next)
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [finance, planning, persist])

  const sync = useCallback(async () => {
    const current = latest.current
    if (running.current || !current.user || !isConfigured) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return

    running.current = true
    setIsSyncing(true)
    try {
      const result = await runSync(
        current.user,
        { finance: current.finance, planning: current.planning },
        current.syncState,
        current.settings,
        (plan) => { applySyncPull(plan.pulls, plan.pullDeletes) },
      )
      // A pull rewrites local state, so the diff baseline moves with it.
      previousSnapshot.current = {
        finance: useAppStore.getState().finance,
        planning: useAppStore.getState().planning,
      }
      persist(result.state)
      saveConflicts(result.conflicts)
      setConflicts(result.conflicts)
      setVerified(result.verified)
    } catch {
      const failed = latest.current.syncState.queue.map((operation) => ({
        recordType: operation.recordType,
        recordId: operation.recordId,
      }))
      persist(bumpRetries(latest.current.syncState, failed, 'The last sync did not complete.'))
      setVerified(false)
    } finally {
      running.current = false
      setIsSyncing(false)
    }
  }, [applySyncPull, isConfigured, persist])

  // Debounced trigger after local mutations.
  useEffect(() => {
    if (!user || !isConfigured) return
    if (syncState.queue.length === 0) return
    const timer = window.setTimeout(() => void sync(), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [isConfigured, sync, syncState.queue, user])

  // Focus, online, and session-restoration triggers.
  useEffect(() => {
    if (!user || !isConfigured) return
    const onFocus = () => void sync()
    const onOnline = () => {
      setIsOnline(true)
      void sync()
    }
    const onOffline = () => setIsOnline(false)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    // Deferred so the session-restoration sync never runs during render.
    const initial = window.setTimeout(() => void sync(), 0)
    return () => {
      window.clearTimeout(initial)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [isConfigured, sync, user])

  const resolveConflict = useCallback(
    (conflictId: string, choice: 'local' | 'cloud') => {
      const conflict = conflicts.find((item) => item.conflictId === conflictId)
      if (!conflict) return

      if (choice === 'cloud') {
        if (conflict.kind === 'cloud-delete-local-edit') {
          applySyncPull([], [{ recordType: conflict.recordType, recordId: conflict.recordId }])
        } else if (conflict.cloudRecord) {
          applySyncPull([{ recordType: conflict.recordType, record: conflict.cloudRecord }], [])
        }
      }

      // Keeping local re-queues the local version (or its tombstone) so the
      // next run pushes the user's choice to the cloud.
      if (choice === 'local') {
        const kind = conflict.kind === 'local-delete-cloud-edit' ? 'delete' : 'upsert'
        const next: SyncState = {
          ...latest.current.syncState,
          queue: [
            ...latest.current.syncState.queue.filter(
              (operation) =>
                !(operation.recordType === conflict.recordType && operation.recordId === conflict.recordId),
            ),
            {
              operationId: `resolve-${conflict.conflictId}`,
              kind,
              recordType: conflict.recordType,
              recordId: conflict.recordId,
              mutatedAt: new Date().toISOString(),
              retryCount: 0,
            },
          ],
          // Drop the stale base so the resolved local version is not seen as a
          // conflict again on the next run.
          base: Object.fromEntries(
            Object.entries(latest.current.syncState.base).filter(
              ([key]) => key !== recordKey(conflict.recordType, conflict.recordId),
            ),
          ),
        }
        persist(next)
      }

      const remaining = conflicts.filter((item) => item.conflictId !== conflictId)
      saveConflicts(remaining)
      setConflicts(remaining)
      previousSnapshot.current = {
        finance: useAppStore.getState().finance,
        planning: useAppStore.getState().planning,
      }
      void sync()
    },
    [applySyncPull, conflicts, persist, sync],
  )

  const status = deriveSyncStatus({
    isConfigured: isConfigured && Boolean(supabase),
    isAuthenticated: Boolean(user),
    isOnline,
    isSyncing,
    pendingCount: syncState.queue.length,
    conflictCount: conflicts.length,
    hasError: Boolean(syncState.lastError),
    verified,
  })

  return {
    status,
    pendingCount: syncState.queue.length,
    conflicts,
    lastSyncedAt: syncState.lastSyncedAt,
    lastError: syncState.lastError,
    isSyncing,
    syncNow: () => void sync(),
    resolveConflict,
  }
}
