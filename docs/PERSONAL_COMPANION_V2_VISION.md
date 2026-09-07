# Personal Companion — V2 Product Vision

Updated: 2026-09-07
Owner: Sameer

## Purpose

This document is the durable future-product vision for Personal Companion V2. It should be read before planning major UX, motion, profile/settings, reminders, or native voice-assistant work.

Personal Companion should evolve from a finance tracker with an embedded Assistant into a highly polished, mobile-first personal finance companion that feels fast, intelligent, useful, creative, and pleasant enough to use daily.

The product should feel materially better than a functional prototype.

---

## V2 Core Product Direction

Key goals:
- premium mobile UI/UX across the whole app
- useful, narrow, information-dense screens instead of oversized or unusual layouts
- strong visual hierarchy and better spacing
- a calm premium base with a small number of memorable signature interactions
- Assistant as the main interaction layer
- reminders and notifications that are genuinely useful and noticeable
- native live voice access for finance actions
- creative motion that explains state, money flow, time, and Assistant intelligence rather than decorative animation everywhere
- safety architecture preserved underneath all UX improvements

### Locked Creative Direction

Use a **hybrid visual direction**:

- base experience = calm, trustworthy, premium, restrained
- signature moments = bold, creative, memorable, but never childish or game-like

The app should not become flashy, cyberpunk, neon-heavy, overloaded with gradients, or full of random animation.

Motion must make something understandable:
- what changed
- where money moved
- what the Assistant is doing
- what needs attention
- whether something completed
- how time/reminders are progressing

If motion answers none of these, it probably should not exist.

---

## Current UI/UX Direction

### Home
Home is currently the strongest/most liked screen and should be treated as the visual benchmark unless a concrete regression exists.

### Non-Home Screens
Most other screens should meet or exceed the same perceived quality.

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
Profile/settings should remain:
- compact
- interesting
- clearly useful
- logically grouped
- easy to scan
- visually consistent with the rest of the app

Avoid giant cards, empty space, and settings pages that feel like technical control panels.

---

## Motion / Interaction Vision

Use Claude's installed UI/design skills intentionally during creative work.

### Required creative skill gate

For a genuinely creative UI/motion task, before touching code the implementation agent should explicitly invoke the relevant skills and state what each contributes.

Preferred creative exploration chain:
- `21st-ui-explore`
- `ui-ux-pro-max`
- `high-end-visual-design`
- `anthropic-skills:frontend-design`

Then, after a direction is chosen:
- implementation
- `web-design-guidelines`
- `run`
- `code-review`
- `simplify`

If a required creative skill is unavailable, the agent should say so before implementation rather than silently skipping it.

Do not use the skills merely to check spacing/timing. Use them to explore 2–3 genuinely different product directions first, then implement only the strongest approved direction.

### Signature motion language

Personal Companion should have a small set of recognizable signature interactions rather than generic fade/slide animation everywhere.

Recommended signature moments:

1. **Companion Orb / Halo**
   - visual identity for the Assistant
   - evolves across idle, listening-ready, thinking, tool/checking, proposal-ready, speaking, success, and error states
   - should later become the visual foundation of the live Voice Agent

2. **Balance Morph + Financial Pulse**
   - meaningful balance changes should morph from old value to new value
   - subtle financial pulse/sparkline response where useful
   - no slow counting from zero

3. **Money Flow Transfer**
   - after a successful transfer, visually explain source → amount movement → destination
   - restrained, fast, informative
   - no flying coins, banknotes, or confetti

4. **Debt / Reminder Completion**
   - amount/progress resolves into Settled/Completed state
   - time-ring / progress identity for reminders where useful
   - controlled urgency for due/overdue states, never anxiety-inducing flashing

5. **Chart Morphing**
   - period changes should interpolate/morph where technically reasonable instead of abrupt destroy/redraw
   - labels and selected points should move naturally

Rules:
- subtle, fast, mobile-first motion
- no gimmicky parallax/tilt/spotlight effects
- no heavy animation dependency merely for visual flair
- prefer CSS/native/lightweight Web Animations unless an existing dependency already fits
- reduced-motion accessibility must be respected
- never delay a finance mutation waiting for an animation to finish

---

## Smart Reminders / Notification Vision

Personal Companion should not say reminders are unsupported when it can understand the request.

Target behavior:
- natural language reminder understanding
- ask only genuinely necessary clarification
- validated proposal
- explicit Confirm
- exactly-once persistence and native Android scheduling
- useful lifecycle: upcoming, due, overdue, snoozed, completed, cancelled
- contextual notification copy using known facts only
- actions such as Done / Snooze / Remind later where safe
- reminder completion must never silently record a financial transaction or settle a debt

Notifications should be creative enough to earn attention, but not spammy, childish, or emoji-heavy.

The reminder experience should visually connect to the same time-ring / completion language used inside the app.

---

## Native Live Voice Assistant — V2 Signature Experience

Voice Agent V1 should not be treated as a plain microphone button added to the existing chat.

It should become one of Personal Companion's main signature experiences.

### Product goal

The user should be able to speak naturally to Personal Companion and feel that the Assistant is alive, context-aware, responsive, and connected to the finance system rather than being a separate voice demo.

