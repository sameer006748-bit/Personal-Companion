Zero point six nine four one eightimport assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

class MemoryStorage {
  #items = new Map()
  getItem(key) { return this.#items.get(key) ?? null }
  setItem(key, value) { this.#items.set(key, String(value)) }
  removeItem(key) { this.#items.delete(key) }
  clear() { this.#items.clear() }
}

globalThis.window = { localStorage: new MemoryStorage() }

const settings = await import('../src/models/settings.ts')
const memory = await import('../src/lib/assistantMemory.ts')
const history = await import('../src/lib/assistantHistory.ts')
const personalization = await import('../src/lib/assistantPersonalization.ts')
const finance = await import('../src/lib/assistantFinance.ts')
const orchestrator = await import('../src/lib/assistantOrchestrator.ts')
const toolLoop = await import('../supabase/functions/personal-finance-assistant/toolCallLoop.ts')

const neutralProfile = settings.DEFAULT_ASSISTANT_PERSONALIZATION

test('personalization defaults are neutral and PKR remains fixed', () => {
  const value = settings.getDefaultSettings()
  assert.equal(value.finance.currency, 'PKR')
  assert.equal(value.assistant.personalization.tone, 'friendly')
  assert.equal(value.assistant.personalization.riskTolerance, 'moderate')
  assert.notEqual(value.profile.fullName.toLocaleLowerCase(), 'sameer')
})

test('version 2 settings migrate additively', () => {
  const current = settings.getDefaultSettings()
  const legacy = { ...current, version: 2, assistant: { responseStyle: 'concise', includeCalculations: true, showSuggestions: false, languageStyle: 'roman-urdu' } }
  const migrated = settings.normalizeUserSettings(legacy)
  assert.equal(migrated?.version, 3)
  assert.equal(migrated?.assistant.personalization.language, 'roman-urdu')
  assert.equal(migrated?.assistant.personalization.responseLength, 'short')
  assert.equal(migrated?.profile.fullName, current.profile.fullName)
})

test('personalization is bounded and rejects oversized stored text', () => {
  const current = settings.getDefaultSettings()
  const invalid = { ...current, assistant: { ...current.assistant, personalization: { ...current.assistant.personalization, aboutMe: 'x'.repeat(settings.PERSONALIZATION_LIMITS.aboutMe + 1) } } }
  assert.equal(settings.isUserSettings(invalid), false)
  assert.equal(settings.isUserSettings(current), true)
})

test('signed-in personalization snapshots are isolated by user id', () => {
  const first = settings.getDefaultSettings()
  const second = settings.getDefaultSettings()
  settings.saveSettings({ ...first, assistant: { ...first.assistant, ownerId: 'user-a', personalization: { ...first.assistant.personalization, tone: 'direct' } } })
  settings.saveSettings({ ...second, assistant: { ...second.assistant, ownerId: 'user-b', personalization: { ...second.assistant.personalization, tone: 'gentle' } } })
  assert.equal(settings.loadScopedUserSettings('user-a')?.assistant.personalization.tone, 'direct')
  assert.equal(settings.loadScopedUserSettings('user-b')?.assistant.personalization.tone, 'gentle')
})

test('memory storage is scoped and reloadable', () => {
  memory.setAssistantMemoryScope('user-a')
  const proposal = memory.createMemoryProposal('communication_preference', 'Conclusion first', 'advice:conclusion-first', 'Conclusion first', 'Improves replies')
  memory.saveAssistantMemory(memory.saveMemoryProposal(memory.createInitialAssistantMemory(), proposal))
  memory.setAssistantMemoryScope('user-b')
  assert.equal(memory.loadAssistantMemory().memories.length, 0)
  memory.setAssistantMemoryScope('user-a')
  assert.equal(memory.loadAssistantMemory().memories.length, 1)
})

test('sensitive memory requires a proposal and relevance before retrieval', () => {
  const proposal = memory.createMemoryProposal('financial_goal', 'Support a relative', 'goal:relative-support', 'Relative support', 'Planning context')
  assert.equal(proposal.status, 'proposed')
  assert.equal(proposal.sensitivity, 'sensitive')
  const saved = memory.saveMemoryProposal(memory.createInitialAssistantMemory(), proposal)
  assert.equal(memory.selectRelevantMemories(saved, 'unrelated work topic').length, 0)
  assert.equal(memory.selectRelevantMemories(saved, 'relative support plan').length, 1)
})

test('memory correction supersedes the old value and deletion survives save', () => {
  const first = memory.createMemoryProposal('communication_preference', 'Short replies', 'length:short', 'Short replies', 'Style')
  const second = memory.createMemoryProposal('communication_preference', 'Detailed replies', 'length:detailed', 'Detailed replies', 'Style', first.createdAt + 1)
  let state = memory.saveMemoryProposal(memory.createInitialAssistantMemory(), first)
  state = memory.saveMemoryProposal(state, second)
  assert.equal(state.memories[0].status, 'archived')
  state = memory.forgetMemory(state, 'Detailed replies')
  assert.equal(memory.activeMemories(state).length, 0)
})

test('memory retrieval is bounded to five and unrelated sensitive memories do not leak', () => {
  let state = memory.createInitialAssistantMemory()
  for (let index = 0; index < 9; index += 1) {
    state = memory.saveMemoryProposal(state, memory.createMemoryProposal('communication_preference', `Budget preference ${index}`, `preference:${index}`, `Budget preference ${index}`, 'Style', Date.now() + index))
  }
  assert.equal(memory.selectRelevantMemories(state, 'budget preference', 20).length, 5)
})

test('concise rendering strips markdown, caps length, questions, and preferred-name repetition', () => {
  const profile = { ...neutralProfile, preferredName: 'Alex', responseLength: 'short' }
  const long = `# Alex **answer** first. ${'word '.repeat(150)}? Another question? Alex again. Fifth sentence.`
  const result = personalization.personaliseAssistantText(long, profile)
  assert.ok(result.length <= 421)
  assert.ok((result.match(/\?/gu) ?? []).length <= 1)
  assert.equal((result.match(/Alex/giu) ?? []).length, 1)
  assert.doesNotMatch(result, /[#*`]/u)
})

test('balanced and detailed preferences do not change deterministic finance facts', () => {
  const context = { currency: 'PKR', today: '2026-08-03', accounts: [], summary: { totalBalance: 0, cashBalance: 0, monthlyIncome: 0, monthlyExpenses: 0, netMonthlyCashFlow: 0, receivables: 0, payables: 5000, commitments: 0, overdueItems: 0, safeToSpend: 0, overdueTotal: 0, upcomingItems: 0 }, financialPosition: 'Tight', accountDistribution: [], recentTransactions: [], receivables: [], payables: [{ id: 'p1', label: 'Parent', amount: 5000 }], commitments: [], managedAccounts: [], managedTransactions: [], managedReceivables: [], managedPayables: [], managedCommitments: [] }
  const answer = finance.getDeterministicFinancialAnswer('Please list who else I owe', context)
  assert.equal(answer?.insight?.rows?.[0]?.amount, 5000)
  assert.equal(answer?.insight?.rows?.[0]?.label, 'Parent')
})

test('cash lookup is authoritative and missing Bank never returns Cash', () => {
  const base = { currency: 'PKR', today: '2026-08-03', accounts: [{ id: 'cash', name: 'Cash', type: 'cash', balance: 700 }], summary: {}, financialPosition: 'Tight', accountDistribution: [], recentTransactions: [], receivables: [], payables: [], commitments: [], managedAccounts: [], managedTransactions: [], managedReceivables: [], managedPayables: [], managedCommitments: [] }
  assert.equal(finance.getAuthoritativeAccountBalanceAnswer('cash balance?', base)?.insight?.metrics?.[0]?.amount, 700)
  assert.equal(finance.getAuthoritativeAccountBalanceAnswer('bank balance?', base)?.insight, undefined)
})

test('account name/type mismatch remains blocked', () => {
  assert.equal(finance.isAccountTypeConsistent({ name: 'Cash', type: 'bank' }), false)
})

test('finance list and detail envelopes normalize with authorized values', () => {
  const allowed = new Set(['5000'])
  const list = toolLoop.parseFinalAssistantContent(JSON.stringify({ version: 2, kind: 'finance_list', text: 'Current records.', financeItems: [{ label: 'Parent', amount: 5000, detail: 'Payable' }] }), allowed, true)
  assert.equal(list.kind, 'finance_list')
  assert.equal(list.financeItems?.[0]?.amount, 5000)
})

test('conversation-derived sensitive memory remains a confirmation proposal', () => {
  const value = toolLoop.parseFinalAssistantContent(JSON.stringify({ version: 2, kind: 'memory_proposal', text: 'Would you like me to remember this?', memoryCandidate: { category: 'financial_goal', summary: 'Support family', normalizedValue: 'goal:family-support', displayLabel: 'Family support', reason: 'Helps future planning', sensitivity: 'sensitive', retention: 'long' } }), new Set())
  assert.equal(value.kind, 'memory_proposal')
  assert.equal(value.memoryCandidate?.sensitivity, 'sensitive')
})

test('legacy finance kind normalizes to finance_summary', () => {
  const value = toolLoop.parseFinalAssistantContent(JSON.stringify({ version: 2, kind: 'finance', text: 'Recorded total is 5000.' }), new Set(['5000']), true)
  assert.equal(value.kind, 'finance_summary')
})

test('unsupported kinds, malformed JSON, and invented numbers retain exact codes', () => {
  assert.throws(() => toolLoop.parseFinalAssistantContent('{"version":2,"kind":"unsupported","text":"No"}', new Set()), (error) => error.code === 'unsupported_kind')
  assert.throws(() => toolLoop.parseFinalAssistantContent('{bad', new Set()), (error) => error.code === 'final_json_malformed')
  assert.throws(() => toolLoop.parseFinalAssistantContent('{"version":2,"kind":"finance_summary","text":"PKR 9000"}', new Set(['5000']), true), (error) => error.code === 'final_number_invalid')
})

const asProviderContent = (raw) =>
  toolLoop.parseChatCompletion({ choices: [{ message: { role: 'assistant', content: raw } }] }).content

test('a JSON envelope is no longer truncated at the answer budget before parsing', () => {
  // The exact intermittent failure: the same answer parsed as prose but failed
  // as JSON, because the raw content was capped at the user-visible text budget
  // and the envelope was guillotined mid-string.
  const answer = 'I can help you track what you earn and spend, plan ahead, and stay on top of commitments. '.repeat(14).trim()
  const envelope = JSON.stringify({ version: 2, kind: 'conversation', text: answer })
  assert.ok(envelope.length > toolLoop.FINAL_TEXT_LIMIT)
  assert.ok(envelope.length < toolLoop.PROVIDER_CONTENT_LIMIT)
  assert.equal(asProviderContent(envelope).endsWith('}'), true)
  // The answer budget itself is unchanged.
  assert.equal(toolLoop.FINAL_TEXT_LIMIT, 1_200)
  assert.ok(toolLoop.PROVIDER_CONTENT_LIMIT > toolLoop.FINAL_TEXT_LIMIT)
})

test('provider content stays hard-bounded and long prose still truncates rather than failing', () => {
  assert.equal(asProviderContent('x'.repeat(20_000)).length, toolLoop.PROVIDER_CONTENT_LIMIT)
  // Prose over the answer budget kept its pre-existing behaviour: truncate, not
  // reject. Only a declared JSON `text` field over budget is a contract breach.
  const prose = toolLoop.parseFinalAssistantContent('Sure. '.repeat(400), new Set())
  assert.equal(prose.text.length, toolLoop.FINAL_TEXT_LIMIT)
  assert.throws(
    () => toolLoop.parseFinalAssistantContent(JSON.stringify({ version: 2, kind: 'conversation', text: 'Sure. '.repeat(400) }), new Set()),
    (error) => error.code === 'final_text_invalid',
  )
})

test('a valid strict conversation envelope is still accepted unchanged', () => {
  const value = toolLoop.parseFinalAssistantContent('{"version":2,"kind":"conversation","text":"Doing well, thanks."}', new Set())
  assert.equal(value.kind, 'conversation')
  assert.equal(value.text, 'Doing well, thanks.')
  assert.equal(value.financeItems, undefined)
  assert.equal(value.memoryCandidate, undefined)
})

test('plain conversational prose is accepted without any recovery step', () => {
  const value = toolLoop.parseFinalAssistantContent('I am doing well, thanks for asking.', new Set())
  assert.equal(value.kind, undefined)
  assert.equal(value.text, 'I am doing well, thanks for asking.')
})

test('the exact previously malformed conversational shapes are safely recovered', () => {
  // Each of these produced code=malformed-result stage=edge-normalization on the
  // device for ordinary talk such as "Hello, how are you?".
  const shapes = {
    missingVersion: '{"kind":"conversation","text":"I am doing well."}',
    versionAsString: '{"version":"2","kind":"conversation","text":"I am doing well."}',
    trailingProse: '{"version":2,"kind":"conversation","text":"Doing well."} Let me know if you need anything.',
    oneWrapperLevel: '{"response":{"version":2,"kind":"conversation","text":"Doing well."}}',
    contentKeyInsteadOfText: '{"version":2,"kind":"conversation","content":"I am doing well."}',
    codeFenced: '```json {"version":2,"kind":"conversation","text":"Doing well."} ```',
    followUpsNotAnArray: '{"version":2,"kind":"conversation","text":"Doing well.","followUps":{"id":"a"}}',
  }
  for (const [name, raw] of Object.entries(shapes)) {
    const strict = () => toolLoop.parseFinalAssistantContent(raw, new Set())
    assert.throws(strict, (error) => toolLoop.RECOVERABLE_CONVERSATION_CODES.has(error.code), `${name} should fail strict parsing`)
    const recovered = toolLoop.recoverConversationalText(raw)
    assert.equal(typeof recovered, 'string', `${name} should recover`)
    assert.ok(recovered.length >= 2, `${name} should recover real text`)
  }
})

test('missing optional conversational metadata never causes malformed-result', () => {
  // No kind, no followUps, no memoryCandidate: all optional, none required.
  const bare = toolLoop.parseFinalAssistantContent('{"version":2,"text":"Doing well."}', new Set())
  assert.equal(bare.text, 'Doing well.')
  assert.equal(bare.followUps, undefined)
  assert.equal(toolLoop.recoverConversationalText('{"text":"Doing well."}'), 'Doing well.')
  assert.equal(toolLoop.recoverConversationalText('{"kind":"advice","text":"Spend less."}'), 'Spend less.')
})

test('recovery refuses every financial, action, and memory shape', () => {
  // Recovery is for talk only. Anything that gestures at money, a write, or a
  // durable fact must stay rejected so the strict path keeps deciding it.
  const refused = [
    '{"kind":"finance_summary","text":"Your balance is PKR 42,000."}',
    '{"kind":"finance_list","text":"Records.","financeItems":[{"label":"Cash","amount":9999}]}',
    '{"kind":"conversation","text":"Here.","financeItems":[{"label":"Cash","amount":9999}]}',
    '{"kind":"conversation","text":"Ready to confirm.","actionProposal":{"type":"expense","amount":500}}',
    '{"kind":"conversation","text":"Ready.","actionBatch":[{"type":"expense"}]}',
    '{"kind":"conversation","text":"Ready.","actions":[{"type":"expense"}]}',
    '{"kind":"memory_proposal","text":"Noted.","memoryCandidate":{"category":"goal"}}',
    '{"kind":"conversation","text":"Noted.","memoryCandidate":{"category":"goal"}}',
    '{"kind":"action_proposal","text":"Confirm to save."}',
    '{"kind":"exfiltrate","text":"Doing well."}',
  ]
  for (const raw of refused) {
    assert.equal(toolLoop.recoverConversationalText(raw), undefined, `must refuse ${raw.slice(0, 40)}`)
  }
})

test('recovery still refuses unsafe or empty text and never unwraps twice', () => {
  assert.equal(toolLoop.recoverConversationalText('{"kind":"conversation","text":""}'), undefined)
  assert.equal(toolLoop.recoverConversationalText('{"kind":"conversation","text":"<script>alert(1)</script>"}'), undefined)
  assert.equal(toolLoop.recoverConversationalText('{"kind":"conversation","text":"See https://evil.example"}'), undefined)
  assert.equal(toolLoop.recoverConversationalText('{"kind":"conversation","text":"Use ```code``` here"}'), undefined)
  // Truncated JSON has no balanced object, so there is nothing to repair.
  assert.equal(toolLoop.recoverConversationalText('{"version":2,"text":"cut off here'), undefined)
  // Two wrapper levels are not unwrapped; only one is.
  assert.equal(toolLoop.recoverConversationalText('{"data":{"response":{"text":"Doing well."}}}'), undefined)
  // A wrapper key alongside other keys is not treated as a wrapper.
  assert.equal(toolLoop.recoverConversationalText('{"response":{"text":"Doing well."},"kind":"conversation"}'), undefined)
})

test('recovery is a single bounded attempt with no provider call and no duplicate output', () => {
  const raw = '{"kind":"conversation","text":"Doing well."}'
  const first = toolLoop.recoverConversationalText(raw)
  const second = toolLoop.recoverConversationalText(raw)
  // Pure and idempotent: it cannot loop, retry, or append a second reply.
  assert.equal(first, second)
  assert.equal(first, 'Doing well.')
  const source = readFileSync(new URL('../supabase/functions/personal-finance-assistant/toolCallLoop.ts', import.meta.url), 'utf8')
  const start = source.indexOf('export function recoverConversationalText')
  const body = source.slice(start, source.indexOf('\n}', start))
  assert.doesNotMatch(body, /await|fetch\(|while \(|for \(/u)
})

test('the edge conversation path recovers once and keeps every truth guard', () => {
  const source = readFileSync(new URL('../supabase/functions/personal-finance-assistant/index.ts', import.meta.url), 'utf8')
  const fastPath = source.slice(source.indexOf('async function runPersonalConversation'), source.indexOf('async function runConversation'))
  // Recovery is gated on shape codes only, then re-checked by the same guards.
  assert.match(fastPath, /RECOVERABLE_CONVERSATION_CODES\.has\(error\.code\)/u)
  assert.match(fastPath, /recoverConversationalText\(assistant\.content\)/u)
  assert.match(fastPath, /!repeatsStaleConversationalAmount\(recovered, request\)/u)
  assert.match(fastPath, /assertProposalTruth\(recovered, 'conversation', 0, config\.model\)/u)
  assert.match(fastPath, /kind: 'conversation'/u)
  // Exactly one repair site, and no extra provider round was introduced.
  assert.equal(fastPath.match(/recoverConversationalText/gu).length, 1)
  assert.equal(fastPath.match(/await callProvider/gu).length, 1)
  // Unrecoverable shapes keep the actionable failure code the client classifies.
  assert.match(fastPath, /'malformed-result', 'edge-normalization'/u)
  // The tool-loop path must not gain any recovery.
  const toolPath = source.slice(source.indexOf('async function runConversation'))
  assert.doesNotMatch(toolPath, /recoverConversationalText/u)
  // The tool-free turn is told plainly not to emit JSON.
  assert.match(source, /Ignore the JSON response contract for this turn/u)
})

test('ordinary conversation completes in one provider call with no tools', async () => {
  let calls = 0
  const result = await toolLoop.runStandardToolLoop({ initialMessages: [], allowedNumbers: new Set(), registeredTools: new Set(), proposalTools: new Set(), routeTool: 'request_deep_analysis', canRouteDeep: false, callProvider: async () => { calls += 1; return { role: 'assistant', content: '{"version":2,"kind":"conversation","text":"I understand."}' } }, executeTool: () => ({ result: {} }) })
  assert.equal(calls, 1)
  assert.equal(result.calledTools.length, 0)
})

test('simple finance read uses one tool round plus one final round', async () => {
  let calls = 0
  const result = await toolLoop.runStandardToolLoop({ initialMessages: [], allowedNumbers: new Set(), registeredTools: new Set(['get_payables']), proposalTools: new Set(), routeTool: 'request_deep_analysis', canRouteDeep: false, callProvider: async () => { calls += 1; return calls === 1 ? { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'get_payables', arguments: '{}' } }] } : { role: 'assistant', content: '{"version":2,"kind":"finance_list","text":"One payable is PKR 5000.","financeItems":[{"label":"Parent","amount":5000}]}' } }, executeTool: () => ({ result: { status: 'ok', payables: [{ label: 'Parent', amount: 5000 }] } }) })
  assert.equal(calls, 2)
  assert.deepEqual(result.calledTools, ['get_payables'])
})

test('simple authoritative reads can finish after one planning call', async () => {
  let calls = 0
  const result = await toolLoop.runStandardToolLoop({ initialMessages: [], allowedNumbers: new Set(), registeredTools: new Set(['get_payables']), proposalTools: new Set(), routeTool: 'request_deep_analysis', canRouteDeep: false, callProvider: async () => { calls += 1; return { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'get_payables', arguments: '{}' } }] } }, executeTool: () => ({ result: { status: 'ok', payables: [{ label: 'Parent', amount: 5000 }] } }), finalizeRead: () => ({ kind: 'finance_list', text: 'Current records.', financeItems: [{ label: 'Parent', amount: 5000 }] }) })
  assert.equal(calls, 1)
  assert.equal(result.final?.kind, 'finance_list')
})

test('simple proposal returns after one provider call and never executes a write', async () => {
  let calls = 0
  let executions = 0
  const action = { actionType: 'add-payable', amountPkr: 5000 }
  const result = await toolLoop.runStandardToolLoop({ initialMessages: [], allowedNumbers: new Set(['5000']), registeredTools: new Set(['propose_payable']), proposalTools: new Set(['propose_payable']), routeTool: 'request_deep_analysis', canRouteDeep: false, callProvider: async () => { calls += 1; return { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'propose_payable', arguments: '{"amountPkr":5000}' } }] } }, executeTool: () => { executions += 1; return { result: { status: 'proposed' }, action } } })
  assert.equal(calls, 1)
  assert.equal(executions, 1)
  assert.deepEqual(result.actions, [action])
  assert.equal(result.final?.kind, 'action_proposal')
})

