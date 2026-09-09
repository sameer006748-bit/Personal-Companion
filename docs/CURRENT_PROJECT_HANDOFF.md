# Personal Companion — Current Project Handoff

Updated: 2026-09-10
Owner: Sameer
Purpose: FAST CONTINUATION CONTEXT FOR NEW CHATS / AGENTS

Read this file first when continuing Personal Companion work, then read:
- `docs/PERSONAL_COMPANION_V2_VISION.md`
- `GLOBAL_CLAUDE_SKILLS_REFERENCE.md`
- `AGENT_V2_ARCHITECTURE.md`
- `AGENTS.md`

This file is intentionally operational and current. The vision file contains the durable product direction.

---

## 1. Project Snapshot

Personal Companion is an Android-first intelligent personal finance app.

Repository:
- GitHub: `sameer006748-bit/Personal-Companion`
- Local: `C:\Users\Dell\Desktop\Personal-Companion`
- Branch baseline: `main`

Stack:
- React 19
- TypeScript strict
- Vite
- Zustand
- Supabase
- Capacitor Android
- package: `com.sameer.personalcompanion`
- DeepSeek OpenAI-compatible provider

Supabase:
- project ref: `rhcqpsvuwosbtzcnuwtm`
- main Edge Function: `personal-finance-assistant`
- `smart-responder` is separate and must NOT be deployed unless explicitly required

---

## 2. Frozen Safety / Finance Architecture

Reads:
User → DeepSeek semantic understanding → optional bounded finance/reminder tools → deterministic app truth/validation → DeepSeek natural answer.

Writes:
User → DeepSeek understands requested action → validated proposal/preview → explicit local Confirm → Execution Gateway → live-state revalidation → exactly-once mutation.

Rules:
- typed `haan/yes/ok/confirm` = zero write authority
- provider never directly mutates
- no regex/keyword semantic routing
- no Roman Urdu phrase dictionaries
- no hardcoded sentence-specific fixes
- ambiguous account/entity must be clarified, not guessed
- finance truth/calculation remains deterministic/app-owned
- proposal facts and confirmation authority must never be invented by UI motion

Accounting reminders:
- borrowing: payable ↑ and receiving account ↑; principal is NOT income
- lending: receivable ↑ and source account ↓; principal is NOT expense
- debt + linked account movement should be one atomic proposal
- loan/reminder due dates remain absent unless actually supplied

---

## 3. Important Completed Functional Work

Known accepted/implemented milestones include:
- DeepSeek-first Assistant orchestration
- clarification handling for generic counterparties
- account creation support
- multi-action proposal/review flow
- physical Confirm separation from conversational acceptance
- smart reminder engine
- native Local Notifications
- Capacitor Haptics
- reminder persistence and exactly-once scheduling safeguards
- clarification-loop fix so natural acceptance can resume a paused clarification without becoming mutation authority
- proposal/action plan staleness handling
- New Chat closes stale paused clarification state

Earlier reminder/clarification Edge changes were manually deployed successfully by Sameer to the correct Supabase project.

Do NOT repeat stale statements that those earlier Edge changes are still undeployed.

---

## 4. Current UI/UX Reality

Previous broad UI/UX passes improved:
- cleanliness
- accessibility
- compactness
- Profile organization
- motion baseline
- Assistant composer behavior
- sheets/dialog exits
- haptics

But Sameer physically reviewed the app on localhost and rated the visible UI around **6/10**.

Main issue:
The app looked polished but still too generic. The promised “wow factor” was not visibly strong enough.

Observed design weaknesses:
- too many similar rounded cards
- weak differentiation between sections
- insufficient proprietary identity
- signature Orb/money-flow concepts were not visually dominant enough
- Planning/Activity still felt ordinary
- charts/data visualization felt basic
- broad redesign passes produced more cleanup than visible reinvention

Therefore whole-app creative passes are no longer the preferred implementation method.

---

## 5. Astra Concept Package

Astra produced a much stronger concept package with three directions:

### Still
Premium financial journal, quiet typography, restrained identity.

### Current
Bold money routes, expressive hierarchy, visual storytelling.

