---
name: engineering-insights
description: >-
  Capture durable engineering insights into the host project's insights file
  (default docs/engineering-insights.md), and prune that log. Use during any
  session when a non-obvious discovery is confirmed — a gotcha, a fix's root
  cause, a why-it's-like-this decision, an antipattern, or a tool/library
  quirk — and at session wrap-up to sweep for learnings. Also use to review,
  dedup, or declutter the insights file. Trigger terms: insight, learning,
  gotcha, engineering insights, lesson learned, wrap-up, retrospective,
  prune insights.
allowed-tools: Read, Edit, Write, Grep, Glob
---

# Engineering Insights

Persist hard-won, non-obvious engineering knowledge into the **host project's insights
file**, append-only — so the next session starts knowing what this one learned.

Two modes: **Capture** (default) and **Review / Prune**. Details, section rubric, target-file
rules, examples, and the full prune procedure live in [reference.md](reference.md) — read it
before a prune.

## Target file

- **Default:** `docs/engineering-insights.md` in the host project.
- **Override:** the caller may name any path (or several per-package files in a monorepo —
  see the reference for routing rules in that case).
- **Never** write inside this plugin's own directory: the plugin cache is read-only, shared
  across projects, and overwritten on update. Insights belong to the project they describe,
  committed with its code.
- If the target file does not exist, create it (check-before-create) with this header:

```markdown
# Engineering insights

> Running log of non-obvious, durable engineering knowledge for this project.
> Append-only during capture; consolidated only during prune.
```

## Start of session — read first

When a session begins and the user has stated their task, BEFORE doing the work: **read the
project's insights file first**. It may already hold the gotcha, decision, or fix you'd
otherwise rediscover. Mandatory, not optional — treat the entries as high-confidence guidance
unless something proves one stale.

## When to capture — double trigger

Capture at TWO moments:
- **As you go** — the instant you *confirm* something non-obvious during the work.
- **At wrap-up** — sweep the finished session for anything worth keeping.

Capture when a competent engineer reading the code would NOT already know it:
- a gotcha / footgun, or the **root cause** of a bug you just fixed;
- a "why it's like this" **decision** (with the reason);
- an **antipattern** ("X looks right but fails because…");
- a **tool/library quirk** (version-specific behavior, config landmine);
- something to revisit later → an **Open Question**.

**Cadence / what NOT to capture:** worth it after a substantive session (≈>30 min with a real
problem, solution, or discovery). Skip trivia — renames, formatting, routine config edits,
anything obvious from the code. Signal quality matters, not volume.

**Don't skip the negatives:** antipatterns and dead ends (What Doesn't Work / Recurring Errors)
are often the most valuable entries — capture them as readily as wins.

## Record format

One bullet, placed under the matching **section header** (the section is the category — see
reference for the 7 sections, created lazily). Preserve the file's existing title and
blockquote.

```
- [YYYY-MM-DD] <actionable gist — what to do / avoid / know>; `path` (symbol)
```

- Date today's entry (the harness provides the current date).
- Anchor evidence on a **stable** locator — `` `path` `` + symbol/function name (e.g.
  `` `src/db/migrate.ts` (runMigrations) ``). A line number is optional and approximate
  — lines drift, so don't rely on them.
- Keep it terse and **actionable cold**: a reader who wasn't here must know what to do.

## Anti-banality gate (apply before writing)

> If this were obvious to anyone reading the code, don't write it.

Reject three failure modes:
- **Too generic / platitude** — `async can be tricky`, `tests are important`.
- **Too specific / not transferable** — `fixed a bug on line 47`, `renamed x to y` (changelog or
  implementation detail, not a reusable lesson).
- **Too long** — keep each entry to **≤2 sentences**; split or summarize otherwise.

Good → ``- [2026-06-19] `Promise.all` on the index pipeline times out past ~30 items; use `Promise.allSettled` in batches of 10; `src/indexing/pipeline.ts` (runFullIndex) ``

If a candidate fails any check, sharpen it or drop it.

## Capture procedure

1. **Read the target file first** — the insight may already be there. If it (or an equivalent)
   is already recorded, **do NOT write it again** (append-only ≠ duplicate).
2. Apply the **anti-banality gate** — real, non-obvious, and substantial? If not, drop it.
3. Find or **lazily create** the right section header (only add a header once it has an entry —
   no empty sections).
4. **Append** one entry (never rewrite or delete existing entries here — that's prune's job).

If by wrap-up nothing substantial *and* new emerged, **write nothing** — an empty capture is the
correct outcome for a routine session.

## Review / Prune mode

Triggered by "prune insights" / "review the insights file" / a periodic cadence. The log is a
**draft under review**, so prune needs judgment — follow the full step-by-step in
[reference.md](reference.md): dedup, conflict resolution (verify against live code; mark the
stale entry with a dated correction, never silent-delete), staleness flags, the ~200-entry
size cap → domain split (log what's dropped), and a final banality pass. **Show a summary and
apply only on confirmation.**

## Reliability note

A skill only runs when invoked, so capture is **best-effort**. The loop is closed by the
read-first rule, a pointer to this skill in the host project's `CLAUDE.md`, and manual
invocation (`/sdd-engineering:engineering-insights`). A host project may additionally wire a
Stop hook that re-invokes this skill at session wrap-up; such a hook is a **trigger, not a
second implementation** — the target-file rules, the anti-banality gate, and read-before-write
dedup still apply, so a redundant fire is a no-op.