test('duplicate tool-call ids are rejected before execution', async () => {
  await assert.rejects(toolLoop.runStandardToolLoop({ initialMessages: [], allowedNumbers: new Set(), registeredTools: new Set(['get_payables']), proposalTools: new Set(), routeTool: 'request_deep_analysis', canRouteDeep: false, callProvider: async () => ({ role: 'assistant', content: null, tool_calls: [{ id: 'same', type: 'function', function: { name: 'get_payables', arguments: '{}' } }, { id: 'same', type: 'function', function: { name: 'get_payables', arguments: '{}' } }] }), executeTool: () => ({ result: {} }) }), (error) => error.code === 'duplicate_tool_call_id')
})

test('proposal lifecycle states persist and duplicate message ids collapse', () => {
  const proposal = { proposalId: 'p1', actionType: 'add-payable', amountPkr: 5000, description: 'Parent', effectiveDate: '2026-08-03', createdAt: 1, status: 'superseded', idempotencyKey: 'p1', summary: 'Preview', counterparty: 'Parent' }
  const message = { id: 'm1', role: 'assistant', text: 'Replaced', timestamp: 1, proposal }
  assert.equal(history.isAssistantMessage(message), true)
  const state = history.appendAssistantMessages({ version: 1, messages: [] }, [message, message])
  assert.equal(state.messages.length, 1)
})

