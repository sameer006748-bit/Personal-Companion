# Personal Companion — V2 Product Vision

Updated: 2026-09-10
Owner: Sameer
Status: ACTIVE PRODUCT DIRECTION / DURABLE AGENT CONTEXT

## Purpose

This document is the durable product vision for Personal Companion V2. Any agent working on major UI/UX, motion, Assistant, reminders, Android-native behavior, voice, or product-direction work should read this document before planning or implementation.

Personal Companion is an Android-first intelligent personal finance companion. It should evolve beyond a functional finance tracker with an embedded chatbot into a highly polished, fast, intelligent, visually memorable daily companion that helps the user understand money, plan ahead, act safely, and eventually interact naturally by voice.

The target is not merely “clean UI.” The product should feel materially different from a generic finance dashboard and should have a recognizable Personal Companion identity.

---

## Product Foundation That Must Not Regress

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
- mixed Roman Urdu / Urdu / English context
- conversational reasoning
- deciding which bounded tool/action is needed

The app owns:
- authoritative balances and financial records
- accounting truth
- account/entity resolution
- reminder scheduling/persistence truth
- proposal lifecycle
- confirmation authority
- mutation execution
- idempotency

Never regress into:
- regex semantic routing
- Roman Urdu phrase dictionaries
- phrase-specific hacks
- provider direct mutation
- model-invented IDs becoming authoritative
- bypassing the Execution Gateway
- typed `haan`, `yes`, `ok`, or `confirm` gaining write authority

Physical/local explicit Confirm remains the sole write authority unless a later dedicated, bounded Voice Confirmation Gateway is intentionally designed and approved.

---

# CURRENT LOCKED VISUAL DIRECTION — 2026-09-10

Earlier UI passes improved cleanliness, density, accessibility, and consistency, but Sameer rated the visible result only around 6/10 because the product still lacked a noticeable wow factor and a proprietary visual identity.

Astra concept exploration then produced three directions:
- **Still** — premium quiet financial journal
- **Current** — bold money routes, visual storytelling, expressive hierarchy
- **Tide** — calm premium base, functional Orb, strong financial/time interaction language

The recommended product direction is now:

## TIDE FOUNDATION + SELECTED CURRENT ENERGY + APPLE-LIKE 2.5D DEPTH

This is the current design target.

### Core formula

- Tide = structural and visual foundation
- selected Current concepts = stronger energy, money-flow storytelling, asymmetry, and bold moments
- Apple-like 2.5D depth = layered surfaces, physical-feeling transitions, spring motion, subtle depth/light, tactile interaction
- selective glass = transient/floating surfaces only, not the entire app foundation
- calm matte content surfaces = primary readability layer
- Companion Orb = recognizable intelligent identity
- motion + haptics = meaningful feedback, not decoration

The desired result is a premium finance companion that feels alive, tactile, smooth, intelligent, and memorable without becoming a game, crypto dashboard, neon AI demo, or animation showcase.

---

## Why Full Glassmorphism Is No Longer the Theme

Earlier direction treated glassmorphism more broadly as the product theme. That is no longer preferred.

Full-app glassmorphism can weaken:
- information hierarchy
- financial readability
- contrast
- density
- performance
- long-term visual credibility

### New material rule

Use:
- **matte / opaque / editorial surfaces** for core financial content
- **selective glass** for transient or floating layers such as:
  - modal/sheet overlays
  - Assistant composer/floating controls where useful
  - voice surface layers
  - contextual quick actions
  - carefully selected Orb/halo depth layers

Glass is now an accent/material behavior, not the global theme.

---

# Apple-Inspired 2.5D Direction

“Apple-like” does not mean heavy decorative 3D.

It means the UI should gain perceived quality through:
- layered depth
- precise soft shadows/highlights
- subtle physical material relationships
- spring-based motion
- shared-element continuity
- controlled parallax/depth only where it explains focus or hierarchy
- tactile haptics
- smooth foreground/background transitions
- objects that appear to move because state or money actually changed

### Good 2.5D candidates

- Companion Orb as a soft volumetric object/ring rather than a flat circle
- Money Horizon segments that gently lift/focus when selected
- Planning timeline active nodes moving into focus while surrounding context recedes
- source → destination transfer continuity
- proposal/review checkpoint moving into foreground while conversation/background recedes
- Future Me scrubber/forecast marker with smooth tracking
- bottom sheets and overlays with spring depth
- goal/arrival seal and completion transitions

### Avoid

