export const MAX_TOOL_ROUNDS = 2
/** A single turn may preview at most this many financial actions. */
export const MAX_BATCH_ACTIONS = 5
/** Upper bound on tool calls the provider may request in one message. */
export const MAX_TOOL_CALLS_PER_MESSAGE = 8

export type AssistantResponseKind =
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

export interface ProviderToolCall {
  index?: number
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ProviderToolCall[]
  tool_call_id?: string
}

export interface FinalAssistantContent {
  text: string
  kind?: AssistantResponseKind
  followUps?: { id: string; label: string }[]
  financeItems?: { label: string; detail?: string; amount?: number }[]
  memoryCandidate?: { category: string; summary: string; normalizedValue: string; displayLabel: string; reason: string; sensitivity?: 'normal' | 'sensitive'; retention?: 'short' | 'long' | 'permanent' }
}

export interface ToolExecution<Action, Memory> {
  result: Record<string, unknown>
  action?: Action
  memory?: Memory
}

export interface ToolLoopResult<Action, Memory> {
  deepRequested?: boolean
  final?: FinalAssistantContent
  /** Every successfully drafted action, in the order the provider requested them. */
  actions: readonly Action[]
  memory?: Memory
  usedReadTool: boolean
  messages: ProviderMessage[]
  rounds: number
  calledTools: string[]
  /** Action proposal tool calls the provider asked for, including rejected ones. */
  actionCallsRequested: number
  /** Action proposal tool calls that produced a validated draft. */
  actionCallsAccepted: number
}

export type ToolLoopErrorCode =
  | 'provider_message_shape'
  | 'provider_tool_call_shape'
  | 'duplicate_tool_call_id'
  | 'final_json_malformed'
  | 'unsupported_kind'
  | 'final_schema_invalid'
  | 'final_text_invalid'
  | 'final_number_invalid'
  | 'tool_round_limit'
  | 'action_limit_exceeded'

export class ToolLoopFailure extends Error {
  readonly code: ToolLoopErrorCode

  constructor(code: ToolLoopErrorCode) {
    super(code)
    this.code = code
    this.name = 'ToolLoopFailure'
  }
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function safeCallId(value: unknown): string {
  return typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,100}$/u.test(value) ? value : ''
}

