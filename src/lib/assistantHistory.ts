// Durable Assistant conversation history.
//
// The Assistant previously kept its transcript in component state, so leaving the
// route, remounting, reloading, or reopening the app started a fresh conversation.
// This module gives it the same persistence shape the rest of the app already
// uses: a versioned envelope in localStorage, read back through a total type
// guard, with unreadable data falling back to a clean initial state.
//
// Isolation: the storage key is deliberately NOT part of the data-safety
// MANAGED_KEYS set. Backup, restore, and cloud sync therefore never read or write
// it, and clearing the transcript can never reach a financial record.
//
// Privacy: only what is already on screen is stored. No token, no Authorization
// header, no request payload sent to the provider, no system prompt, no raw
// provider response, no stack trace, and no account identifier is written here.

import { ASSISTANT_ACTION_TYPES } from '../models/assistant'
import type {
  AssistantActionBatch,
  AssistantActionProposal,
  AssistantActionReceipt,
  AssistantActionType,
  AssistantFollowUp,
  AssistantInsight,
  AssistantInsightRow,
  AssistantMessage,
  AssistantMetric,
} from '../models/assistant'

export const ASSISTANT_HISTORY_STORAGE_KEY = 'personal-companion-assistant-history'
const STORAGE_KEY = ASSISTANT_HISTORY_STORAGE_KEY
let activeStorageScope = 'guest'

function scopedStorageKey(): string {
  return activeStorageScope === 'guest' ? STORAGE_KEY : `${STORAGE_KEY}:${activeStorageScope}`
}

export function setAssistantHistoryScope(scope: string | undefined, migrateLegacy = false): void {
  const trimmedScope = scope?.trim()
  activeStorageScope = trimmedScope?.length ? trimmedScope : 'guest'
  if (!migrateLegacy || activeStorageScope === 'guest' || typeof window === 'undefined') return
  const target = scopedStorageKey()
  try {
    if (!window.localStorage.getItem(target)) {
      const legacy = window.localStorage.getItem(STORAGE_KEY)
      if (legacy) window.localStorage.setItem(target, legacy)
    }
  } catch { /* the scoped in-memory transcript remains usable */ }
}

// A stable id, so the opening message is recognisable and is re-seeded only when
// the transcript is genuinely empty. Restoring a saved conversation therefore
// never appends a second welcome.
export const ASSISTANT_WELCOME_MESSAGE_ID = 'assistant-introduction'

const WELCOME_TEXT =
  'Ask me anything about your current financial position, recent activity, receivables, payables, or commitments.'

// Bound on stored turns. A question and its answer are two messages, so this
// keeps roughly the last sixty exchanges. An assistant turn carrying an insight
// card serialises to a little under 2 KB, which puts the worst case near 200 KB:
// well inside the origin's storage budget that Finance, Planning, and settings
// also share, while far larger than any conversation a user can hold in one
// sitting. Trimming always drops the oldest messages, so recent context that the
// user can still see referenced is never the part that is discarded.
const MAX_STORED_MESSAGES = 120

export interface AssistantHistoryState {
  version: 1
  messages: readonly AssistantMessage[]
}

export function createWelcomeMessage(timestamp = Date.now()): AssistantMessage {
  return {
    id: ASSISTANT_WELCOME_MESSAGE_ID,
    role: 'assistant',
    text: WELCOME_TEXT,
    timestamp,
  }
}

export function createInitialAssistantHistory(): AssistantHistoryState {
  return { version: 1, messages: [createWelcomeMessage()] }
}

// --- Validation --------------------------------------------------------------
// Persisted data is untrusted input: it can be hand-edited, half-written by a
// storage failure, or left behind by an older build. Every field the UI reads is
// checked, because a malformed record must not be able to crash the Assistant.

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isTone(value: unknown): boolean {
  return (
    value === undefined ||
    value === 'default' ||
    value === 'positive' ||
    value === 'negative' ||
    value === 'attention'
  )
}

