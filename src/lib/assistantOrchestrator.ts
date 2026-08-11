import { ASSISTANT_FALLBACK_MESSAGES, askAssistant, type AssistantOutcome } from './assistantClient'
import {
  buildAssistantFinancialContext,
  createAssistantProposalFromDraft,
} from './assistantFinance'
import {
  createMemoryProposal,
  parseMemoryInspectionCommand,
  selectRelevantMemories,
  type AssistantMemoryState,
} from './assistantMemory'
import type {
  AssistantActionBatch,
  AssistantActionProposal,
  AssistantMessage,
  AssistantPersonalizationProfile,
  AssistantProviderRequest,
  AssistantResponse,
  AssistantTurnInput,
} from '../models/assistant'
import type { PersonalFinanceData } from '../models/finance'
import type { PlanningState } from '../models/planning'
import type { UserSettings } from '../models/settings'
import type { FinanceState } from './financeCore'
import { DEFAULT_ASSISTANT_PERSONALIZATION } from '../models/settings'
import { personaliseAssistantText } from './assistantPersonalization'
export { personaliseAssistantText } from './assistantPersonalization'

export interface AssistantOrchestratorOptions {
  input: AssistantTurnInput
  messages: readonly AssistantMessage[]
  data: PersonalFinanceData
  finance: FinanceState
  planning: PlanningState
  assistantMemory: AssistantMemoryState
  settings: UserSettings
  // Identifies the submitted turn. Every path below derives its answer id from
  // it, so a replayed or re-entered turn produces the same id and is dropped by
  // the transcript's id deduplication instead of appearing twice.
  turnId?: string
  /** Test seam for proving that a turn reaches the provider. */
  providerInvoker?: (request: AssistantProviderRequest, localFallback: AssistantResponse) => Promise<AssistantOutcome>
}

export type AssistantOrchestratorResult =
  | {
    kind: 'append'
    message: AssistantMessage
    replaceMessageId?: string
    replacementMessage?: AssistantMessage
    forgetMemoryQuery?: string
  }
  | {
    kind: 'replace'
    replaceMessageId: string
    replacementMessage: AssistantMessage
  }

function findLastPendingProposal(messages: readonly AssistantMessage[]): AssistantMessage | undefined {
  return [...messages].reverse().find(
    (message) => message.role === 'assistant' && message.proposal?.status === 'proposed',
  )
}

// A batch is a confirmable preview too, so cancellation and supersession treat
// both shapes the same way and two confirmable previews can never be live.
function findLastPendingPreview(messages: readonly AssistantMessage[]): AssistantMessage | undefined {
  return [...messages].reverse().find(
    (message) => message.role === 'assistant' &&
      (message.proposal?.status === 'proposed' || message.batch?.status === 'proposed'),
  )
}

function supersedePreview(message: AssistantMessage, text: string, note: string): AssistantMessage {
  return {
    ...message,
    text,
    ...(message.proposal ? { proposal: { ...message.proposal, status: 'superseded' as const } } : {}),
    ...(message.batch ? { batch: { ...message.batch, status: 'superseded' as const } } : {}),
    statusNote: note,
  }
}

// One answer id per turn. Exactly one of the paths below returns, so this is
// only ever used once per turn, and a repeated turn reuses the same id.
function assistantMessageId(options: AssistantOrchestratorOptions, now: number): string {
  return options.turnId
    ? `assistant-${options.turnId}`
    : `assistant-${now}-${Math.random().toString(36).slice(2, 8)}`
}

function responseProfile(options: AssistantOrchestratorOptions): AssistantPersonalizationProfile {
  if (!options.settings.assistant.personalizationEnabled) return { ...DEFAULT_ASSISTANT_PERSONALIZATION }
  const saved = options.settings.assistant.personalization
  return { ...saved, proactiveSuggestions: saved.proactiveSuggestions && options.settings.assistant.showSuggestions }
}

