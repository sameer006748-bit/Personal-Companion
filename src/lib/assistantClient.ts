// Client half of the real assistant.
//
// Design rule: every number shown to the user is computed locally by
// assistantEngine. The remote model only rephrases the narrative sentence, so a
// provider outage, a bad response, or a prompt-injection attempt can change the
// wording but can never change a figure, and the app still answers when offline.
//
// Data minimisation: no transaction, account, counterparty, shop, note, title, or
// date ever leaves the device. Only intent-scoped aggregate numbers are sent, and
// the Edge Function reduces even those to the words positive, negative, or zero
// before they reach the provider.

import { classifyAssistantIntent, generateAssistantResponse } from './assistantEngine'
import {
  getAssistantAttentionItems,
  getLargestExpenseDrivers,
  getMonthlyExpenses,
  getMonthlyIncome,
  getNetMonthlyPosition,
  getNetOutstandingPosition,
  getOutstandingPayableItems,
  getOutstandingPlanningPayables,
  getOutstandingPlanningReceivables,
  getOutstandingReceivableItems,
  getSafeToSpend,
  getTotalAvailable,
} from './financeSelectors'
import { getCloudConfiguration, supabase } from './supabase'
import type { AssistantIntent, AssistantResponse } from '../models/assistant'
import type { PersonalFinanceData } from '../models/finance'

const FUNCTION_NAME = 'personal-finance-assistant'
const REQUEST_TIMEOUT_MS = 12000
const CONSENT_KEY = 'personal-companion-ai-consent'

export type AssistantSource = 'ai' | 'local'

export type AssistantFallbackReason =
  | 'opted-out'
  | 'not-configured'
  | 'signed-out'
  | 'offline'
  | 'rate-limited'
  | 'unavailable'
  | 'invalid-response'

export interface AssistantOutcome {
  response: AssistantResponse
  source: AssistantSource
  reason?: AssistantFallbackReason
}

// --- Consent -----------------------------------------------------------------
// Opt-in is per device and defaults to off: sending anything to a third party is
// never the result of inaction.

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
    // Without storage the assistant simply stays local-only.
  }
}

// Shown next to the opt-in so the user can see exactly what would be sent.
export const AI_DATA_DISCLOSURE: readonly string[] = [
  'Your typed question.',
  'Whether a small number of totals are positive, negative, or zero.',
  'Nothing else: no amounts, account names, people, shops, notes, or dates are sent.',
]

// --- Minimal retrieval -------------------------------------------------------

interface RetrievedContext {
  figures: Record<string, number>
  counts: Record<string, number>
}

// Only the aggregates the answer actually depends on are gathered, so an unknown
// or unrelated question sends almost nothing.
export function retrieveMinimalContext(
  intent: AssistantIntent,
  data: PersonalFinanceData,
): RetrievedContext {
  const figures: Record<string, number> = {}
  const counts: Record<string, number> = {}

  if (intent === 'monthly-summary') {
    figures.moneyIn = getMonthlyIncome(data)
    figures.moneyOut = getMonthlyExpenses(data)
    figures.netMonthly = getNetMonthlyPosition(data)
  }

  if (intent === 'safe-to-spend') {
    figures.safeToSpend = getSafeToSpend(data)
  }

  if (intent === 'available-balance') {
    figures.available = getTotalAvailable(data)
    counts.accounts = data.accounts.length
  }

  if (intent === 'receivables') {
    const items = getOutstandingReceivableItems(data)
    figures.receivables = getOutstandingPlanningReceivables(data)
    counts.receivables = items.length
    counts.overdueReceivables = items.filter((item) => item.status === 'overdue').length
  }

  if (intent === 'payables') {
    const items = getOutstandingPayableItems(data)
    figures.payables = getOutstandingPlanningPayables(data)
    counts.payables = items.length
    counts.overduePayables = items.filter((item) => item.status === 'overdue').length
  }

  if (intent === 'attention-items') {
    counts.attentionItems = getAssistantAttentionItems(data).length
  }

  if (intent === 'expense-explanation') {
    // Only how many drivers there were. Their labels are transaction titles such as
    // a shop or person's name, so they stay on the device and are shown in the
    // locally rendered insight instead.
    figures.monthlyExpenses = getMonthlyExpenses(data)
    counts.expenseDrivers = getLargestExpenseDrivers(data).length
  }

  if (intent === 'financial-position') {
    figures.available = getTotalAvailable(data)
    figures.safeToSpend = getSafeToSpend(data)
    figures.netMonthly = getNetMonthlyPosition(data)
    figures.receivables = getOutstandingPlanningReceivables(data)
    figures.payables = getOutstandingPlanningPayables(data)
    figures.netOutstanding = getNetOutstandingPosition(data)
  }

  return { figures, counts }
}