### Tide — recommended base
Calm premium base, functional Orb, financial/time interaction language, stronger coherent identity.

Sameer and coordinator currently prefer:

**Tide foundation + selected Current energy + Apple-like 2.5D depth + selective glass + spring motion + haptics.**

This is the active design direction.

Strong concepts worth carrying forward:
- adaptive Home states
- Money Horizon
- Future Me deterministic projection
- Money Map / Story Thread
- Smart Next Actions
- Assistant six+ explicit states
- proposal Open Gate / checkpoint
- transfer continuity
- goal arrival/completion

Do not copy Astra concepts blindly. They must fit the actual app architecture, terminology, data, PKR presentation, navigation, and safety model.

---

## 6. Current Material / Motion Direction

Full glassmorphism is no longer the global theme.

Preferred material system:
- matte/opaque core financial surfaces
- selective glass only for overlays/transient/floating layers
- Apple-like 2.5D depth where it improves focus/state continuity
- no generic glass-everywhere treatment

Preferred motion:
- smooth spring physics
- subtle depth
- shared-element continuity
- balance settle/morph
- Money Horizon focus
- timeline progression
- Assistant Orb state change
- proposal checkpoint transition
- transfer source→destination connector
- restrained completion/arrival motion

Avoid:
- animation on every element
- constant floating/glowing
- bouncing icons everywhere
- decorative parallax
- cartoon coins/confetti
- repeated alarm-like overdue/error motion
- fake money counting through invented intermediate values

Reduced-motion remains mandatory.

---

## 7. App Icon Direction

The app icon should be redesigned after the main visual language is approved.

Preferred concept:
**Orb + Thread**

Other possible explorations:
- Horizon Ring
- Open Gate Mark

Target:
- simple
- recognizable at small Android icon sizes
- calm volumetric/embossed feel where useful
- aligned with Companion Orb + movement/time identity

Do not finalize icon before Home/design language is visually approved.

---

## 8. New Implementation Strategy — PAGE BY PAGE

The team is now intentionally switching to single-page implementation for efficiency and quality.

Sequence:
1. Home
2. Planning
3. Assistant
4. Activity
5. Accounts
6. Profile

Cycle for each page:
- discuss exact visual problem and desired direction
- use only relevant skills
- inspect only necessary code
- implement only that page plus unavoidable shared primitives
- verify localhost/mobile
- Sameer visually reviews and rates it
- approve/revise
- update GitHub durable project docs with the report/status
- only then continue to next page

This should reduce credit/token waste and avoid another broad “polished but barely noticeable” pass.

---

## 9. CURRENT ACTIVE TASK — HOME ONLY

A Home-only implementation prompt has already been given.

Sameer is running it through the Claude Code extension using:
- **Model: GPT-5.6 Sol**
- **Effort: Extra High**

IMPORTANT:
The model and effort were communicated OUTSIDE the prompt. This is the required workflow going forward.

Home target:
- NOW → NEXT → ASK
- stronger financial hierarchy
- Money Horizon / current financial-position storytelling
- nearest meaningful upcoming items
- contextual Assistant entry
- compact recent activity
- Tide foundation
- selected Current energy
- Apple-like 2.5D depth
- selective glass only
- spring motion
- existing bottom navigation preserved
- no backend/Supabase change
- no APK yet

The implementation report is still pending as of this handoff.

The user intends to provide that report in the next chat.

DO NOT assume the Home task passed until:
1. report is reviewed
2. localhost visual result is checked by Sameer
3. Sameer approves/rates it

If Home is not visibly strong enough, revise Home before Planning.

---

## 10. Prompt / Agent Workflow — VERY IMPORTANT

Sameer has repeatedly clarified these preferences.

### Before giving a prompt

Do not automatically write an implementation prompt just because Sameer mentions a problem or idea.

If direction is not already locked:
- discuss the issue first
- give recommendation/pushback
- ask/confirm which direction to take
- only then write the implementation prompt

If Sameer has already clearly approved the exact next step and explicitly asks for the prompt, provide it directly.

### Model and effort

