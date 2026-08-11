/**
 * Personal Companion — Assistant edge function.
 *
 * One request path. The provider is the semantic authority: it decides whether a
 * tool is needed, which tool, and how to word the answer. This file owns only
 * the things a language model must not own — authentication, rate limiting, the
 * authoritative finance snapshot, tool execution, and the response contract.
 *
 * There is no local intent router, no keyword or phrase matching, no forced tool
 * round, and no locally authored answer text on the healthy path.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0'
import {
  CompanionProviderFailure,
  PROVIDER_CONTENT_LIMIT,
  buildProviderRequestBody,
  parseChatCompletion,
  runCompanionLoop,
  runtimeCompanionEnabled,
  type CompanionFailureReason,
  type CompanionTurn,
  type ProviderAssistantMessage,
  type ProviderMessage,
} from './companionLoop.ts'
import {
  ACTION_TOOL_NAMES,
  ALL_TOOL_DEFINITIONS,
  ALL_TOOL_NAMES,
  MAX_TEXT_CHARS,
  PROPOSAL_TOOL_NAMES,
  REASONING_TOOL_NAMES,
  cleanText,
  executeCompanionTool,
  parseFinanceContext,
  record,
  safeId,
  type ActionDraft,
  type FinanceContext,
  type MemoryDraft,
} from './companionTools.ts'
import { buildCompanionSystemPrompt, parsePromptUser } from './companionPrompt.ts'
import {
  failureCodeFor,
  financeItemsFromReads,
  honestFallbackText,
  responseKind,
  sanitiseProviderError,
  type SafeFailureCode,
  type SafeFailureStage,
} from './companionResponse.ts'
import { createNumericProvenance } from './numericProvenance.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const HOURLY_LIMIT = 20
const DAILY_LIMIT = 100
/** Upper bound on one provider round trip. */
const PROVIDER_TIMEOUT_MS = 20_000
/** Upper bound on all provider work in a turn. The client waits longer than this. */
const TURN_DEADLINE_MS = 50_000

type SafeFailureReason = 'timeout' | 'unreachable' | 'rejected' | 'malformed' | 'disabled'

interface TurnMetrics {
  requestStartedAt: number
  authMs: number
  usageMs: number
  contextMs: number
  providerMs: number
  providerCalls: number
  toolsCalled: number
  toolsExposed: number
  proposalCount: number
  proposalCallsRequested: number
  serialized: boolean
  requestId?: string
  runtimeMode: 'llm-first' | 'degraded'
}

function createTurnMetrics(): TurnMetrics {
  return {
    requestStartedAt: Date.now(),
    authMs: 0,
    usageMs: 0,
    contextMs: 0,
    providerMs: 0,
    providerCalls: 0,
    toolsCalled: 0,
    toolsExposed: 0,
    proposalCount: 0,
    proposalCallsRequested: 0,
    serialized: false,
    runtimeMode: 'llm-first',
  }
}

function timingTotals(metrics: TurnMetrics): Record<string, number> {
  return {
    auth: metrics.authMs,
    usage: metrics.usageMs,
    context: metrics.contextMs,
    provider: metrics.providerMs,
    total: Date.now() - metrics.requestStartedAt,
  }
}

function safeTurnTelemetry(metrics: TurnMetrics): Record<string, unknown> {
  return {
    timingsMs: timingTotals(metrics),
    roundCount: metrics.providerCalls,
    toolsExposed: metrics.toolsExposed,
    toolsCalled: metrics.toolsCalled,
    ...(metrics.requestId ? { requestId: metrics.requestId } : {}),
    runtimeMode: metrics.runtimeMode,
  }
}

