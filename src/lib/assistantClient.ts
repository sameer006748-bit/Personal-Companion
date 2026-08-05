import { getCloudConfiguration, supabase } from './supabase'
import type {
  AssistantActionDraft,
  AssistantMemoryDraft,
  AssistantMemoryCategory,
  AssistantInsight,
  AssistantProviderEnvelope,
  AssistantProviderRequest,
  AssistantResponse,
  AssistantFailureCode,
  AssistantFailureStage,
  AssistantSafeDiagnostic,
  AssistantPerformanceMetadata,
} from '../models/assistant'

const FUNCTION_NAME = 'personal-finance-assistant'
// The Edge Function bounds the provider work of a whole turn to 25s and needs a
// few seconds either side for auth, the usage check, and the round trip. The
// previous 30s budget could abort a turn the function was still finishing, which
// surfaced as a timeout on ordinary conversation. The client now always outlives
// the server budget, so a timeout here means the network rather than the model.
export const REQUEST_TIMEOUT_MS = 35_000
const CONSENT_KEY = 'personal-companion-ai-consent'

export type AssistantSource = 'ai' | 'local'

export type AssistantFallbackReason =
  | 'opted-out'
  | 'not-configured'
  | 'signed-out'
  | 'offline'
  | 'rate-limited'
  | 'timed-out'
  | 'network'
  | 'service-not-configured'
  | 'usage-unavailable'
  | 'provider-timeout'
  | 'provider-unreachable'
  | 'provider-rejected'
  | 'unavailable'
  | 'invalid-response'
  // The turn reached the model and came back understood, but no confirmable
  // action could be built from it. Distinct from an unreachable service because
  // telling the user the AI is down would simply be untrue.
  | 'action-not-prepared'

export interface AssistantOutcome {
  response: AssistantResponse
  source: AssistantSource
  reason?: AssistantFallbackReason
  actionProposal?: AssistantActionDraft
  /** Two to five drafts requested in one message, to be previewed as one batch. */
  actionDrafts?: readonly AssistantActionDraft[]
  memoryProposal?: AssistantMemoryDraft
  modelTier?: 'flash' | 'pro'
  diagnostic?: AssistantSafeDiagnostic
  timingsMs?: Readonly<Record<string, number>>
  performance?: AssistantPerformanceMetadata
}

export function isAiAssistantEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(CONSENT_KEY) === 'granted'
}

export function setAiAssistantEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (enabled) window.localStorage.setItem(CONSENT_KEY, 'granted')
    else window.localStorage.removeItem(CONSENT_KEY)
  } catch {
    // Without storage the assistant safely stays local-only.
  }
}

export const AI_DATA_DISCLOSURE: readonly string[] = [
  'Your current message and up to 10 recent visible messages.',
  'Your compact preferences and up to 5 approved relevant memories.',
  'Only bounded financial facts returned by safe read tools when they are needed.',
  'No API keys, auth tokens, deleted memories, raw storage, or automatic financial writes.',
]

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

