/**
 * The single provider/tool loop for Personal Companion.
 *
 * One request path, one bounded round ceiling, one transcript. The provider is
 * the only semantic authority: it decides whether a tool is needed, which tool,
 * and how to word the answer. This module owns the wire protocol and the
 * transcript, nothing about meaning.
 *
 * Protocol invariants enforced here:
 *  - `tool_choice` is never serialized, in any form.
 *  - The complete tool list is resent on every round.
 *  - The provider assistant message is replayed verbatim, including
 *    `reasoning_content` and any other provider transcript field.
 *  - Every provider-issued `tool_call_id` is echoed unchanged.
 *  - One hard ceiling bounds rounds, so a loop cannot burn tokens.
 */

/** Total provider calls per turn. Permits read -> calculate -> final with headroom. */
export const MAX_PROVIDER_ROUNDS = 5
/** Upper bound on tool calls the provider may request in one message. */
export const MAX_TOOL_CALLS_PER_MESSAGE = 8
/** A single turn may preview at most this many financial actions. */
export const MAX_BATCH_ACTIONS = 5
/** Budget for the user-visible answer. */
export const FINAL_TEXT_LIMIT = 1_200
/** Hard bound on a raw provider content string before it is trimmed. */
export const PROVIDER_CONTENT_LIMIT = 8_000
/** Hard bound on one serialized tool-call argument blob. */
const TOOL_ARGUMENTS_LIMIT = 4_000

/**
 * Server runtime rollback switch. Missing means the normal companion mode;
 * every other value fails conservatively into the degraded path.
 */
export function runtimeCompanionEnabled(value: string | undefined): boolean {
  if (value === undefined) return true
  const normalized = value.trim().toLocaleLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'enabled'
}

export type CompanionFailureReason = 'timeout' | 'unreachable' | 'rejected' | 'malformed' | 'round-ceiling'

/** A provider failure carrying only a sanitized status and code. Never a key, header, or record. */
export class CompanionProviderFailure extends Error {
  readonly reason: CompanionFailureReason
  readonly httpStatus?: number
  readonly providerCode?: string
  readonly providerMessage?: string

  constructor(
    reason: CompanionFailureReason,
    details: { httpStatus?: number; providerCode?: string; providerMessage?: string } = {},
  ) {
    super(`provider-${reason}`)
    this.name = 'CompanionProviderFailure'
    this.reason = reason
    if (details.httpStatus !== undefined) this.httpStatus = details.httpStatus
    if (details.providerCode) this.providerCode = details.providerCode
    if (details.providerMessage) this.providerMessage = details.providerMessage
  }
}

export interface ProviderToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/**
 * A parsed provider assistant message.
 *
 * `raw` is the untouched provider object. It is what gets replayed on the next
 * round, so `reasoning_content` and any future provider transcript field
 * survive verbatim. `content` and `toolCalls` are a read-only view used to
 * decide what to execute; they never replace `raw`.
 */
export interface ProviderAssistantMessage {
  raw: Record<string, unknown>
  content: string
  toolCalls: readonly ProviderToolCall[]
}

/** Any message on the wire. Assistant turns are replayed as their raw object. */
export type ProviderMessage = Record<string, unknown>

export interface ToolExecution<Action, Memory> {
  result: Record<string, unknown>
  action?: Action
  memory?: Memory
}

export interface CompanionTurn<Action, Memory> {
  /** The provider's own final wording. Never reconstructed from a template. */
  text: string
  actions: readonly Action[]
  memory?: Memory
  /** Validated read-tool results, retained so cards can be built from app truth. */
  readResults: readonly { name: string; result: Record<string, unknown> }[]
  calledTools: readonly string[]
  rounds: number
  /** Proposal tool calls requested, including any that failed validation. */
  actionCallsRequested: number
  actionCallsAccepted: number
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function safeCallId(value: unknown): string {
  return typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,100}$/u.test(value) ? value : ''
}

/** Strips control and bidirectional characters, which are the injection surface. */
export function sanitiseText(value: string, limit: number): string {
  let cleaned = ''
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    const hidden = code < 0x20 || (code >= 0x7f && code <= 0x9f) ||
      (code >= 0x200b && code <= 0x200f) || (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2060 && code <= 0x206f)
    cleaned += hidden ? ' ' : character
  }
  return cleaned.replaceAll(/\s+/gu, ' ').trim().slice(0, limit)
}

