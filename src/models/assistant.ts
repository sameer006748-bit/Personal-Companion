import type { TransactionCategory } from './finance'

export type AssistantRole = 'user' | 'assistant'

export type AssistantInputMode = 'text' | 'voice_transcript'

export interface AssistantTurnInput {
  text: string
  inputMode: AssistantInputMode
  transcriptionConfidence?: number
  locale?: string
  interruptedResponse?: boolean
}

export type AssistantIntent =
  | 'monthly-summary'
  | 'safe-to-spend'
  | 'receivables'
  | 'payables'
  | 'attention-items'
  | 'expense-explanation'
  | 'available-balance'
  | 'financial-position'
  | 'unknown'

export type AssistantInsightTone = 'default' | 'positive' | 'negative' | 'attention'

export interface AssistantMetric {
  label: string
  amount: number
  sign?: string
  tone?: AssistantInsightTone
}

export interface AssistantInsightRow {
  label: string
  detail?: string
  amount?: number
  tone?: AssistantInsightTone
}

export interface AssistantInsight {
  title: string
  metrics?: readonly AssistantMetric[]
  rows?: readonly AssistantInsightRow[]
}

export interface AssistantFollowUp {
  id: string
  label: string
}

// Where an answer came from. Declared here rather than in the client so a stored
// message can record it without the persistence layer depending on the network
// layer.
export type AssistantAnswerSource = 'ai' | 'local'

export type AssistantFailureCode =
  | 'invalid-response'
  | 'invalid-envelope'
  | 'malformed-result'
  | 'unsupported-kind'
  | 'unsupported-action'
  | 'tool-result-invalid'
  | 'final-number-invalid'
  | 'stale-conversation-number'
  | 'proposal-invalid'
  | 'proposal-payload-missing'
  | 'narrated-proposal-without-draft'
  | 'partial-action-plan'
  | 'action-count-mismatch'
  | 'action-limit-exceeded'
  | 'batch-invalid'
  | 'local-record-not-found'
  | 'request-invalid'
  | 'provider-timeout'
  | 'provider-unavailable'
  | 'provider-rejected'
  | 'auth-failed'
  | 'rate-limited'
  | 'turn-deadline-exceeded'
  | 'serialization-failed'
  | 'edge-unhandled-failure'
  | 'unknown-safe-failure'

export type AssistantFailureStage =
  | 'client-context'
  | 'client-fetch'
  | 'client-normalization'
  | 'edge-request'
  | 'edge-auth'
  | 'edge-usage'
  | 'edge-context'
  | 'edge-routing'
  | 'provider-round'
  | 'tool-execution'
  | 'edge-normalization'
  | 'edge-serialization'
  | 'local-proposal-validation'
  | 'local-batch-validation'
  | 'unknown'

export interface AssistantSafeDiagnostic {
  code: AssistantFailureCode
  stage: AssistantFailureStage
  responseKind?: string
  toolName?: string
  roundCount?: number
  toolsExposed?: number
  toolsCalled?: number
  // Whether the failing turn carried any action draft at all, and how many.
  // Enough to tell a narrated proposal from a rejected one without retaining
  // any proposal content.
  proposalDraftsPresent?: boolean
  proposalCount?: number
  serializationCompleted?: boolean
  timingsMs?: Readonly<Record<string, number>>
}

export interface AssistantPerformanceMetadata {
  timingsMs: Readonly<Record<string, number>>
  roundCount?: number
  toolsExposed?: number
  toolsCalled?: number
}

export type AssistantMemoryCategory = 'communication_preference' | 'financial_goal' | 'person_alias' | 'account_preference' | 'routine_preference' | 'app_preference' | 'user_defined_fact'
export type AssistantMemoryStatus = 'active' | 'archived' | 'deleted'

// Memory layers A-D. Layer E (recent conversation state) is derived per turn and
// never stored here, and layer F (financial records) lives in the finance and
// planning stores and is never written through the memory path.
export type AssistantMemoryLayer = 'profile' | 'people' | 'goals' | 'preferences'

// Sensitive memories describe a person, a relationship or an obligation rather
// than a stable app preference. They are always consent-gated and are excluded
// from a reply unless the current turn is about them.
export type AssistantMemorySensitivity = 'normal' | 'sensitive'

// How long a fact is expected to stay true. Short-lived facts are the ones a
// later statement is most likely to supersede.
export type AssistantMemoryRetention = 'short' | 'long' | 'permanent'

