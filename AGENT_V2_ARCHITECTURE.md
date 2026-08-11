# Agent V2 Architecture — Final Semantic Boundary

## Product model

In a healthy turn, DeepSeek is the sole semantic and conversational authority.
The app does not infer arbitrary financial meaning from phrases before the model.

`User message → bounded conversation/memory context → DeepSeek → optional tool → deterministic truth/validation → DeepSeek response`

DeepSeek owns language understanding, contextual interpretation, reasoning, tool
selection, and conversational wording. The app owns PKR records, calculations,
entity existence, tool schemas, proposal construction, confirmation authority,
idempotency, mutation execution, and security. Deterministic truth is not
deterministic language understanding.

The only healthy-mode local semantic shortcut is a whole-message greeting. It is
deliberately limited to pure greetings and cannot consume a greeting combined
with financial or conversational content. Cancel and memory-consent controls are
UI authority flows rather than interpretation of financial meaning.

## Live routing and rollback

The production runtime source of truth is the Edge Function secret
`AGENT_V2_LLM_FIRST_ENABLED`. It is read once, centrally, for every authenticated
request before usage accounting or provider work:

- missing, `true`, `1`, `on`, or `enabled`: LLM-first is enabled;
- every other value, including malformed values: conservative degraded mode;
- if the Edge path itself is unreachable, the client classifies that provider
  failure and uses the same bounded degraded policy.

`AGENT_V2_LLM_FIRST_ENABLED` is the production runtime switch. When it is off,
the Edge returns the safe `runtime-disabled` code and the client shows one honest
unavailable message: there is no second provider request and no local route that
answers in its place. This changes behavior for subsequent turns without
rebuilding the APK and cannot bypass proposal validation or the Execution
Gateway.

Safe toggle commands, using an already authenticated Supabase CLI session:

```powershell
npx supabase secrets set AGENT_V2_LLM_FIRST_ENABLED=false --project-ref rhcqpsvuwosbtzcnuwtm
npx supabase secrets set AGENT_V2_LLM_FIRST_ENABLED=true --project-ref rhcqpsvuwosbtzcnuwtm
```

No service-role credential is placed in the client, source, or command.

## Healthy and degraded semantics

The request carries no locally derived meaning at all: there is no intent frame,
no resolved reference, no conversation state and no pre-computed answer. Its
fields are `version`, `requestId`, `input`, `personalization`, `memories`,
`recentMessages`, `financeContext` and an optional `pendingProposal` — bounded
recent messages, relevant consented memory, profile preferences, and the
deterministic finance snapshot that stays inside the Edge tool boundary. All 44
tools are exposed on every round and the model decides whether a tool is needed;
`tool_choice` is never serialized, so no round is narrowed or forced.

`assistantIntent`, `assistantLanguage`, `assistantRuntime`, `assistantConversation`
and `assistantEngine` are deleted, not retained as a quiet fallback. No module
maps a keyword, phrase, alias or typo to a route, and nothing local decides what
a message means before the provider answers.

The degraded path is therefore not a second parser. On `runtime-disabled`, or on
a classified provider `timeout`, `unreachable`, `rejected`, `malformed` or
`round-ceiling` failure, the turn returns one honest bounded message that states
the limitation and no financial figure. It never answers the question that was
asked from local data, and it never guesses a write.

The one surviving local pre-model branch is memory inspection: listing and
forgetting stored memories reads and writes device-only data the model cannot
see. It cannot answer a finance question, choose a tool, or prepare an action.

## Response field audit

The response is audited from provider content through Edge parsing, the final
Edge envelope, client normalization, orchestration, and UI message rendering.
Unknown extra presentation keys are ignored. Advisory failures are observable
through bounded `advisoryFieldsDropped` telemetry and do not acquire authority.