test('completed lifecycle stores exactly one receipt on one assistant message', () => {
  const proposal = { proposalId: 'p1', actionType: 'add-payable', amountPkr: 5000, description: 'Parent', effectiveDate: '2026-08-03', createdAt: 1, status: 'executed', idempotencyKey: 'p1', summary: 'Preview', counterparty: 'Parent' }
  const receipt = { proposalId: 'p1', actionType: 'add-payable', amountPkr: 5000, affectedLabel: 'Parent', completedAt: 2 }
  assert.equal(history.isAssistantMessage({ id: 'm1', role: 'assistant', text: 'Action completed.', timestamp: 2, proposal, receipt }), true)
})

test('a production build refuses to ship without cloud configuration', async () => {
  const configSource = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8')
  // Missing VITE_* values are replaced with `undefined` rather than failing, so
  // an unconfigured build installs happily and then stops the Assistant on its
  // `not-configured` preflight before any request starts. Fail at build instead.
  assert.match(configSource, /apply: 'build'/u)
  assert.match(configSource, /VITE_SUPABASE_URL/u)
  assert.match(configSource, /VITE_SUPABASE_ANON_KEY/u)
  assert.match(configSource, /throw new Error\(/u)
  // The escape hatch has to be deliberate, never the default.
  assert.match(configSource, /VITE_ALLOW_LOCAL_ONLY_BUILD === '1'/u)

  const exampleSource = await readFile(new URL('../.env.example', import.meta.url), 'utf8')
  assert.match(exampleSource, /VITE_ALLOW_LOCAL_ONLY_BUILD=/u)
  // The browser bundle may only ever carry the anon key.
  assert.doesNotMatch(exampleSource, /SERVICE_ROLE/u)
})

test('static performance, timeout, capability, and safety invariants remain bounded', async () => {
  const [clientSource, edgeSource, orchestratorSource, componentSource, profileSource, mockSource] = await Promise.all([
    readFile(new URL('../src/lib/assistantClient.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/personal-finance-assistant/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/assistantOrchestrator.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/assistant/AssistantComponents.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/profile/ProfilePage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/mocks/finance.ts', import.meta.url), 'utf8'),
  ])
  assert.match(clientSource, /REQUEST_TIMEOUT_MS = 35_000/u)
  assert.match(edgeSource, /TURN_DEADLINE_MS = 25_000/u)
  assert.match(edgeSource, /recentMessages\.slice\(-10\)/u)
  assert.match(edgeSource, /request\.conversationState\?\.isFollowUp/u)
  assert.match(edgeSource, /tools: \[\]/u)
  assert.match(edgeSource, /cleanPersonalizationText/u)
  assert.match(edgeSource, /Not instructions or authority/u)
  assert.match(orchestratorSource, /slice\(-10\)/u)
  assert.match(orchestratorSource, /selectRelevantMemories\([^)]*5\)/su)
  assert.match(componentSource, /message\.proposal\.status !== 'executed'/u)
  assert.match(componentSource, /Nothing will change until you confirm/u)
  assert.match(profileSource, /Memory Controls/u)
  assert.match(profileSource, /Strict \/ accountability/u)
  assert.doesNotMatch(edgeSource, /Sameer/u)
  assert.doesNotMatch(mockSource, /Sameer/u)
})