Examples:
- “Meezan se 5000 Cash mein transfer kar do”
- “Ali ka 3000 receivable clear kar do”
- “Aaj kitna safe spend kar sakta hoon?”
- “Kal 11 baje Bilal ko payment yaad dila dena”

The voice experience must reuse the same existing DeepSeek-first finance/reminder architecture.

### Voice visual identity

The Companion Orb/Halo should become the main live voice surface.

States should be visually distinct but restrained:

- **Idle** — almost still / subtle breathing
- **Listening** — reacts to real microphone energy
- **Understanding** — controlled fluid/orbital motion
- **Tool / Finance Check** — structured ripple/orbit state
- **Speaking** — a different motion language from Listening so the user can instantly tell who is talking
- **Proposal Ready** — motion resolves/tightens and the relevant finance object/card emerges
- **Success** — short resolved state + coordinated haptic
- **Error** — restrained disturbance, no flashing red panic state

The user should be able to visually understand the current voice state without reading a label.

### Context-aware finance objects

Voice should not be transcript-only.

When the Assistant understands a meaningful finance/reminder request, relevant compact objects should emerge from the voice surface.

Examples:
- person/counterparty
- PKR amount
- source/destination account
- reminder date/time
- receivable/payable state
- proposal summary

The transcript remains available but secondary to the live voice surface and actionable context.

### Barge-in / interruption

The user should be able to interrupt the Assistant naturally while it is speaking.

When interrupted:
- Assistant speech stops promptly
- visual state switches immediately from Speaking → Listening
- no stale voice response should continue underneath

This should feel native, not like waiting for a prerecorded response to finish.

### Haptics and motion coordination

Use haptics selectively with visual state changes:
- listening start / important action-ready state
- proposal ready
- confirm success
- reminder scheduled / completed
- restrained warning/error

Do not vibrate on every spoken turn or every tap.

### Voice confirmation safety

The existing finance safety model must not be discarded just because voice removes taps.

Typed text such as `haan`, `yes`, `ok`, or `confirm` remains zero-write authority unless the product later explicitly changes the architecture with a safe bounded mechanism.

For voice confirmation, use a dedicated Voice Confirmation Gateway concept:
- an exact proposal already exists
- Assistant asks for confirmation for that exact proposal
- authorization is bound to the active authenticated voice session + proposal fingerprint
- reply is single-use
- stale/changed/expired proposals cannot execute
- cancel/change remains available by voice
- destructive/high-risk operations may require stronger wording or an additional confirmation step

Random conversational “haan” must never execute a finance mutation.

### Voice V1 scope

Voice V1 should start inside the app with:
- live two-way speech
- natural Roman Urdu / Urdu / English switching
- interruption / barge-in
- one or more existing finance reads
- finance/reminder proposals through the current deterministic architecture
- safe proposal-bound confirmation
- exactly-once execution
- voice response plus the relevant visual finance/reminder object

Do not build a second finance brain for voice.

### System / side-button invocation — follow-up phase

After in-app Voice V1 is physically reliable, extend to supported Android-native invocation:
- Android Assistant role / system assistant invocation
- programmable side/action button where supported by device/OEM
- long-press or system gesture where Android permits Personal Companion as selected assistant

Do not assume every device allows arbitrary interception of the power button. Use supported Android assistant/system mechanisms rather than hacks.

The system-invoked experience should use the exact same Companion Orb, voice states, finance objects, and confirmation architecture so it feels like the same Assistant, not a separate app mode.

---

## Architecture That V2 Must Preserve

Healthy architecture remains:

User
→ DeepSeek semantic understanding
→ optional bounded finance/reminder tools
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
- reminder scheduling/persistence truth
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

## Updated V2 Sequencing

### Phase 1 — Whole-App UX / Structure
- audit weak screens against Home quality
- simplify Profile/Settings
- improve density, hierarchy, and mobile ergonomics

### Phase 2 — Core Screen Polish
- Accounts
- Activity / Transactions
- Planning / Commitments / Reminders
- Profile / Settings
- shared cards, headers, sheets, forms, and empty states

### Phase 3 — Motion + Reminder Experience
- shared motion system
- signature Companion Orb
- balance/transfer/debt/chart motion
- smart reminders + native Android notifications
- reduced-motion support

### Phase 4 — Native Live Voice Agent V1
Before implementation:
- run creative skill gate
- explore 2–3 voice UI directions
- select one approved direction

Then build:
- in-app live voice
- barge-in
- Companion Orb voice states
- context-aware finance/reminder objects
- one existing finance read
- one existing finance write/reminder proposal
- safe proposal-bound voice confirmation
- exactly-once execution

### Phase 5 — System Invocation
- Android Assistant role / supported system invocation
- supported side/action-button route where device/OEM permits
- same visual identity and safety architecture

Only expand coverage after each phase is physically reliable.

---

## Agent Instruction

When Sameer says things like:
- “V2 ka vision dekho”
- “whole app UI/UX improve karni hai”
- “motion add karo”
- “creative banao”
- “voice assistant wala phase start karo”
- “voice ko premium/creative banao”

read this document first, then read `GLOBAL_CLAUDE_SKILLS_REFERENCE.md` before choosing design or review skills.

For creative tasks, do not silently skip the required skill exploration step.

Do not interpret “creative” as permission for visual noise. The goal is a premium financial companion with a small number of memorable, meaningful signature interactions.
