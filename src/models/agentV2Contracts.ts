/**
 * Additive, serializable Agent V2 contracts. Phase 0 does not connect these
 * shapes to Assistant routing, provider payloads, confirmation, or mutation.
 */

export type AgentInputMode = 'text' | 'voice'

export type FieldProvenance =
  | 'user_explicit'
  | 'locally_normalized'
  | 'resolved_from_live_state'
  | 'existing_record'
  | 'local_default'
  | 'provider_inferred'
  | 'conversation_reference'
  | 'voice_transcript'
  | 'unknown'

export type ConfidenceBand = 'high' | 'clarify' | 'blocked'

export type CriticalField =
  | 'amount'
  | 'account'
  | 'transaction_direction'
  | 'date'
  | 'counterparty_or_person'
  | 'destructive_control'
  | 'confirmation_or_cancellation'
  | 'reference_resolution'

export interface ConfidenceBandRule {
  band: ConfidenceBand
  minimumInclusive: number
  maximumInclusive: number
  outcome: 'continue' | 'request_clarification' | 'refuse_action'
}

export interface ConfidencePolicy {
  bands: readonly ConfidenceBandRule[]
  criticalFields: readonly CriticalField[]
  requireHighConfidenceForCriticalFields: true
  neverInferConfirmationOrCancellation: true
}

export const AGENT_V2_CONFIDENCE_POLICY: ConfidencePolicy = {
  bands: [
    { band: 'blocked', minimumInclusive: 0, maximumInclusive: 0.39, outcome: 'refuse_action' },
    { band: 'clarify', minimumInclusive: 0.4, maximumInclusive: 0.84, outcome: 'request_clarification' },
    { band: 'high', minimumInclusive: 0.85, maximumInclusive: 1, outcome: 'continue' },
  ],
  criticalFields: [
    'amount',
    'account',
    'transaction_direction',
    'date',
    'counterparty_or_person',
    'destructive_control',
    'confirmation_or_cancellation',
    'reference_resolution',
  ],
  requireHighConfidenceForCriticalFields: true,
  neverInferConfirmationOrCancellation: true,
}

export interface AgentEntityReference {
  kind: string
  id?: string
  alias?: string
  sourceText?: string
  confidence: number
}

export interface AgentSlot {
  name: string
  value?: string | number | boolean | null
  provenance: FieldProvenance
  confidence: number
}

export interface AmbiguousSlot {
  name: string
  candidateValues: readonly (string | number)[]
  reason: string
}

export interface RankedReferenceCandidate {
  kind: string
  id: string
  alias?: string
  confidence: number
  rank: number
}

export type AgentRouteCategory = 'read' | 'proposal' | 'control' | 'conversation' | 'fallback' | 'blocked'
export type AgentRouteSource = 'deterministic' | 'provider' | 'fallback'

export interface AgentV2RouteDecision {
  category: AgentRouteCategory
  source: AgentRouteSource
  confidenceBand: ConfidenceBand
  clarificationReason?: string
}

export interface AssistantIntentFrame {
  originalInput: string
  normalizedInput: string
  inputMode: AgentInputMode
  locale: string
  semanticIntent: string
  controlIntent?: 'confirm' | 'cancel' | 'correct' | 'explain' | 'show_details' | 'none'
  entities: readonly AgentEntityReference[]
  slots: readonly AgentSlot[]
  missingSlots: readonly string[]
  ambiguousSlots: readonly AmbiguousSlot[]
  confidence: number
  clarificationRequired: boolean
  candidateReferences: readonly RankedReferenceCandidate[]
  fieldProvenance: Readonly<Record<string, FieldProvenance>>
  anomalyFlags: readonly string[]
  routeDecision: AgentV2RouteDecision
}

export interface ClarificationTurn {
  askedAt: number
  field: string
  question: string
  resolved: boolean
}

export interface CorrectedDialogueSlot {
  name: string
  previousValue?: string | number | boolean | null
  correctedValue?: string | number | boolean | null
  disputed: boolean
  correctedAt: number
}

export interface LastRelevantDialogueEvent {
  kind: 'read' | 'proposal' | 'confirmation' | 'cancellation' | 'correction'
  referenceId?: string
  occurredAt: number
}

export interface DialogueRecency {
  startedAt: number
  updatedAt: number
  expiresAt: number
  turnCount: number
  maxTurns: number
  maxAgeMs: number
}

/** Bounded state is resent on every provider turn; provider memory is never assumed. */
export interface BoundedDialogueFrame {
  activeIntent?: string
  activePendingReference?: { kind: 'proposal' | 'batch'; id: string }
  filledSlots: readonly AgentSlot[]
  missingSlots: readonly string[]
  correctedOrDisputedSlots: readonly CorrectedDialogueSlot[]
  unresolvedReferences: readonly string[]
  rankedReferenceCandidates: readonly RankedReferenceCandidate[]
  confidence: number
  clarificationHistory: readonly ClarificationTurn[]
  confirmedFields: readonly string[]
  inferredFields: readonly string[]
  lastRelevantEvent?: LastRelevantDialogueEvent
  recency: DialogueRecency
}

