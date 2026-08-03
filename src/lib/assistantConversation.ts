import type { AssistantConversationState, AssistantMessage, AssistantUnresolvedAction } from '../models/assistant'

// Layer E of the memory model: what the conversation is currently about.
//
// This module produces *context*, never an answer. It does not classify intent,
// does not decide whether an action is wanted, and does not choose a reply. Its
// only job is to give the model enough structure to resolve what the user is
// referring to, and to mark which figures came from conversation rather than
// from the financial records. Every decision that follows is the model's.

// Words that point at something said earlier instead of naming it. This is a
// reference lexicon used for detection only; it never maps to a response.
//
// Ordinary connectives are deliberately absent. `aur` means "and" far more often
// than "more of that", so treating it as a reference marked almost every Roman
// Urdu sentence as a continuation and drained the signal of meaning. A genuine
// continuation like "aur add kar do" is short enough to be caught below anyway.
const REFERENCE_MARKERS: readonly string[] = [
  'woh', 'wo', 'ye', 'yeh', 'usko', 'usay', 'usse', 'usi', 'usme', 'usmein', 'unko', 'unhe', 'unhein',
  'iska', 'uska', 'unka', 'baqi', 'baki', 'bacha', 'bachi', 'pehle', 'pehla', 'wala', 'wali',
  'abhi', 'phir', 'half', 'aadha', 'adha', 'thora', 'thoda', 'itna', 'utna',
  'it', 'that', 'this', 'them', 'those', 'rest', 'remaining', 'same', 'again', 'instead', 'earlier',
  'more',
]

// Relationship words that name a person without giving a proper name. Used to
// notice that a person is being referred to, so the model can resolve or ask.
const RELATIONSHIP_WORDS: readonly string[] = [
  'ammi', 'ami', 'amma', 'ama', 'abbu', 'abu', 'abba', 'baba', 'mama', 'mami', 'chacha', 'chachi',
  'khala', 'khalu', 'phupho', 'phupha', 'nana', 'nani', 'dada', 'dadi', 'bhai', 'bhaijan',
  'behn', 'behen', 'bahen', 'beta', 'beti', 'bivi', 'shohar', 'dost', 'friend',
  'mom', 'mother', 'dad', 'father', 'brother', 'sister', 'son', 'daughter', 'wife', 'husband',
  'uncle', 'aunt', 'cousin', 'landlord', 'boss',
]

const MAX_SUMMARY_MESSAGES = 3
const MAX_SUMMARY_CHARS = 160
const MAX_CONVERSATIONAL_AMOUNTS = 6
const MAX_UNRESOLVED = 5

function tokens(value: string): readonly string[] {
  return value
    .toLocaleLowerCase()
    .replaceAll(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean)
}

function amountsIn(value: string): readonly number[] {
  return [...value.matchAll(/\d[\d,]*/gu)]
    .map((match) => Number(match[0].replaceAll(',', '')))
    .filter((amount) => Number.isSafeInteger(amount) && amount >= 100 && amount <= 100_000_000)
}

function lastSentence(value: string): string {
  const sentences = value.match(/[^.!?]+[.!?]?/gu)?.map((item) => item.trim()).filter(Boolean) ?? []
  return sentences.at(-1) ?? value.trim()
}

function visible(messages: readonly AssistantMessage[]): readonly AssistantMessage[] {
  return messages.filter((message) => message.id !== 'assistant-introduction')
}

// A message continues the previous exchange when it points backwards rather
// than standing alone: it uses a reference word, it is a short reply, or it
// directly follows a question the assistant asked.
export function isFollowUpMessage(
  question: string,
  messages: readonly AssistantMessage[],
): boolean {
  const history = visible(messages)
  if (!history.length) return false
  const words = tokens(question)
  if (!words.length) return false
  const markers = new Set(REFERENCE_MARKERS)
  if (words.some((word) => markers.has(word))) return true
  // A bare amount is normally an answer or correction to the immediately
  // preceding exchange. Other short messages are not automatically follow-ups:
  // that heuristic incorrectly carried old people and amounts into new topics.
  if (words.length <= 3 && amountsIn(question).length > 0) return true
  return pendingAssistantQuestion(messages) !== undefined
}

// The last thing the assistant asked, when the user has not replied to it yet.
export function pendingAssistantQuestion(
  messages: readonly AssistantMessage[],
): string | undefined {
  const previous = visible(messages).at(-1)
  if (previous?.role !== 'assistant') return undefined
  const sentence = lastSentence(previous.text)
  return sentence.endsWith('?') ? sentence.slice(0, 200) : undefined
}