function sanitiseText(value: string, limit: number): string {
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

export function numericTokens(value: string): Set<string> {
  return new Set((value.match(/\d[\d,]*(?:\.\d+)?/gu) ?? []).map((token) => token.replaceAll(',', '')))
}

export function parseChatCompletion(payload: unknown): ProviderMessage {
  const root = objectRecord(payload)
  const choices = root && Array.isArray(root.choices) ? root.choices : []
  const choice = objectRecord(choices[0])
  const message = objectRecord(choice?.message)
  if (!message) throw new ToolLoopFailure('provider_message_shape')

  const content = typeof message.content === 'string'
    ? sanitiseText(message.content, 1_200)
    : null
  let toolCalls: ProviderToolCall[] = []
  if (message.tool_calls !== undefined) {
    if (!Array.isArray(message.tool_calls)) throw new ToolLoopFailure('provider_tool_call_shape')
    if (message.tool_calls.length > MAX_TOOL_CALLS_PER_MESSAGE) throw new ToolLoopFailure('provider_tool_call_shape')
    toolCalls = message.tool_calls.map((candidate) => {
      const call = objectRecord(candidate)
      const fn = objectRecord(call?.function)
      const id = safeCallId(call?.id)
      const name = typeof fn?.name === 'string' ? sanitiseText(fn.name, 80) : ''
      const args = typeof fn?.arguments === 'string' ? fn.arguments.slice(0, 4_000) : undefined
      const index = typeof call?.index === 'number' && Number.isSafeInteger(call.index) && call.index >= 0
        ? call.index
        : undefined
      if (!id || call?.type !== 'function' || !name || args === undefined ||
          (typeof fn?.arguments === 'string' && fn.arguments.length > 4_000)) {
        throw new ToolLoopFailure('provider_tool_call_shape')
      }
      return {
        ...(index === undefined ? {} : { index }),
        id,
        type: 'function' as const,
        function: { name, arguments: args },
      }
    })
  }
  if (!content && !toolCalls.length) throw new ToolLoopFailure('provider_message_shape')
  return { role: 'assistant', content, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }
}

export function parseToolArguments(raw: string): { status: 'ok'; arguments: Record<string, unknown> } | { status: 'invalid_arguments' } {
  try {
    const parsed: unknown = JSON.parse(raw)
    const args = objectRecord(parsed)
    return args ? { status: 'ok', arguments: args } : { status: 'invalid_arguments' }
  } catch {
    return { status: 'invalid_arguments' }
  }
}

function responseKind(value: unknown): AssistantResponseKind | undefined {
  if (value === 'finance') return 'finance_summary'
  return value === 'conversation' || value === 'advice' || value === 'clarification' ||
      value === 'finance_summary' || value === 'finance_list' || value === 'finance_detail' ||
      value === 'action_proposal' || value === 'action_batch' || value === 'memory_proposal' ||
      value === 'local_fallback'
    ? value
    : undefined
}

/**
 * Structural markers for text that promises a confirmable preview. Used only to
 * detect a claim; the truth check itself is the presence of a validated draft,
 * so this never needs to match every possible phrasing.
 */
const PROPOSAL_CLAIM_PATTERN =
  /\bconfirm\b|\bconfirmation\b|\bpreview\b|\bproposal\b|\bproposed\b|\bpreparing\b|\bprepared\b|\brecord (?:kar|ho)|\bsave ho\b|\bsave karn?[ae]\b|\btayyar\b|\btayar\b|\bbana ?(?:raha|rahi|rha|di|diya|dia)\b|\bkuch bhi change nahi\b|\bnothing (?:will )?change\b/iu

/** True when the text implies a confirmable action preview exists. */
export function claimsActionPreview(text: string): boolean {
  return PROPOSAL_CLAIM_PATTERN.test(text)
}

export function parseFinalAssistantContent(
  raw: string,
  allowedNumbers: ReadonlySet<string>,
  requireAuthoritativeNumbers = false,
): FinalAssistantContent {
  const trimmed = raw.trim()
  let textValue = trimmed
  let kind: AssistantResponseKind | undefined
  let followUps: { id: string; label: string }[] = []
  let financeItems: { label: string; detail?: string; amount?: number }[] = []
  let memoryCandidate: FinalAssistantContent['memoryCandidate']

  if (trimmed.startsWith('{')) {
    let parsed: Record<string, unknown> | undefined
    try { parsed = objectRecord(JSON.parse(trimmed)) } catch { throw new ToolLoopFailure('final_json_malformed') }
    if (!parsed || parsed.version !== 2 || typeof parsed.text !== 'string') {
      throw new ToolLoopFailure('final_schema_invalid')
    }
    textValue = parsed.text
    kind = responseKind(parsed.kind)
    if (parsed.kind !== undefined && !kind) throw new ToolLoopFailure('unsupported_kind')
    if (parsed.followUps !== undefined && !Array.isArray(parsed.followUps)) {
      throw new ToolLoopFailure('final_schema_invalid')
    }
    followUps = Array.isArray(parsed.followUps)
      ? parsed.followUps.slice(0, 1).map((candidate, index) => {
        const item = objectRecord(candidate)
        const label = typeof item?.label === 'string' ? sanitiseText(item.label, 80) : ''
        const suppliedId = typeof item?.id === 'string' ? item.id : ''
        const id = sanitiseText(suppliedId, 80).toLocaleLowerCase().replaceAll(/[^a-z0-9-]/gu, '-') || `follow-up-${index + 1}`
        if (!label) throw new ToolLoopFailure('final_schema_invalid')
        return { id, label }
      })
      : []
    if (parsed.financeItems !== undefined && !Array.isArray(parsed.financeItems)) throw new ToolLoopFailure('final_schema_invalid')
    financeItems = Array.isArray(parsed.financeItems)
      ? parsed.financeItems.slice(0, 10).map((candidate) => {
          const item = objectRecord(candidate)
          const label = typeof item?.label === 'string' ? sanitiseText(item.label, 100) : ''
          const detail = typeof item?.detail === 'string' ? sanitiseText(item.detail, 120) : ''
          const amount = item?.amount
          if (!label || (amount !== undefined && (typeof amount !== 'number' || !Number.isSafeInteger(amount)))) throw new ToolLoopFailure('final_schema_invalid')
          if (typeof amount === 'number' && !allowedNumbers.has(String(amount))) throw new ToolLoopFailure('final_number_invalid')
          return { label, ...(detail ? { detail } : {}), ...(typeof amount === 'number' ? { amount } : {}) }
        })
      : []
    if (financeItems.length && kind !== 'finance_list' && kind !== 'finance_detail') throw new ToolLoopFailure('final_schema_invalid')
    if (parsed.memoryCandidate !== undefined) {
      const candidate = objectRecord(parsed.memoryCandidate)
      const category = typeof candidate?.category === 'string' ? sanitiseText(candidate.category, 40) : ''
      const summary = typeof candidate?.summary === 'string' ? sanitiseText(candidate.summary, 180) : ''
      const normalizedValue = typeof candidate?.normalizedValue === 'string' ? sanitiseText(candidate.normalizedValue, 120) : ''
      const displayLabel = typeof candidate?.displayLabel === 'string' ? sanitiseText(candidate.displayLabel, 80) : ''
      const reason = typeof candidate?.reason === 'string' ? sanitiseText(candidate.reason, 160) : ''
      const sensitivity = candidate?.sensitivity === 'sensitive' ? 'sensitive' as const : candidate?.sensitivity === 'normal' ? 'normal' as const : undefined
      const retention = candidate?.retention === 'short' || candidate?.retention === 'long' || candidate?.retention === 'permanent' ? candidate.retention : undefined
      if (!category || !summary || !normalizedValue || !displayLabel || !reason || kind !== 'memory_proposal') throw new ToolLoopFailure('final_schema_invalid')
      memoryCandidate = { category, summary, normalizedValue, displayLabel, reason, ...(sensitivity ? { sensitivity } : {}), ...(retention ? { retention } : {}) }
    }
  }

  const text = sanitiseText(textValue, 1_200)
  if (textValue.length > 1_200 || text.length < 2 || /https?:\/\/|<[a-z/]|```/iu.test(text)) {
    throw new ToolLoopFailure('final_text_invalid')
  }
  if (kind === 'finance_summary' || kind === 'finance_list' || kind === 'finance_detail' || requireAuthoritativeNumbers) {
    for (const token of numericTokens(text)) {
      if (!allowedNumbers.has(token)) throw new ToolLoopFailure('final_number_invalid')
    }
  }
  return { text, ...(kind ? { kind } : {}), ...(followUps.length ? { followUps } : {}), ...(financeItems.length ? { financeItems } : {}), ...(memoryCandidate ? { memoryCandidate } : {}) }
}

interface RunToolLoopOptions<Action, Memory> {
  initialMessages: ProviderMessage[]
  allowedNumbers: Set<string>
  registeredTools: ReadonlySet<string>
  proposalTools: ReadonlySet<string>
  /** Subset of proposalTools that draft financial actions (excludes memory). */
  actionTools?: ReadonlySet<string>
  routeTool: string
  canRouteDeep: boolean
  initialUsedReadTool?: boolean
  callProvider: (messages: ProviderMessage[], round: number) => Promise<ProviderMessage>
  executeTool: (name: string, args: Record<string, unknown>) => ToolExecution<Action, Memory>
  finalizeRead?: (results: readonly { name: string; result: Record<string, unknown> }[]) => FinalAssistantContent | undefined
  onEvent?: (event: { event: string; round: number; toolNames?: string[]; errorCode?: string }) => void
}

export async function runStandardToolLoop<Action, Memory>(
  options: RunToolLoopOptions<Action, Memory>,
): Promise<ToolLoopResult<Action, Memory>> {
  const messages = [...options.initialMessages]
  const executedCallIds = new Set<string>()
  const actionTools = options.actionTools ?? options.proposalTools
  const actions: Action[] = []
  let memory: Memory | undefined
  let usedReadTool = options.initialUsedReadTool ?? false
  let toolRounds = 0
  let actionCallsRequested = 0
  let actionCallsAccepted = 0
  const calledTools: string[] = []
  const readResults: { name: string; result: Record<string, unknown> }[] = []

  while (toolRounds <= MAX_TOOL_ROUNDS) {
    const providerRound = toolRounds + 1
    const assistant = await options.callProvider(messages, providerRound)
    const calls = assistant.tool_calls ?? []
    options.onEvent?.({ event: calls.length ? 'provider-tool-calls' : 'provider-final-message', round: providerRound, ...(calls.length ? { toolNames: calls.map((call) => call.function.name) } : {}) })
    if (!calls.length) {
      if (!assistant.content) throw new ToolLoopFailure('provider_message_shape')
      const final = parseFinalAssistantContent(assistant.content, options.allowedNumbers, usedReadTool)
      return {
        final,
        actions,
        ...(memory ? { memory } : {}),
        usedReadTool,
        messages: [...messages, assistant],
        rounds: toolRounds,
        calledTools,
        actionCallsRequested,
        actionCallsAccepted,
      }
    }

    if (toolRounds >= MAX_TOOL_ROUNDS) break
    toolRounds += 1

    const currentIds = new Set<string>()
    for (const call of calls) {
      if (currentIds.has(call.id)) {
        options.onEvent?.({ event: 'tool-call-rejected', round: toolRounds, toolNames: [call.function.name], errorCode: 'duplicate_tool_call_id' })
        throw new ToolLoopFailure('duplicate_tool_call_id')
      }
      currentIds.add(call.id)
    }
    const deepRequestedThisRound = options.canRouteDeep && calls.some((call) => call.function.name === options.routeTool)

    // The structurally equivalent assistant message is kept before any tool
    // result, including its content and every original call id/name/arguments.
    messages.push(assistant)
    for (const call of calls) {
      let execution: ToolExecution<Action, Memory>
      let executed = false
      if (actionTools.has(call.function.name)) actionCallsRequested += 1
      if (executedCallIds.has(call.id)) {
        execution = { result: { status: 'invalid_arguments', error: 'duplicate_tool_call' } }
      } else if (!options.registeredTools.has(call.function.name)) {
        execution = { result: { status: 'invalid_arguments', error: 'unknown_tool' } }
      } else {
        const parsed = parseToolArguments(call.function.arguments)
        if (parsed.status === 'invalid_arguments') {
          execution = { result: { status: 'invalid_arguments', error: 'malformed_arguments' } }
        } else {
          execution = options.executeTool(call.function.name, parsed.arguments)
          executedCallIds.add(call.id)
          executed = true
          calledTools.push(call.function.name)
        }
      }

      // Financial and memory previews cannot be mixed in one turn, but several
      // financial actions may be drafted together as a batch.
      if (execution.action && memory) {
        execution = { result: { status: 'invalid_arguments', error: 'memory_preview_already_exists' } }
      }
      if (execution.memory && (memory || actions.length)) {
        execution = { result: { status: 'invalid_arguments', error: 'supporting_proposal_already_exists' } }
      }
      if (execution.action) {
        if (actions.length >= MAX_BATCH_ACTIONS) {
          options.onEvent?.({ event: 'tool-call-rejected', round: toolRounds, toolNames: [call.function.name], errorCode: 'action_limit_exceeded' })
          throw new ToolLoopFailure('action_limit_exceeded')
        }
        actions.push(execution.action)
        actionCallsAccepted += 1
      }
      if (execution.memory) memory = execution.memory
      if (executed && !options.proposalTools.has(call.function.name) && call.function.name !== options.routeTool) {
        usedReadTool = true
        readResults.push({ name: call.function.name, result: execution.result })
      }

      const content = JSON.stringify(execution.result)
      for (const token of numericTokens(content)) options.allowedNumbers.add(token)
      messages.push({ role: 'tool', content, tool_call_id: call.id })
    }
    if (deepRequestedThisRound) {
      return { deepRequested: true, actions: [], usedReadTool, messages, rounds: toolRounds, calledTools, actionCallsRequested, actionCallsAccepted }
    }
    if (actions.length || memory) {
      const kind: AssistantResponseKind = actions.length > 1
        ? 'action_batch'
        : actions.length === 1
          ? 'action_proposal'
          : 'memory_proposal'
      const final: FinalAssistantContent = {
        text: actions.length ? 'Preview prepared.' : 'Memory preview prepared.',
        kind,
      }
      return {
        final,
        actions,
        ...(memory ? { memory } : {}),
        usedReadTool,
        messages,
        rounds: toolRounds,
        calledTools,
        actionCallsRequested,
        actionCallsAccepted,
      }
    }
    const deterministic = options.finalizeRead?.(readResults)
    if (deterministic) {
      return { final: deterministic, actions: [], usedReadTool, messages, rounds: toolRounds, calledTools, actionCallsRequested, actionCallsAccepted }
    }
  }

  options.onEvent?.({ event: 'tool-loop-stopped', round: MAX_TOOL_ROUNDS, errorCode: 'tool_round_limit' })
  throw new ToolLoopFailure('tool_round_limit')
}