export interface AssistantMemory {
  memoryId: string
  category: AssistantMemoryCategory
  summary: string
  normalizedValue: string
  source: 'user-approved'
  createdAt: number
  updatedAt: number
  lastUsedAt?: number
  confidence: number
  consentStatus: 'approved'
  status: AssistantMemoryStatus
  entityId?: string
  expiresAt?: number
  displayLabel: string
  // Recorded from the turn the fact was approved in, so a stored memory can be
  // traced back to the message that produced it.
  sourceTurnId?: string
  sensitivity?: AssistantMemorySensitivity
  retention?: AssistantMemoryRetention
  // Set when a newer memory replaced this one, so supersession is auditable
  // rather than a silent overwrite.
  supersededBy?: string
}

export interface AssistantPersonalizationProfile {
  preferredName?: string
  aboutMe: string
  language: 'english' | 'roman-urdu'
  responseLength: 'short' | 'balanced' | 'detailed'
  tone: 'friendly' | 'direct' | 'gentle' | 'strict'
  financialCoaching: 'conservative' | 'balanced' | 'growth-oriented'
  riskTolerance: 'low' | 'moderate' | 'high'
  financialPriorities: string
  goalsAndPlans: string
  advicePreferences: string
  thingsToAvoid: string
  proactiveSuggestions: boolean
}

export interface AssistantContextMessage {
  role: AssistantRole
  text: string
}

export interface AssistantContextEntity {
  kind: 'account' | 'person' | 'commitment' | 'transaction'
  id: string
  label: string
}

export interface AssistantToolAccount {
  id: string
  name: string
  type: string
  balance: number
}

export interface AssistantToolTransaction {
  id: string
  title: string
  amount: number
  date: string
  direction: string
  accountId: string
  counterparty?: string
}

export interface AssistantToolRecord {
  id: string
  label: string
  amount: number
  dueDate?: string
  status?: string
  accountId?: string
  frequency?: string
}

export interface AssistantToolFinanceContext {
  currency: 'PKR'
  today: string
  accounts: readonly AssistantToolAccount[]
  summary: {
    totalBalance: number
    cashBalance: number
    monthlyIncome: number
    monthlyExpenses: number
    netMonthlyCashFlow: number
    receivables: number
    payables: number
    commitments: number
    overdueItems: number
    safeToSpend: number
    overdueTotal: number
    upcomingItems: number
  }
  financialPosition: 'Comfortable' | 'Tight'
  accountDistribution: readonly {
    accountId: string
    label: string
    balance: number
    sharePercent: number
  }[]
  recentTransactions: readonly AssistantToolTransaction[]
  receivables: readonly AssistantToolRecord[]
  payables: readonly AssistantToolRecord[]
  commitments: readonly AssistantToolRecord[]
  managedAccounts: readonly {
    id: string
    name: string
    type: 'cash' | 'bank' | 'wallet' | 'savings' | 'other'
    openingBalance: number
    balance: number
    isDefault: boolean
    isArchived: boolean
    institutionName?: string
    lastFourDigits?: string
  }[]
  managedTransactions: readonly {
    id: string
    type: 'income' | 'expense' | 'transfer'
    amount: number
    date: string
    title: string
    categoryId: TransactionCategory
    accountId: string
    destinationAccountId?: string
    personOrBusiness?: string
    note?: string
  }[]
  managedReceivables: readonly {
    id: string
    counterparty: string
    originalAmount: number
    receivedAmount: number
    dueDate: string
    note?: string
    accountId?: string
  }[]
  managedPayables: readonly {
    id: string
    counterparty: string
    originalAmount: number
    paidAmount: number
    dueDate: string
    note?: string
    accountId?: string
  }[]
  managedCommitments: readonly {
    id: string
    label: string
    category: TransactionCategory
    amount: number
    frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'one-time'
    dueDate: string
    note?: string
    accountId?: string
    isSettled: boolean
    isArchived: boolean
  }[]
}

// Layer E: what the conversation is currently about. This exists so the model
// can resolve references such as "woh", "unko" or "abhi" without the transport
// having to send the whole transcript, and so conversational figures can be
// labelled as conversational rather than read as current financial truth.
export interface AssistantConversationState {
  // One short line describing the running topic, in the user's own words.
  summary: string
  // References the user made that no local record could be matched to.
  unresolvedReferences: readonly string[]
  // A choice the user appears to be weighing, quoted from their message.
  openDecision?: string
  // The last question the assistant asked and the user has not yet answered.
  pendingQuestion?: string
  // Amounts that only ever appeared in conversation. Never authoritative, and
  // sent explicitly so the model can tell them apart from tool results.
  conversationalAmounts: readonly number[]
  // True when this message reads as a continuation of the previous exchange.
  isFollowUp: boolean
  // Set when the previous assistant turn talked about an action but no
  // confirmable preview exists for it. Conversation context only: none of this
  // is a record, and none of it can be executed without a visible Confirm.
  unresolvedAction?: AssistantUnresolvedAction
}

