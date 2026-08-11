/**
 * The response adapter: the smallest layer that turns a completed turn into the
 * envelope the client already understands.
 *
 * It reads the payload and nothing else. It never infers what the user meant,
 * never authors a financial figure, and never rejects a safe answer because an
 * optional display field was malformed. Authoritative rows come from validated
 * read-tool results; proposal cards come from validated proposal-tool results.
 */

import type { CompanionFailureReason } from './companionLoop.ts'
import { cleanText, record } from './companionTools.ts'

/** Upper bound on rows in one display card. */
export const MAX_CARD_ROWS = 10

export type SafeFailureCode =
  | 'invalid-envelope'
  | 'malformed-result'
  | 'provider-timeout'
  | 'provider-unavailable'
  | 'provider-rejected'
  | 'auth-failed'
  | 'rate-limited'
  | 'request-invalid'
  | 'serialization-failed'
  | 'edge-unhandled-failure'
  | 'runtime-disabled'

export type SafeFailureStage =
  | 'edge-request'
  | 'edge-auth'
  | 'edge-usage'
  | 'edge-context'
  | 'edge-routing'
  | 'provider-round'
  | 'edge-normalization'
  | 'edge-serialization'
  | 'unknown'

/** The client's response kinds. Chosen by payload shape, never by intent. */
export type CompanionResponseKind =
  | 'conversation'
  | 'finance_list'
  | 'action_proposal'
  | 'action_batch'
  | 'memory_proposal'

export interface FinanceCardRow {
  label: string
  amount?: number
  detail?: string
}

/**
 * Structured finance rows, built only from validated read-tool results.
 *
 * Every label and amount here comes from the app's own records, never from
 * model-authored text. The card is optional display metadata: when a result has
 * no list shape, the answer still stands on its own prose.
 */
export function financeItemsFromReads(
  reads: readonly { name: string; result: Record<string, unknown> }[],
): FinanceCardRow[] | undefined {
  const listKeys = ['transactions', 'receivables', 'payables', 'commitments', 'overdueItems', 'expenses', 'items', 'accounts']
  for (const read of [...reads].reverse()) {
    if (read.result.status !== 'ok') continue
    for (const key of listKeys) {
      const list = read.result[key]
      if (!Array.isArray(list) || !list.length) continue
      const rows = list.slice(0, MAX_CARD_ROWS).flatMap((candidate) => {
        const item = record(candidate)
        const label = cleanText(item.label ?? item.title ?? item.name, 100)
        if (!label) return []
        const amount = typeof item.amount === 'number' && Number.isFinite(item.amount)
          ? item.amount
          : typeof item.balance === 'number' && Number.isFinite(item.balance)
            ? item.balance
            : undefined
        const detail = cleanText(item.dueDate ?? item.date ?? item.type ?? item.status, 120)
        return [{
          label,
          ...(amount === undefined ? {} : { amount }),
          ...(detail ? { detail } : {}),
        }]
      })
      if (rows.length) return rows
    }
  }
  return undefined
}

/**
 * Response kind for the client contract.
 *
 * It follows the payload, never an inference about what the user "meant" —
 * advice that happened to read a balance stays conversation, and a compound
 * turn that both read and proposed is a proposal carrying its read card.
 */
export function responseKind(actionCount: number, hasMemory: boolean, hasCard: boolean): CompanionResponseKind {
  if (actionCount === 1) return 'action_proposal'
  if (actionCount > 1) return 'action_batch'
  if (hasMemory) return 'memory_proposal'
  return hasCard ? 'finance_list' : 'conversation'
}

/**
 * One honest, bounded reply when the provider could not complete the turn.
 *
 * It states the limitation and nothing else: no invented figure, no fabricated
 * success, and no locally guessed answer to the question that was asked.
 */
export function honestFallbackText(reason: CompanionFailureReason): string {
  return reason === 'timeout'
    ? 'That took longer than I can wait for. Please ask me again in a moment.'
    : 'I could not reach my reasoning service just now, so I would rather not guess. Please try again in a moment.'
}

export function failureCodeFor(reason: CompanionFailureReason): SafeFailureCode {
  if (reason === 'timeout') return 'provider-timeout'
  if (reason === 'rejected') return 'provider-rejected'
  if (reason === 'malformed' || reason === 'round-ceiling') return 'malformed-result'
  return 'provider-unavailable'
}

/**
 * A provider error code/message, stripped to a shape that cannot carry a secret.
 *
 * Only the error's own code and a bounded message survive, and any token-like
 * run inside that message is replaced rather than trusted: an upstream error
 * string is not a controlled value and may echo part of the request.
 */
export function sanitiseProviderError(payload: string): { providerCode?: string; providerMessage?: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return {}
  }
  const error = record(record(parsed).error)
  const providerCode = cleanText(error.code ?? error.type, 60).replaceAll(/[^a-zA-Z0-9_.-]/gu, '')
  const providerMessage = cleanText(error.message, 200)
    .replaceAll(/\b[A-Za-z0-9_-]{20,}\b/gu, '[redacted]')
    .slice(0, 160)
  return {
    ...(providerCode ? { providerCode } : {}),
    ...(providerMessage ? { providerMessage } : {}),
  }
}