// The allow-list is the contract boundary: an action type the app cannot
// execute is rejected here rather than surfaced as a preview the user could
// confirm into nothing.
function isActionDraft(value: unknown): value is AssistantActionDraft {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  const actions = new Set([
    'add-income', 'add-expense', 'transfer', 'account-adjustment',
    'receive-receivable', 'pay-payable', 'add-commitment',
    'add-receivable', 'add-payable', 'settle-commitment',
    'create-account', 'update-account', 'archive-account', 'restore-account', 'set-default-account',
    'update-transaction', 'delete-transaction', 'update-receivable', 'delete-receivable',
    'update-payable', 'delete-payable', 'update-commitment', 'archive-commitment',
    'restore-commitment', 'delete-commitment', 'update-preference',
  ])
  const frequencies = new Set(['weekly', 'monthly', 'quarterly', 'yearly', 'one-time'])
  const needsCounterparty = item.actionType === 'add-receivable' || item.actionType === 'add-payable'
  return actions.has(item.actionType as string) &&
    typeof item.amountPkr === 'number' && Number.isSafeInteger(item.amountPkr) &&
    typeof item.description === 'string' && item.description.length <= 120 &&
    typeof item.effectiveDate === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(item.effectiveDate) &&
    typeof item.summary === 'string' && item.summary.length <= 240 &&
    isOptionalString(item.targetAccountId) && isOptionalString(item.sourceAccountId) &&
    isOptionalString(item.recordId) &&
    (typeof item.counterparty === 'string' ? item.counterparty.length <= 60 : item.counterparty === undefined) &&
    isOptionalString(item.accountName) && isOptionalString(item.accountType) &&
    (item.openingBalance === undefined || (typeof item.openingBalance === 'number' && Number.isSafeInteger(item.openingBalance))) &&
    (item.settledAmount === undefined || (typeof item.settledAmount === 'number' && Number.isSafeInteger(item.settledAmount))) &&
    isOptionalString(item.institutionName) && isOptionalString(item.lastFourDigits) &&
    (item.makeDefault === undefined || typeof item.makeDefault === 'boolean') &&
    isOptionalString(item.transactionType) && isOptionalString(item.categoryId) &&
    isOptionalString(item.personOrBusiness) && isOptionalString(item.note) &&
    isOptionalString(item.preferenceKey) &&
    (item.preferenceValue === undefined || typeof item.preferenceValue === 'string' || typeof item.preferenceValue === 'boolean') &&
    (!needsCounterparty || (typeof item.counterparty === 'string' && item.counterparty.trim().length > 0)) &&
    (item.commitmentFrequency === undefined || frequencies.has(item.commitmentFrequency as string))
}

function isMemoryCategory(value: unknown): value is AssistantMemoryCategory {
  return value === 'communication_preference' || value === 'financial_goal' ||
    value === 'person_alias' || value === 'account_preference' ||
    value === 'routine_preference' || value === 'app_preference' ||
    value === 'user_defined_fact'
}

function isMemoryDraft(value: unknown): value is AssistantMemoryDraft {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return isMemoryCategory(item.category) &&
    typeof item.summary === 'string' && item.summary.length <= 180 &&
    typeof item.normalizedValue === 'string' && item.normalizedValue.length <= 120 &&
    typeof item.displayLabel === 'string' && item.displayLabel.length <= 80 &&
    typeof item.reason === 'string' && item.reason.length <= 160 &&
    (item.sensitivity === undefined || item.sensitivity === 'normal' || item.sensitivity === 'sensitive') &&
    (item.retention === undefined || item.retention === 'short' || item.retention === 'long' || item.retention === 'permanent')
}

function isInsightTone(value: unknown): boolean {
  return value === undefined || value === 'default' || value === 'positive' ||
    value === 'negative' || value === 'attention'
}

function isFinanceCard(value: unknown): value is AssistantInsight {
  if (!value || typeof value !== 'object') return false
  const card = value as Record<string, unknown>
  if (typeof card.title !== 'string' || card.title.trim().length < 1 || card.title.length > 100) return false
  if (card.metrics !== undefined) {
    if (!Array.isArray(card.metrics) || card.metrics.length > 8 || !card.metrics.every((candidate) => {
      if (!candidate || typeof candidate !== 'object') return false
      const metric = candidate as Record<string, unknown>
      return typeof metric.label === 'string' && metric.label.length <= 80 &&
        typeof metric.amount === 'number' && Number.isFinite(metric.amount) &&
        isOptionalString(metric.sign) && isInsightTone(metric.tone)
    })) return false
  }
  if (card.rows !== undefined) {
    if (!Array.isArray(card.rows) || card.rows.length > 10 || !card.rows.every((candidate) => {
      if (!candidate || typeof candidate !== 'object') return false
      const row = candidate as Record<string, unknown>
      return typeof row.label === 'string' && row.label.length <= 100 &&
        isOptionalString(row.detail) &&
        (row.amount === undefined || (typeof row.amount === 'number' && Number.isFinite(row.amount))) &&
        isInsightTone(row.tone)
    })) return false
  }
  return true
}

type EnvelopeNormalization = { ok: true; envelope: AssistantProviderEnvelope } | { ok: false; code: AssistantFailureCode; responseKind?: string }

