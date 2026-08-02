# Orders sample project — instructions for Claude

A small e-commerce backend: Fastify 5 + Drizzle + Postgres server, a separate pure
reporting engine (`report-core/`), shared Zod contracts in `@acme/shared`.

## Read when (routing table — consult BEFORE touching code)

- Adding or changing an HTTP API endpoint → read [docs/api-guidelines.md](./docs/api-guidelines.md) first.
- Architecture, layering, dependency direction, "where should this code live" → read [docs/architecture.md](./docs/architecture.md).
- Hit unexpected behavior ("this should work but doesn't") → check [docs/gotchas.md](./docs/gotchas.md) before debugging from scratch.

## Working rules

- For any architectural assessment of planned or existing code (layering, dependency
  direction, boundaries), dispatch the `architecture-reviewer` subagent — do not review inline.
- When you confirm a non-obvious insight about this codebase (a surprising root cause, a
  gotcha, a convention that isn't written down), record it with the `engineering-insights`
  skill so the team doesn't rediscover it.
- Verify, don't recall: ground claims in the relevant skill or the actual source code.
