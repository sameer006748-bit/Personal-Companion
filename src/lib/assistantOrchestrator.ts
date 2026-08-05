import { ASSISTANT_FALLBACK_MESSAGES, askAssistant } from './assistantClient'
import { buildConversationState, claimsPreview } from './assistantConversation'
import {
  buildAssistantFinancialContext,
  createAssistantProposalFromDraft,
  getAuthoritativeAccountBalanceAnswer,
  getDeterministicFinancialAnswer,
  parseDeterministicActionDraft,
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
  AssistantContextEntity,
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

function normalise(value: string): string {
  return value.toLocaleLowerCase().replaceAll(/[^a-z0-9\s]/gu, ' ').replaceAll(/\s+/gu, ' ').trim()
}

// The typed equivalent of pressing Cancel on a pending preview. This is an
// exact whole-message match against a short control vocabulary, not an intent
// classifier: anything longer than a bare cancel goes to the model, which can
// still choose to cancel, revise or explain.
function isExplicitCancel(question: string): boolean {
  const command = normalise(question)
  return new Set([
    'cancel', 'cancel it', 'cancel this', 'cancel kar do', 'cancel kar dein', 'no', 'nahi', 'nahin',
    'band kar do', 'band karo', 'rehne do', 'rehne dein', 'never mind', 'nevermind',
  ]).has(command)
}

// Greetings are answered by the app, not the provider. A greeting carries no
// financial question, so a round trip can only add latency, and when the
// provider or its usage check is unavailable it turns "Hello" into an error
// notice. Matched as a whole message, so "hello, balance kitna hai" still
// routes as the balance question it actually is.
const GREETINGS = new Set([
  'hello', 'hello there', 'helo', 'hi', 'hi there', 'hii', 'hiii', 'hey', 'hey there', 'heyy',
  'salam', 'salaam', 'slam', 'salam alaikum', 'salaam alaikum', 'assalam o alaikum',
  'assalam u alaikum', 'assalamu alaikum', 'assalamualaikum', 'asalam o alaikum',
  'asalamualaikum', 'aslam o alaikum', 'aoa', 'good morning', 'good afternoon', 'good evening',
])

function isGreeting(question: string): boolean {
  return GREETINGS.has(normalise(question))
}

// A short confirmation continues the previous request rather than starting a
// new one. It is only ever resolved against local records, and never while a
// preview is pending, because there "han" means confirm this action.
const AFFIRMATIVE_FOLLOW_UPS = new Set([
  'han', 'haan', 'ha', 'han ji', 'haan ji', 'yes', 'yes please', 'yep', 'ok', 'okay', 'theek hai',
  'check', 'check kro', 'check karo', 'check kar do', 'check kardo', 'han check kro',
  'han check karo', 'haan check kro', 'haan check karo', 'yes check', 'yes check it',
  'please check', 'batao', 'bata do', 'bta do', 'han batao', 'haan batao', 'dekho', 'dekh lo',
  'zara dekho',
])

function isAffirmativeFollowUp(question: string): boolean {
  return AFFIRMATIVE_FOLLOW_UPS.has(normalise(question))
}

// The provider occasionally replies that it cannot reach the records, or
// promises to go and check them. Both are false: the records travel with the
// request, and nothing runs after the turn to fulfil a promise. These are
// corrected locally rather than shown.
const DENIES_RECORD_ACCESS =
  /(pahunch nahi|pohnch nahi|rasai nahi|records? tak access nahi|local (data|records?) (is|are) (not|un)available|access nahi|nahi dekh sakta|nahi dekh sakti|dekh nahi sakta|dekh nahi sakti|no access to your|do not have access|don't have access|cannot access your|can't access your|unable to access your|not able to access your|do not have visibility|cannot see your|can't see your)/iu
const PROMISES_TO_CHECK =
  /(check kar raha hoon|check kar rahi hoon|check karta hoon|check karti hoon|dekh raha hoon|dekh rahi hoon|thori der baad|thodi der baad|baad mein bata|later (reply|respond|tell|check)|let me check|i'?ll check|i will check|i am checking|i'?m checking|checking your|one moment|hold on)/iu

function serviceUnavailableText(language: 'english' | 'roman-urdu'): string {
  return language === 'roman-urdu'
    ? 'AI service abhi available nahi, lekin main aapka balance, transactions, receivables aur payables local records se bata sakta hoon.'
    : 'The AI service is not available right now, but I can tell you your balance, transactions, receivables and payables from your local records.'
}

function hasLocalFinanceRecords(context: ReturnType<typeof buildAssistantFinancialContext>): boolean {
  return Boolean(
    context.accounts.length || context.recentTransactions.length || context.receivables.length ||
    context.payables.length || context.commitments.length,
  )
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

function relevanceTokens(value: string): Set<string> {
  return new Set(normalise(value).split(' ').filter((token) => token.length > 2))
}

function selectRecentEntities(
  question: string,
  messages: readonly AssistantMessage[],
  context: ReturnType<typeof buildAssistantFinancialContext>,
): readonly AssistantContextEntity[] {
  const recentText = `${messages.slice(-4).map((message) => message.text).join(' ')} ${question}`
  const tokens = relevanceTokens(recentText)
  const candidates: AssistantContextEntity[] = [
    ...context.accounts.map((account) => ({ kind: 'account' as const, id: account.id, label: account.name })),
    ...context.receivables.map((record) => ({ kind: 'person' as const, id: record.id, label: record.label })),
    ...context.payables.map((record) => ({ kind: 'person' as const, id: record.id, label: record.label })),
    ...context.commitments.map((record) => ({ kind: 'commitment' as const, id: record.id, label: record.label })),
    ...context.recentTransactions.map((record) => ({ kind: 'transaction' as const, id: record.id, label: record.title })),
  ]
  const seen = new Set<string>()
  return candidates
    .map((entity) => ({
      entity,
      score: [...relevanceTokens(entity.label)].filter((token) => tokens.has(token)).length,
    }))
    .filter(({ score, entity }) => score > 0 && !seen.has(`${entity.kind}:${entity.id}`))
    .sort((left, right) => right.score - left.score)
    .filter(({ entity }) => {
      const key = `${entity.kind}:${entity.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 5)
    .map(({ entity }) => entity)
}

// Every label the local records know about. Used to decide whether a person the
// user named already has a record, which is what separates "resolve this" from
// "there is nothing here yet".
function knownRecordLabels(context: ReturnType<typeof buildAssistantFinancialContext>): readonly string[] {
  return [
    ...context.accounts.map((account) => account.name),
    ...context.receivables.map((record) => record.label),
    ...context.payables.map((record) => record.label),
    ...context.commitments.map((record) => record.label),
    ...context.recentTransactions.flatMap((record) => record.counterparty ? [record.counterparty] : []),
  ]
}

// Every figure that is currently backed by a record. Anything in the transcript
// that is not in this set is conversational, and is reported as such.
function authoritativeAmounts(context: ReturnType<typeof buildAssistantFinancialContext>): readonly number[] {
  return [
    ...context.accounts.map((account) => account.balance),
    ...Object.values(context.summary),
    ...context.recentTransactions.map((record) => record.amount),
    ...context.receivables.map((record) => record.amount),
    ...context.payables.map((record) => record.amount),
    ...context.commitments.map((record) => record.amount),
  ]
}

export function buildAssistantProviderRequest(options: AssistantOrchestratorOptions): AssistantProviderRequest {
  const financeContext = buildAssistantFinancialContext(options.data, options.finance, options.planning)
  const profile = responseProfile(options)
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
    input: options.input,
    personalization: profile,
    memories,
    recentMessages,
    recentEntities: selectRecentEntities(options.input.text, options.messages, financeContext),
    conversationState: buildConversationState(
      options.input.text,
      options.messages,
      knownRecordLabels(financeContext),
      authoritativeAmounts(financeContext),
    ),
    financeContext,
    ...(pendingProposal ? { pendingProposal } : {}),
  }
}

// Contextual fallback for a genuinely failed or timed-out provider call.
//
// This is deliberately three broad situations rather than a phrase dictionary.
// It acknowledges what the message was about and offers one practical next step,
// and it never states a financial fact, never creates an action, and never
// claims the model understood details it did not process. Anything it cannot
// place safely keeps the generic wording.
const FAMILY_PATTERN =
  /\b(ammi|ami|amma|abbu|abu|abba|mama|papa|mom|dad|mother|father|bhai|behn|behen|brother|sister|beta|beti|family|ghar|rishtedar|relative|relatives|dost|friend)\b/iu
const MONEY_NEED_PATTERN =
  /\b(paisa|paise|paisay|money|udhaar|udhar|qarz|loan|maang|mang|maangte|maangti|maangta|demand|kharcha|kharch|help|madad)\b/iu
const DIFFICULTY_PATTERN =
  /\b(mushkil|mushkal|pareshan|preshan|pareshani|stress|tension|dukhi|udaas|worried|worry|anxious|confused|guilty|awkward|difficult|hard|struggle|struggling)\b/iu

function contextualFallbackText(
  question: string,
  language: 'english' | 'roman-urdu',
): string | undefined {
  if (FAMILY_PATTERN.test(question) && MONEY_NEED_PATTERN.test(question)) {
    return language === 'roman-urdu'
      ? 'AI companion abhi jawab nahi de saka, lekin apnon ki paise wali request par na kehna waqai mushkil hota hai. Jawab dene se pehle khud tay kar lein ke is mahine aap aaram se kitna de sakte hain. Phir poori baat par haan ya na kehne ke bajaye wohi ek hadd narmi se bata dein. Kya aap batana chahenge ke baat kis had tak ki hai?'
      : 'The AI companion could not answer, but saying no to family about money is genuinely hard. Before you reply, decide privately how much you could give this month without strain. Then share that one limit gently instead of accepting or refusing the whole request. Would you like to tell me roughly what is being asked for?'
  }
  if (DIFFICULTY_PATTERN.test(question)) {
    return language === 'roman-urdu'
      ? 'AI companion abhi jawab nahi de saka, lekin jo aap keh rahe hain woh asaan cheez nahi hai. Ek chhota qadam yeh hai ke sirf wohi ek baat alag likh lein jo is waqt sab se zyada bhaari lag rahi hai. Baqi sab usi ke baad zyada saaf lagta hai. Kya aap wohi ek baat mujhe bata sakte hain?'
      : 'The AI companion could not answer, but what you are describing is not an easy thing. One small step is to write down only the single part that feels heaviest right now. The rest usually gets clearer after that. Would you like to tell me what that one part is?'
  }
  return undefined
}

// The client-side half of the proposal truth invariant. The Edge rejects a turn
// whose text promises a preview it never drafted, so this only ever sees text
// that arrived by some other path — a local fallback, or a reply the server
// accepted before this build. Text is replaced, never a card invented.
function unclaimedPreviewText(text: string, language: 'english' | 'roman-urdu'): string {
  if (!claimsPreview(text)) return text
  return language === 'roman-urdu'
    ? 'Main is action ka preview nahi bana saya. Kya main isay abhi dobara tayyar karun?'
    : 'I could not create a confirmable preview for that action. Would you like me to prepare it now?'
}

function fallbackResponse(options: AssistantOrchestratorOptions): AssistantResponse {
  const context = buildAssistantFinancialContext(options.data, options.finance, options.planning)
  const conversationState = buildConversationState(options.input.text, options.messages, knownRecordLabels(context), authoritativeAmounts(context))
  const previousUserText = conversationState.isFollowUp
    ? [...options.messages].reverse().find((message) => message.role === 'user')?.text ?? ''
    : ''
  const exact = getDeterministicFinancialAnswer(`${previousUserText} ${options.input.text}`, context)
  if (exact) return exact
  const profile = responseProfile(options)
  const contextual = contextualFallbackText(options.input.text, profile.language)
  if (contextual) return { intent: 'unknown', text: contextual }
  // A failed provider call is not a failure of the app. The records are still
  // here, so the fallback offers what it can actually answer instead of
  // reporting an outage the user can do nothing about.
  return { intent: 'unknown', text: serviceUnavailableText(profile.language) }
}

// The only pre-model route left on the pending-proposal path. Cancelling is a
// control action that must never depend on a network call, and it can only ever
// remove a preview, so it is safe to resolve locally. Revising a pending
// proposal is deliberately *not* handled here: the pending proposal is sent to
// the model, which understands "nahi, 5000 karo" far better than a marker
// pattern did, and any replacement it returns supersedes the old preview below.
function resolveExplicitCancel(
  options: AssistantOrchestratorOptions,
): AssistantOrchestratorResult | undefined {
  const existing = findLastPendingPreview(options.messages)
  if (!existing || !isExplicitCancel(options.input.text)) return undefined
  return {
    kind: 'replace',
    replaceMessageId: existing.id,
    replacementMessage: {
      ...existing,
      text: existing.batch
        ? 'Actions cancelled. Nothing changed.'
        : 'Action cancelled. Nothing changed.',
      ...(existing.proposal ? { proposal: { ...existing.proposal, status: 'cancelled' as const } } : {}),
      ...(existing.batch ? { batch: { ...existing.batch, status: 'cancelled' as const } } : {}),
      statusNote: 'Action cancelled',
    },
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

// The name the user is addressed by. The personalization profile wins when it
// carries one; otherwise the first name from the profile is used, and an empty
// name simply drops out of the sentence.
function preferredAddressName(
  options: AssistantOrchestratorOptions,
  profile: AssistantPersonalizationProfile,
): string {
  const preferred = profile.preferredName?.trim()
  if (preferred) return preferred
  const full = options.settings.profile.fullName?.trim() ?? ''
  return full.split(/\s+/u)[0] ?? ''
}

// A greeting is answered here so that saying hello never depends on the
// provider, its usage check, or the network. It states no financial fact and
// never mentions service availability.
function localGreeting(options: AssistantOrchestratorOptions): AssistantOrchestratorResult | undefined {
  if (!isGreeting(options.input.text)) return undefined
  // While a preview is pending the greeting is not the whole turn, so the
  // model keeps the context of the action awaiting confirmation.
  if (findLastPendingPreview(options.messages)) return undefined
  const profile = responseProfile(options)
  const name = preferredAddressName(options, profile)
  const now = Date.now()
  return {
    kind: 'append',
    message: {
      id: assistantMessageId(options, now),
      role: 'assistant',
      text: profile.language === 'roman-urdu'
        ? `Hello${name ? ` ${name}` : ''}, aaj finances mein kis cheez mein help chahiye?`
        : `Hello${name ? ` ${name}` : ''}, what would you like help with in your finances today?`,
      timestamp: now,
      source: 'local',
      statusNote: 'Answered locally',
    },
  }
}

// "Han check kro" after an unanswered balance question is a continuation of
// that question. It is resolved against the previous user message so the answer
// comes from the records, which is what stops the provider from being asked to
// guess what "check" referred to and inventing a lack of access.
function resolvePendingLocalRead(
  options: AssistantOrchestratorOptions,
  context: ReturnType<typeof buildAssistantFinancialContext>,
  profile: AssistantPersonalizationProfile,
  contextMs: number,
  startedAt: number,
): AssistantOrchestratorResult | undefined {
  if (!isAffirmativeFollowUp(options.input.text)) return undefined
  // A pending preview makes a bare "han" a confirmation of that action, which
  // is the confirmation flow's decision and never this one's.
  if (findLastPendingPreview(options.messages)) return undefined
  const previousUserText = [...options.messages].reverse().find((message) => message.role === 'user')?.text
  if (!previousUserText) return undefined
  const answer = getAuthoritativeAccountBalanceAnswer(previousUserText, context, profile.language)
    ?? getDeterministicFinancialAnswer(previousUserText, context)
  if (!answer) return undefined
  const now = Date.now()
  return {
    kind: 'append',
    message: {
      id: assistantMessageId(options, now),
      role: 'assistant',
      text: personaliseAssistantText(answer.text, profile),
      timestamp: now,
      source: 'local',
      statusNote: 'Answered from current account records',
      performance: { timingsMs: { context: contextMs, total: Math.round(performance.now() - startedAt) }, roundCount: 0, toolsExposed: 0, toolsCalled: 0 },
      ...(answer.insight ? { insight: answer.insight } : {}),
    },
  }
}

// A direct balance lookup keeps its established local path, because the local
// records are the authority and a round trip could only restate them. It is
// held to a short, self-contained question: anything longer is a conversation,
// and a conversation belongs to the model even when it mentions an account.
const DIRECT_LOOKUP_MAX_WORDS = 12

function isDirectFinanceLookup(question: string): boolean {
  return normalise(question).split(' ').filter(Boolean).length <= DIRECT_LOOKUP_MAX_WORDS
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

// Routing is deliberately ordered from the most stateful and safety-sensitive
// interpretation to the least. Pending controls win first. Supported action
// commands are then prepared and validated locally before any read matcher can
// see them. Account/general balance and other bounded finance reads use current
// records, followed by greeting and conversational follow-up resolution. Only
// genuinely open conversation reaches the provider and its useful local
// fallback.
export async function orchestrateAssistantTurn(
  options: AssistantOrchestratorOptions,
): Promise<AssistantOrchestratorResult> {
  // 1. Pending confirmation / cancel / edit handling. Explicit cancellation is
  // replace-only. Confirm and edit language remains in the existing pending
  // proposal conversation flow and is never reinterpreted as a balance read.
  const cancelled = resolveExplicitCancel(options)
  if (cancelled) return cancelled
  const memoryInspection = localMemoryInspection(options)
  if (memoryInspection) return memoryInspection

  const now = Date.now()
  const contextStartedAt = performance.now()
  const context = buildAssistantFinancialContext(options.data, options.finance, options.planning)
  const profile = responseProfile(options)
  const contextMs = Math.round(performance.now() - contextStartedAt)

  // 2. Action commands. The parser intentionally supports only unambiguous
  // single-account income/expense commands, and the proposal domain performs
  // the same account, amount and available-balance validation as provider
  // drafts. No mutation occurs here; the result is only a confirmable preview.
  const localDraft = parseDeterministicActionDraft(options.input.text, options.finance, context.today)
  if (localDraft) {
    const resolved = createAssistantProposalFromDraft(
      localDraft,
      options.finance,
      options.planning,
      now,
      options.turnId ? `assistant-action-${options.turnId}` : undefined,
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
          diagnostic: {
            code: resolved.error?.includes('available') ? 'local-record-not-found' : 'proposal-invalid',
            stage: 'local-proposal-validation',
            responseKind: 'action_proposal',
            timingsMs: { context: contextMs, total: Math.round(performance.now() - contextStartedAt) },
          },
        },
      }
    }
    const superseded = findLastPendingPreview(options.messages)
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
        text: profile.language === 'roman-urdu'
          ? 'Preview tayyar hai. Confirm karne tak koi financial record change nahi hoga.'
          : 'The preview is ready. No financial record will change until you confirm.',
        timestamp: now,
        source: 'local',
        statusNote: 'Action requires confirmation',
        proposal: resolved.proposal,
        performance: {
          timingsMs: { context: contextMs, total: Math.round(performance.now() - contextStartedAt) },
          roundCount: 0,
          toolsExposed: 0,
          toolsCalled: 0,
        },
      },
    }
  }

  if (isDirectFinanceLookup(options.input.text)) {
    // 3 and 4. The finance helper checks named/type-specific accounts before its
    // general balance branch. Its action/advice exclusions are the lower-level
    // guard that prevents a write request from ever becoming a balance card.
    const authoritativeAccountAnswer = getAuthoritativeAccountBalanceAnswer(
      options.input.text,
      context,
      profile.language,
    )
    if (authoritativeAccountAnswer) {
      return {
        kind: 'append',
        message: {
          id: assistantMessageId(options, now),
          role: 'assistant',
          text: personaliseAssistantText(authoritativeAccountAnswer.text, profile),
          timestamp: now,
          source: 'local',
          statusNote: 'Answered from current account records',
          performance: { timingsMs: { context: contextMs, total: Math.round(performance.now() - contextStartedAt) }, roundCount: 0, toolsExposed: 0, toolsCalled: 0 },
          ...(authoritativeAccountAnswer.insight ? { insight: authoritativeAccountAnswer.insight } : {}),
        },
      }
    }

    // 5. Other deterministic finance reads use the same bounded local snapshot.
    const deterministicAnswer = getDeterministicFinancialAnswer(options.input.text, context)
    if (deterministicAnswer) {
      return {
        kind: 'append',
        message: {
          id: assistantMessageId(options, now),
          role: 'assistant',
          text: personaliseAssistantText(deterministicAnswer.text, profile),
          timestamp: now,
          source: 'local',
          statusNote: 'Answered from current records',
          performance: { timingsMs: { context: contextMs, total: Math.round(performance.now() - contextStartedAt) }, roundCount: 0, toolsExposed: 0, toolsCalled: 0 },
          ...(deterministicAnswer.insight ? { insight: deterministicAnswer.insight } : {}),
        },
      }
    }
  }

  // 6. Provider-independent greeting.
  const greeting = localGreeting(options)
  if (greeting) return greeting

  // 7. Conversational follow-up resolution. A pending preview blocks this route,
  // leaving a bare affirmative to the existing confirmation semantics.
  const pendingRead = resolvePendingLocalRead(options, context, profile, contextMs, contextStartedAt)
  if (pendingRead) return pendingRead

  // 8 and 9. Open conversation goes to the provider; failures receive a useful,
  // truthful local fallback rather than a false statement about record access.
  const request = buildAssistantProviderRequest(options)
  const localFallback = fallbackResponse(options)
  const outcome = await askAssistant(request, localFallback)
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

  // Provider prose that denies access to the records, or promises to go and
  // check them, is corrected before it can be shown. The finance context
  // travelled with the request, so the denial is false, and nothing runs after
  // the turn to fulfil the promise. The local answer replaces it where the
  // records can produce one; otherwise the turn offers what it can answer. No
  // card is invented and no figure is stated that is not already a record.
  const correction = !proposal && !batch && hasLocalFinanceRecords(context) &&
    (DENIES_RECORD_ACCESS.test(outcome.response.text) || PROMISES_TO_CHECK.test(outcome.response.text))
    ? getAuthoritativeAccountBalanceAnswer(options.input.text, context, profile.language)
      ?? getDeterministicFinancialAnswer(options.input.text, context)
      ?? { intent: 'unknown' as const, text: serviceUnavailableText(profile.language) }
    : undefined

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
  const statusNote = correction
    ? correction.insight
      ? 'Answered from current account records'
      : 'Answered locally'
    : outcome.reason
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
        : correction
          ? personaliseAssistantText(correction.text, profile)
          : personaliseAssistantText(unclaimedPreviewText(outcome.response.text, profile.language), profile)

  // A corrected turn drops the provider's follow-ups too: they were written to
  // continue prose that is no longer being shown.
  const followUps = correction ? undefined : outcome.response.followUps?.slice(0, 1)
  const insight = correction ? correction.insight : outcome.response.insight

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