// A batch carries 2..5 drafts and is all-or-nothing: one unusable child rejects
// the whole envelope rather than silently shrinking the plan, which is exactly
// the failure this contract exists to prevent.
function actionBatchDrafts(value: unknown): readonly AssistantActionDraft[] | undefined {
  if (!Array.isArray(value) || value.length < 2 || value.length > 5) return undefined
  if (!value.every((candidate) => isActionDraft(candidate))) return undefined
  const drafts = value
  // Two identical children are a provider repetition, not two real actions.
  const signatures = new Set(drafts.map((draft) => [draft.actionType, draft.amountPkr, draft.effectiveDate, draft.sourceAccountId ?? '', draft.targetAccountId ?? '', draft.recordId ?? '', draft.description].join('|')))
  return signatures.size === drafts.length ? drafts : undefined
}

function financeItemsCard(value: unknown): AssistantInsight | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) return undefined
  const rows = value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return []
    const item = candidate as Record<string, unknown>
    if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 100) return []
    if (item.amount !== undefined && (typeof item.amount !== 'number' || !Number.isFinite(item.amount))) return []
    if (item.detail !== undefined && (typeof item.detail !== 'string' || item.detail.length > 120)) return []
    return [{ label: item.label.trim(), ...(typeof item.detail === 'string' ? { detail: item.detail.trim() } : {}), ...(typeof item.amount === 'number' ? { amount: item.amount } : {}) }]
  })
  if (rows.length !== value.length) return undefined
  return { title: 'Current records', rows }
}

