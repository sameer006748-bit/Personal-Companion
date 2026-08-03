import type { AssistantMemory, AssistantMemoryCategory, AssistantMemoryLayer, AssistantMemoryProposal, AssistantMemoryRetention, AssistantMemorySensitivity, AssistantPersonalizationProfile } from '../models/assistant'

const STORAGE_KEY = 'personal-companion-assistant-memory'
const MAX_MEMORIES = 40
let activeStorageScope = 'guest'

function scopedStorageKey(): string {
  return activeStorageScope === 'guest' ? STORAGE_KEY : `${STORAGE_KEY}:${activeStorageScope}`
}

export function setAssistantMemoryScope(scope: string | undefined, migrateLegacy = false): void {
  const trimmedScope = scope?.trim()
  activeStorageScope = trimmedScope?.length ? trimmedScope : 'guest'
  if (!migrateLegacy || activeStorageScope === 'guest' || typeof window === 'undefined') return
  const target = scopedStorageKey()
  try {
    if (!window.localStorage.getItem(target)) {
      const legacy = window.localStorage.getItem(STORAGE_KEY)
      if (legacy) window.localStorage.setItem(target, legacy)
    }
  } catch { /* the in-memory state remains isolated */ }
}

export interface AssistantMemoryState {
  version: 1
  enabled: boolean
  profile: AssistantPersonalizationProfile
  memories: readonly AssistantMemory[]
}

export const DEFAULT_PERSONALIZATION: AssistantPersonalizationProfile = {
  aboutMe: '', language: 'english', responseLength: 'balanced', tone: 'friendly',
  financialCoaching: 'balanced', riskTolerance: 'moderate', financialPriorities: '',
  goalsAndPlans: '', advicePreferences: '', thingsToAvoid: '', proactiveSuggestions: false,
}

export function createInitialAssistantMemory(): AssistantMemoryState {
  return { version: 1, enabled: true, profile: { ...DEFAULT_PERSONALIZATION }, memories: [] }
}

function validCategory(value: unknown): value is AssistantMemoryCategory {
  return value === 'communication_preference' || value === 'financial_goal' || value === 'person_alias' || value === 'account_preference' || value === 'routine_preference' || value === 'app_preference' || value === 'user_defined_fact'
}

function isMemory(value: unknown): value is AssistantMemory {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  const sensitivityOk = item.sensitivity === undefined || item.sensitivity === 'normal' || item.sensitivity === 'sensitive'
  const retentionOk = item.retention === undefined || item.retention === 'short' || item.retention === 'long' || item.retention === 'permanent'
  return typeof item.memoryId === 'string' && validCategory(item.category) && typeof item.summary === 'string' && item.summary.length <= 180 && typeof item.normalizedValue === 'string' && typeof item.displayLabel === 'string' && item.source === 'user-approved' && item.consentStatus === 'approved' && (item.status === 'active' || item.status === 'archived' || item.status === 'deleted') && typeof item.createdAt === 'number' && typeof item.updatedAt === 'number' && typeof item.confidence === 'number' && sensitivityOk && retentionOk && (item.sourceTurnId === undefined || typeof item.sourceTurnId === 'string') && (item.supersededBy === undefined || typeof item.supersededBy === 'string')
}

function isState(value: unknown): value is AssistantMemoryState {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  const profile = item.profile as Record<string, unknown> | undefined
  return item.version === 1 && typeof item.enabled === 'boolean' && Array.isArray(item.memories) && item.memories.every(isMemory) && !!profile && (profile.language === 'english' || profile.language === 'roman-urdu') && (profile.responseLength === 'short' || profile.responseLength === 'balanced' || profile.responseLength === 'detailed') && typeof profile.proactiveSuggestions === 'boolean' && (profile.preferredName === undefined || typeof profile.preferredName === 'string')
}

function normalizeProfile(value: AssistantPersonalizationProfile | Record<string, unknown>): AssistantPersonalizationProfile {
  const item = value as Record<string, unknown>
  const legacyTone = item.tone === 'warm' ? 'friendly' : item.tone === 'professional' ? 'direct' : item.tone
  return {
    ...DEFAULT_PERSONALIZATION,
    ...(typeof item.preferredName === 'string' ? { preferredName: item.preferredName.slice(0, 60) } : {}),
    language: item.language === 'roman-urdu' ? 'roman-urdu' : 'english',
    responseLength: item.responseLength === 'short' || item.responseLength === 'detailed' ? item.responseLength : 'balanced',
    tone: legacyTone === 'direct' || legacyTone === 'gentle' || legacyTone === 'strict' ? legacyTone : 'friendly',
  }
}

export function loadAssistantMemory(): AssistantMemoryState {
  if (typeof window === 'undefined') return createInitialAssistantMemory()
  try {
    const raw = window.localStorage.getItem(scopedStorageKey())
    const parsed: unknown = raw ? JSON.parse(raw) : undefined
    if (isState(parsed)) return { ...parsed, profile: normalizeProfile(parsed.profile) }
  } catch { /* isolated reset */ }
  return createInitialAssistantMemory()
}