- decorative fake-3D objects
- floating cards everywhere
- constant parallax
- unnecessary tilt/spotlight effects
- cartoon coins/banknotes
- continuous ambient motion
- animation that delays or hides financial truth

Activity and Profile should remain comparatively flatter and more scan-friendly. Signature depth belongs primarily on Home, Assistant, Planning, transfer/review, goals/reminders, and future Voice surfaces.

---

# Signature Product Concepts From Astra Exploration

The following concepts are approved for continued exploration/implementation where they fit the real data model and product architecture.

## 1. Adaptive Home

Home should not behave like a static dashboard forever.

Its emphasis may adapt to the user’s real financial situation, for example:
- starting out
- essentials covered
- needs attention
- plan completed

This adaptation must be driven by deterministic app truth/derived rules, not invented AI claims.

## 2. Money Horizon

Move beyond a single balance number toward an understandable financial position showing relevant concepts such as:
- available
- reserved
- upcoming plans/obligations
- buffer / room

Exact meanings must be grounded in real deterministic calculations.

## 3. Future Me

A future-position / forecast interaction can show how known upcoming obligations or planned movements affect projected balance.

Guardrails:
- deterministic calculations first
- assumptions visible
- no invented future income/expenses
- AI may explain the result but must not create authoritative numbers

## 4. Money Map / Story Thread

Activity should eventually explain money movement, not merely list rows.

Useful story relationships include:
- where money came from
- where it went
- what was reserved
- what remains committed
- how a transfer connected two accounts

Do not turn Accounts into a decorative node graph.

## 5. Smart Next Actions

The product may surface a small number of useful contextual next actions based on visible, verified facts.

These should assist the user, not autonomously mutate financial records.

## 6. Goal Arrival / Completion

Where goals exist, money movement can connect visually to goal progress and projected completion.

Avoid confetti or game mechanics. Use restrained “arrival / settled / completed” language and motion.

## 7. Assistant Open Gate / Proposal Checkpoint

A validated proposal should visually communicate:

**Ready ≠ Executed**

The proposal/review surface can become a strong product signature. Only explicit physical Confirm crosses that checkpoint into execution.

## 8. Six+ Orb States

Companion Orb should communicate state visually, with a consistent grammar across text Assistant today and Voice later.

Required states include:
- idle
- input/listening-ready visual state
- reasoning/thinking
- clarification
- proposal-ready
- executing
- completed/success
- error/recovery

The Orb should not be a decorative mascot. It should help the user understand the Assistant’s state.

---

# Motion Philosophy

The product should contain substantial motion quality, but NOT animation on every element.

Motion is justified when it explains:
- what changed
- where money moved
- what needs attention
- where the user is in a timeline
- what the Assistant is doing
- whether an action is merely proposed or actually executed
- whether something completed

High-value motion candidates:
- balance settle/morph
- Money Horizon focus transitions
- Now → Next → Ask continuity
- Planning timeline node progression
- reminder urgency/time-ring movement
- Assistant Orb state transitions
- proposal checkpoint transition
- source → destination transfer connector
- Activity shared-element detail expansion
- goal progress / arrival seal
- chart/period morph where real data continuity exists

Avoid:
- every card floating
- every icon bouncing
- every text block fading independently
- constant glow
- continuous background animation
- repeated overdue/error pulse
- fake money counting through intermediate values

Reduced-motion accessibility remains mandatory.

---

# Home — Current Priority

Home is the current page being redesigned first.

The single-page-by-single-page implementation approach is now preferred because it is more efficient, easier to verify visually, and reduces token/credit waste.

## Home target structure

Home should explore a strong:

**NOW → NEXT → ASK**

hierarchy.

### NOW
- strongest visual area
- current financial position
- main balance hierarchy
- one concise verified interpretation
- Money Horizon / financial-state visualization
- Apple-like controlled depth

### NEXT
- nearest meaningful upcoming items
- reminders / obligations / commitments where available
- exact amounts/dates/status visible
- premium useful empty state when nothing exists

### ASK
- contextual entry into Assistant based on visible state
- connected to the Companion Orb identity
- never implies autonomous execution

Below this, retain a compact recent-activity preview rather than another generic stack of equal-weight cards.

## Current active task

A Home-only implementation prompt has been handed to GPT-5.6 Sol in the Claude Code extension.

Model guidance for that task:
- model: GPT-5.6 Sol
- effort: Extra High

The implementation report for this Home task is still pending as of this update and should be reviewed in the next chat before deciding whether Home is approved.