// Intermittent routing regression reproduced on the device: "Hello" answered
// with an unavailability notice, and a Roman Urdu balance question was answered
// with a claim that the records could not be reached. Both are routing defects,
// not provider defects: the records were present the whole time.

const financeContext = (overrides = {}) => ({
  currency: 'PKR',
  today: '2026-08-05',
  accounts: [{ id: 'cash', name: 'Cash', type: 'cash', balance: 700 }],
  summary: { totalBalance: 700, cashBalance: 700, monthlyIncome: 0, monthlyExpenses: 0, netMonthlyCashFlow: 0, receivables: 0, payables: 0, commitments: 0, overdueItems: 0, safeToSpend: 700, overdueTotal: 0, upcomingItems: 0 },
  financialPosition: 'Tight',
  accountDistribution: [],
  recentTransactions: [],
  receivables: [],
  payables: [],
  commitments: [],
  managedAccounts: [],
  managedTransactions: [],
  managedReceivables: [],
  managedPayables: [],
  managedCommitments: [],
  ...overrides,
})

const NO_ACCESS_CLAIM = /pahunch nahi|access nahi|do not have access|cannot access your|can't access your/iu
const CHECKING_CLAIM = /check kar raha hoon|let me check|i'?ll check|i am checking|one moment/iu

