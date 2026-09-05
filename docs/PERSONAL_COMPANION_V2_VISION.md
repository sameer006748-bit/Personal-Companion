# Personal Companion — V2 Product Vision

Updated: 2026-09-05
Owner: Sameer

## Purpose

This document is the durable future-product vision for Personal Companion V2. It should be read before planning major UX, motion, profile/settings, or native voice-assistant work.

Current priority is still to finish the remaining V1/V1.5 tasks first. Do not jump into V2 implementation until the active Assistant capability/UI work and remaining acceptance/cleanup tasks are closed.

---

## V2 Core Product Direction

Personal Companion should evolve from a finance tracker with an embedded Assistant into a highly polished, mobile-first personal finance companion that feels fast, intelligent, useful, and pleasant enough to use daily.

The product should feel materially better than a functional prototype.

Key goals:
- premium mobile UI/UX across the whole app
- useful, narrow, information-dense screens instead of oversized or unusual layouts
- strong visual hierarchy and better spacing
- subtle motion and state transitions that make the app feel alive without becoming flashy
- Assistant as the main interaction layer
- eventual native live voice access for finance actions
- safety architecture preserved underneath all UX improvements

---

## Current UI/UX Direction

### Home
Home is currently the strongest/most liked screen and should be treated as the visual benchmark unless a concrete regression exists.

### Non-Home Screens
Most other screens still need a substantial product-quality pass.

Desired direction:
- narrower, cleaner layouts
- less wasted space
- higher information density without clutter
- clearer hierarchy
- fewer unusual or generic-looking sections
- every tab/section should feel useful enough that the user wants to open it
- reduce decorative UI that does not help decision-making
- preserve mobile ergonomics and readable touch targets

### Profile / Settings Area
Current profile-related tabs are considered unusually structured, visually weak, and low-value.

V2 should redesign them so they become:
- compact
- interesting
- clearly useful
- logically grouped
- easy to scan
- visually consistent with the rest of the app

Avoid giant cards, empty space, and settings pages that feel like technical control panels.

---

## Motion / Interaction Vision

Use Claude's installed UI/design skills intentionally during V2 polish work.

Recommended skill chain from the saved Claude skills reference:
- `ui-ux-pro-max`
- `high-end-visual-design`
- `web-design-guidelines`
- implementation
- `run`
- `code-review`
- `simplify`

Use motion for:
- page/section transitions
- expandable/collapsible states
- Assistant proposal state changes
- contextual controls appearing/disappearing
- bottom sheets/action menus
- confirmation success/failure transitions
- lightweight chart/summary transitions where useful

Rules:
- subtle, fast, mobile-first motion
- no gimmicky parallax/tilt/spotlight effects
- no heavy animation dependency merely for visual flair
- prefer CSS/native/lightweight transitions unless an existing dependency already fits
- reduced-motion accessibility must be respected

---

## Native Live Voice Assistant — V2 Vision

This is a V2 feature, not the current immediate task.

Long-term target experience:

1. User invokes Personal Companion quickly from a physical/system shortcut where Android and the device allow it.
2. Assistant opens/listens immediately or starts a voice session without requiring normal navigation through the app.
3. User speaks naturally, for example:
   - “Meezan se 5000 Cash mein transfer kar do”
   - “Ali ka 3000 receivable clear kar do”
   - “Aaj kitna safe spend kar sakta hoon?”
4. Personal Companion understands the request using the same existing DeepSeek-first finance architecture.
5. For writes, the Assistant creates a validated proposal.
6. Confirmation may happen naturally inside the live voice session, but only through a dedicated proposal-bound confirmation mechanism.
7. The app executes exactly once and reports the real result back by voice.

### Physical Button / System Invocation

The vision is to support the fastest practical Android-native invocation route available on the user's device.

Possible future routes include:
- Android Assistant role / system assistant invocation
- programmable side/action button when supported by the device/OEM
- long-press or system gesture where Android permits Personal Companion as the selected assistant

Do not assume every device allows arbitrary interception of the power button. Use supported Android assistant/system mechanisms rather than hacks.

If the app is already open, voice mode should also be directly accessible from within Personal Companion.

---

## Voice Confirmation Safety

The existing finance safety model must not be discarded just because voice removes taps.

Typed text such as `haan`, `yes`, `ok`, or `confirm` remains zero-write authority unless the product later explicitly changes the architecture with a safe bounded mechanism.

For V2 voice confirmation, use a dedicated Voice Confirmation Gateway concept:
- an exact proposal already exists
- Assistant asks for confirmation for that exact proposal
- authorization is bound to the active voice session + proposal fingerprint
- reply is single-use
- stale/changed/expired proposals cannot execute
- cancel/change remains available by voice
- destructive/high-risk operations may require stronger wording or an additional confirmation step

Random conversational “haan” must never execute a finance mutation.

---

## Architecture That V2 Must Preserve

Healthy architecture remains:

User
→ DeepSeek semantic understanding
→ optional bounded finance tools
→ deterministic app truth / validation
→ DeepSeek natural answer

Writes:

User
→ DeepSeek understands desired action
→ validated proposal
→ explicit authorized confirmation mechanism
→ Execution Gateway
→ live-state revalidation
→ exactly-once mutation

DeepSeek owns:
- language understanding
- mixed Roman Urdu/English
- context and conversational reasoning
- deciding which bounded tool/action is needed

App owns:
- authoritative balances and records
- account/entity resolution
- proposal lifecycle
- confirmation authority
- mutation execution
- idempotency
- accounting truth

Never regress into:
- regex semantic routing
- Roman Urdu phrase dictionaries
- phrase-specific hacks
- provider direct mutation
- model-invented IDs becoming authoritative
- bypassing Execution Gateway

---

## V2 Sequencing

Do not implement everything at once.

Recommended sequence after current V1/V1.5 work is complete:

### Phase 1 — Whole-App UX Audit
- compare every screen against Home quality
- identify weak layouts, dead space, poor hierarchy, low-value sections
- especially audit Profile/Settings

### Phase 2 — Core Screen Polish
- Accounts
- Transactions
- Receivables/Payables
- Planning/Commitments
- Profile/Settings
- shared cards, headers, tabs, sheets, and empty states

### Phase 3 — Motion System
- subtle shared motion rules
- state transitions
- bottom sheets
- Assistant interactions
- reduced-motion support

### Phase 4 — Assistant Product Polish
- continue refining Assistant hierarchy, cards, quick actions, history/new-chat behavior, and discoverability

### Phase 5 — Native Live Voice Assistant Prototype
Start very small:
- native/system invocation
- live conversation
- one existing finance read
- one existing finance write proposal
- safe voice confirmation
- exactly-once execution

Only expand voice coverage after the prototype is physically reliable.

---

## Current Priority Before V2

Before beginning this V2 roadmap, finish the remaining current work:
- active Assistant capability audit/fixes
- current Assistant UI/UX V2-style polish task already in progress
- manual Supabase deployment if Edge changes require it
- physical Android acceptance tests
- remaining functional gaps found by the audit
- final regression/cleanup/docs
- approved commit/push checkpoint

V2 should begin from a stable, physically accepted foundation rather than masking functional problems with design work.

---

## Agent Instruction

When Sameer says things like:
- “V2 ka vision dekho”
- “whole app UI/UX improve karni hai”
- “profile tabs redesign karo”
- “motion add karo”
- “voice assistant wala phase start karo”

read this document first, then read `GLOBAL_CLAUDE_SKILLS_REFERENCE.md` / the Claude skills reference before choosing design or review skills.

Do not interpret this document as permission to start V2 early. Current active project tasks and physical acceptance status take priority.
