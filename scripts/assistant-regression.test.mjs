import assert from 'node:assert/strict'
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