export function saveAssistantMemory(state: AssistantMemoryState): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(scopedStorageKey(), JSON.stringify(state)) } catch { /* in-memory state remains usable */ }
}

export function clearAssistantMemory(): AssistantMemoryState {
  if (typeof window !== 'undefined') { try { window.localStorage.removeItem(scopedStorageKey()) } catch { /* no-op */ } }
  return createInitialAssistantMemory()
}

// Which layer a category belongs to. Layer E (recent conversation) is derived
// per turn in assistantConversation.ts, and layer F (financial records) lives in
// the finance and planning stores. Neither is ever written through this file.
const CATEGORY_LAYERS: Readonly<Record<AssistantMemoryCategory, AssistantMemoryLayer>> = {
  communication_preference: 'profile',
  app_preference: 'preferences',
  account_preference: 'preferences',
  routine_preference: 'preferences',
  financial_goal: 'goals',
  person_alias: 'people',
  user_defined_fact: 'preferences',
}

export function memoryLayer(category: AssistantMemoryCategory): AssistantMemoryLayer {
  return CATEGORY_LAYERS[category]
}

// Facts about other people are treated as sensitive by default: they are only
// surfaced when the current turn is actually about them.
function defaultSensitivity(category: AssistantMemoryCategory): AssistantMemorySensitivity {
  return category === 'person_alias' || category === 'financial_goal' ? 'sensitive' : 'normal'
}

// Preference keys that hold exactly one value. A newer memory on the same key
// replaces the older one instead of accumulating a contradictory pair.
const SINGLE_VALUE_KEYS = new Set(['name', 'language', 'length', 'tone'])

function supersedeKey(normalizedValue: string): string {
  const separator = normalizedValue.indexOf(':')
  const key = separator > 0 ? normalizedValue.slice(0, separator) : ''
  return SINGLE_VALUE_KEYS.has(key) ? key : normalizedValue
}

export interface MemoryProposalOptions {
  sensitivity?: AssistantMemorySensitivity
  retention?: AssistantMemoryRetention
  sourceTurnId?: string
}

export function createMemoryProposal(category: AssistantMemoryCategory, summary: string, normalizedValue: string, displayLabel: string, reason: string, now = Date.now(), options: MemoryProposalOptions = {}): AssistantMemoryProposal {
  return {
    proposalId: `memory-${now}-${Math.random().toString(36).slice(2, 8)}`,
    category,
    summary: summary.slice(0, 180),
    normalizedValue: normalizedValue.slice(0, 120),
    displayLabel: displayLabel.slice(0, 80),
    reason,
    createdAt: now,
    status: 'proposed',
    sensitivity: options.sensitivity ?? defaultSensitivity(category),
    retention: options.retention ?? (category === 'communication_preference' ? 'permanent' : 'long'),
    ...(options.sourceTurnId ? { sourceTurnId: options.sourceTurnId } : {}),
  }
}

export function saveMemoryProposal(state: AssistantMemoryState, proposal: AssistantMemoryProposal): AssistantMemoryState {
  if (!state.enabled || proposal.status !== 'proposed') return state
  if (state.memories.some((memory) => memory.memoryId === proposal.proposalId)) return state
  const now = Date.now()
  const memory: AssistantMemory = {
    memoryId: proposal.proposalId,
    category: proposal.category,
    summary: proposal.summary,
    normalizedValue: proposal.normalizedValue,
    displayLabel: proposal.displayLabel,
    source: 'user-approved',
    createdAt: now,
    updatedAt: now,
    confidence: 1,
    consentStatus: 'approved',
    status: 'active',
    sensitivity: proposal.sensitivity ?? defaultSensitivity(proposal.category),
    retention: proposal.retention ?? 'long',
    ...(proposal.sourceTurnId ? { sourceTurnId: proposal.sourceTurnId } : {}),
  }
  const profile = { ...state.profile }
  if (proposal.normalizedValue.startsWith('name:')) profile.preferredName = proposal.normalizedValue.slice(5)
  if (proposal.normalizedValue.includes('language:roman-urdu')) profile.language = 'roman-urdu'
  if (proposal.normalizedValue === 'language:english') profile.language = 'english'
  if (proposal.normalizedValue.includes('length:short')) profile.responseLength = 'short'
  else if (proposal.normalizedValue.startsWith('length:')) profile.responseLength = proposal.normalizedValue.slice(7) as AssistantPersonalizationProfile['responseLength']

  // Supersession is recorded, not silent: the replaced memory is archived and
  // points at the memory that replaced it, so the history stays inspectable.
  const key = supersedeKey(memory.normalizedValue)
  const memories = state.memories.map((item) =>
    item.status === 'active' && supersedeKey(item.normalizedValue) === key
      ? { ...item, status: 'archived' as const, supersededBy: memory.memoryId, updatedAt: now }
      : item,
  )
  return { ...state, profile, memories: [...memories, memory].slice(-MAX_MEMORIES) }
}