function isMetric(value: unknown): value is AssistantMetric {
  if (typeof value !== 'object' || value === null) return false
  const metric = value as Record<string, unknown>
  return (
    typeof metric.label === 'string' &&
    isFiniteNumber(metric.amount) &&
    isOptionalString(metric.sign) &&
    isTone(metric.tone)
  )
}

function isInsightRow(value: unknown): value is AssistantInsightRow {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.label === 'string' &&
    isOptionalString(row.detail) &&
    (row.amount === undefined || isFiniteNumber(row.amount)) &&
    isTone(row.tone)
  )
}

function isInsight(value: unknown): value is AssistantInsight {
  if (typeof value !== 'object' || value === null) return false
  const insight = value as Record<string, unknown>
  if (typeof insight.title !== 'string') return false
  if (insight.metrics !== undefined) {
    if (!Array.isArray(insight.metrics) || !insight.metrics.every(isMetric)) return false
  }
  if (insight.rows !== undefined) {
    if (!Array.isArray(insight.rows) || !insight.rows.every(isInsightRow)) return false
  }
  return true
}

function isFollowUp(value: unknown): value is AssistantFollowUp {
  if (typeof value !== 'object' || value === null) return false
  const followUp = value as Record<string, unknown>
  return typeof followUp.id === 'string' && typeof followUp.label === 'string'
}

// Which fields the proposal union declares as required for each action type.
// Accepting every action type without checking these would let a restored
// proposal claim a shape its data does not have, so the two are kept together.
const REQUIRED_PROPOSAL_FIELDS: Readonly<Record<AssistantActionType, readonly string[]>> = {
  'add-income': ['targetAccountId'],
  'add-expense': ['sourceAccountId'],
  transfer: ['sourceAccountId', 'targetAccountId'],
  'account-adjustment': ['targetAccountId'],
  'receive-receivable': ['targetAccountId', 'recordId'],
  'pay-payable': ['sourceAccountId', 'recordId'],
  'add-commitment': ['commitmentFrequency'],
  'add-receivable': ['counterparty'],
  'add-payable': ['counterparty'],
  'settle-commitment': ['recordId'],
  'create-account': ['accountName', 'accountType'],
  'update-account': ['targetAccountId', 'accountName', 'accountType'],
  'archive-account': ['targetAccountId'],
  'restore-account': ['targetAccountId'],
  'set-default-account': ['targetAccountId'],
  'update-transaction': ['recordId', 'transactionType', 'categoryId', 'sourceAccountId'],
  'delete-transaction': ['recordId'],
  'update-receivable': ['recordId', 'counterparty'],
  'delete-receivable': ['recordId'],
  'update-payable': ['recordId', 'counterparty'],
  'delete-payable': ['recordId'],
  'update-commitment': ['recordId', 'commitmentFrequency', 'categoryId'],
  'archive-commitment': ['recordId'],
  'restore-commitment': ['recordId'],
  'delete-commitment': ['recordId'],
  'update-preference': ['preferenceKey'],
}

function isProposal(value: unknown): value is AssistantActionProposal {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  // The action list is shared with the model union rather than copied. An
  // earlier copy here recognised only the first seven actions, so a saved
  // conversation containing any later one failed this guard and the whole
  // transcript was dropped on reload.
  const actionType = item.actionType as AssistantActionType
  if (!ASSISTANT_ACTION_TYPES.includes(actionType)) return false
  const statuses = new Set(['proposed', 'confirmed', 'cancelled', 'executed', 'superseded', 'failed'])
  const carriesOpeningBalance = actionType === 'create-account' || actionType === 'update-account'
  return typeof item.proposalId === 'string' &&
    isFiniteNumber(item.amountPkr) && typeof item.description === 'string' &&
    typeof item.effectiveDate === 'string' && isFiniteNumber(item.createdAt) &&
    statuses.has(item.status as string) && typeof item.idempotencyKey === 'string' &&
    typeof item.summary === 'string' && isOptionalString(item.targetAccountId) &&
    isOptionalString(item.sourceAccountId) && isOptionalString(item.recordId) &&
    REQUIRED_PROPOSAL_FIELDS[actionType].every((field) => {
      const present = item[field]
      return typeof present === 'string' && present.length > 0
    }) &&
    (!carriesOpeningBalance || isFiniteNumber(item.openingBalance)) &&
    (actionType !== 'update-preference' ||
      typeof item.preferenceValue === 'string' || typeof item.preferenceValue === 'boolean') &&
    (item.validationErrors === undefined || (Array.isArray(item.validationErrors) && item.validationErrors.every((error) => typeof error === 'string')))
}