For every coding/agent prompt, tell Sameer OUTSIDE the prompt:
- recommended model
- recommended effort

Effort recommendation is mandatory.

### Never put model/effort inside the task prompt

Sameer often runs GPT-5.6 Sol through the Claude Code extension.

Therefore task prompts must be model-neutral.

Correct format:

Model: GPT-5.6 Sol
Effort: Extra High

Then a separate task-only prompt.

Do NOT include lines such as:
`MODEL: ...`
`EFFORT: ...`
inside the prompt itself.

### Prompt style

Prompts should be:
- efficient
- scope-locked
- token-conscious
- serious
- explicit about protected areas
- clear about validation
- low on repetitive browser checks
- low on broad repo audits
- no unnecessary narration

Do not ask an agent to recreate design elements manually when a suitable installed skill/component/pattern already exists.

---

## 11. Skills Guidance

Read `GLOBAL_CLAUDE_SKILLS_REFERENCE.md` before selecting skills when design/review skills matter.

Known useful design skills:
- `ui-ux-pro-max`
- `high-end-visual-design`
- `web-design-guidelines`
- `dataviz`
- `anthropic-skills:frontend-design`
- `design-taste-frontend`
- `21st-ui-explore`
- `21st-ui-build`
- `21st-ui-review`

Engineering/review:
- `run`
- `code-review`
- `simplify`
- `security-review` when relevant

Do not blindly invoke all skills.
Use the smallest relevant chain for the page/task.

If 21st/auth/catalog is unavailable, do not burn tokens repeatedly retrying it.

---

## 12. Report → GitHub Workflow

Going forward, after Sameer provides a meaningful agent implementation report:

- review it critically
- note what was actually changed
- note tests/build validation
- note Supabase/Edge YES/NO
- note deploy required/done/not required
- note staged/commit/push status
- distinguish agent claims from Sameer’s physical visual acceptance
- update the durable GitHub status/vision/handoff before moving to the next major task when continuing the tracked workflow

UI acceptance rule:
Agent saying “premium”, “wow”, or “complete” is not proof.
Sameer’s localhost/physical review is the acceptance authority.

The next chat should update this file after reviewing the pending Home report.

---

## 13. Git / Safety Rules

Protected paths:
- `scripts/_probe.mjs`
- `supabase/.temp/`

Never touch/inspect/stage/delete them unless Sameer explicitly changes the rule.

Avoid:
- git reset
- git restore
- git checkout
- git stash
- git clean
- git add .
- git add -A

Do not stage/commit/push local implementation by default.
Only do so when Sameer explicitly approves.

If Graphify is materially required:
`graphify update .`
exactly once.

---

## 14. Android Build Context

A reliable local Android debug build helper was previously established.

Preferred command:
`npm run android:debug`

It builds web assets, syncs Capacitor, stops Gradle, and builds with safer no-watch settings.

Do not build APK after every UI iteration.
Current workflow is:
localhost visual approval first → APK afterward.

---

## 15. Future Major Phase — Voice Agent

Voice has NOT started yet.

Future goal:
- live two-way speech
- Roman Urdu / Urdu / English
- barge-in/interruption
- Companion Orb voice states
- finance/reminder objects emerge contextually
- same DeepSeek finance brain
- same deterministic finance truth
- proposal-bound confirmation
- exactly-once execution
- later Android assistant/system invocation where supported

Do not start Voice until current UI/UX direction is sufficiently accepted unless Sameer explicitly reprioritizes.

---

## 16. Immediate New-Chat Instruction

When Sameer opens the next chat and supplies the Home implementation report:

1. read this handoff
2. read the current V2 vision
3. review the report critically
4. identify whether Home changed materially or only cosmetically
5. check stated validation and whether backend/Edge changed
6. ask for/inspect localhost evidence if needed
7. Sameer rates/approves Home
8. update GitHub handoff/vision with the verified result
9. only after approval discuss Planning
10. before Planning prompt, lock direction first if anything is ambiguous
11. state model + effort OUTSIDE the prompt
12. never put model/effort inside the prompt

This is the exact continuation point.