// --- Response contract -------------------------------------------------------

interface AiEnvelope {
  version: 1
  text: string
  followUpIds?: readonly string[]
}

// The same contract the Edge Function enforces is re-checked here, because a
// client must never trust a remote response it renders.
export function validateAiEnvelope(value: unknown, allowedIds: readonly string[]): AiEnvelope | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const candidate = value as Record<string, unknown>
  if (candidate.version !== 1) return undefined
  if (typeof candidate.text !== 'string') return undefined

  const text = candidate.text.replaceAll(/\s+/gu, ' ').trim()
  if (text.length < 8 || text.length > 600) return undefined
  // Numbers are rendered from local data only, so any digit means the response
  // is off-contract and is discarded.
  if (/\d/u.test(text)) return undefined
  if (/https?:\/\//iu.test(text)) return undefined

  const allowed = new Set(allowedIds)
  const rawIds = Array.isArray(candidate.followUpIds) ? candidate.followUpIds : []
  const followUpIds = rawIds
    .filter((id): id is string => typeof id === 'string' && allowed.has(id))
    .slice(0, 3)

  return { version: 1, text, ...(followUpIds.length ? { followUpIds } : {}) }
}

// --- Request -----------------------------------------------------------------

export async function askAssistant(
  question: string,
  data: PersonalFinanceData,
  currency: string,
): Promise<AssistantOutcome> {
  const intent = classifyAssistantIntent(question)
  // The deterministic answer is produced first and always: it is the fallback and
  // the source of every figure and insight the user sees.
  const local = generateAssistantResponse(question, data)

  const fallback = (reason: AssistantFallbackReason): AssistantOutcome => ({
    response: local,
    source: 'local',
    reason,
  })

  if (!isAiAssistantEnabled()) return fallback('opted-out')
  if (!supabase || getCloudConfiguration().state !== 'configured') return fallback('not-configured')
  if (typeof navigator !== 'undefined' && !navigator.onLine) return fallback('offline')

  const { data: sessionData } = await supabase.auth.getSession()
  const session = sessionData.session
  if (!session) return fallback('signed-out')

  const allowedIds = (local.followUps ?? []).map((followUp) => followUp.id)
  const context = retrieveMinimalContext(intent, data)

  try {
    // A slow provider must never leave the user without an answer, so the request
    // races a timeout and the local response wins if the model is late.
    const invocation = supabase.functions.invoke<unknown>(FUNCTION_NAME, {
      body: {
        question,
        intent,
        currency,
        figures: context.figures,
        counts: context.counts,
        allowedFollowUpIds: allowedIds,
      },
    })
    const timeout = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), REQUEST_TIMEOUT_MS),
    )
    const settled = await Promise.race([invocation, timeout])
    if (settled === 'timeout') return fallback('unavailable')

    const payload: unknown = settled.data
    const invokeError: unknown = settled.error

    if (invokeError) {
      // A 429 is the server's rate limit, which is worth naming to the user; every
      // other failure is reported generically.
      const status = (invokeError as { context?: { status?: number } }).context?.status
      return fallback(status === 429 ? 'rate-limited' : 'unavailable')
    }

    const envelope = validateAiEnvelope(payload, allowedIds)
    if (!envelope) return fallback('invalid-response')

    const followUps = envelope.followUpIds
      ? (local.followUps ?? []).filter((followUp) => envelope.followUpIds?.includes(followUp.id))
      : local.followUps

    // Only the sentence is replaced. The insight card stays exactly as computed.
    return {
      response: {
        ...local,
        text: envelope.text,
        ...(followUps?.length ? { followUps } : {}),
      },
      source: 'ai',
    }
  } catch {
    return fallback('unavailable')
  }
}

export const ASSISTANT_FALLBACK_MESSAGES: Readonly<Record<AssistantFallbackReason, string>> = {
  'opted-out': 'Answered on this device',
  'not-configured': 'Answered on this device',
  'signed-out': 'Answered on this device. Sign in to use the AI assistant.',
  offline: 'Answered on this device while offline',
  'rate-limited': 'AI limit reached. Answered on this device.',
  unavailable: 'AI unavailable. Answered on this device.',
  'invalid-response': 'AI response was rejected. Answered on this device.',
}