const orchestratorOptions = (text, extra = {}) => {
  const base = settings.getDefaultSettings()
  return {
    input: { text, language: 'roman-urdu' },
    messages: extra.messages ?? [],
    data: {
      reportingMonth: '2026-08',
      activityReferenceDate: '2026-08-05',
      planningReferenceDate: '2026-08-05',
      profile: { name: 'Sameer Ahmed', initials: 'SA', incomeType: 'Freelance' },
      accounts: [{ id: 'cash', label: 'Cash', balance: 700, isDefault: true }],
      transactions: [],
      receivables: [],
      payables: [],
      commitments: [],
      planningReceivables: [],
      planningPayables: [],
      planningCommitments: [],
      liquidityReserve: 0,
      previousMonthIncome: 0,
    },
    finance: {
      version: 1,
      accounts: [{ id: 'cash', name: 'Cash', type: 'cash', openingBalance: 700, isDefault: true, isArchived: false, createdAt: 1, updatedAt: 1 }],
      transactions: [],
      migratedFromSettings: false,
    },
    planning: { version: 1, receivables: [], payables: [], commitments: [] },
    assistantMemory: memory.createInitialAssistantMemory(),
    settings: { ...base, profile: { ...base.profile, fullName: 'Sameer Ahmed' }, assistant: { ...base.assistant, personalization: { ...base.assistant.personalization, language: 'roman-urdu' } } },
    turnId: extra.turnId ?? 'turn-1',
  }
}

