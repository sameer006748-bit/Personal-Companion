# Claude Global Skills Reference

Updated: 2026-09-05
Owner: Sameer

## Purpose

This file is a cross-chat / cross-agent reference for the Claude Code skills currently available on Sameer's machine. If Sameer says things like **"Claude ke paas skills hain"**, **"Claude skills use karo"**, or asks which skills are useful for a task, agents should search/read this file first instead of guessing.

Primary local skills path:
`C:\Users\Dell\.claude\skills\`

Important: installed skills can change. This file is the durable baseline. If exact live availability matters, ask Claude Code to list the currently installed/available skills and compare against this file.

---

## Local Design / UI Skills

### `ui-ux-pro-max`
Purpose: broad UI/UX design intelligence with local datasets for styles, palettes, fonts, UX guidelines, icons, GSAP presets, charts, and stack guidance.
Best use: UI/UX design, mobile interaction, accessibility guidance, motion ideas, chart design.
**Priority: very high.** Best all-round design skill for Personal Companion and similar apps.

### `web-design-guidelines`
Purpose: review UI code against web interface best practices, including accessibility, UX, responsive behavior, and interaction quality.
Best use: accessibility audit, touch targets, layout quality, UI code review.
**Priority: very high.**

### `21st-ui-review`
Purpose: audit existing UI for accessibility, responsiveness, and interaction quality; may also fix defects.
Best use: second-pass UI audit.
Note: some flows may depend on 21st tooling/network.

### `21st-ui-build`
Purpose: build or substantially change production UI using project design context plus 21st inspiration.
Best use: when a design direction is already chosen.

### `21st-ui-explore`
Purpose: generate and compare multiple meaningfully different UI directions.
Best use: when visual direction is genuinely undecided.
Avoid when only polishing an already-approved product direction.

### `high-end-visual-design`
Purpose: premium visual design guidance covering spacing, hierarchy, shadows, cards, typography, animation taste, and anti-generic-AI rules.
Best use: making app UI feel expensive, deliberate, and polished.
**Priority: very high.**

### `design-taste-frontend`
Purpose: anti-slop frontend design with audit-first workflow, mainly aimed at landing pages/redesigns.
Best use: transferable design-audit discipline.
Note: less directly suited to dense app-shell UI than `ui-ux-pro-max`.

### `image-to-code`
Purpose: generate/analyse a visual design and implement code to match it.
Best use: mockup-driven implementation.
Use only when Sameer explicitly wants image/mockup-first design.

### `21st-ai`
Purpose: generate/iterate UI through 21st CLI.
Status at last audit: `@21st-dev/cli` not installed; needs account/network.
Priority: low unless environment changes.

### `21st-cli-use`
Purpose: search/install React + shadcn components/themes from 21st catalog.
Status at last audit: Personal Companion has no `components.json`; shadcn not installed.
Priority: low for current Personal Companion architecture.

### `21st-registry`
Purpose: publish/manage components/themes/templates on 21st.dev.
Priority: avoid unless Sameer explicitly asks to publish.

### `21st-design-sync`
Purpose: publish design tokens/theme to 21st.
Priority: avoid by default because it is outward-facing/publication-oriented.

### `playwright-cli`
Purpose: browser automation and Playwright test authoring/running.
Status at last audit: Playwright not installed in Personal Companion.
Use if browser automation is intentionally introduced.

---

## Harness / Engineering Skills

### `code-review`
Purpose: review working-tree diff / PR / branch / path for correctness bugs, test gaps, reuse, simplification, and efficiency.
Best use: after implementation, especially on large uncommitted diffs.
**Priority: very high.**

### `simplify`
Purpose: quality-only pass for reuse, simplification, efficiency, and code altitude.
Best use: after functional correctness is already established.
**Priority: high.**

### `security-review`
Purpose: security audit of code.
Best use: Supabase Edge Functions, authentication, key handling, mutation paths, finance-sensitive flows.
**Priority: high when backend/security code changes.**

### `run`
Purpose: launch and drive the app to verify behavior, including screenshots where supported.
Best use: practical verification after UI or interaction changes.
**Priority: high.**

### `dataviz`
Purpose: chart/dashboard design system with form heuristics, accessible palette guidance, mark specs, interaction rules, and light/dark consistency.
Best use: finance dashboards, analytics, charts.
**Priority: high for future finance visualization work.**

### `claude-api`
Purpose: Claude/Anthropic model and API reference, including models, pricing, streaming, tools, MCP, caching, token counting.
Best use: only if Claude/Anthropic API integration is actually relevant.

### `update-config`
Purpose: configure Claude harness settings, permissions, env vars, hooks.
Best use: workflow enforcement, e.g. lint/typecheck hooks.

### `fewer-permission-prompts`
Purpose: analyze transcripts and create a more efficient permission allowlist.
Best use: workflow convenience.

### `loop`
Purpose: run recurring prompts/slash commands.
Best use: repetitive workflow automation.

### `init`
Purpose: create/update project instruction docs.
Best use: projects lacking good handoff/agent docs.

### `keybindings-help`
Purpose: customize Claude keybindings.
Best use: personal workflow only.

---

## Bundled Anthropic Skills

### `anthropic-skills:frontend-design`
Purpose: frontend / visual design guidance.
Best use: production UI polish.
**Priority: high; overlaps with `high-end-visual-design`.**

### `anthropic-skills:xlsx`
Purpose: create/edit Excel workbooks.
Use for spreadsheet import/export/reporting tasks.

### `anthropic-skills:pdf-reading`
Purpose: read/extract PDFs.
Useful for statement/document ingestion workflows.

### `anthropic-skills:pdf`
Purpose: create/manipulate PDFs.

### `anthropic-skills:docx`
Purpose: create/edit Word documents.

### `anthropic-skills:pptx`
Purpose: create/edit PowerPoint presentations.

### `anthropic-skills:consolidate-memory`
Purpose: tidy/merge persistent memory files.
Use when project memory becomes fragmented.

### `anthropic-skills:schedule`
Purpose: scheduled/recurring tasks.

### `anthropic-skills:explain-usage`
Purpose: explain Claude usage/limits.

### `anthropic-skills:setup-cowork`
Purpose: setup Cowork workflows.

---

## Recommended Skill Chains

### Premium app UI / Assistant screen
`ui-ux-pro-max` → `high-end-visual-design` → `web-design-guidelines` → implementation → `run` → `code-review` → `simplify`

### Finance dashboard / charts
`ui-ux-pro-max` → `dataviz` → `web-design-guidelines` → implementation → `run` → `code-review`

### Backend / finance mutation change
implementation → `security-review` → `code-review` → regression tests → `simplify`

### Existing UI bug/polish
`web-design-guidelines` + `21st-ui-review` → targeted fix → `run` → `code-review`

---

## Personal Companion Guardrails

Skills are helpers, not architecture owners.

They MUST NOT override:
- DeepSeek-first semantic ownership
- deterministic app truth
- account/entity re-resolution
- proposal lifecycle
- explicit local Confirm requirement
- Execution Gateway
- exactly-once mutation safety
- typed `haan/yes/ok/confirm` = zero write authority

For Personal Companion, use design/motion skills only after the functional state model is correct.

Prefer lightweight CSS/native transitions unless an existing dependency already supports the interaction cleanly. Do not add heavy animation libraries merely because a skill contains presets.

Do not expose unimplemented quick actions/features just to make the UI look richer.

---

## Last Verified Environment Notes

At the last inventory:
- React 19 + Vite 8
- Tailwind v4 CSS-first
- no shadcn `components.json`
- Zustand + React Router
- Capacitor 8 Android
- Supabase Deno Edge Functions
- Assistant tests use `node:test`
- no Playwright/Vitest/Jest installed
- no 21st CLI binary installed

These project-specific facts may change. Re-check current source before relying on them.

---

## Agent Instruction

When Sameer says **"Claude ke skills use karo"** or asks which Claude skills can help:

1. Read this file first.
2. Identify only the skills relevant to the current task.
3. Do not blindly use every skill.
4. Prefer the smallest useful skill set.
5. Keep architecture/security/business truth under the project's existing rules.
6. If live skill availability may have changed, ask Claude Code to enumerate current skills before execution.
