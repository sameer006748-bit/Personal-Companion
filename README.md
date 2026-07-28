# Personal Companion

Personal Companion is a local-first React frontend foundation for a calm, professional personal organization experience. This repository currently contains only the application shell and project architecture; product features are intentionally not implemented yet.

## Technology

- React and TypeScript
- Vite
- Tailwind CSS
- React Router
- Zustand
- Lucide React
- date-fns

## Requirements

- Node.js 20.19 or newer
- npm 10 or newer
- Python 3.10 or newer for Graphify
- Graphify installed as an isolated developer tool

## Local development

```powershell
npm install
npm run dev
```

The development server prints the local URL when it starts.

## Quality checks

```powershell
npm run typecheck
npm run lint
npm run build
```

## Project structure

```text
src/
├── app/        Application composition and routing
├── features/   Product feature boundaries
├── lib/        Framework-independent utilities
├── mocks/      Development fixtures when a feature needs them
├── models/     Shared domain models
├── pages/      Route-level screens
├── shared/     Reusable UI and shared frontend code
└── store/      Application-level state
```

Reserved feature boundaries cover onboarding, Home, Assistant, Activity, Planning, and Profile. They remain empty until their product requirements are defined.

## Graphify

Graphify provides a local structural map of the repository. Generated output is intentionally ignored by Git.

```powershell
graphify extract . --code-only
graphify query "Where is application routing configured?"
graphify update .
```

Agents should consult the generated graph before broad scans and refresh it after meaningful structural changes.

## Product boundaries

- All interface wording is professional English.
- PKR is the only supported application currency.
- This foundation does not include a backend, authentication, a database, Supabase, real AI capabilities, notifications, or a completed dashboard.