// What the previous turn appears to have intended but never produced. This is
// deliberately shaped as extracted context rather than a draft: it tells the
// model an action was discussed and not prepared, so it can prepare it properly
// or ask once, instead of the app reporting the provider as unavailable.
export interface AssistantUnresolvedAction {
  // The turn claimed a preview would appear.
  claimedPreview: boolean
  // Whether a real validated proposal was created for that claim.
  proposalCreated: boolean
  // What the user seemed to be asking for, when it can be told apart safely.
  actionType?: 'expense' | 'income' | 'receivable' | 'payable' | 'transfer'
  // Person named in the request, if any. Conversation text, not a record.
  personOrBusiness?: string
  // Amount named in the request. Conversation only, never a balance.
  amountPkr?: number
  // Account named in the request, matched against active account labels.
  accountLabel?: string
  // Fields the request did not supply, so one precise question can be asked.
  missingFields: readonly ('amount' | 'account' | 'person' | 'purpose')[]
}

export interface AssistantProviderRequest {
  version: 2
  input: AssistantTurnInput
  personalization?: AssistantPersonalizationProfile
  memories: readonly Pick<AssistantMemory, 'category' | 'summary' | 'normalizedValue' | 'displayLabel'>[]
  recentMessages: readonly AssistantContextMessage[]
  recentEntities: readonly AssistantContextEntity[]
  conversationState?: AssistantConversationState
  financeContext: AssistantToolFinanceContext
  pendingProposal?: AssistantActionProposal
}

export interface AssistantMemoryProposal {
  proposalId: string
  category: AssistantMemoryCategory
  summary: string
  normalizedValue: string
  displayLabel: string
  reason: string
  createdAt: number
  status: 'proposed' | 'saved' | 'rejected' | 'cancelled'
  sensitivity?: AssistantMemorySensitivity
  retention?: AssistantMemoryRetention
  sourceTurnId?: string
}

// Every action the assistant may propose. Each entry is backed by an existing
// domain operation; nothing here is aspirational.
export type AssistantActionType =
  | 'add-income'
  | 'add-expense'
  | 'transfer'
  | 'account-adjustment'
  | 'receive-receivable'
  | 'pay-payable'
  | 'add-commitment'
  | 'add-receivable'
  | 'add-payable'
  | 'settle-commitment'
  | 'create-account'
  | 'update-account'
  | 'archive-account'
  | 'restore-account'
  | 'set-default-account'
  | 'update-transaction'
  | 'delete-transaction'
  | 'update-receivable'
  | 'delete-receivable'
  | 'update-payable'
  | 'delete-payable'
  | 'update-commitment'
  | 'archive-commitment'
  | 'restore-commitment'
  | 'delete-commitment'
  | 'update-preference'

// The same list at runtime, for the guards that have to check an action type
// coming from untrusted input: a provider envelope and a restored transcript.
// Both previously kept their own hand-written copy, and the transcript guard's
// copy had fallen nineteen entries behind the union, which silently discarded a
// whole saved conversation on reload.
//
// `satisfies` rejects an entry that is not a real action type, while `as const`
// keeps the literals so the exhaustiveness check below can spot a missing one.
export const ASSISTANT_ACTION_TYPES = [
  'add-income',
  'add-expense',
  'transfer',
  'account-adjustment',
  'receive-receivable',
  'pay-payable',
  'add-commitment',
  'add-receivable',
  'add-payable',
  'settle-commitment',
  'create-account',
  'update-account',
  'archive-account',
  'restore-account',
  'set-default-account',
  'update-transaction',
  'delete-transaction',
  'update-receivable',
  'delete-receivable',
  'update-payable',
  'delete-payable',
  'update-commitment',
  'archive-commitment',
  'restore-commitment',
  'delete-commitment',
  'update-preference',
] as const satisfies readonly AssistantActionType[]

// Fails to compile if an action type is added to the union without being added
// to the array above, so the two cannot drift apart again. `AssertNever` only
// accepts `never`, so a missing entry surfaces as a type error right here.
type AssertNever<T extends never> = T
export type UnlistedAssistantActionType = AssertNever<
  Exclude<AssistantActionType, (typeof ASSISTANT_ACTION_TYPES)[number]>