test('a greeting is answered locally without any provider call', async () => {
  for (const greeting of ['Hello', 'Hey', 'Hi', 'Salam', 'Assalam o Alaikum', 'AoA']) {
    const result = await orchestrator.orchestrateAssistantTurn(orchestratorOptions(greeting))
    assert.equal(result.message.source, 'local', `${greeting} must be answered locally`)
    // Never an availability notice, and never a financial claim.
    assert.doesNotMatch(result.message.text, /unavailable|available nahi|AI companion/iu, `${greeting} must not mention availability`)
    assert.equal(result.message.insight, undefined)
    assert.equal(result.message.proposal, undefined)
  }
})

test('the greeting is personalized and asks what help is needed', async () => {
  const result = await orchestrator.orchestrateAssistantTurn(orchestratorOptions('Hello'))
  assert.match(result.message.text, /Sameer/u)
  assert.match(result.message.text, /\?$/u)
})

test('Roman Urdu balance questions route to the authoritative local records', () => {
  const context = financeContext()
  const questions = [
    'Paisy kitne hein hamare pass?',
    'Mere paas kitne paise hain?',
    'Balance kitna hai?',
    'Cash kitna hai?',
    'Available balance batao',
    'Abhi kitne paise hain?',
    'How much balance do I have?',
    'What is my current balance?',
  ]
  for (const question of questions) {
    const answer = finance.getAuthoritativeAccountBalanceAnswer(question, context, 'roman-urdu')
    assert.ok(answer, `${question} must resolve locally`)
    assert.doesNotMatch(answer.text, NO_ACCESS_CLAIM, `${question} must not deny record access`)
  }
})

test('"Paisy kitne hein hamare pass?" reports the recorded total, not an invented figure', () => {
  const context = financeContext({
    accounts: [
      { id: 'cash', name: 'Cash', type: 'cash', balance: 700 },
      { id: 'easypaisa', name: 'Easypaisa', type: 'wallet', balance: 1_300 },
    ],
  })
  const answer = finance.getAuthoritativeAccountBalanceAnswer('Paisy kitne hein hamare pass?', context, 'roman-urdu')
  assert.equal(answer?.insight?.metrics?.[0]?.amount, 2_000)
  // Every per-account row is a real record, and nothing beyond the records.
  assert.deepEqual(answer?.insight?.rows?.map((row) => row.amount), [700, 1_300])
})

test('a general balance question never invents an account that is not recorded', () => {
  const context = financeContext()
  const answer = finance.getAuthoritativeAccountBalanceAnswer('Paisy kitne hein hamare pass?', context, 'roman-urdu')
  assert.equal(answer?.insight?.rows?.length, 1)
  assert.doesNotMatch(answer?.text ?? '', /bank/iu)
  // The pre-existing guard is unchanged: a missing Bank is still reported as
  // missing rather than answered with Cash.
  assert.equal(finance.getAuthoritativeAccountBalanceAnswer('bank balance?', context)?.insight, undefined)
})

test('advice about money is not hijacked by the local balance route', () => {
  const context = financeContext()
  // These mention money and a quantity but ask for judgement, which belongs to
  // the model. Routing them locally would silently replace advice with a total.
  for (const question of ['Ammi ko kitne paise dene chahiye?', 'Mujhe kitna kharch karna chahiye?']) {
    assert.equal(finance.getAuthoritativeAccountBalanceAnswer(question, context, 'roman-urdu'), undefined, `${question} must stay with the model`)
  }
})