/**
 * The one request the Assistant sends.
 *
 * It carries the user's own message, the bounded recent transcript, their saved
 * personalization and memories, and the deterministic finance snapshot the
 * tools read from. It deliberately carries no locally chosen intent, no
 * follow-up meaning and no pre-resolved reference: understanding the message is
 * the model's work, and the app's job is to supply authoritative facts and to
 * validate whatever comes back.
 */
export function buildAssistantProviderRequest(options: AssistantOrchestratorOptions): AssistantProviderRequest {
  const financeContext = buildAssistantFinancialContext(options.data, options.finance, options.planning)
  const now = Date.now()
  const memories = selectRelevantMemories(options.assistantMemory, options.input.text, 5)
    .map(({ category, summary, normalizedValue, displayLabel }) => ({
      category,
      summary,
      normalizedValue,
      displayLabel,
    }))
  const recentMessages = options.messages
    .filter((message) => message.id !== 'assistant-introduction')
    .slice(-10)
    .map((message) => ({ role: message.role, text: message.text.slice(0, 600) }))
  const pendingProposal = findLastPendingProposal(options.messages)?.proposal

  return {
    version: 2,
    requestId: (options.turnId && /^[a-zA-Z0-9:_-]{1,100}$/u.test(options.turnId)) ? options.turnId : `turn-${now}`,
    input: options.input,
    personalization: responseProfile(options),
    memories,
    recentMessages,
    financeContext,
    ...(pendingProposal ? { pendingProposal } : {}),
  }
}

// The single honest answer for a turn that never reached the model. It states
// no financial figure, because the app has not read one for this question.
function honestProviderFallback(options: AssistantOrchestratorOptions): AssistantResponse {
  const profile = responseProfile(options)
  return {
    intent: 'unknown',
    text: profile.language === 'roman-urdu'
      ? 'AI reasoning abhi temporarily available nahi hai. Main is sawal ka andaza laga kar jawab nahi dunga.'
      : 'AI reasoning is temporarily unavailable. I will not guess an answer to this question.',
  }
}

// Listing and deleting stored memories reads and writes local data the model
// cannot see, so it stays local. Deciding what is worth remembering does not:
// that arrives as a memory proposal from the model.
function localMemoryInspection(options: AssistantOrchestratorOptions): AssistantOrchestratorResult | undefined {
  const command = parseMemoryInspectionCommand(options.input.text, options.assistantMemory)
  if (!command.text) return undefined
  const now = Date.now()
  const message: AssistantMessage = {
    id: assistantMessageId(options, now),
    role: 'assistant',
    text: command.text,
    timestamp: now,
    source: 'local',
    statusNote: command.forgetQuery ? 'Memory removed' : 'Saved memories',
  }
  return command.forgetQuery
    ? { kind: 'append', forgetMemoryQuery: command.forgetQuery, message }
    : { kind: 'append', message }
}

export function shouldHideSuggestionPanel(messages: readonly AssistantMessage[]): boolean {
  return messages.some((message) => message.role === 'user') || Boolean(findLastPendingPreview(messages))
}

