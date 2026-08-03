## What happened in this session (about 3 hours)

1. Renamed `getUser` to `fetchUser` across the codebase for consistency.
2. Ran prettier over `server/src/` — 41 files reformatted, no logic changes.
3. Chased a CI-only failure in the indexing pipeline for an hour. Root cause: `Promise.all`
   over the document batch opens one Postgres connection per item, and CI's pool caps at 20,
   so anything past ~20 documents deadlocks waiting for a free connection. Locally the pool is
   100, so it never reproduced. Fixed in `src/indexing/pipeline.ts` (`runFullIndex`) by
   switching to `Promise.allSettled` over batches of 10.
4. Before landing on that, we spent 40 minutes adding retry-with-backoff around the failing
   queries. It made the symptom intermittent instead of fixing it, and masked the deadlock in
   the logs — we reverted it.
5. Bumped `pino` from 9.4.0 to 9.5.0 in `package.json`.
6. Discovered that `drizzle-orm`'s `.returning()` silently returns an empty array on a
   conflict-skipped upsert rather than throwing, so `const [row] = await ...` yields
   `undefined` and the next line blows up with a confusing message. Confirmed against
   `server/src/modules/orders/repository.ts` (`upsertOrder`).
7. Added a `docs/` link to the README.
8. Async code is generally tricky in this codebase and needs care.

## Current contents of docs/engineering-insights.md

```markdown
# Engineering insights

> Running log of non-obvious, durable engineering knowledge for this project.
> Append-only during capture; consolidated only during prune.

## Gotchas

- [2026-05-02] Vitest `globals: true` is required for the jest-dom matchers to register; without it `toBeInTheDocument` is undefined at runtime; `src/test/setup.js`
- [2026-06-19] `drizzle-orm` `.returning()` gives back an empty array when an upsert hits a conflict-skip, so destructuring the first row yields `undefined`; `server/src/modules/orders/repository.ts` (upsertOrder)
```