>

export type AssistantProposalStatus = 'proposed' | 'confirmed' | 'cancelled' | 'executed' | 'superseded' | 'failed'

export interface AssistantActionDraft {
  actionType: AssistantActionType
  amountPkr: number
  description: string
  effectiveDate: string
  summary: string
  targetAccountId?: string
  sourceAccountId?: string
  recordId?: string
  commitmentFrequency?: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'one-time'
  // Who the money is owed to or owed by, for a new receivable or payable.
  counterparty?: string
  accountName?: string
  accountType?: 'cash' | 'bank' | 'wallet' | 'savings' | 'other'
  openingBalance?: number
  settledAmount?: number
  institutionName?: string
  lastFourDigits?: string
  makeDefault?: boolean
  transactionType?: 'income' | 'expense' | 'transfer'
  categoryId?: TransactionCategory
  personOrBusiness?: string
  note?: string
  preferenceKey?: 'profile-name' | 'income-type' | 'financial-position-style' | 'hide-balances-on-launch' | 'assistant-response-style' | 'assistant-calculations' | 'assistant-suggestions' | 'theme-preference' | 'privacy-mode' | 'personalization-enabled'
  preferenceValue?: string | boolean
}

export interface AssistantMemoryDraft {
  category: AssistantMemoryCategory
  summary: string
  normalizedValue: string
  displayLabel: string
  reason: string
  sensitivity?: AssistantMemorySensitivity
  retention?: AssistantMemoryRetention
}

export type AssistantProviderResponseKind =
  | 'conversation'
  | 'advice'
  | 'clarification'
  | 'finance_summary'
  | 'finance_list'
  | 'finance_detail'
  | 'action_proposal'
  | 'action_batch'
  | 'memory_proposal'
  | 'local_fallback'

interface AssistantProviderEnvelopeBase {
  version: 2
  text: string
  followUps?: readonly AssistantFollowUp[]
  modelTier?: 'flash' | 'pro'
}

/** Two to five actions requested in one message, previewed and confirmed as one unit. */
export interface AssistantActionBatchDraft {
  actionCount: number
  actions: readonly AssistantActionDraft[]
}

export type AssistantProviderEnvelope =
  | (AssistantProviderEnvelopeBase & {
      kind: 'conversation' | 'clarification'
      actionProposal?: never
      actionBatch?: never
      memoryProposal?: never
      financeCard?: never
    })
  | (AssistantProviderEnvelopeBase & {
      kind: 'advice' | 'local_fallback'
      actionProposal?: never
      actionBatch?: never
      memoryProposal?: never
      financeCard?: never
    })
  | (AssistantProviderEnvelopeBase & {
      kind: 'finance_summary' | 'finance_list' | 'finance_detail'
      financeCard?: AssistantInsight
      actionProposal?: never
      actionBatch?: never
      memoryProposal?: never
    })
  | (AssistantProviderEnvelopeBase & {
      kind: 'action_proposal'
      actionProposal: AssistantActionDraft
      actionBatch?: never
      memoryProposal?: never
      financeCard?: never
    })
  | (AssistantProviderEnvelopeBase & {
      kind: 'action_batch'
      actionBatch: AssistantActionBatchDraft
      actionProposal?: never
      memoryProposal?: never
      financeCard?: never
    })
  | (AssistantProviderEnvelopeBase & {
      kind: 'memory_proposal'
      memoryProposal: AssistantMemoryDraft
      actionProposal?: never
      actionBatch?: never
      financeCard?: never
    })

interface AssistantActionBase {
  proposalId: string
  amountPkr: number
  targetAccountId?: string
  sourceAccountId?: string
  recordId?: string
  description: string
  effectiveDate: string
  createdAt: number
  status: AssistantProposalStatus
  idempotencyKey: string
  summary: string
  validationErrors?: readonly string[]
  accountName?: string
  accountType?: 'cash' | 'bank' | 'wallet' | 'savings' | 'other'
  openingBalance?: number
  settledAmount?: number
  institutionName?: string
  lastFourDigits?: string
  makeDefault?: boolean
  transactionType?: 'income' | 'expense' | 'transfer'
  categoryId?: TransactionCategory
  personOrBusiness?: string
  note?: string
  counterparty?: string
  commitmentFrequency?: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'one-time'
  preferenceKey?: AssistantActionDraft['preferenceKey']
  preferenceValue?: string | boolean
}