export function normalizeAiEnvelope(value: unknown): EnvelopeNormalization {
  if (!value || typeof value !== 'object') return { ok: false, code: 'invalid-envelope' }
  const item = value as Record<string, unknown>
  if (item.version !== 2 || typeof item.text !== 'string') return { ok: false, code: 'invalid-envelope' }
  const rawKind = item.kind
  const kind = rawKind === 'finance' ? 'finance_summary' : rawKind
  if (kind !== 'conversation' && kind !== 'advice' && kind !== 'clarification' &&
      kind !== 'finance_summary' && kind !== 'finance_list' && kind !== 'finance_detail' &&
      kind !== 'action_proposal' && kind !== 'action_batch' && kind !== 'memory_proposal' && kind !== 'local_fallback') {
    return { ok: false, code: 'unsupported-kind', ...(typeof rawKind === 'string' ? { responseKind: rawKind } : {}) }
  }
  const text = item.text.replaceAll(/\s+/gu, ' ').trim()
  if (text.length < 2 || text.length > 1_200 || /https?:\/\/|<[a-z/]|```/iu.test(text)) return { ok: false, code: 'malformed-result', responseKind: kind }

  const followUps = Array.isArray(item.followUps)
    ? item.followUps
      .filter((candidate): candidate is { id: string; label: string } => {
        if (!candidate || typeof candidate !== 'object') return false
        const followUp = candidate as Record<string, unknown>
        return typeof followUp.id === 'string' && /^[a-z0-9-]{1,80}$/u.test(followUp.id) &&
          typeof followUp.label === 'string' && followUp.label.trim().length >= 2 && followUp.label.length <= 80
      })
      .slice(0, 3)
      .map((followUp) => ({ id: followUp.id, label: followUp.label.trim() }))
    : []

  const modelTier: 'flash' | 'pro' | undefined = item.modelTier === 'pro'
    ? 'pro'
    : item.modelTier === 'flash'
      ? 'flash'
      : undefined
  const base = { version: 2 as const, text, ...(followUps.length ? { followUps } : {}), ...(modelTier ? { modelTier } : {}) }
  if (kind === 'action_proposal') {
    if (!isActionDraft(item.actionProposal) || item.actionBatch !== undefined || item.memoryProposal !== undefined || item.financeCard !== undefined) return { ok: false, code: 'proposal-invalid', responseKind: kind }
    return { ok: true, envelope: { ...base, kind, actionProposal: item.actionProposal } }
  }
  if (kind === 'action_batch') {
    if (item.actionProposal !== undefined || item.memoryProposal !== undefined || item.financeCard !== undefined) return { ok: false, code: 'batch-invalid', responseKind: kind }
    const batch = item.actionBatch
    if (!batch || typeof batch !== 'object') return { ok: false, code: 'batch-invalid', responseKind: kind }
    const actions = actionBatchDrafts((batch as Record<string, unknown>).actions)
    if (!actions) return { ok: false, code: 'batch-invalid', responseKind: kind }
    // A declared count that disagrees with the delivered children means an
    // action went missing on the way here.
    const declared = (batch as Record<string, unknown>).actionCount
    if (typeof declared !== 'number' || declared !== actions.length) return { ok: false, code: 'action-count-mismatch', responseKind: kind }
    return { ok: true, envelope: { ...base, kind, actionBatch: { actionCount: actions.length, actions } } }
  }
  if (kind === 'memory_proposal') {
    if (!isMemoryDraft(item.memoryProposal) || item.actionProposal !== undefined || item.actionBatch !== undefined || item.financeCard !== undefined) return { ok: false, code: 'malformed-result', responseKind: kind }
    return { ok: true, envelope: { ...base, kind, memoryProposal: item.memoryProposal } }
  }
  if (kind === 'finance_summary' || kind === 'finance_list' || kind === 'finance_detail') {
    if (item.actionProposal !== undefined || item.actionBatch !== undefined || item.memoryProposal !== undefined) return { ok: false, code: 'malformed-result', responseKind: kind }
    const listCard = item.financeItems === undefined ? undefined : financeItemsCard(item.financeItems)
    if (item.financeItems !== undefined && !listCard) return { ok: false, code: 'tool-result-invalid', responseKind: kind }
    if (item.financeCard !== undefined && !isFinanceCard(item.financeCard)) return { ok: false, code: 'tool-result-invalid', responseKind: kind }
    const financeCard = item.financeCard ?? listCard
    return { ok: true, envelope: { ...base, kind, ...(financeCard ? { financeCard } : {}) } }
  }
  if (item.actionProposal !== undefined || item.actionBatch !== undefined || item.memoryProposal !== undefined || item.financeCard !== undefined || item.financeItems !== undefined) return { ok: false, code: 'malformed-result', responseKind: kind }
  return { ok: true, envelope: { ...base, kind } }
}

export function validateAiEnvelope(value: unknown): AssistantProviderEnvelope | undefined {
  const normalized = normalizeAiEnvelope(value)
  return normalized.ok ? normalized.envelope : undefined
}

// Failures where the turn genuinely completed but produced no confirmable
// action. Reporting these as an unreachable service is what previously made the
// app claim the AI was down when it had in fact answered.
const ACTION_NOT_PREPARED_CODES: ReadonlySet<string> = new Set([
  'proposal-payload-missing',
  'narrated-proposal-without-draft',
  'partial-action-plan',
  'action-count-mismatch',
  'action-limit-exceeded',
  'batch-invalid',
])

export function classifyFunctionError(
  status: number | undefined,
  code: string | undefined,
  reason: string | undefined,
): AssistantFallbackReason {
  if (status === 401 || status === 403) return 'signed-out'
  if (status === 429) return 'rate-limited'
  if (code === 'not-configured' || code === 'provider-not-configured') return 'service-not-configured'
  if (code === 'usage-unavailable') return 'usage-unavailable'
  if (code === 'invalid-request' || code === 'request-invalid' || code === 'method-not-allowed') return 'invalid-response'
  if (code === 'invalid-model-response' || code === 'invalid-envelope') return 'invalid-response'
  if (code === 'rate-limited') return 'rate-limited'
  if (code && ACTION_NOT_PREPARED_CODES.has(code)) return 'action-not-prepared'
  if (code === 'turn-deadline-exceeded' || code === 'provider-timeout') return 'provider-timeout'
  if (code === 'provider-rejected') return 'provider-rejected'
  if (code === 'malformed-result' || code === 'tool-result-invalid' || code === 'unsupported-kind' ||
      code === 'final-number-invalid' || code === 'stale-conversation-number' ||
      code === 'serialization-failed') return 'invalid-response'
  if (code === 'provider-unavailable' || code === 'edge-unhandled-failure' || code === 'unknown-safe-failure') {
    if (reason === 'timeout') return 'provider-timeout'
    if (reason === 'unreachable') return 'provider-unreachable'
    if (reason === 'rejected') return 'provider-rejected'
    if (reason === 'malformed') return 'invalid-response'
  }
  return 'unavailable'
}

/**
 * A safe failure envelope returned with HTTP 200. The Edge Function answers this
 * way for every expected failure so the diagnostic survives; supabase-js turns a
 * non-2xx into a transport error and discards the body.
 */
function safeFailureEnvelope(value: unknown): { code: string; reason?: string; diagnostic?: AssistantSafeDiagnostic } | undefined {
  if (!value || typeof value !== 'object') return undefined
  const item = value as Record<string, unknown>
  if (typeof item.error !== 'string' || item.error.length > 40) return undefined
  // A success envelope never carries `error`, so its presence is unambiguous.
  const reason = typeof item.reason === 'string' && item.reason.length <= 40 ? item.reason : undefined
  const parsed = safeDiagnostic(item.diagnostic)
  return { code: item.error, ...(reason ? { reason } : {}), ...(parsed ? { diagnostic: parsed } : {}) }
}

async function readFunctionErrorCodes(
  error: unknown,
): Promise<{ status?: number; code?: string; reason?: string; diagnostic?: AssistantSafeDiagnostic }> {
  const context = (error as { context?: unknown }).context
  if (!(context instanceof Response)) return {}
  const status = context.status
  try {
    const body: unknown = await context.clone().json()
    if (!body || typeof body !== 'object') return { status }
    const record = body as Record<string, unknown>
    const code = typeof record.error === 'string' && record.error.length <= 40 ? record.error : undefined
    const reason = typeof record.reason === 'string' && record.reason.length <= 40 ? record.reason : undefined
    const diagnostic = safeDiagnostic(record.diagnostic)
    return { status, ...(code ? { code } : {}), ...(reason ? { reason } : {}), ...(diagnostic ? { diagnostic } : {}) }
  } catch {
    return { status }
  }
}

const FAILURE_CODES = new Set<AssistantFailureCode>([
  'invalid-response', 'invalid-envelope', 'malformed-result', 'unsupported-kind', 'unsupported-action',
  'tool-result-invalid', 'final-number-invalid', 'stale-conversation-number', 'proposal-invalid',
  'proposal-payload-missing', 'narrated-proposal-without-draft', 'partial-action-plan',
  'action-count-mismatch', 'action-limit-exceeded', 'batch-invalid', 'local-record-not-found',
  'request-invalid', 'provider-timeout', 'provider-unavailable', 'provider-rejected', 'auth-failed',
  'rate-limited', 'turn-deadline-exceeded', 'serialization-failed', 'edge-unhandled-failure',
  'unknown-safe-failure',
])
const FAILURE_STAGES = new Set<AssistantFailureStage>([
  'client-context', 'client-fetch', 'client-normalization',
  'edge-request', 'edge-auth', 'edge-usage', 'edge-context', 'edge-routing',
  'provider-round', 'tool-execution', 'edge-normalization', 'edge-serialization',
  'local-proposal-validation', 'local-batch-validation', 'unknown',
])

function safeDiagnostic(value: unknown): AssistantSafeDiagnostic | undefined {
  if (!value || typeof value !== 'object') return undefined
  const item = value as Record<string, unknown>
  if (!FAILURE_CODES.has(item.code as AssistantFailureCode) || !FAILURE_STAGES.has(item.stage as AssistantFailureStage)) return undefined
  const timingsMs = item.timingsMs && typeof item.timingsMs === 'object' && !Array.isArray(item.timingsMs)
    ? Object.fromEntries(Object.entries(item.timingsMs as Record<string, unknown>).filter(([key, timing]) => /^[a-z-]{1,40}$/u.test(key) && typeof timing === 'number' && Number.isFinite(timing) && timing >= 0).slice(0, 20)) as Record<string, number>
    : undefined
  return {
    code: item.code as AssistantFailureCode,
    stage: item.stage as AssistantFailureStage,
    ...(typeof item.responseKind === 'string' && item.responseKind.length <= 40 ? { responseKind: item.responseKind } : {}),
    ...(typeof item.toolName === 'string' && item.toolName.length <= 80 ? { toolName: item.toolName } : {}),
    ...(typeof item.roundCount === 'number' && Number.isSafeInteger(item.roundCount) ? { roundCount: item.roundCount } : {}),
    ...(typeof item.toolsExposed === 'number' && Number.isSafeInteger(item.toolsExposed) ? { toolsExposed: item.toolsExposed } : {}),
    ...(typeof item.toolsCalled === 'number' && Number.isSafeInteger(item.toolsCalled) ? { toolsCalled: item.toolsCalled } : {}),
    ...(typeof item.proposalCount === 'number' && Number.isSafeInteger(item.proposalCount) ? { proposalCount: item.proposalCount } : {}),
    ...(typeof item.proposalDraftsPresent === 'boolean' ? { proposalDraftsPresent: item.proposalDraftsPresent } : {}),
    ...(typeof item.serializationCompleted === 'boolean' ? { serializationCompleted: item.serializationCompleted } : {}),
    ...(timingsMs ? { timingsMs } : {}),
  }
}

function diagnostic(code: AssistantFailureCode, stage: AssistantFailureStage, details: Partial<AssistantSafeDiagnostic> = {}): AssistantSafeDiagnostic {
  return { code, stage, ...details }
}

function safeTelemetry(value: unknown): { timingsMs?: Record<string, number>; roundCount?: number; toolsExposed?: number; toolsCalled?: number } {
  if (!value || typeof value !== 'object') return {}
  const item = value as Record<string, unknown>
  const timingsMs = item.timingsMs && typeof item.timingsMs === 'object' && !Array.isArray(item.timingsMs)
    ? Object.fromEntries(Object.entries(item.timingsMs as Record<string, unknown>).filter(([key, timing]) => /^[a-z-]{1,40}$/u.test(key) && typeof timing === 'number' && Number.isFinite(timing) && timing >= 0).slice(0, 20)) as Record<string, number>
    : undefined
  return {
    ...(timingsMs ? { timingsMs } : {}),
    ...(typeof item.roundCount === 'number' && Number.isSafeInteger(item.roundCount) ? { roundCount: item.roundCount } : {}),
    ...(typeof item.toolsExposed === 'number' && Number.isSafeInteger(item.toolsExposed) ? { toolsExposed: item.toolsExposed } : {}),
    ...(typeof item.toolsCalled === 'number' && Number.isSafeInteger(item.toolsCalled) ? { toolsCalled: item.toolsCalled } : {}),
  }
}

export async function askAssistant(
  request: AssistantProviderRequest,
  localFallback: AssistantResponse,
): Promise<AssistantOutcome> {
  const startedAt = performance.now()
  const fallback = (reason: AssistantFallbackReason, details?: AssistantSafeDiagnostic): AssistantOutcome => {
    return {
      response: localFallback,
      source: 'local',
      reason,
      ...(details ? { diagnostic: details } : {}),
      timingsMs: { total: Math.round(performance.now() - startedAt) },
    }
  }

  if (!isAiAssistantEnabled()) return fallback('opted-out')
  if (!supabase || getCloudConfiguration().state !== 'configured') return fallback('not-configured')
  if (typeof navigator !== 'undefined' && !navigator.onLine) return fallback('offline')

  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return fallback('signed-out')

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, REQUEST_TIMEOUT_MS)

  try {
    const fetchStartedAt = performance.now()
    const settled = await supabase.functions.invoke<unknown>(FUNCTION_NAME, {
      body: request,
      signal: controller.signal,
    })
    // An abort is the terminal result for this turn. Some fetch wrappers can
    // still resolve after their signal fires; never accept that late payload.
    const fetchMs = Math.round(performance.now() - fetchStartedAt)
    if (timedOut) return fallback('timed-out', diagnostic('provider-timeout', 'client-fetch', { timingsMs: { fetch: fetchMs } }))
    if (settled.error) {
      if (timedOut) return fallback('timed-out')
      if ((settled.error as { name?: string }).name === 'FunctionsFetchError') return fallback('network')
      const { status, code, reason, diagnostic: serverDiagnostic } = await readFunctionErrorCodes(settled.error)
      const fallbackReason = classifyFunctionError(status, code, reason)
      const fallbackCode: AssistantFailureCode = status === 401 || status === 403 ? 'auth-failed' : status === 429 ? 'rate-limited' : fallbackReason === 'provider-timeout' ? 'provider-timeout' : fallbackReason === 'provider-rejected' ? 'provider-rejected' : fallbackReason === 'invalid-response' ? 'malformed-result' : 'provider-unavailable'
      return fallback(fallbackReason, serverDiagnostic ?? diagnostic(fallbackCode, 'client-fetch', { timingsMs: { fetch: fetchMs } }))
    }

    const normalizationStartedAt = performance.now()
    // A safe failure now arrives as HTTP 200 with an `error` code, so it has to
    // be recognised before envelope normalization rejects it as malformed.
    const safeFailure = safeFailureEnvelope(settled.data)
    if (safeFailure) {
      const failureReason = classifyFunctionError(undefined, safeFailure.code, safeFailure.reason)
      return fallback(failureReason, safeFailure.diagnostic ?? diagnostic('unknown-safe-failure', 'unknown', { timingsMs: { fetch: fetchMs } }))
    }
    const normalized = normalizeAiEnvelope(settled.data)
    const normalizationMs = Math.round(performance.now() - normalizationStartedAt)
    if (!normalized.ok) return fallback('invalid-response', diagnostic(normalized.code, 'client-normalization', { ...(normalized.responseKind ? { responseKind: normalized.responseKind } : {}), timingsMs: { fetch: fetchMs, normalization: normalizationMs } }))
    const envelope = normalized.envelope
    const rawTelemetry = settled.data && typeof settled.data === 'object' ? (settled.data as Record<string, unknown>).telemetry : undefined
    const telemetry = safeTelemetry(rawTelemetry)
    return {
      response: {
        intent: 'unknown',
        text: envelope.text,
        ...(envelope.followUps?.length ? { followUps: envelope.followUps } : {}),
        ...((envelope.kind === 'finance_summary' || envelope.kind === 'finance_list' || envelope.kind === 'finance_detail') && envelope.financeCard ? { insight: envelope.financeCard } : {}),
      },
      source: 'ai',
      ...(envelope.actionProposal ? { actionProposal: envelope.actionProposal } : {}),
      ...(envelope.kind === 'action_batch' ? { actionDrafts: envelope.actionBatch.actions } : {}),
      ...(envelope.memoryProposal ? { memoryProposal: envelope.memoryProposal } : {}),
      ...(envelope.modelTier ? { modelTier: envelope.modelTier } : {}),
      timingsMs: { ...telemetry.timingsMs, fetch: fetchMs, normalization: normalizationMs, total: Math.round(performance.now() - startedAt) },
      performance: {
        timingsMs: { ...telemetry.timingsMs, fetch: fetchMs, normalization: normalizationMs, total: Math.round(performance.now() - startedAt) },
        ...(telemetry.roundCount === undefined ? {} : { roundCount: telemetry.roundCount }),
        ...(telemetry.toolsExposed === undefined ? {} : { toolsExposed: telemetry.toolsExposed }),
        ...(telemetry.toolsCalled === undefined ? {} : { toolsCalled: telemetry.toolsCalled }),
      },
    }
  } catch {
    return fallback(timedOut ? 'timed-out' : 'unavailable', diagnostic(timedOut ? 'provider-timeout' : 'provider-unavailable', 'client-fetch'))
  } finally {
    clearTimeout(timer)
  }
}

export const ASSISTANT_FALLBACK_MESSAGES: Readonly<Record<AssistantFallbackReason, string>> = {
  'opted-out': 'Answered on this device',
  'not-configured': 'Answered on this device',
  'signed-out': 'Answered on this device. Sign in to use the AI companion.',
  offline: 'AI companion offline. Local answer shown.',
  'rate-limited': 'AI limit reached. Local answer shown.',
  'timed-out': 'AI took too long. Local answer shown.',
  network: 'AI companion could not be reached. Local answer shown.',
  'service-not-configured': 'AI companion is not configured. Local answer shown.',
  'usage-unavailable': 'AI usage check failed. Local answer shown.',
  'provider-timeout': 'AI service timed out. Local answer shown.',
  'provider-unreachable': 'AI service could not be reached. Local answer shown.',
  'provider-rejected': 'AI service declined the request. Local answer shown.',
  unavailable: 'AI companion unavailable. Local answer shown.',
  'invalid-response': 'AI response was rejected. Local answer shown.',
  'action-not-prepared': 'The action could not be prepared for confirmation.',
}