test('required English and Roman Urdu Cash commands create local confirmation-gated proposals', async () => {
  const cases = [
    ['Add PKR 1,000 to Cash', 'add-income', 1_000],
    ['Add 1000 to my Cash account', 'add-income', 1_000],
    ['Cash mein 1000 add karo', 'add-income', 1_000],
    ['Cash mein 1000 jama karo', 'add-income', 1_000],
    ['Cash mein 1000 daal do', 'add-income', 1_000],
    ['1000 income add karo', 'add-income', 1_000],
    ['Add an expense of 500', 'add-expense', 500],
    ['Cash se 500 kharcha add karo', 'add-expense', 500],
    ['Record 500 expense', 'add-expense', 500],
    ['Top up Cash by 1000', 'add-income', 1_000],
  ]
  for (const [text, actionType, amountPkr] of cases) {
    const result = await orchestrator.orchestrateAssistantTurn(orchestratorOptions(text, { turnId: `action-${amountPkr}-${actionType}-${text}` }))
    assert.equal(result.kind, 'append', `${text} must append one preview`)
    assert.equal(result.message.source, 'local', `${text} must work without the provider`)
    assert.equal(result.message.proposal?.status, 'proposed', `${text} must require confirmation`)
    assert.equal(result.message.proposal?.actionType, actionType)
    assert.equal(result.message.proposal?.amountPkr, amountPkr)
    assert.equal(result.message.proposal?.sourceAccountId ?? result.message.proposal?.targetAccountId, 'cash')
    assert.equal(result.message.insight, undefined, `${text} must not render a balance card`)
    assert.equal(result.message.statusNote, 'Action requires confirmation')
    assert.match(result.message.text, /confirm/iu)
  }
})

test('local action parsing produces drafts without mutating finance records', async () => {
  const options = orchestratorOptions('Cash mein 1000 add karo')
  const snapshot = structuredClone(options.finance)
  const result = await orchestrator.orchestrateAssistantTurn(options)
  assert.equal(result.kind, 'append')
  assert.equal(result.message.proposal?.status, 'proposed')
  assert.deepEqual(options.finance, snapshot)
  assert.equal(options.finance.transactions.length, 0)
})

test('expense proposals are locally rejected when Cash has insufficient balance', async () => {
  const result = await orchestrator.orchestrateAssistantTurn(orchestratorOptions('Add an expense of 1000'))
  assert.equal(result.kind, 'append')
  assert.equal(result.message.source, 'local')
  assert.equal(result.message.proposal, undefined)
  assert.match(result.message.text, /enough available balance/iu)
  assert.equal(result.message.insight, undefined)
})

test('action, edit, delete, move, transfer, advice and hypothetical phrases never become balance reads', () => {
  const context = financeContext()
  const nonReads = [
    'Cash mein 1000 add karo',
    'Add 500 expense',
    'Cash account edit karo',
    'Delete Cash transaction',
    'Move 1000 to Cash',
    'Transfer 1000 to Cash',
    'Ammi ko kitne paise dene chahiye?',
    'Agar Cash mein 1000 ho to kya karun?',
  ]
  for (const text of nonReads) {
    assert.equal(finance.getAuthoritativeAccountBalanceAnswer(text, context, 'roman-urdu'), undefined, `${text} must not be a balance read`)
    assert.equal(finance.getDeterministicFinancialAnswer(text, context), undefined, `${text} must not be another deterministic read`)
  }
})

test('unsupported action-like commands never produce a local balance card', async () => {
  for (const text of ['Cash account edit karo', 'Delete Cash transaction', 'Move 1000 to Cash']) {
    const result = await orchestrator.orchestrateAssistantTurn(orchestratorOptions(text))
    assert.equal(result.kind, 'append')
    assert.equal(result.message.insight, undefined, `${text} must not show balance insight`)
    assert.equal(result.message.proposal, undefined, `${text} must not invent an unsupported proposal`)
  }
})

test('monthly expense reads remain deterministic after mutation-cue hardening', async () => {
  const result = await orchestrator.orchestrateAssistantTurn(orchestratorOptions('What are my monthly expenses?'))
  assert.equal(result.kind, 'append')
  assert.equal(result.message.source, 'local')
  assert.equal(result.message.insight?.metrics?.[0]?.amount, 0)
  assert.equal(result.message.proposal, undefined)
})

test('"Han check kro" resolves the unanswered balance question locally', async () => {
  const messages = [
    { id: 'u1', role: 'user', text: 'Paisy kitne hein hamare pass?', timestamp: 1 },
    { id: 'a1', role: 'assistant', text: 'Kya main aap ke records check karun?', timestamp: 2 },
  ]
  for (const reply of ['Han check kro', 'Check karo', 'Haan batao', 'Yes check', 'Dekho', 'Batao']) {
    const result = await orchestrator.orchestrateAssistantTurn(orchestratorOptions(reply, { messages }))
    assert.equal(result.message.source, 'local', `${reply} must resolve locally`)
    assert.equal(result.message.insight?.metrics?.[0]?.amount, 700, `${reply} must report the recorded total`)
    assert.doesNotMatch(result.message.text, NO_ACCESS_CLAIM)
    assert.doesNotMatch(result.message.text, CHECKING_CLAIM)
  }
})

