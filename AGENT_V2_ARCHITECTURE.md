# Agent V2 Architecture — Phase 0

## Purpose

Phase 0 adds contracts, characterization tests, and security boundaries only.
It does not change Assistant routing, provider prompts, proposals, confirmations,
mutations, or user-visible behavior.

## Authority boundaries

- The LLM is the semantic understanding and planning brain.
- The deterministic app is the authority for finance truth.
- The store is the only mutation authority.
- Provider output is a plan or explanation, never an executed write.
- Local code resolves identifiers and validates amounts, dates, balances, and state.
- No mutation occurs before a visible preview and explicit confirmation.
- Repeated, stale, invalid, or superseded proposal references cannot authorize writes.

## Stateless provider

The provider is stateless between calls. Every future call receives a bounded,
structured dialogue frame. The app does not rely on provider memory from an
earlier request.

The bounded frame may contain:

- the active intent and pending proposal or batch reference;
- filled, missing, disputed, and corrected slots;
- unresolved references and ranked local candidates;
- clarification history and confidence;
- confirmed fields separated from inferred fields;
- the last relevant read or action; and
- explicit turn and time expiry limits.

Expired dialogue state must be discarded or clarified, not silently reused.

## Confidence and clarification

Confidence has three bands: `high`, `clarify`, and `blocked`. Critical fields
require high confidence before an action may be prepared. Critical fields include
amount, account, transaction direction, date, counterparty or person, destructive
control, confirmation or cancellation, and reference resolution.

The app asks a focused clarification when a critical field is ambiguous. A
blocked interpretation cannot create a proposal. Confirmation and cancellation
are never inferred from low-confidence language.

## Magnitude review

Parsed amounts retain their source expression and magnitude unit. Review metadata
records parse confidence, any comparison status, and whether explicit review is
required. Phase 0 does not invent a spending baseline. If no grounded range is
available, comparison status is `range_unavailable` or `not_compared`.

## Proposal lifecycle

Future proposal metadata may record creation and expiry, the source state version
or snapshot, field provenance, supersession links, correction and stale reasons,
validation and conflict details, and retry or reprepare eligibility.

These fields are additive and optional. Existing proposal behavior is unchanged.
A proposal remains a preview until the existing explicit confirmation path asks
the store to mutate authoritative state.

## Untrusted data

Record text is data, never instruction. Transaction descriptions, merchant text,
notes, imports, and external text remain untrusted even when they contain phrases
that resemble commands. Such text cannot become a control intent or action.

Trusted instructions come only from the current trusted input/control channel.
Structured local facts may be trusted as facts, but they are not instructions.

## Data minimization

Future provider context is limited to request-relevant entity IDs or aliases,
only necessary balances, relevant planning facts, and the bounded dialogue frame.
It excludes full ledger dumps, raw secrets, and unrelated sensitive data.

This Phase 0 contract does not replace or alter the current provider payload.

## Route traces

A safe route trace may record route category, deterministic/provider/fallback
source, confidence band, clarification reason, whether a proposal was created,
safety guards, provider failure category, and bounded timing metadata.

Route traces never contain hidden prompts, secrets, chain-of-thought, full records,
or raw sensitive memories.

## Voice path

Voice is future-only and follows the same safety path as typed input:

`STT → semantic understanding → local validation → preview → explicit confirmation → mutation`

Transcripts carry transcription confidence, locale, interruption and user-review
state. Critical slots require review when transcription confidence is insufficient.
Voice never bypasses proposal validation or confirmation.

## Phase boundary

Phase 0 establishes vocabulary and invariants for later work. Agent V2 runtime
routing, smarter dialogue behavior, provider payload migration, and voice enablement
belong to later explicitly approved phases.