// People named in the current turn who have no matching local record. Naming
// them lets the model decide between resolving, proposing a record, or asking,
// instead of the app guessing on its behalf.
export function unresolvedReferences(
  question: string,
  knownLabels: readonly string[],
): readonly string[] {
  const words = tokens(question)
  const known = new Set(knownLabels.flatMap((label) => tokens(label)))
  const relationships = new Set(RELATIONSHIP_WORDS)
  const found: string[] = []
  for (const word of words) {
    if (!relationships.has(word) || known.has(word)) continue
    if (!found.includes(word)) found.push(word)
  }
  return found.slice(0, MAX_UNRESOLVED)
}

// Figures that exist only in the transcript. They are reported separately from
// tool results so the model can use them to understand a reference without ever
// restating one as the user's current position.
export function conversationalAmounts(
  question: string,
  messages: readonly AssistantMessage[],
  authoritative: readonly number[],
): readonly number[] {
  const recorded = new Set(authoritative)
  const seen = new Set<number>()
  const collected: number[] = []
  const sources = [...visible(messages).slice(-8).map((message) => message.text), question]
  for (const text of sources.reverse()) {
    for (const amount of amountsIn(text)) {
      if (recorded.has(amount) || seen.has(amount)) continue
      seen.add(amount)
      collected.push(amount)
    }
  }
  return collected.slice(0, MAX_CONVERSATIONAL_AMOUNTS)
}

// --- Unresolved intended action ---------------------------------------------
// Detection only. This module never builds a draft, never resolves an account id
// and never records anything: it reports that the previous turn discussed an
// action which never became a confirmable preview, plus whatever the user's own
// words plainly contained. Preparing the action again is the model's decision,
// and executing it still requires the visible Confirm button.

// Structural markers for text that promises a confirmable preview. Kept in step
// with the Edge-side claim detector; the truth check is always the absence of a
// real proposal, so this never has to match every possible phrasing.
const PREVIEW_CLAIM_PATTERN =
  /\bconfirm\b|\bconfirmation\b|\bpreview\b|\bproposal\b|\bproposed\b|\bpreparing\b|\bprepared\b|\brecord (?:kar|ho)|\bsave ho\b|\bsave karn?[ae]\b|\btayyar\b|\btayar\b|\bbana ?(?:raha|rahi|rha|di|diya|dia)\b|\bkuch bhi change nahi\b|\bnothing (?:will )?change\b/iu

/** True when the text implies a confirmable preview exists. */
export function claimsPreview(text: string): boolean {
  return PREVIEW_CLAIM_PATTERN.test(text)
}

const GIVEN_PATTERN = /\b(diye|diya|dii|di|dedi|dedia|dediya|dena|deni|kharch|kharcha|paid|pay|gave|give|spent|salary|bill)\b/iu
const RECEIVED_PATTERN = /\b(mila|mili|milay|mile|aya|aaya|received|got|income|kamaya|kamaye)\b/iu
const OWED_TO_USER_PATTERN = /\b(lene|lena|lene hain|wapas karega|wapas karegi|owes|receivable)\b/iu
const OWED_BY_USER_PATTERN = /\b(dene hain|dena hai|wapas karna|qarz|karz|udhaar|udhar|payable)\b/iu
const TRANSFER_PATTERN = /\b(transfer|shift|move|bheja|bheje)\b/iu
const PURPOSE_PATTERN =
  /\b(salary|kaam|kam|work|bill|rent|kiraya|grocery|groceries|khana|food|fees|fee|medical|dawa|transport|petrol|repair|gift|charity|zakat|loan|udhaar|udhar|advance|bonus|shopping|kapre|clothes|mobile|internet|utility|bijli|gas|pani|school|tuition)\b/iu

function unresolvedActionType(text: string): AssistantUnresolvedAction['actionType'] | undefined {
  if (TRANSFER_PATTERN.test(text)) return 'transfer'
  if (OWED_TO_USER_PATTERN.test(text)) return 'receivable'
  if (OWED_BY_USER_PATTERN.test(text)) return 'payable'
  if (GIVEN_PATTERN.test(text)) return 'expense'
  if (RECEIVED_PATTERN.test(text)) return 'income'
  return undefined
}

// The largest figure in the request. A request usually names one amount; when it
// names more this is context for the model to disambiguate, not a decision.
function primaryAmount(text: string): number | undefined {
  const amounts = amountsIn(text)
  return amounts.length ? Math.max(...amounts) : undefined
}

// Matched against the labels the app already knows, so an account is only
// reported when the user actually named one that exists.
function namedAccountLabel(text: string, knownLabels: readonly string[]): string | undefined {
  const words = new Set(tokens(text))
  for (const label of knownLabels) {
    const parts = tokens(label)
    if (parts.length && parts.every((part) => words.has(part))) return label.slice(0, 60)
  }
  // A bare account word still tells the model which account family was meant.
  for (const word of ['cash', 'bank', 'wallet', 'easypaisa', 'jazzcash', 'card']) {
    if (words.has(word)) return word
  }
  return undefined
}