Do not start Planning implementation until Sameer has visually reviewed Home on localhost and approved or requested changes.

---

# Preferred Single-Page Implementation Sequence

Proceed one page at a time:

1. Home
2. Planning
3. Assistant
4. Activity
5. Accounts
6. Profile

For each page:
1. identify the exact visual/product problem
2. choose relevant design skills only
3. inspect only the necessary source
4. implement only that page plus unavoidable shared primitives
5. run limited localhost/mobile visual review
6. Sameer approves or rejects the result
7. only then proceed to the next page

This is preferred over whole-app redesign passes because previous broad passes produced polished but insufficiently noticeable change.

---

# App Icon Direction

The application icon should be revisited because the visual identity is changing.

Preferred concept direction:

## Orb + Thread

Potential ingredients:
- simple companion/orb form
- one meaningful flow/thread line
- subtle depth or embossed/volumetric treatment
- recognizable at small Android launcher sizes
- works in light/dark/background variants
- no overly detailed financial symbols

Other possible explorations:
- Horizon Ring
- Open Gate Mark

Do not finalize the icon until the Home/design language is visually approved so the launcher identity matches the real product.

---

# Profile / Settings Direction

Profile should remain intentionally calmer and more conventional than signature finance screens.

Preserve:
- grouped hub
- browser-history-backed subviews
- compact rows
- predictable settings behavior

Avoid:
- giant cards
- decorative icon containers everywhere
- technical/admin-panel appearance
- excessive experimental 3D/motion

Use depth and glass only where interaction genuinely benefits.

---

# Planning / Reminders Direction

Planning should become a meaningful financial/time horizon rather than a stack of similar cards.

Desired identity:
- chronological progression
- reminders, commitments, receivables and payables remain semantically distinct
- time/status/amount obvious
- meaningful node/focus continuity
- Future Me or horizon concepts only if calculations are grounded
- completion tick + restrained haptic
- no anxiety-inducing animation

---

# Activity Direction

Activity should evolve from a generic transaction list toward a readable money story while staying scan-friendly.

Desired:
- strong chronological structure
- signed amounts
- account/source context
- semantic movement icons
- selected-record continuity
- possible Story Thread / Money Map relationships where real
- detail expansion that preserves timeline context

Do not sacrifice ledger readability for decorative visualization.

---

# Accounts Direction

Accounts remain text-first and authoritative.

Potential additions:
- stronger balance hierarchy
- meaningful proportional share visualization when useful
- source → destination transfer continuity
- clear default/archive status without badge overload

Do not turn account management into an abstract node graph.

---

# Assistant Direction

Assistant is a major signature surface.

Desired evolution:
- Orb integrated as functional state indicator
- verified evidence visually distinct from ordinary prose
- clarification distinct from final answer
- proposal/review surface becomes a strong Open Gate / checkpoint moment
- execution receipt appears only after real execution
- typed conversational acceptance never visually masquerades as authorization

Future Voice should reuse this same identity.

---

# Smart Reminders / Notifications

Target behavior remains:
- natural-language understanding
- only necessary clarification
- validated proposal
- explicit Confirm
- exactly-once persistence
- native Android scheduling
- upcoming / due / overdue / snoozed / completed / cancelled lifecycle
- contextual copy using known facts only

Reminder completion must never silently record a finance transaction or settle a debt.

The app already has Capacitor Local Notifications and Haptics integrated. Future UI work must preserve their functional behavior.

---

# Native Live Voice Assistant — Future Signature Phase

Voice remains a major future phase after current UI/UX acceptance.

The user should eventually be able to speak naturally in Roman Urdu / Urdu / English, interrupt the Assistant, receive visual finance/reminder context, and create safe proposals through the existing deterministic architecture.

Voice should reuse:
- same DeepSeek finance brain
- same authoritative finance tools
- same proposal lifecycle
- same Orb identity
- same exactly-once execution model

Do not build a second finance brain for Voice.

A future Voice Confirmation Gateway must be proposal-bound, authenticated, single-use, stale-safe, and incapable of executing from random conversational “haan”.

Android system/side-button invocation should be explored only after in-app Voice V1 is reliable, using supported Android assistant mechanisms rather than hacks.

---

# Design / Claude Skills

Read `GLOBAL_CLAUDE_SKILLS_REFERENCE.md` before choosing skills for design-heavy work.