function isReceipt(value: unknown): value is AssistantActionReceipt {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return typeof item.proposalId === 'string' && typeof item.actionType === 'string' &&
    isFiniteNumber(item.amountPkr) && typeof item.affectedLabel === 'string' &&
    isFiniteNumber(item.completedAt) && isOptionalString(item.referenceId) &&
    (item.resultingAmount === undefined || isFiniteNumber(item.resultingAmount))
}

// A batch is validated through the same per-child proposal guard, so a restored
// multi-action preview is either wholly trustworthy or dropped. Without this the
// whole transcript would fail validation on reload and be discarded.
function isBatch(value: unknown): value is AssistantActionBatch {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  if (!Array.isArray(item.proposals)) return false
  if (item.proposals.length < 2 || item.proposals.length > 5) return false
  if (!item.proposals.every(isProposal)) return false
  if (item.actionCount !== item.proposals.length) return false
  const statuses = new Set(['proposed', 'confirmed', 'cancelled', 'executed', 'superseded', 'failed'])
  if (item.receipts !== undefined && (!Array.isArray(item.receipts) || !item.receipts.every(isReceipt))) return false
  return typeof item.batchId === 'string' && item.batchId.length > 0 &&
    typeof item.sourceTurnId === 'string' &&
    typeof item.idempotencyKey === 'string' && item.idempotencyKey.length > 0 &&
    statuses.has(item.status as string) && typeof item.summary === 'string' &&
    isFiniteNumber(item.createdAt)
}

function isMemoryProposal(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.proposalId === 'string' && typeof item.category === 'string' && typeof item.summary === 'string' && typeof item.normalizedValue === 'string' && typeof item.displayLabel === 'string' && typeof item.reason === 'string' && isFiniteNumber(item.createdAt) && (item.status === 'proposed' || item.status === 'saved' || item.status === 'rejected' || item.status === 'cancelled')
}

function isTimings(value: unknown): boolean {
  return value !== undefined && typeof value === 'object' && value !== null && !Array.isArray(value) && Object.entries(value).every(([key, timing]) => /^[a-z-]{1,40}$/u.test(key) && isFiniteNumber(timing) && timing >= 0)
}

function isDiagnostic(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.code === 'string' && typeof item.stage === 'string' &&
    (item.timingsMs === undefined || isTimings(item.timingsMs)) &&
    isOptionalString(item.responseKind) && isOptionalString(item.toolName) &&
    (item.roundCount === undefined || isFiniteNumber(item.roundCount)) &&
    (item.toolsExposed === undefined || isFiniteNumber(item.toolsExposed)) &&
    (item.toolsCalled === undefined || isFiniteNumber(item.toolsCalled))
}

function isPerformance(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return isTimings(item.timingsMs) &&
    (item.roundCount === undefined || isFiniteNumber(item.roundCount)) &&
    (item.toolsExposed === undefined || isFiniteNumber(item.toolsExposed)) &&
    (item.toolsCalled === undefined || isFiniteNumber(item.toolsCalled))
}