function safeDiagnostic(
  code: SafeFailureCode,
  stage: SafeFailureStage,
  metrics: TurnMetrics,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    code,
    stage,
    roundCount: metrics.providerCalls,
    toolsExposed: metrics.toolsExposed,
    toolsCalled: metrics.toolsCalled,
    proposalCount: metrics.proposalCount,
    proposalDraftsPresent: metrics.proposalCount > 0,
    serializationCompleted: metrics.serialized,
    ...(metrics.requestId ? { requestId: metrics.requestId } : {}),
    runtimeMode: metrics.runtimeMode,
    timingsMs: timingTotals(metrics),
    ...extra,
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

/**
 * The only shape a failure may take. Status stays 200 because the client reads
 * the envelope body; supabase-js turns a non-2xx into a transport error and
 * discards every diagnostic with it.
 */
function safeFailureResponse(
  code: SafeFailureCode,
  stage: SafeFailureStage,
  metrics: TurnMetrics,
  reason: SafeFailureReason,
  extra: Record<string, unknown> = {},
): Response {
  const diagnostic = safeDiagnostic(code, stage, metrics, extra)
  try {
    const response = json({ error: code, reason, diagnostic }, 200)
    metrics.serialized = true
    return response
  } catch {
    return new Response(
      JSON.stringify({
        error: 'serialization-failed',
        reason: 'malformed',
        diagnostic: { code: 'serialization-failed', stage: 'edge-serialization', serializationCompleted: false },
      }),
      { status: 200, headers: { ...CORS, 'content-type': 'application/json' } },
    )
  }
}

interface CompanionRequest {
  text: string
  requestId: string
  inputMode: 'text' | 'voice_transcript'
  personalization: Record<string, unknown>
  memories: { displayLabel: string; summary: string }[]
  history: { role: 'user' | 'assistant'; content: string }[]
  priorUserTexts: string[]
  finance: FinanceContext
  pendingProposalSummary: string
}

/**
 * Everything crossing the network is re-bounded here. Conversation context is
 * carried as plain replayed turns: it explains what the user means, it never
 * establishes what is true about their money.
 */
function parseRequest(body: Record<string, unknown>): CompanionRequest | undefined {
  if (body.version !== 2) return undefined
  const input = record(body.input)
  const text = cleanText(input.text, MAX_TEXT_CHARS)
  const inputMode = input.inputMode === 'voice_transcript'
    ? 'voice_transcript'
    : input.inputMode === 'text'
      ? 'text'
      : undefined
  const financeInput = record(body.financeContext)
  const today = cleanText(financeInput.today, 10)
  if (!text || !inputMode || !/^\d{4}-\d{2}-\d{2}$/u.test(today)) return undefined

  const turns = Array.isArray(body.recentMessages) ? body.recentMessages.slice(-10).map(record) : []
  const history = turns.flatMap((turn) => {
    const role = turn.role === 'assistant' ? 'assistant' : turn.role === 'user' ? 'user' : undefined
    const content = cleanText(turn.text, 600)
    return role && content ? [{ role, content }] : []
  })
  const memories = (Array.isArray(body.memories) ? body.memories.slice(0, 5).map(record) : []).flatMap((entry) => {
    const displayLabel = cleanText(entry.displayLabel, 80)
    const summary = cleanText(entry.summary, 180)
    return displayLabel && summary ? [{ displayLabel, summary }] : []
  })
  const pending = record(body.pendingProposal)

  return {
    text,
    requestId: safeId(body.requestId) || `turn-${Date.now()}`,
    inputMode,
    personalization: record(body.personalization),
    memories,
    history,
    priorUserTexts: history.filter((turn) => turn.role === 'user').map((turn) => turn.content),
    finance: parseFinanceContext(financeInput, today),
    pendingProposalSummary: cleanText(pending.summary, 240),
  }
}

interface ProviderConfig {
  key: string
  baseUrl: string
  model: string
}

/** Sampling settings for one provider round. Deliberately no `tool_choice`. */
const PROVIDER_SETTINGS = (model: string) => ({ model, temperature: 0.3, maxTokens: 1_200 })

function readProviderConfig(): ProviderConfig | undefined {
  const key = Deno.env.get('AI_API_KEY')?.trim()
  if (!key) return undefined
  return {
    key,
    model: Deno.env.get('AI_MODEL')?.trim() || 'deepseek-chat',
    baseUrl: (Deno.env.get('AI_BASE_URL')?.trim() || 'https://api.deepseek.com').replace(/\/+$/u, ''),
  }
}

/**
 * One provider request.
 *
 * The complete tool list goes out on every round. `tool_choice` is never
 * constructed, in any form — not `auto`, not `required`, not a named tool — so
 * the provider is never told which tool to use or forced to use one at all.
 */
async function callProvider(
  config: ProviderConfig,
  messages: readonly ProviderMessage[],
  tools: readonly Record<string, unknown>[],
  deadlineAt: number,
  metrics: TurnMetrics,
): Promise<ProviderAssistantMessage> {
  const budget = Math.min(PROVIDER_TIMEOUT_MS, deadlineAt - Date.now())
  if (budget <= 0) throw new CompanionProviderFailure('timeout')
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, budget)
  const startedAt = Date.now()
  metrics.providerCalls += 1

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.key}` },
      signal: controller.signal,
      body: JSON.stringify(buildProviderRequestBody(PROVIDER_SETTINGS(config.model), messages, tools)),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new CompanionProviderFailure('rejected', {
        httpStatus: response.status,
        ...sanitiseProviderError(body.slice(0, PROVIDER_CONTENT_LIMIT)),
      })
    }
    return parseChatCompletion(await response.json())
  } catch (error) {
    if (error instanceof CompanionProviderFailure) throw error
    throw new CompanionProviderFailure(controller.signal.aborted ? 'timeout' : 'unreachable')
  } finally {
    clearTimeout(timer)
    metrics.providerMs += Date.now() - startedAt
  }
}

/**
 * The whole turn: auth, rate limit, prompt, loop, response. Every expected
 * failure inside leaves as a structured envelope rather than a gateway error.
 */
async function handleTurn(request: Request, metrics: TurnMetrics): Promise<Response> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: 'not-configured', diagnostic: safeDiagnostic('provider-unavailable', 'edge-auth', metrics) }, 503)
  }
  const authorization = request.headers.get('authorization') ?? ''
  if (!authorization.toLocaleLowerCase().startsWith('bearer ')) {
    return json({ error: 'unauthorized', diagnostic: safeDiagnostic('auth-failed', 'edge-auth', metrics) }, 401)
  }

  const authStartedAt = Date.now()
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })
  const { data: userData, error: userError } = await authClient.auth.getUser()
  metrics.authMs = Date.now() - authStartedAt
  if (userError || !userData.user) {
    return json({ error: 'unauthorized', diagnostic: safeDiagnostic('auth-failed', 'edge-auth', metrics) }, 401)
  }

  const contextStartedAt = Date.now()
  let body: Record<string, unknown>
  try {
    body = record(await request.json())
  } catch {
    return json({ error: 'invalid-request', diagnostic: safeDiagnostic('request-invalid', 'edge-request', metrics) }, 400)
  }
  const companionRequest = parseRequest(body)
  metrics.contextMs = Date.now() - contextStartedAt
  if (!companionRequest) {
    return json({ error: 'invalid-request', diagnostic: safeDiagnostic('request-invalid', 'edge-request', metrics) }, 400)
  }
  metrics.requestId = companionRequest.requestId

  // The rollback switch. The degraded path says only that the assistant is
  // unavailable; it never becomes a second, simpler semantic parser.
  if (!runtimeCompanionEnabled(Deno.env.get('AGENT_V2_LLM_FIRST_ENABLED'))) {
    metrics.runtimeMode = 'degraded'
    console.log(JSON.stringify({ event: 'assistant-runtime-degraded', requestId: metrics.requestId, runtimeMode: metrics.runtimeMode }))
    return safeFailureResponse('runtime-disabled', 'edge-routing', metrics, 'disabled')
  }

  // Rate-limit accounting is strictly service-role work. Supplying the token
  // explicitly keeps this client from creating a session while the HEAD calls
  // run; they stay sequential because the concurrent PostgREST path returned
  // intermittent 401s in production.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    accessToken: async () => serviceKey,
  })
  const now = Date.now()
  const usageStartedAt = Date.now()
  const hourly = await admin.from('ai_request_usage').select('id', { count: 'exact', head: true })
    .eq('user_id', userData.user.id).gte('created_at', new Date(now - 3_600_000).toISOString())
  const daily = await admin.from('ai_request_usage').select('id', { count: 'exact', head: true })
    .eq('user_id', userData.user.id).gte('created_at', new Date(now - 86_400_000).toISOString())
  metrics.usageMs = Date.now() - usageStartedAt
  if (hourly.error || daily.error) {
    return json({ error: 'usage-unavailable', diagnostic: safeDiagnostic('provider-unavailable', 'edge-usage', metrics) }, 503)
  }
  if ((hourly.count ?? 0) >= HOURLY_LIMIT) {
    return json({ error: 'rate-limited', scope: 'hour', diagnostic: safeDiagnostic('rate-limited', 'edge-usage', metrics) }, 429)
  }
  if ((daily.count ?? 0) >= DAILY_LIMIT) {
    return json({ error: 'rate-limited', scope: 'day', diagnostic: safeDiagnostic('rate-limited', 'edge-usage', metrics) }, 429)
  }

  const config = readProviderConfig()
  if (!config) {
    return json({ error: 'provider-not-configured', diagnostic: safeDiagnostic('provider-unavailable', 'edge-context', metrics) }, 503)
  }
  const { error: usageError } = await admin.from('ai_request_usage').insert({ user_id: userData.user.id, intent: 'companion-turn' })
  if (usageError) {
    return json({ error: 'usage-unavailable', diagnostic: safeDiagnostic('provider-unavailable', 'edge-usage', metrics) }, 503)
  }

  const systemPrompt = buildCompanionSystemPrompt({
    user: parsePromptUser(companionRequest.personalization),
    today: companionRequest.finance.today,
    memories: companionRequest.memories,
    ...(companionRequest.pendingProposalSummary ? { pendingProposalSummary: companionRequest.pendingProposalSummary } : {}),
    inputMode: companionRequest.inputMode,
  })
  // Conversational numbers enter the ledger typed as conversation, so the
  // deterministic calculator can accept them as operands without them ever
  // becoming app truth.
  const ledger = createNumericProvenance({
    currentText: companionRequest.text,
    priorUserTexts: companionRequest.priorUserTexts,
  })
  metrics.toolsExposed = ALL_TOOL_DEFINITIONS.length
  const deadlineAt = Date.now() + TURN_DEADLINE_MS

  let turn: CompanionTurn<ActionDraft, MemoryDraft>
  try {
    turn = await runCompanionLoop<ActionDraft, MemoryDraft>({
      systemPrompt,
      history: companionRequest.history,
      userContent: companionRequest.text,
      tools: ALL_TOOL_DEFINITIONS,
      registeredTools: ALL_TOOL_NAMES,
      proposalTools: PROPOSAL_TOOL_NAMES,
      actionTools: ACTION_TOOL_NAMES,
      reasoningTools: REASONING_TOOL_NAMES,
      callProvider: (messages, _round, tools) => callProvider(config, messages, tools, deadlineAt, metrics),
      executeTool: (name, args) => executeCompanionTool(name, args, companionRequest.finance, ledger),
      onEvent: (event) => {
        console.log(JSON.stringify({
          event: `companion-${event.event}`,
          ...(metrics.requestId ? { requestId: metrics.requestId } : {}),
          round: event.round,
          ...(event.toolNames ? { toolNames: event.toolNames } : {}),
          ...(event.errorCode ? { errorCode: event.errorCode } : {}),
        }))
      },
    })
  } catch (error) {
    if (!(error instanceof CompanionProviderFailure)) throw error
    const code = failureCodeFor(error.reason)
    console.log(JSON.stringify({
      event: 'assistant-turn-failed',
      ...(metrics.requestId ? { requestId: metrics.requestId } : {}),
      errorCode: code,
      stage: 'provider-round',
      ...(error.httpStatus === undefined ? {} : { httpStatus: error.httpStatus }),
      ...(error.providerCode ? { providerCode: error.providerCode } : {}),
      ...(error.providerMessage ? { providerMessage: error.providerMessage } : {}),
      roundCount: metrics.providerCalls,
      timingsMs: timingTotals(metrics),
    }))
    // One honest bounded reply, delivered as an ordinary response so the user
    // sees an explanation rather than a silent failure.
    return respond({
      version: 2,
      kind: 'local_fallback',
      text: honestFallbackText(error.reason),
      telemetry: safeTurnTelemetry(metrics),
      diagnostic: safeDiagnostic(code, 'provider-round', metrics, {
        ...(error.httpStatus === undefined ? {} : { providerHttpStatus: error.httpStatus }),
        ...(error.providerCode ? { providerCode: error.providerCode } : {}),
      }),
    }, metrics)
  }

  metrics.toolsCalled = turn.calledTools.length
  metrics.proposalCount = turn.actions.length
  metrics.proposalCallsRequested = turn.actionCallsRequested
  const financeItems = financeItemsFromReads(turn.readResults)
  const actions = turn.actions

  // One action stays a single proposal; two or more become one batch the client
  // previews and confirms as a whole. Neither is executed here.
  return respond({
    version: 2,
    kind: responseKind(actions.length, Boolean(turn.memory), Boolean(financeItems)),
    text: turn.text,
    ...(financeItems ? { financeItems } : {}),
    ...(actions.length === 1 ? { actionProposal: actions[0] } : {}),
    ...(actions.length > 1 ? { actionBatch: { actionCount: actions.length, actions } } : {}),
    ...(turn.memory ? { memoryProposal: turn.memory } : {}),
    telemetry: safeTurnTelemetry(metrics),
  }, metrics)
}

/** Serializes a success envelope; a serialization failure becomes a safe code. */
function respond(body: Record<string, unknown>, metrics: TurnMetrics): Response {
  let response: Response
  try {
    response = json(body)
  } catch {
    console.log(JSON.stringify({ event: 'assistant-turn-failed', errorCode: 'serialization-failed', stage: 'edge-serialization' }))
    return safeFailureResponse('serialization-failed', 'edge-serialization', metrics, 'malformed')
  }
  metrics.serialized = true
  console.log(JSON.stringify({
    event: 'assistant-turn-complete',
    ...(metrics.requestId ? { requestId: metrics.requestId } : {}),
    runtimeMode: metrics.runtimeMode,
    roundCount: metrics.providerCalls,
    toolsExposed: metrics.toolsExposed,
    toolsCalled: metrics.toolsCalled,
    proposalCount: metrics.proposalCount,
    timingsMs: timingTotals(metrics),
  }))
  return response
}

Deno.serve(async (request) => {
  const metrics = createTurnMetrics()
  try {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })
    if (request.method !== 'POST') {
      return json({ error: 'method-not-allowed', diagnostic: safeDiagnostic('request-invalid', 'edge-request', metrics) }, 405)
    }
    return await handleTurn(request, metrics)
  } catch (error) {
    const reason: CompanionFailureReason = error instanceof CompanionProviderFailure ? error.reason : 'unreachable'
    const code: SafeFailureCode = error instanceof CompanionProviderFailure ? failureCodeFor(reason) : 'edge-unhandled-failure'
    const stage: SafeFailureStage = error instanceof CompanionProviderFailure ? 'provider-round' : 'unknown'
    console.log(JSON.stringify({
      event: 'assistant-turn-failed',
      ...(metrics.requestId ? { requestId: metrics.requestId } : {}),
      runtimeMode: metrics.runtimeMode,
      errorCode: code,
      stage,
      roundCount: metrics.providerCalls,
      timingsMs: timingTotals(metrics),
    }))
    return safeFailureResponse(code, stage, metrics, reason === 'round-ceiling' ? 'malformed' : reason)
  }
})