export type AssistantActionProposal =
  | (AssistantActionBase & { actionType: 'add-income'; targetAccountId: string })
  | (AssistantActionBase & { actionType: 'add-expense'; sourceAccountId: string })
  | (AssistantActionBase & { actionType: 'transfer'; sourceAccountId: string; targetAccountId: string })
  | (AssistantActionBase & { actionType: 'account-adjustment'; targetAccountId: string })
  | (AssistantActionBase & { actionType: 'receive-receivable'; targetAccountId: string; recordId: string })
  | (AssistantActionBase & { actionType: 'pay-payable'; sourceAccountId: string; recordId: string })
  | (AssistantActionBase & { actionType: 'add-commitment'; commitmentFrequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'one-time' })
  // New planning records. `effectiveDate` carries the due date, matching how
  // `add-commitment` already treats it.
  | (AssistantActionBase & { actionType: 'add-receivable'; counterparty: string })
  | (AssistantActionBase & { actionType: 'add-payable'; counterparty: string })
  // Marking a commitment paid advances or settles an existing planning record.
  // It moves no money on its own, so it carries no account.
  | (AssistantActionBase & { actionType: 'settle-commitment'; recordId: string })
  | (AssistantActionBase & { actionType: 'create-account'; accountName: string; accountType: NonNullable<AssistantActionDraft['accountType']>; openingBalance: number })
  | (AssistantActionBase & { actionType: 'update-account'; targetAccountId: string; accountName: string; accountType: NonNullable<AssistantActionDraft['accountType']>; openingBalance: number })
  | (AssistantActionBase & { actionType: 'archive-account' | 'restore-account' | 'set-default-account'; targetAccountId: string })
  | (AssistantActionBase & { actionType: 'update-transaction'; recordId: string; transactionType: NonNullable<AssistantActionDraft['transactionType']>; categoryId: TransactionCategory; sourceAccountId: string })
  | (AssistantActionBase & { actionType: 'delete-transaction'; recordId: string })
  // `settledAmount` is required rather than optional: the proposal builder always
  // resolves it from the existing record when the model omits it, and validation
  // rejects anything outside 0..amountPkr. Making that explicit here lets the
  // store pass it straight to the planning input, which does not accept undefined.
  | (AssistantActionBase & { actionType: 'update-receivable' | 'update-payable'; recordId: string; counterparty: string; settledAmount: number })
  | (AssistantActionBase & { actionType: 'delete-receivable' | 'delete-payable'; recordId: string })
  | (AssistantActionBase & { actionType: 'update-commitment'; recordId: string; commitmentFrequency: NonNullable<AssistantActionDraft['commitmentFrequency']>; categoryId: TransactionCategory })
  | (AssistantActionBase & { actionType: 'archive-commitment' | 'restore-commitment' | 'delete-commitment'; recordId: string })
  | (AssistantActionBase & { actionType: 'update-preference'; preferenceKey: NonNullable<AssistantActionDraft['preferenceKey']>; preferenceValue: string | boolean })

export interface AssistantActionReceipt {
  proposalId: string
  actionType: AssistantActionType
  amountPkr: number
  affectedLabel: string
  resultingAmount?: number
  completedAt: number
  referenceId?: string
}

export type AssistantBatchStatus = 'proposed' | 'confirmed' | 'cancelled' | 'executed' | 'superseded' | 'failed'

/** A set of 2–5 actions proposed together and confirmed or cancelled as one unit. */
export interface AssistantActionBatch {
  batchId: string
  sourceTurnId: string
  idempotencyKey: string
  actionCount: number
  status: AssistantBatchStatus
  summary: string
  proposals: readonly AssistantActionProposal[]
  receipts?: readonly AssistantActionReceipt[]
  createdAt: number
}

export interface AssistantMessage {
  id: string
  role: AssistantRole
  text: string
  timestamp: number
  insight?: AssistantInsight
  followUps?: readonly AssistantFollowUp[]
  source?: AssistantAnswerSource
  statusNote?: string
  proposal?: AssistantActionProposal
  batch?: AssistantActionBatch
  receipt?: AssistantActionReceipt
  memoryProposal?: AssistantMemoryProposal
  diagnostic?: AssistantSafeDiagnostic
  performance?: AssistantPerformanceMetadata
}

export interface AssistantResponse {
  intent: AssistantIntent
  text: string
  insight?: AssistantInsight
  followUps?: readonly AssistantFollowUp[]
}