Useful known skills include:
- `ui-ux-pro-max`
- `high-end-visual-design`
- `web-design-guidelines`
- `dataviz`
- `anthropic-skills:frontend-design`
- `design-taste-frontend`
- `21st-ui-explore`
- `21st-ui-build`
- `21st-ui-review`
- `run`
- `code-review`
- `simplify`

Important rule:
**Do not blindly invoke every skill.** Use the smallest relevant set for the current page/task. Existing skill/component patterns should be reused where they already solve the problem instead of recreating everything from scratch.

If a skill/authenticated catalog is unavailable, do not burn tokens repeatedly retrying it.

---

# Agent / Prompt Workflow — Standing Rule

This section is important for every future chat/agent.

## Before writing a coding/agent prompt

The coordinator should NOT automatically dump a prompt whenever a new issue is mentioned.

First:
- understand the user’s concern
- discuss/lock the intended direction when the task is ambiguous or visual
- ask Sameer before generating the implementation prompt when direction is not already approved

If Sameer has already explicitly approved the exact next action and asks for the prompt, provide it directly without unnecessary re-confirmation.

## Model and effort communication

Sameer wants the coordinator to state OUTSIDE the prompt:
- which model to use
- the recommended effort level

Effort recommendation is mandatory for agent/coding prompts.

### Critical formatting rule

**Do NOT put model names or effort settings inside the task prompt itself.**

Tell Sameer separately, for example:
- Model: GPT-5.6 Sol
- Effort: Extra High

Then provide a task-only prompt.

Sameer often runs GPT-5.6 Sol through the Claude Code extension, so prompts must remain model-neutral and focused on work rather than model-routing instructions.

## Prompt quality

Prompts should be:
- scope-locked
- token-efficient
- serious
- verification-oriented
- explicit about what NOT to touch
- minimal in repeated browser/build diagnostics
- clear about final validation
- clear about no staging/commit/push unless requested

Avoid giant generic repo audits when a narrow page/task is being changed.

## Design tasks

Prefer page-by-page work and visible approval before the next page.

For creative tasks:
- use relevant skills where valuable
- do not recreate components/patterns if a strong existing skill/library pattern already solves them
- creativity should create visible product identity, not visual noise

---

# Report → GitHub Update Workflow

After each meaningful implementation/report milestone provided by Sameer:

1. review the report critically
2. distinguish proven results from agent claims
3. note actual validation/test results
4. note backend/Supabase/Edge changes explicitly
5. note whether deployment is required or already done
6. note staged/commit/push status
7. update the durable GitHub project handoff/vision docs with the new verified status before the next major task when Sameer asks to continue the tracked workflow

Do not leave stale statements such as “Edge undeployed” after Sameer has already shown a successful deploy.

Do not claim completion merely because an agent report says “premium” or “wow”; Sameer’s localhost/physical visual review remains the acceptance authority for UI/UX.

---

# Repository / Git Safety

Known repo:
- `sameer006748-bit/Personal-Companion`
- local path: `C:\Users\Dell\Desktop\Personal-Companion`
- main branch used as project baseline

Protected paths:
- `scripts/_probe.mjs`
- `supabase/.temp/`

Never inspect/touch/stage/delete those paths unless Sameer explicitly changes this rule.

Avoid:
- `git reset`
- `git restore`
- `git checkout`
- `git stash`
- `git clean`
- `git add .`
- `git add -A`

Do not stage, commit, or push local implementation work unless Sameer explicitly approves it.

If Graphify is materially required by the project workflow, use exactly:
`graphify update .`

---

# Current Operational Notes

- Smart reminder engine exists and native Local Notifications/Haptics are integrated.
- Earlier reminder/clarification Edge Function changes were manually deployed successfully to the correct Supabase project.
- Do not repeat stale claims that those earlier Edge changes remain undeployed.
- Reliable Android debug build path exists via `npm run android:debug`, but APK should only be rebuilt after visual acceptance when the active task is UI/UX.
- Localhost is the preferred first visual acceptance surface for current page-by-page redesign work.
- Large creative implementation changes may still be unstaged/local; GitHub documentation should not be mistaken for proof that all local UI changes were committed.

---

# Immediate Next Step

Wait for the report from the current **Home-only GPT-5.6 Sol / Extra High** implementation task.

Then:
1. review its actual changes and validation
2. inspect Home on localhost
3. Sameer rates/approves it
4. update GitHub durable status with the report
5. if approved, prepare the Planning-only task next using the same page-by-page workflow

Do not skip Home acceptance and jump directly into the remaining screens.