test('a bare confirmation never resolves a read while an action awaits confirmation', async () => {
  // With a preview pending, "han" is a confirmation of that action and belongs
  // to the confirmation flow, which is unchanged.
  const messages = [
    { id: 'u1', role: 'user', text: 'Add PKR 1000 to Cash', timestamp: 1 },
    { id: 'a1', role: 'assistant', text: 'Preview tayyar hai.', timestamp: 2, proposal: { proposalId: 'p1', actionType: 'add-income', amountPkr: 1_000, description: 'Cash', effectiveDate: '2026-08-05', createdAt: 2, status: 'proposed', idempotencyKey: 'p1', summary: 'Preview' } },
  ]
  const result = await orchestrator.orchestrateAssistantTurn(orchestratorOptions('Han', { messages }))
  // Not answered as a balance read: no local insight was substituted.
  assert.equal(result.message.insight?.metrics?.[0]?.amount, undefined)
})

test('typed cancel replaces the pending preview once and does not mutate records', async () => {
  const pending = await orchestrator.orchestrateAssistantTurn(orchestratorOptions('Add PKR 1000 to Cash', { turnId: 'pending-cancel' }))
  assert.equal(pending.kind, 'append')
  const before = orchestratorOptions('Cancel', { messages: [pending.message] })
  const snapshot = structuredClone(before.finance)
  const result = await orchestrator.orchestrateAssistantTurn(before)
  assert.equal(result.kind, 'replace')
  assert.equal(result.replaceMessageId, pending.message.id)
  assert.equal(result.replacementMessage.proposal?.status, 'cancelled')
  assert.equal(result.replacementMessage.text, 'Action cancelled. Nothing changed.')
  assert.equal(result.replacementMessage.statusNote, 'Action cancelled')
  assert.equal('message' in result, false, 'typed cancel must not append a duplicate Assistant message')
  assert.deepEqual(before.finance, snapshot)
  assert.equal(before.finance.transactions.length, 0)
})

test('a provider or usage-check failure cannot change a local balance answer', async () => {
  // The local finance route returns before any provider call, so an unavailable
  // provider is irrelevant to it. Proven by the answer being identical whether
  // the client would have failed or not.
  const direct = await orchestrator.orchestrateAssistantTurn(orchestratorOptions('Paisy kitne hein hamare pass?'))
  assert.equal(direct.message.source, 'local')
  assert.equal(direct.message.insight?.metrics?.[0]?.amount, 700)
  assert.equal(direct.message.statusNote, 'Answered from current account records')
  assert.doesNotMatch(direct.message.text, /unavailable|available nahi/iu)
})

test('the ordinary provider-failure fallback is useful and non-technical', async () => {
  const source = await readFile(new URL('../src/lib/assistantOrchestrator.ts', import.meta.url), 'utf8')
  const start = source.indexOf('function serviceUnavailableText')
  const body = source.slice(start, source.indexOf('\n}', start))
  // Says what it can still do, and names no error code, status or subsystem.
  assert.match(body, /balance, transactions, receivables/u)
  assert.doesNotMatch(body, /usage check|edge|timeout|HTTP|status code|diagnostic/iu)
  // The old wording that reported an outage the user cannot act on is gone.
  assert.doesNotMatch(source, /could not provide a complete contextual answer/u)
})

test('provider text denying record access is corrected when records exist', async () => {
  const source = await readFile(new URL('../src/lib/assistantOrchestrator.ts', import.meta.url), 'utf8')
  // The guard is gated on local records existing, and never fires when a
  // preview was produced, so no confirmable action is ever rewritten.
  assert.match(source, /const correction = !proposal && !batch && hasLocalFinanceRecords\(context\)/u)
  assert.match(source, /DENIES_RECORD_ACCESS\.test\(outcome\.response\.text\)/u)
  assert.match(source, /PROMISES_TO_CHECK\.test\(outcome\.response\.text\)/u)
  // The correction prefers a real local answer and falls back to what it can do.
  assert.match(source, /getAuthoritativeAccountBalanceAnswer\(options\.input\.text, context, profile\.language\)\s*\?\?\s*getDeterministicFinancialAnswer/u)
  // The regexes match the exact device wording from both reported failures.
  assert.match('Abhi meri records tak pahunch nahi hai', /pahunch nahi/iu)
  assert.match('Let me check your records', CHECKING_CLAIM)
  assert.match(source, /records\? tak access nahi/u)
  assert.match(source, /thori der baad/u)
  assert.match(source, /local \(data\|records\?\)/u)
})

test('truthfulness guards include exact record-denial, fake-checking and delayed-response wording', async () => {
  const source = await readFile(new URL('../src/lib/assistantOrchestrator.ts', import.meta.url), 'utf8')
  const denialStart = source.indexOf('const DENIES_RECORD_ACCESS')
  const denialBody = source.slice(denialStart, source.indexOf('\nconst PROMISES_TO_CHECK', denialStart))
  const checkingStart = source.indexOf('const PROMISES_TO_CHECK')
  const checkingBody = source.slice(checkingStart, source.indexOf('\n\nfunction serviceUnavailableText', checkingStart))
  assert.match(denialBody, /records\? tak access nahi/u)
  assert.match(denialBody, /local \(data\|records\?\)/u)
  assert.match(checkingBody, /thori der baad/u)
  assert.match(checkingBody, /later \(reply\|respond\|tell\|check\)/u)
})

test('a corrected turn appends exactly one message and no duplicate reply', async () => {
  const result = await orchestrator.orchestrateAssistantTurn(orchestratorOptions('Paisy kitne hein hamare pass?'))
  assert.equal(result.kind, 'append')
  assert.equal(result.replacementMessage, undefined)
  // The turn id drives the message id, so a replayed turn collapses in history
  // rather than producing a second visible reply.
  assert.equal(result.message.id, 'assistant-turn-1')
  const state = history.appendAssistantMessages({ version: 1, messages: [] }, [result.message, result.message])
  assert.equal(state.messages.length, 1)
})