// Builds one confirmable batch from the drafts the model returned in a single
// turn. Every child is re-resolved and re-validated locally exactly like a
// single proposal, and the batch is all-or-nothing: if one child cannot be
// prepared, none is previewed and the turn asks one precise question instead.
// Child ids are derived from the turn id, so a replayed turn produces the same
// ids and idempotency keys and can never execute twice under new identities.
function buildActionBatch(
  drafts: readonly NonNullable<Awaited<ReturnType<typeof askAssistant>>['actionDrafts']>[number][],
  options: AssistantOrchestratorOptions,
  now: number,
): { batch?: AssistantActionBatch; error?: string } {
  const seed = options.turnId ?? `${now}`
  const proposals: AssistantActionProposal[] = []
  const signatures = new Set<string>()

  for (const [index, draft] of drafts.entries()) {
    const resolved = createAssistantProposalFromDraft(
      draft,
      options.finance,
      options.planning,
      now,
      `assistant-action-${seed}-${index + 1}`,
    )
    if (!resolved.proposal) return { error: resolved.error ?? 'One of the requested actions could not be prepared.' }
    // Two identical children in one turn are a planning error, not two actions.
    const signature = [
      resolved.proposal.actionType, resolved.proposal.amountPkr, resolved.proposal.effectiveDate,
      resolved.proposal.description, resolved.proposal.targetAccountId ?? '', resolved.proposal.sourceAccountId ?? '',
      resolved.proposal.recordId ?? '',
    ].join('|')
    if (signatures.has(signature)) return { error: 'The same action was requested twice, so nothing was prepared.' }
    signatures.add(signature)
    proposals.push(resolved.proposal)
  }

  if (proposals.length < 2 || proposals.length > 5) {
    return { error: 'This set of actions could not be prepared together.' }
  }
  return {
    batch: {
      batchId: `assistant-batch-${seed}`,
      sourceTurnId: seed,
      idempotencyKey: `assistant-batch-${seed}`,
      actionCount: proposals.length,
      status: 'proposed',
      summary: proposals.map((proposal) => proposal.summary).join(' '),
      proposals,
      createdAt: now,
    },
  }
}

/**
 * One request path.
 *
 * Memory inspection stays local because it reads and writes device-only data
 * the model cannot see. Everything else — ordinary conversation, reads,
 * arithmetic, advice, cancelling a preview, proposing a change — goes to the
 * model with the full tool surface available, and comes back to be validated
 * here. The app decides nothing about what the message meant.
 */