| Class | Fields | Boundary behavior |
| --- | --- | --- |
| A. Core safe conversation | `text` | The only required conversation field. Must be a bounded safe string. Safe `{ text }` is accepted without `version` or `kind`. |
| B. Advisory/optional envelope | `version`, `kind`/intent label, `followUps`, `modelTier`, unknown style hints, optional explanation keys | Missing is accepted. Null, wrong type, malformed entries, and unsupported values are dropped for an independent conversation response. They cannot select a route or authorize a tool. |
| B. Advisory semantic metadata | `semanticInterpretation`; `semanticIntent`, `candidateCategory`, `confidence`, `clarificationRequired`, candidate slots, missing/ambiguous slots, candidate references/actions, provenance | Parsed only when bounded and well-shaped; otherwise the complete advisory descriptor or malformed child is dropped. It never creates authoritative data or authorization. |
| B. Safe observability | `telemetry`, `diagnostic`, `requestId`, `runtimeMode`, stage, tool names called, round/tool counts, timings, `advisoryFieldsDropped`, response kind | Allow-listed, bounded, and type-filtered. Malformed values are dropped. Raw user text, ledgers, prompts, secrets, JWTs, memory, and chain of thought are never logged. |
| C. Strict provider tool call | tool-call id, registered tool name, JSON arguments, argument schema/types, round and duplicate-call limits | Unknown names, malformed JSON, duplicate ids, excess rounds, and invalid arguments block tool execution. |
| C. Strict finance truth | `financeItems`, `financeCard`, labels/rows/metrics, authoritative PKR amounts, currency, tool result shape, account/record/entity resolution | Malformed or invented values block the dependent finance output. Final authoritative numeric prose must match numbers returned by tools. |
| C. Strict memory candidate | category, summary, normalized value, display label, reason, sensitivity, retention | Must satisfy its schema and still becomes only a user-consent proposal. It never writes memory directly. |
| D. Proposal/write authority | `actionProposal`, `actionBatch`, action type/count, amount, account/transaction/record ids, date, fingerprint, expiry, confirmation token, idempotency key, proposal status and receipt | Strict and all-or-nothing. Provider candidates are re-resolved against current records. Provider `confirmed`, `executed`, receipt, or completion prose cannot create trusted state. Only UI confirmation can issue proposal-bound authorization. |

At the client boundary, accepted fields become `AssistantResponse.text`, optional
`followUps`/`insight`, proposal or memory candidates, safe performance metadata,
and then an `AssistantMessage`. Orchestration personalizes presentation text but
does not reinterpret a healthy response or replace it using finance phrases.
Structured cards remain the display authority for financial numbers.

## Truth, entities, and tools

All 44 existing tool definitions remain unchanged. Read tools return bounded
authoritative values. Every write-capable tool is a `propose_*` capability and
returns a candidate only. Tool results and record text are delimited as untrusted
data; notes such as “ignore previous instructions” cannot control tools or writes.

The model may decide what entity a user appears to mean. The deterministic
resolver decides whether that entity exists: one clear current match resolves,
multiple matches require clarification, and no match is rejected/not found.
Provider-supplied account and record IDs are never trusted as existence proof.

The same finance state must produce the same authoritative PKR value regardless
of the user's natural wording. The provider cannot introduce a new authoritative
number, and its final numeric statement cannot contradict the tool result.

## Numeric provenance and verified arithmetic

`numericProvenance.ts` is the single numeric truth boundary for provider output.
It records four non-interchangeable evidence classes:

- `APP_AUTHORITATIVE`: values returned by validated deterministic tools;
- `USER_CURRENT_CONVERSATIONAL`: values stated in the current turn;
- `USER_PRIOR_CONVERSATIONAL`: bounded prior-turn hypothetical values; and
- `DERIVED_VERIFIED`: results calculated by deterministic code from selected,
  provenance-bearing operands.

Validated write previews also use `APP_VALIDATED_PROPOSAL` for deterministic
display details such as amount and effective date. This fifth class can complete
proposal prose, but it cannot populate an authoritative finance card or serve as
an arithmetic operand, and it does not imply that a record exists.

The 44 business tools remain unchanged. One internal `calculate_verified`
reasoning primitive carries arithmetic intent through native tool calling rather
than optional final-response metadata. DeepSeek selects the operation and typed
operands from natural context; deterministic code verifies each operand against
the ledger and computes the result. No local phrase or language parser chooses
the operation.

The verifier supports bounded addition, subtraction, multiplication, non-zero
division, whole purchasable-unit count, percentage-of, percentage
increase/decrease, absolute difference, remaining amount, and simple average.
`whole_units` divides same-unit values and floors at zero to return a SCALAR count,
so an item count is never presented as PKR. A prior conversational value is
displayable only when the calculator explicitly selects it. It never becomes an
app balance.

PKR results use integer values and round half away from zero. Percentage and
scalar results retain at most four decimal places. Commas do not affect numeric
identity, negative and zero results are valid, and every operand/result must be
finite with an absolute bound of PKR/scalar 1,000,000,000,000. This prevents
floating-point display artifacts and unbounded arithmetic.

The calculator result is added as `DERIVED_VERIFIED` before DeepSeek composes the
final answer. Natural final text needs no `calculation` object. It must display
the verified derived result, and every other displayed number must be
authoritative, current-conversational, an explicitly selected prior operand, or
validated proposal data. Invented arithmetic, or an answer that ignores the
calculator result, fails closed. The old final calculation object remains
accepted only for backward compatibility and is not the healthy truth channel.

If DeepSeek first emits an otherwise safe natural arithmetic draft before using
the calculator, the tool loop does not immediately collapse to an availability
error. One bounded repair forces `calculate_verified`, then asks DeepSeek to
compose again from its deterministic result. A second failure still fails closed;
actions and memory proposals never enter this repair path.

## Post-tool completion and response semantics