export function forgetMemory(state: AssistantMemoryState, query?: string): AssistantMemoryState {
  const target = query?.toLocaleLowerCase().trim()
  if (!target) return state
  return { ...state, memories: state.memories.map((memory) => memory.status === 'active' && (memory.displayLabel.toLocaleLowerCase().includes(target) || memory.summary.toLocaleLowerCase().includes(target)) ? { ...memory, status: 'deleted', updatedAt: Date.now() } : memory) }
}

export function activeMemories(state: AssistantMemoryState): readonly AssistantMemory[] { return state.memories.filter((memory) => memory.status === 'active') }

function searchableTokens(value: string): Set<string> {
  return new Set(
    value.toLocaleLowerCase()
      .replaceAll(/[^a-z0-9\s]/gu, ' ')
      .split(/\s+/u)
      .filter((token) => token.length > 2),
  )
}

// General lexical relevance keeps memory retrieval independent of an exact
// phrase dictionary. Communication preferences are always eligible because they
// shape how a reply is written even when their words are absent from the turn.
export function selectRelevantMemories(
  state: AssistantMemoryState,
  question: string,
  limit = 5,
): readonly AssistantMemory[] {
  if (!state.enabled) return []
  const questionTokens = searchableTokens(question)
  return activeMemories(state)
    .map((memory) => {
      const memoryTokens = searchableTokens(`${memory.summary} ${memory.normalizedValue} ${memory.displayLabel}`)
      const overlap = [...memoryTokens].filter((token) => questionTokens.has(token)).length
      // A sensitive fact is only eligible when the turn actually mentions it,
      // so it never leaks into an unrelated reply as background colour.
      const preferenceWeight = memory.category === 'communication_preference' ? 2 : 0
      const eligible = memory.sensitivity === 'sensitive' ? overlap > 0 : overlap + preferenceWeight > 0
      return { memory, score: eligible ? overlap + preferenceWeight : 0 }
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || right.memory.updatedAt - left.memory.updatedAt)
    .slice(0, Math.max(0, Math.min(limit, 5)))
    .map(({ memory }) => memory)
}

export interface MemoryInspectionCommand { text?: string; forgetQuery?: string }

function matchingMemories(question: string, memories: readonly AssistantMemory[]): readonly AssistantMemory[] {
  const commandTokens = searchableTokens(question)
  return memories
    .map((memory) => {
      const candidateTokens = searchableTokens(`${memory.displayLabel} ${memory.summary}`)
      return {
        memory,
        score: [...candidateTokens].filter((token) => commandTokens.has(token)).length,
      }
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || right.memory.updatedAt - left.memory.updatedAt)
    .map(({ memory }) => memory)
}

// Inspecting and deleting stored memories stays local because it reads and
// writes local data that no model call can see, and because a delete must not
// depend on a network round trip. Deciding *what is worth remembering* is not
// handled here — that is the model's judgement, arriving as a memory proposal.
export function parseMemoryInspectionCommand(question: string, state: AssistantMemoryState): MemoryInspectionCommand {
  const input = question.toLocaleLowerCase().trim()
  const asksAboutMemories = /\b(memor(?:y|ies)|yaad(?:dasht)?)\b/u.test(input)
  if (!asksAboutMemories) return {}

  if (/\b(dikhao|dikhaye|batao|list|show|kya|what|konsi|kaunsi)\b/u.test(input)) {
    const memories = activeMemories(state)
    return {
      text: memories.length
        ? `Saved memories: ${memories.map((memory) => memory.displayLabel).join(', ')}.`
        : 'Abhi koi saved memory nahi hai.',
    }
  }
  if (/\b(bhool|bhula|delete|remove|forget|hatao|mitao)\b/u.test(input)) {
    const memories = activeMemories(state)
    const matches = matchingMemories(question, memories)
    if (matches.length === 1 && matches[0]) {
      return { text: `${matches[0].displayLabel} has been removed.`, forgetQuery: matches[0].displayLabel }
    }
    if (matches.length > 1) {
      return { text: `Which saved memory should I remove: ${matches.slice(0, 3).map((memory) => memory.displayLabel).join(', ')}?` }
    }
    if (memories.length === 1 && memories[0]) {
      return { text: `${memories[0].displayLabel} has been removed.`, forgetQuery: memories[0].displayLabel }
    }
    return {
      text: memories.length
        ? `Which saved memory should I remove: ${memories.slice(0, 3).map((memory) => memory.displayLabel).join(', ')}?`
        : 'There are no saved memories to remove.',
    }
  }
  return {}
}