export function isAssistantMessage(value: unknown): value is AssistantMessage {
  if (typeof value !== 'object' || value === null) return false
  const message = value as Record<string, unknown>

  if (typeof message.id !== 'string' || !message.id) return false
  if (message.role !== 'user' && message.role !== 'assistant') return false
  if (typeof message.text !== 'string') return false
  // The transcript renders this through Date, so a non-finite stamp would produce
  // an invalid date and throw while formatting.
  if (!isFiniteNumber(message.timestamp)) return false
  if (message.insight !== undefined && !isInsight(message.insight)) return false
  if (message.followUps !== undefined) {
    if (!Array.isArray(message.followUps) || !message.followUps.every(isFollowUp)) return false
  }
  if (message.source !== undefined && message.source !== 'ai' && message.source !== 'local') {
    return false
  }
  if (!isOptionalString(message.statusNote)) return false
  if (message.proposal !== undefined && !isProposal(message.proposal)) return false
  if (message.batch !== undefined && !isBatch(message.batch)) return false
  if (message.receipt !== undefined && !isReceipt(message.receipt)) return false
  if (message.memoryProposal !== undefined && !isMemoryProposal(message.memoryProposal)) return false
  if (message.diagnostic !== undefined && !isDiagnostic(message.diagnostic)) return false
  if (message.performance !== undefined && !isPerformance(message.performance)) return false

  return true
}

export function isAssistantHistoryState(value: unknown): value is AssistantHistoryState {
  if (typeof value !== 'object' || value === null) return false
  const state = value as Record<string, unknown>
  return (
    state.version === 1 &&
    Array.isArray(state.messages) &&
    state.messages.every(isAssistantMessage)
  )
}

// --- Persistence -------------------------------------------------------------

// Keeps the newest messages and preserves their order.
function bound(messages: readonly AssistantMessage[]): readonly AssistantMessage[] {
  return messages.length <= MAX_STORED_MESSAGES
    ? messages
    : messages.slice(messages.length - MAX_STORED_MESSAGES)
}

// Duplicate ids would break React's keys and could double-render a turn, so the
// first occurrence of each id wins.
function deduplicate(messages: readonly AssistantMessage[]): readonly AssistantMessage[] {
  const seen = new Set<string>()
  return messages.filter((message) => {
    if (seen.has(message.id)) return false
    seen.add(message.id)
    return true
  })
}

export function loadAssistantHistory(): AssistantHistoryState {
  if (typeof window === 'undefined') return createInitialAssistantHistory()

  try {
    const raw = window.localStorage.getItem(scopedStorageKey())
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (isAssistantHistoryState(parsed)) {
        const messages = bound(deduplicate(parsed.messages))
        // An empty stored transcript is still a valid one; it just gets the
        // opening message back rather than rendering nothing.
        return messages.length ? { version: 1, messages } : createInitialAssistantHistory()
      }
    }
  } catch {
    // Unreadable or malformed history falls back to a clean conversation. Nothing
    // else is touched: Finance, Planning, and settings live under their own keys.
  }

  return createInitialAssistantHistory()
}

export function saveAssistantHistory(state: AssistantHistoryState): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(scopedStorageKey(), JSON.stringify(state))
  } catch {
    // The conversation stays usable in memory when storage is full or blocked.
  }
}

export function appendAssistantMessages(
  state: AssistantHistoryState,
  incoming: readonly AssistantMessage[],
): AssistantHistoryState {
  const messages = bound(deduplicate([...state.messages, ...incoming]))
  return { version: 1, messages }
}

// Removes the conversation only. The financial storage keys are never named here,
// so no amount of clearing can reach a transaction, an account, or a backup.
export function clearStoredAssistantHistory(): AssistantHistoryState {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(scopedStorageKey())
    } catch {
      // Nothing further to do: the fresh state below is still published.
    }
  }
  return createInitialAssistantHistory()
}

// The status line the page shows describes the most recent answer, so it is
// recovered from the transcript instead of being kept in volatile state.
export function getLatestStatusNote(messages: readonly AssistantMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'assistant' && message.statusNote) return message.statusNote
  }
  return ''
}
