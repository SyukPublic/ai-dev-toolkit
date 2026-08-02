# architecture-review

Read-only architectural auditor agent that reviews layering, dependency direction, and boundary violations.

## What's inside

| Component | Type | Description |
| --------- | ---- | ----------- |
| `architecture-reviewer` | agent | Audits already-written code for Onion Architecture violations, forbidden-import boundary breaches, and structural erosion. Reports findings with verbatim `file:line` evidence and ends with an explicit PASS/FAIL gate verdict. Never modifies files. |

## Requirements

**This plugin requires `engineering-paved-path` `^1.0.0` from the same marketplace.**

The agent preloads three skills from it at spawn time (`engineering-paved-path:onion-architecture`, `engineering-paved-path:typescript-expert`, `engineering-paved-path:security`) and loads its surface skills (React/Next.js/Fastify) on demand during a review. Claude Code installs the dependency for you:

```
/plugin marketplace add SyukPublic/ai-dev-toolkit
/plugin install architecture-review@ai-dev-toolkit
```

Should `engineering-paved-path` end up missing — for example if it was disabled — the preloaded skills are unavailable; the agent still runs with the self-contained rules embedded in its prompt, but reviews are stronger with the full skill set.

## When to run it

- **As a merge gate** — before a PR, on the branch diff; the PASS/FAIL verdict line is designed for exactly this.
- **After a feature lands** — audit the touched packages for erosion that accumulated during implementation.
- **Inside the SDD pipeline** — the `sdd-engineering` plugin's `run-plan` skill spawns this agent automatically in its review stage, in parallel with `plan-verifier`; you don't invoke it yourself there.
- **Periodically on a hot module** — layering violations are cheapest to fix while the code is still warm.

## How to use the agent

Once installed, `architecture-reviewer` is available as a subagent type in every Claude Code session. Spawn it by asking Claude to delegate:

- "Run an architecture review on the `server/` package."
- "Use the architecture-reviewer agent to audit this PR diff for layering violations."
- "Is the dependency direction in `modules/billing` correct? Have the architecture reviewer check."

The agent answers one question: **does the dependency graph respect the layer contracts?** It audits existing code — it does not plan future code, check spec coverage, or hunt for bugs, style issues, or performance problems.

### What it checks

- **Dependency direction** — inner layers (domain/core) must never import from outer layers (server, client, adapters); the arrow always points inward.
- **Boundary breaches** — e.g. routes/services importing the ORM directly, ORM types leaking through service APIs, HTTP framework types in domain logic, database error codes handled outside the repository layer.
- **Structural erosion** — God services, contracts duplicated across layers, validation schemas defined in infrastructure, circular dependencies via barrel re-exports.
- **Documented invariants** — if the host project documents package invariants (e.g. purity of a core package), it verifies they still hold.

Default layer/package names in its rules (`core/`, `server/`, `client/`, `modules/`, `adapters/`, `packages/shared`) are conventions, not requirements — the agent maps them to the host project's actual layout before auditing.

### Report format

Findings are graded CRITICAL / HIGH / MEDIUM / LOW, each with verbatim `file:line` evidence, the rule violated, and a concrete recommendation. Every report ends with a `Gate verdict: PASS` or `Gate verdict: FAIL` line (FAIL when any CRITICAL or HIGH finding exists), which makes it usable as a merge gate.

## Hard read-only constraints

- **No `Write`/`Edit` tools** (tool list: `Read, Grep, Glob, Bash, Skill`). It cannot create, modify, or delete files.
- **`Bash` is restricted to non-mutating commands** (`git log`, `git diff`, `rg`, ...). No commits, installs, builds, or redirections.
- **Evidence-first.** A finding without a verbatim citation from code it actually read is not reported.

## Versioning

SemVer per [RELEASES.md](https://github.com/SyukPublic/ai-dev-toolkit/blob/main/docs/RELEASES.md); release notes in [CHANGELOG.md](CHANGELOG.md). How this plugin fits the wider set: [docs/DEPENDENCIES.md](https://github.com/SyukPublic/ai-dev-toolkit/blob/main/docs/DEPENDENCIES.md).
