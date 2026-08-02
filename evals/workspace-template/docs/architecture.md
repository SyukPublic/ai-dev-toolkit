# Architecture — documented structural contracts

This project follows Onion Architecture. These are the rules code review enforces; cite them
by number or by substance when flagging a violation.

## Layer contracts (server/)

1. **Dependencies point inward, only inward.** Domain code imports nothing from outer layers
   (no `fastify`, no HTTP types, no DB client in `domain/` files). Any reversal of the arrow
   is a CRITICAL violation.
2. **All DB access lives in repositories.** No `drizzle-orm` usage (select/from/where/update)
   in routes or services — a service calls its repository.
3. **Concrete adapters are constructed only in the composition root.** Services depend on the
   interface they receive from the DI container; `new SomeConcreteAdapter()` inside a service
   or route is a violation. A module's service constructing its OWN repository from the
   container's db handle is the sanctioned pattern.
4. **Cross-module access goes through the container facade,** never by importing another
   module's internal repository files directly.
5. **Validation happens once at the edge** with shared Zod contracts (see api-guidelines.md);
   inner layers trust parsed types.

## report-core purity invariants

`report-core/` is a pure engine package, reusable standalone. Its documented invariants:

- **No I/O of its own.** No `node:fs`/`node:os` reads, no direct network calls, no
  `process.env` reads. Data is passed IN as inputs; the ONLY permitted side effect is the
  injected `LLMProvider`. The server (caller) does all reading and writing.
- **Grounding is MANDATORY.** Every finding the pipeline emits MUST pass `groundFindings()`
  first — returning drafted or deduped findings directly (skipping the gate) is a CRITICAL
  violation even when no forbidden import is added.
- **No back-edges.** `report-core/**` must never import from `server/**`; the allowed
  direction is server → report-core → `@acme/shared`.

## Mechanical enforcement

Boundary rules are enforced by dependency-cruiser forbidden rules, wired as `pnpm arch:check`
in CI. Keep it green; do not rely on review-time discipline alone.