export type ProposalValidationStatus = 'unvalidated' | 'valid' | 'invalid' | 'stale' | 'conflicted'

export interface ProposalConflictDetail {
  field: string
  expected?: string | number | boolean | null
  actual?: string | number | boolean | null
  reason: string
}

/** Optional metadata that future proposal types may adopt without changing current behavior. */
export interface ProposalLifecycleMetadata {
  createdAt?: number
  expiresAt?: number
  sourceStateVersion?: string
  sourceSnapshotReference?: string
  fieldProvenance?: Readonly<Record<string, FieldProvenance>>
  supersedes?: string
  supersededBy?: string
  correctionReason?: string
  staleReason?: string
  validationStatus?: ProposalValidationStatus
  conflictDetails?: readonly ProposalConflictDetail[]
  retryEligible?: boolean
  reprepareEligible?: boolean
}

export type MagnitudeUnit = 'ones' | 'hundreds' | 'thousands' | 'lakhs' | 'crores' | 'explicit_pkr' | 'unknown'
export type TypicalRangeComparisonStatus = 'not_compared' | 'within_range' | 'outside_range' | 'range_unavailable'

export interface MagnitudeReviewMetadata {
  parsedAmount: number
  sourceExpression: string
  magnitudeUnit: MagnitudeUnit
  confidence: number
  typicalRangeComparisonStatus: TypicalRangeComparisonStatus
  requiresExplicitReview: boolean
  reviewReason?: string
}

export type DataTrustClassification =
  | 'trusted_instruction'
  | 'trusted_structured_fact'
  | 'untrusted_user_record_text'
  | 'untrusted_merchant_text'
  | 'untrusted_note'
  | 'untrusted_imported_text'
  | 'untrusted_external_text'

export interface ClassifiedDataText {
  text: string
  classification: Exclude<DataTrustClassification, 'trusted_instruction' | 'trusted_structured_fact'>
  mayControlActions: false
}

export const RECORD_TEXT_IS_DATA_NEVER_INSTRUCTION = true as const

export function classifyRecordText(
  text: string,
  classification: ClassifiedDataText['classification'] = 'untrusted_user_record_text',
): ClassifiedDataText {
  return { text, classification, mayControlActions: false }
}

export interface ProviderContextEntity {
  kind: string
  id: string
  alias?: string
}

export interface NecessaryBalance {
  accountId: string
  balancePkr: number
  asOf: number
}

export interface RelevantPlanningFact {
  kind: string
  referenceId?: string
  value: string | number | boolean
}

/** Future-only minimal provider payload; it intentionally has no ledger or secret field. */
export interface BoundedProviderContext {
  relevantEntities: readonly ProviderContextEntity[]
  necessaryBalances: readonly NecessaryBalance[]
  relevantPlanningFacts: readonly RelevantPlanningFact[]
  dialogue: BoundedDialogueFrame
  sourceStateVersion?: string
}

export const PROVIDER_CONTEXT_FORBIDDEN_FIELDS = [
  'fullLedger',
  'rawSecrets',
  'unrelatedSensitiveData',
] as const

export type ProviderFailureCategory = 'none' | 'unavailable' | 'timeout' | 'malformed_response' | 'unsafe_payload'

export interface RouteTimingMetadata {
  totalMs?: number
  localValidationMs?: number
  providerMs?: number
}

export interface AgentRouteTrace {
  selectedRouteCategory: AgentRouteCategory
  routeSource: AgentRouteSource
  confidenceBand: ConfidenceBand
  clarificationReason?: string
  proposalCreated: boolean
  safetyGuardTriggered: boolean
  providerFailureCategory?: ProviderFailureCategory
  timing?: RouteTimingMetadata
}

export const ROUTE_TRACE_FORBIDDEN_FIELDS = [
  'hiddenPrompts',
  'secrets',
  'chainOfThought',
  'fullRecords',
  'rawSensitiveMemories',
] as const

export interface VoiceInputContract {
  inputMode: 'voice'
  transcript: string
  transcriptionConfidence: number
  locale: string
  interrupted: boolean
  userReviewedTranscript: boolean
  criticalSlotReviewRequired: boolean
}

/** Each LLM request is self-contained and receives only bounded structured state. */
export interface StatelessProviderTurnContract {
  stateless: true
  providerMemoryAllowed: false
  dialogueStateResentEveryTurn: true
  dialogue: BoundedDialogueFrame
  context: BoundedProviderContext
}