function truncateAtBoundary(value: string, limit: number): string {
  if (value.length <= limit) return value
  const slice = value.slice(0, limit - 1).trimEnd()
  const floor = Math.floor(limit * 0.6)
  const punctuation = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('? '), slice.lastIndexOf('! '))
  const boundary = punctuation >= floor ? punctuation + 1 : slice.lastIndexOf(' ')
  return `${(boundary >= floor ? slice.slice(0, boundary) : slice).trimEnd()}…`
}

/** The user-visible answer: the provider's words, cleaned and bounded. Never a JSON envelope. */
export function finalAnswerText(content: string): string {
  const cleaned = sanitiseText(content, PROVIDER_CONTENT_LIMIT)
    .replace(/```[a-z]*/giu, ' ')
    .replaceAll('```', ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim()
  return truncateAtBoundary(cleaned, FINAL_TEXT_LIMIT)
}

/**
 * Reads one chat completion.
 *
 * The provider message object is kept whole. Only the fields needed to execute
 * tools are validated; everything else rides along untouched so the next
 * request replays a transcript the provider itself produced.
 */
export function parseChatCompletion(payload: unknown): ProviderAssistantMessage {
  const root = objectRecord(payload)
  const choices = root && Array.isArray(root.choices) ? root.choices : []
  const message = objectRecord(objectRecord(choices[0])?.message)
  if (!message) throw new CompanionProviderFailure('malformed', { providerCode: 'message_shape' })

  const content = typeof message.content === 'string' ? message.content : ''
  let toolCalls: ProviderToolCall[] = []
  if (message.tool_calls !== undefined && message.tool_calls !== null) {
    if (!Array.isArray(message.tool_calls) || message.tool_calls.length > MAX_TOOL_CALLS_PER_MESSAGE) {
      throw new CompanionProviderFailure('malformed', { providerCode: 'tool_call_shape' })
    }
    toolCalls = message.tool_calls.map((candidate) => {
      const call = objectRecord(candidate)
      const fn = objectRecord(call?.function)
      const id = safeCallId(call?.id)
      const name = typeof fn?.name === 'string' ? sanitiseText(fn.name, 80) : ''
      const args = typeof fn?.arguments === 'string' ? fn.arguments : ''
      if (!id || call?.type !== 'function' || !name || args.length > TOOL_ARGUMENTS_LIMIT) {
        throw new CompanionProviderFailure('malformed', { providerCode: 'tool_call_shape' })
      }
      return { id, type: 'function' as const, function: { name, arguments: args } }
    })
  }
  if (!content.trim() && !toolCalls.length) {
    throw new CompanionProviderFailure('malformed', { providerCode: 'empty_message' })
  }
  return { raw: message, content, toolCalls }
}

export function parseToolArguments(raw: string): Record<string, unknown> | undefined {
  if (!raw.trim()) return {}
  try {
    return objectRecord(JSON.parse(raw))
  } catch {
    return undefined
  }
}

export interface ProviderRequestSettings {
  model: string
  temperature: number
  maxTokens: number
}

/**
 * The serialized provider request body.
 *
 * `tool_choice` is deliberately absent — not `auto`, not `required`, not a named
 * tool. Constructing it at all would be the application telling the model what
 * a message means, which is the model's work. The complete tool list is
 * included here on every round, so a later round is never narrowed to a subset
 * or to a single tool.
 */
export function buildProviderRequestBody(
  settings: ProviderRequestSettings,
  messages: readonly ProviderMessage[],
  tools: readonly Record<string, unknown>[],
): Record<string, unknown> {
  return {
    model: settings.model,
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
    messages,
    tools,
  }
}

export interface CompanionLoopOptions<Action, Memory> {
  systemPrompt: string
  /** Prior visible turns, already bounded, replayed as ordinary chat messages. */
  history?: readonly { role: 'user' | 'assistant'; content: string }[]
  userContent: string
  /** Complete tool surface. Resent unchanged on every round. */
  tools: readonly Record<string, unknown>[]
  registeredTools: ReadonlySet<string>
  proposalTools: ReadonlySet<string>
  /** Proposal tools that draft a financial action; excludes memory. */
  actionTools: ReadonlySet<string>
  /** Deterministic reasoning tools whose results are derived truth, not app records. */
  reasoningTools: ReadonlySet<string>
  /**
   * One provider round. The complete tool list is handed over every time, so a
   * later round can never be narrowed to a subset or to one forced tool.
   */
  callProvider: (
    messages: readonly ProviderMessage[],
    round: number,
    tools: readonly Record<string, unknown>[],
  ) => Promise<ProviderAssistantMessage>
  executeTool: (name: string, args: Record<string, unknown>) => ToolExecution<Action, Memory>
  onEvent?: (event: { event: string; round: number; toolNames?: string[]; errorCode?: string }) => void
}

/**
 * One standard bounded multi-round tool loop.
 *
 * The same path serves ordinary conversation, reads, read-then-calculate,
 * advice, proposals, and compound read-plus-proposal turns. There is no
 * per-shape branch and no forced round of any kind.
 */
export async function runCompanionLoop<Action, Memory>(
  options: CompanionLoopOptions<Action, Memory>,
): Promise<CompanionTurn<Action, Memory>> {
  const messages: ProviderMessage[] = [
    { role: 'system', content: options.systemPrompt },
    ...(options.history ?? []).map((turn) => ({ role: turn.role, content: turn.content })),
    { role: 'user', content: options.userContent },
  ]
  const executedCallIds = new Set<string>()
  const actions: Action[] = []
  const calledTools: string[] = []
  const readResults: { name: string; result: Record<string, unknown> }[] = []
  let memory: Memory | undefined
  let actionCallsRequested = 0
  let actionCallsAccepted = 0

  for (let round = 1; round <= MAX_PROVIDER_ROUNDS; round += 1) {
    const assistant = await options.callProvider(messages, round, options.tools)
    const calls = assistant.toolCalls
    options.onEvent?.({
      event: calls.length ? 'provider-tool-calls' : 'provider-final-message',
      round,
      ...(calls.length ? { toolNames: calls.map((call) => call.function.name) } : {}),
    })

    if (!calls.length) {
      const text = finalAnswerText(assistant.content)
      if (text.length < 2) throw new CompanionProviderFailure('malformed', { providerCode: 'empty_answer' })
      return {
        text,
        actions,
        ...(memory ? { memory } : {}),
        readResults,
        calledTools,
        rounds: round,
        actionCallsRequested,
        actionCallsAccepted,
      }
    }

    // The provider still wants tools but no round is left to read the results.
    if (round === MAX_PROVIDER_ROUNDS) {
      options.onEvent?.({ event: 'round-ceiling-reached', round, errorCode: 'round_ceiling' })
      throw new CompanionProviderFailure('round-ceiling', { providerCode: 'round_ceiling' })
    }

    const seenThisRound = new Set<string>()
    for (const call of calls) {
      if (seenThisRound.has(call.id)) {
        throw new CompanionProviderFailure('malformed', { providerCode: 'duplicate_tool_call_id' })
      }
      seenThisRound.add(call.id)
    }

    // The provider's own message is replayed verbatim ahead of its tool results.
    messages.push(assistant.raw)

    for (const call of calls) {
      if (options.actionTools.has(call.function.name)) actionCallsRequested += 1
      let execution: ToolExecution<Action, Memory>
      let executed = false

      if (executedCallIds.has(call.id)) {
        execution = { result: { status: 'invalid_arguments', error: 'duplicate_tool_call' } }
      } else if (!options.registeredTools.has(call.function.name)) {
        execution = { result: { status: 'invalid_arguments', error: 'unknown_tool' } }
      } else {
        const args = parseToolArguments(call.function.arguments)
        if (!args) {
          execution = { result: { status: 'invalid_arguments', error: 'malformed_arguments' } }
        } else {
          execution = options.executeTool(call.function.name, args)
          executedCallIds.add(call.id)
          executed = true
          calledTools.push(call.function.name)
        }
      }

      // A financial batch and a memory preview cannot share one turn.
      if (execution.action && memory) {
        execution = { result: { status: 'invalid_arguments', error: 'memory_preview_already_exists' } }
      }
      if (execution.memory && (memory || actions.length)) {
        execution = { result: { status: 'invalid_arguments', error: 'supporting_proposal_already_exists' } }
      }
      if (execution.action) {
        if (actions.length >= MAX_BATCH_ACTIONS) {
          execution = { result: { status: 'invalid_arguments', error: 'action_limit_exceeded' } }
        } else {
          actions.push(execution.action)
          actionCallsAccepted += 1
        }
      }
      if (execution.memory) memory = execution.memory
      if (executed && !options.proposalTools.has(call.function.name) && !options.reasoningTools.has(call.function.name)) {
        readResults.push({ name: call.function.name, result: execution.result })
      }

      // The id is echoed exactly as the provider issued it.
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(execution.result) })
    }
  }

  options.onEvent?.({ event: 'round-ceiling-reached', round: MAX_PROVIDER_ROUNDS, errorCode: 'round_ceiling' })
  throw new CompanionProviderFailure('round-ceiling', { providerCode: 'round_ceiling' })
}