In healthy LLM-first mode every successful read, proposal, or memory tool result
returns to DeepSeek for final reasoning and composition. `deterministicReadFinal`
is not passed into the healthy tool loop; it remains available only through an
explicit degraded/rollback callback. After DeepSeek finishes, deterministic read
data may still be attached as a structured finance card without replacing the
model's explanation.

Tool use does not determine the semantic response kind. A tool-backed answer can
remain `advice`, `conversation`, or `clarification`; a finance kind is only the
fallback when the provider omitted a kind after a read. Validated action or
memory structures still override presentation intent because they carry the
strict lifecycle contract.

Proposal truth is structural: `action_proposal` requires exactly one validated
draft and `action_batch` requires the validated batch. Words such as Confirm,
preview, or proposal have no authority, so normal UI discussion remains normal
conversation. Provider claims such as `confirmed=true` or `executed=true` are
ignored and cannot create a proposal or receipt.

Safe conversation and advice text longer than 1,200 characters is truncated at
a clean boundary with an ellipsis. Action, batch, and memory proposal text is
never truncated; oversized confirmable content is rejected so the Confirm UI
cannot represent incomplete details. Malformed optional metadata is dropped,
while finance/tool/action payloads remain strict.

A compound read/write turn carries both outputs: deterministic read truth is
attached as a finance card and the validated write remains a separate proposal.
No mutation occurs until the proposal-bound Confirm flow reaches the Execution
Gateway.

## Write authority

The only mutation route is:

`Assistant UI Confirm → proposal-bound authorization → assistantExecutionGateway → commit-time validation → idempotent store mutation → receipt`

Typed “yes”, “haan”, or “ok” is conversation input and cannot issue gateway
authorization. Cancel, stale/expired or modified previews, replayed tokens, and a
second Confirm cannot mutate. Compound turns keep each write separately gated.
Provider output cannot mark a proposal confirmed/executed, authorize itself, or
call the store. The gateway implementation is unchanged by this semantic pass.

## Context, memory, and latency

Provider calls are stateless. Recent messages are capped at 10 and relevant
consented memories at 5. Full ledgers, secrets, unrelated sensitive records, and
raw memory are excluded from model context. Contextual follow-ups are resolved by
DeepSeek from that bounded context; insufficient context produces clarification.

The existing budgets remain: a 25-second Edge turn deadline, a 35-second client
timeout, and at most two business-tool rounds. Internal deterministic arithmetic
has a separate cap of two calculator attempts so a premature calculation can
fail provenance validation, read the authoritative app value, and retry once.
Normal conversation can finish in one provider call; a balance-derived answer
can use one read round, one calculator round, and one final composition call.
Explicit degraded mode may use deterministic one-round read finalization.

Future voice input uses the same authority boundary:

`STT → semantic understanding → local validation → preview → explicit confirmation → mutation`

Transcription confidence cannot bypass validation, proposal creation, UI
confirmation, or the Execution Gateway.

## Current tool-capability gap audit

This pass keeps all 44 tools unchanged. Current reporting-month totals are
authoritative, but transaction-history reads operate on a bounded recent
snapshot and do not prove completeness for arbitrary periods.

| Question class | Support now | Truthful boundary | Minimal future capability |
| --- | --- | --- | --- |
| Yesterday's income or expense | Partial | DeepSeek can inspect matching rows in the bounded recent snapshot, but cannot prove a complete day total. | One bounded aggregate query with start/end date and direction. |
| Last week's fuel spend | Partial | Recent title/counterparty search may find examples; it is not a complete category/date aggregate. | Date range plus canonical category filter and sum. |
| Previous month's account outflow | Missing | Existing totals cover the current reporting month; recent rows cannot prove a previous-month account total. | Date range, account, direction, and sum. |
| Category totals | Missing | No complete category aggregation tool is exposed. | Canonical category filter with grouped/summed output. |
| Month-vs-month comparison | Missing | There is no authoritative pair of historical period aggregates. | Two bounded period aggregates, or one grouped-by-period aggregate. |
| Arbitrary date range | Missing | Bounded recent rows are not a complete range query. | Inclusive start/end date filters with bounded results and aggregates. |
| Account + date + direction | Partial | Individual recent rows contain these fields, but the snapshot may omit matching records. | Combined account/date/direction filters with count and sum. |
| Direction filtering | Partial | Current-month income/expense totals are full for their fixed period; arbitrary-period direction filtering is unavailable. | Direction plus date range in the aggregate query. |
| Category + date | Missing | No complete combined filter or aggregation exists. | Category plus start/end date with count and sum. |

The smallest future addition is one bounded transaction aggregate capability
with required start/end dates and optional account, category, and direction,
returning deterministic count/sum (and bounded rows only when explicitly
requested). That capability is report-only here and is not implemented in this
pass.
