# Personal Companion agent instructions

## Repository navigation

- Consult the current Graphify output before any broad repository scan.
- Use Graphify queries to identify likely entry points and relationships, then open only the files relevant to the task.
- Do not repeatedly rescan the repository. Reuse the graph and knowledge already gathered during the task.
- Refresh Graphify after structural source changes so later agents receive an accurate repository map.

## Product constraints

- Keep all user-interface wording professional, concise, and in English.
- PKR is the only application currency. Do not introduce currency selection, conversion, or alternate currency codes.
- Keep model-selection advice outside coding prompts and source-code instructions.
- Preserve the intentional feature boundaries under `src/features` and shared code under `src/shared`, `src/models`, `src/store`, `src/lib`, and `src/mocks`.

## Engineering guardrails

- Keep TypeScript strict and avoid weakening compiler or lint rules to bypass errors.
- Add only dependencies required by an approved feature.
- Do not add a backend, authentication, a database, Supabase, real AI integrations, or notifications without an explicit request.
- Do not configure a GitHub remote, push, or commit unless explicitly requested.
- Run `npm run typecheck`, `npm run lint`, and `npm run build` before handing off source changes.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
