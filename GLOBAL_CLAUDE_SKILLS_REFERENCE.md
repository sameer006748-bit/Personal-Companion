# GLOBAL CLAUDE SKILLS REFERENCE

Updated: 2026-09-05
Owner: Sameer
Scope: GLOBAL / CROSS-PROJECT / CROSS-CHAT

## Discovery instruction

This is Sameer's global Claude Code skills reference. It is intentionally stored at the repository root with a unique filename so any agent with GitHub access can find it by searching Sameer's GitHub for:

`GLOBAL_CLAUDE_SKILLS_REFERENCE.md`

If Sameer says things like:
- "Claude ke skills dekh lo"
- "GitHub se Claude skills read karlo"
- "Claude ke skills use karo"
- "skills wali global file dekh lo"

then search GitHub for this exact filename and read it before choosing skills for the task.

Canonical detailed copy also exists at:
`sameer006748-bit/Personal-Companion/docs/CLAUDE_GLOBAL_SKILLS_REFERENCE.md`

Installed skills can change, so treat this as the durable baseline. If exact live availability matters, ask Claude Code to enumerate current installed/available skills and compare against this reference.

---

## Local Design / UI Skills

### `ui-ux-pro-max`
Broad UI/UX design intelligence: styles, palettes, fonts, UX guidelines, icons, GSAP presets, charts, stack guidance.
Best use: UI/UX design, mobile interaction, accessibility, motion ideas, charts.
Priority: VERY HIGH.

### `web-design-guidelines`
Reviews UI against web interface best practices including accessibility, responsive behavior, interaction quality and touch targets.
Priority: VERY HIGH.

### `21st-ui-review`
Audits existing UI for accessibility, responsiveness and interaction quality; can fix defects.
Use as a second-pass UI audit.

### `21st-ui-build`
Builds/substantially changes production UI using project design context plus 21st inspiration.
Use when the design direction is already chosen.

### `21st-ui-explore`
Generates and compares multiple meaningfully different UI directions.
Use only when visual direction is genuinely undecided.

### `high-end-visual-design`
Premium visual design guidance for spacing, hierarchy, shadows, cards, typography, animation taste and anti-generic-AI rules.
Priority: VERY HIGH.

### `design-taste-frontend`
Anti-slop frontend design with audit-first discipline; more landing/redesign oriented than app-shell oriented.

### `image-to-code`
Mockup/image-first design implementation.
Use only when Sameer explicitly wants mockup-driven implementation.

### `21st-ai`
UI generation/iteration through 21st CLI.
Last known status: CLI not installed; requires account/network.
Priority: LOW unless environment changes.

### `21st-cli-use`
Search/install React + shadcn components/themes from 21st catalog.
Last known Personal Companion status: no shadcn `components.json`.
Priority: LOW there.

### `21st-registry`
Publish/manage components/themes/templates on 21st.dev.
Avoid unless Sameer explicitly asks to publish.

### `21st-design-sync`
Publish design tokens/theme to 21st.
Avoid by default because it is outward-facing/publication-oriented.

### `playwright-cli`
Browser automation and Playwright testing.
Use only when Playwright is intentionally available/introduced.

---

## Harness / Engineering Skills

### `code-review`
Reviews diff/PR/branch/path for correctness bugs, test gaps, reuse, simplification and efficiency.
Priority: VERY HIGH after implementation.

### `simplify`
Quality-only cleanup pass for reuse, simplification, efficiency and code altitude.
Priority: HIGH after correctness is established.

### `security-review`
Security audit of code.
Priority: HIGH for auth, secrets, Supabase Edge Functions, finance-sensitive mutation paths.

### `run`
Launches/drives the app to verify behavior and capture screenshots where supported.
Priority: HIGH for practical verification.

### `dataviz`
Chart/dashboard design system with accessible palette, chart-form heuristics, interaction rules and light/dark consistency.
Priority: HIGH for finance dashboards/analytics.

### `claude-api`
Claude/Anthropic API reference for models, pricing, parameters, streaming, tools, MCP, caching and token counting.
Use only when Claude API integration is relevant.

### `update-config`
Configure Claude harness settings, permissions, env vars and hooks.

### `fewer-permission-prompts`
Builds a more efficient permission allowlist from transcripts.

### `loop`
Runs recurring prompts/slash commands.

### `init`
Creates/updates project instruction docs.

### `keybindings-help`
Customizes Claude keybindings.

---

## Bundled Anthropic Skills

- `anthropic-skills:frontend-design` — production frontend/visual design guidance. HIGH relevance for UI polish.
- `anthropic-skills:xlsx` — Excel workbook creation/editing.
- `anthropic-skills:pdf-reading` — PDF reading/extraction.
- `anthropic-skills:pdf` — PDF creation/manipulation.
- `anthropic-skills:docx` — Word document creation/editing.
- `anthropic-skills:pptx` — PowerPoint creation/editing.
- `anthropic-skills:consolidate-memory` — tidy/merge persistent memory files.
- `anthropic-skills:schedule` — scheduled/recurring tasks.
- `anthropic-skills:explain-usage` — explain Claude usage/limits.
- `anthropic-skills:setup-cowork` — Cowork setup/workflows.

---

## Recommended Skill Chains

### Premium app UI / Assistant screen
`ui-ux-pro-max` → `high-end-visual-design` → `web-design-guidelines` → implementation → `run` → `code-review` → `simplify`

### Finance dashboard / charts
`ui-ux-pro-max` → `dataviz` → `web-design-guidelines` → implementation → `run` → `code-review`

### Backend / finance mutation change
implementation → `security-review` → `code-review` → regression tests → `simplify`

### Existing UI bug / polish
`web-design-guidelines` + `21st-ui-review` → targeted fix → `run` → `code-review`

---

## Global agent rule

Skills are helpers, not architecture owners.

For any project:
1. Search GitHub for `GLOBAL_CLAUDE_SKILLS_REFERENCE.md`.
2. Read this file before selecting Claude skills.
3. Use only skills relevant to the current task; do not blindly invoke everything.
4. Preserve the current project's architecture, security, business rules and source-of-truth boundaries.
5. Never let a design or convenience skill override safety-critical behavior.
6. If installed skills may have changed, verify live availability with Claude Code before execution.

For Personal Companion specifically, never let skills override DeepSeek-first semantics, deterministic app truth, entity/account re-resolution, explicit local Confirm, Execution Gateway, exactly-once mutation safety, or typed `haan/yes/ok/confirm` = zero write authority.
