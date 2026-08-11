import type { AssistantActionBatch, AssistantActionProposal, AssistantActionReceipt } from '../models/assistant'
import { validateAssistantProposal } from './assistantFinance'
import { useAppStore } from '../store/appStore'

export type AssistantExecutionResult =
  | { status: 'executed'; receipt: AssistantActionReceipt }
  | { status: 'already-executed'; receipt?: AssistantActionReceipt }
  | { status: 'expired' | 'cancelled' | 'invalid-token' | 'content-mismatch' | 'stale' | 'validation-failed'; error: string }

export type AssistantBatchExecutionResult =
  | { status: 'executed'; receipts: readonly AssistantActionReceipt[] }
  | { status: 'already-executed'; receipts?: readonly AssistantActionReceipt[] }
  | { status: 'expired' | 'cancelled' | 'invalid-token' | 'content-mismatch' | 'stale' | 'validation-failed'; error: string }

interface Authorization { id: string; fingerprint: string; expiresAt: number; consumed: boolean; cancelled: boolean }
const authorizations = new Map<string, Authorization>()
const TTL_MS = 5 * 60 * 1_000

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
  return value
}

function fingerprint(value: unknown): string {
  const text = JSON.stringify(canonical(value))
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619)
  return `fnv1a-${(hash >>> 0).toString(16)}`
}

function issue(value: AssistantActionProposal | AssistantActionBatch): string {
  const id = `assistant-confirm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  authorizations.set(id, { id, fingerprint: fingerprint(value), expiresAt: Date.now() + TTL_MS, consumed: false, cancelled: false })
  return id
}

export function authorizeAssistantProposal(proposal: AssistantActionProposal): string { return issue(proposal) }
export function authorizeAssistantBatch(batch: AssistantActionBatch): string { return issue(batch) }

function validate(id: string, value: AssistantActionProposal | AssistantActionBatch): Authorization | undefined {
  const authorization = authorizations.get(id)
  if (!authorization || authorization.cancelled || authorization.consumed) return undefined
  if (authorization.expiresAt <= Date.now()) return undefined
  if (authorization.fingerprint !== fingerprint(value)) return undefined
  return authorization
}

export function executeAssistantProposalThroughGateway(proposal: AssistantActionProposal, authorizationId: string): AssistantExecutionResult {
  const authorization = validate(authorizationId, proposal)
  if (!authorization) return { status: 'invalid-token', error: 'This confirmation is invalid, expired, or no longer matches the preview.' }
  const state = useAppStore.getState()
  const errors = validateAssistantProposal(proposal, state.finance, state.planning)
  if (errors.length) return { status: 'stale', error: errors[0] ?? 'The live financial state changed. Prepare a new preview.' }
  const result = state.executeAssistantProposal({ ...proposal, status: 'confirmed' })
  if (result.receipt) { authorization.consumed = true; return { status: 'executed', receipt: result.receipt } }
  return { status: 'validation-failed', error: result.error ?? 'The action was not recorded.' }
}

export function executeAssistantBatchThroughGateway(batch: AssistantActionBatch, authorizationId: string): AssistantBatchExecutionResult {
  const authorization = validate(authorizationId, batch)
  if (!authorization) return { status: 'invalid-token', error: 'This confirmation is invalid, expired, or no longer matches the preview.' }
  const state = useAppStore.getState()
  for (const proposal of batch.proposals) {
    const errors = validateAssistantProposal(proposal, state.finance, state.planning)
    if (errors.length) return { status: 'stale', error: errors[0] ?? 'The live financial state changed. Prepare a new preview.' }
  }
  const result = state.executeAssistantBatch({ ...batch, status: 'confirmed' })
  if (result.receipts) { authorization.consumed = true; return { status: 'executed', receipts: result.receipts } }
  return { status: 'validation-failed', error: result.error ?? 'The actions were not recorded.' }
}

export function cancelAssistantAuthorization(value: AssistantActionProposal | AssistantActionBatch): void {
  const target = fingerprint(value)
  for (const authorization of authorizations.values()) if (authorization.fingerprint === target) authorization.cancelled = true
}

export function clearAssistantAuthorizations(): void { authorizations.clear() }