export async function orchestrateAssistantTurn(
  options: AssistantOrchestratorOptions,
): Promise<AssistantOrchestratorResult> {
  const memoryInspection = localMemoryInspection(options)
  if (memoryInspection) return memoryInspection

  const now = Date.now()
  const contextStartedAt = performance.now()
  const profile = responseProfile(options)
  const request = buildAssistantProviderRequest(options)
  const contextMs = Math.round(performance.now() - contextStartedAt)

  const outcome = await (options.providerInvoker ?? askAssistant)(request, honestProviderFallback(options))
  let proposal: AssistantActionProposal | undefined
  let batch: AssistantActionBatch | undefined

  if (outcome.actionDrafts?.length) {
    // A compound request is all-or-nothing. Previewing only the children that
    // happened to resolve is exactly the silent drop this repair removes.
    const built = buildActionBatch(outcome.actionDrafts, options, now)
    if (!built.batch) {
      return {
        kind: 'append',
        message: {
          id: assistantMessageId(options, now),
          role: 'assistant',
          text: built.error ?? 'I need one clarification before I can prepare those actions.',
          timestamp: now,
          source: 'local',
          statusNote: 'Action batch rejected locally',
          diagnostic: { code: 'batch-invalid', stage: 'local-batch-validation', responseKind: 'action_batch', timingsMs: { context: contextMs, total: Math.round(performance.now() - contextStartedAt) } },
        },
      }
    }
    batch = built.batch
  } else if (outcome.actionProposal) {
    // The model plans the action; the local domain decides whether it is real.
    // Account ids, record ids, amounts and dates are all re-resolved and
    // re-validated here, so a plausible-looking plan that does not match the
    // current records is rejected rather than previewed.
    const resolved = createAssistantProposalFromDraft(
      outcome.actionProposal,
      options.finance,
      options.planning,
      now,
    )
    if (!resolved.proposal) {
      return {
        kind: 'append',
        message: {
          id: assistantMessageId(options, now),
          role: 'assistant',
          text: resolved.error ?? 'I need one clarification before I can prepare that action.',
          timestamp: now,
          source: 'local',
          statusNote: 'Action proposal rejected locally',
          diagnostic: { code: resolved.error?.includes('available') ? 'local-record-not-found' : 'proposal-invalid', stage: 'local-proposal-validation', responseKind: 'action_proposal', timingsMs: { context: contextMs, total: Math.round(performance.now() - contextStartedAt) } },
        },
      }
    }
    proposal = resolved.proposal
  }

  const memoryProposal = outcome.memoryProposal && options.assistantMemory.enabled
    ? createMemoryProposal(
      outcome.memoryProposal.category,
      outcome.memoryProposal.summary,
      outcome.memoryProposal.normalizedValue,
      outcome.memoryProposal.displayLabel,
      outcome.memoryProposal.reason,
      now,
      {
        ...(outcome.memoryProposal.sensitivity ? { sensitivity: outcome.memoryProposal.sensitivity } : {}),
        ...(outcome.memoryProposal.retention ? { retention: outcome.memoryProposal.retention } : {}),
        ...(options.turnId ? { sourceTurnId: options.turnId } : {}),
      },
    )
    : undefined
  const statusNote = outcome.reason
      ? ASSISTANT_FALLBACK_MESSAGES[outcome.reason]
      : proposal || batch
        ? 'Action requires confirmation'
        : memoryProposal
          ? 'Memory confirmation needed'
          : 'Answered with AI companion'

  // A preview replaces the model's prose so the confirmation card is the only
  // thing describing what would change. Everything else keeps the model's own
  // words, personalised but not rewritten.
  //
  // In the other direction, prose that promises a preview when none exists is
  // rewritten too: the Edge already rejects that turn structurally, so this is
  // the last guard for anything that reaches here, and it never invents a card.
  const responseText = batch
    ? profile.language === 'roman-urdu'
      ? `${batch.actionCount} actions ka preview tayyar hai. Confirm karne tak koi record change nahi hoga.`
      : `A preview of ${batch.actionCount} actions is ready. No record will change until you confirm.`
    : proposal
      ? profile.language === 'roman-urdu'
        ? 'Preview tayyar hai. Confirm karne tak koi financial record change nahi hoga.'
        : 'The preview is ready. No financial record will change until you confirm.'
      : outcome.reason === 'action-not-prepared'
        // The service answered; it simply could not turn the request into a
        // confirmable action. Reporting that as an unavailable AI companion was
        // both wrong and unactionable, so the wording says what happened.
        ? profile.language === 'roman-urdu'
          ? 'Main is action ko confirm karne ke liye tayyar nahi kar saka, is liye kuch record nahi hua. Kya main isay dobara tayyar karun?'
          : 'I could not prepare that action for confirmation, so nothing was recorded. Would you like me to try preparing it again?'
        : personaliseAssistantText(outcome.response.text, profile)

  const followUps = outcome.response.followUps?.slice(0, 1)
  const insight = outcome.response.insight

  // A new preview supersedes an older pending one, so two confirmable actions
  // can never be live at the same time.
  const superseded = proposal || batch ? findLastPendingPreview(options.messages) : undefined

  return {
    kind: 'append',
    ...(superseded
      ? {
        replaceMessageId: superseded.id,
        replacementMessage: supersedePreview(
          superseded,
          'This preview was replaced by a newer proposal.',
          'Action superseded',
        ),
      }
      : {}),
    message: {
      id: assistantMessageId(options, now),
      role: 'assistant',
      text: responseText,
      timestamp: now,
      source: outcome.source,
      statusNote,
      ...(insight ? { insight } : {}),
      ...(followUps?.length ? { followUps } : {}),
      ...(proposal ? { proposal } : {}),
      ...(batch ? { batch } : {}),
      ...(memoryProposal ? { memoryProposal } : {}),
      ...(outcome.diagnostic ? { diagnostic: outcome.diagnostic } : {}),
      performance: outcome.performance
        ? { ...outcome.performance, timingsMs: { context: contextMs, ...outcome.performance.timingsMs } }
        : { timingsMs: { context: contextMs, total: Math.round(performance.now() - contextStartedAt) } },
    },
  }
}