// A capitalised word that no record matches, or a relationship word. Used only
// so a clarification can name the person the user named.
function namedPerson(text: string, knownLabels: readonly string[]): string | undefined {
  const known = new Set(knownLabels.flatMap((label) => tokens(label)))
  const relationships = new Set(RELATIONSHIP_WORDS)
  const stop = new Set([
    'main', 'mein', 'mene', 'maine', 'mera', 'meri', 'mere', 'usne', 'usko', 'uska', 'woh', 'wo',
    'cash', 'bank', 'pkr', 'rupees', 'rupee', 'rs', 'aur', 'or', 'ko', 'ke', 'ki', 'ka', 'hai',
    'hein', 'hain', 'tha', 'thi', 'the', 'to', 'par', 'kar', 'karo', 'karna', 'karke', 'liye',
  ])
  for (const word of tokens(text)) {
    if (stop.has(word) || known.has(word)) continue
    if (relationships.has(word)) return word
  }
  // Proper names keep their original casing in the raw message.
  const capitalised = text.match(/(?<![.!?]\s)\b\p{Lu}\p{Ll}{2,}\b/gu) ?? []
  for (const candidate of capitalised) {
    const lowered = candidate.toLocaleLowerCase()
    if (stop.has(lowered) || known.has(lowered)) continue
    return candidate.slice(0, 60)
  }
  return undefined
}

// Reads the previous exchange: an assistant turn that promised a preview while
// carrying neither a proposal nor a batch is an unresolved intended action.
export function detectUnresolvedAction(
  messages: readonly AssistantMessage[],
  knownLabels: readonly string[],
): AssistantUnresolvedAction | undefined {
  const history = visible(messages)
  const lastAssistant = [...history].reverse().find((message) => message.role === 'assistant')
  if (!lastAssistant) return undefined
  // A preview that exists, was executed, or was deliberately ended is resolved.
  if (lastAssistant.proposal || lastAssistant.batch || lastAssistant.receipt) return undefined
  if (!PREVIEW_CLAIM_PATTERN.test(lastAssistant.text)) return undefined

  const assistantIndex = history.lastIndexOf(lastAssistant)
  const request = [...history.slice(0, assistantIndex)].reverse()
    .find((message) => message.role === 'user')?.text
  if (!request) return undefined

  const actionType = unresolvedActionType(request)
  const amountPkr = primaryAmount(request)
  const accountLabel = namedAccountLabel(request, knownLabels)
  const personOrBusiness = namedPerson(request, knownLabels)
  const missing: AssistantUnresolvedAction['missingFields'][number][] = []
  if (amountPkr === undefined) missing.push('amount')
  if (!accountLabel) missing.push('account')
  if (!personOrBusiness && (actionType === 'receivable' || actionType === 'payable')) missing.push('person')
  if (!PURPOSE_PATTERN.test(request)) missing.push('purpose')

  return {
    claimedPreview: true,
    proposalCreated: false,
    ...(actionType ? { actionType } : {}),
    ...(personOrBusiness ? { personOrBusiness } : {}),
    ...(amountPkr === undefined ? {} : { amountPkr }),
    ...(accountLabel ? { accountLabel } : {}),
    missingFields: missing,
  }
}

// A compact running topic built from the user's own recent wording, so the
// model does not have to re-read the transcript to know what is being discussed.
function conversationSummary(messages: readonly AssistantMessage[]): string {
  const said = visible(messages)
    .filter((message) => message.role === 'user')
    .slice(-MAX_SUMMARY_MESSAGES)
    .map((message) => message.text.replaceAll(/\s+/gu, ' ').trim().slice(0, MAX_SUMMARY_CHARS))
    .filter(Boolean)
  return said.join(' | ')
}

export function buildConversationState(
  question: string,
  messages: readonly AssistantMessage[],
  knownLabels: readonly string[],
  authoritativeAmounts: readonly number[],
): AssistantConversationState {
  const followUp = isFollowUpMessage(question, messages)
  const pending = pendingAssistantQuestion(messages)
  // What the user was weighing before this message, quoted rather than
  // paraphrased, so a follow-up can be read against their actual words.
  const previousUser = followUp
    ? visible(messages).filter((message) => message.role === 'user').at(-1)?.text
      .replaceAll(/\s+/gu, ' ').trim().slice(0, 200)
    : undefined
  const unresolvedAction = detectUnresolvedAction(messages, knownLabels)

  return {
    summary: followUp ? conversationSummary(messages) : '',
    unresolvedReferences: unresolvedReferences(question, knownLabels),
    ...(previousUser ? { openDecision: previousUser } : {}),
    ...(pending ? { pendingQuestion: pending } : {}),
    conversationalAmounts: conversationalAmounts(question, messages, authoritativeAmounts),
    isFollowUp: followUp,
    ...(unresolvedAction ? { unresolvedAction } : {}),
  }
}
