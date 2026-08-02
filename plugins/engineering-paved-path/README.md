# engineering-paved-path

Curated, project-agnostic engineering skills for the modern TypeScript stack:
React, Next.js, Fastify, onion architecture, testing, TypeScript, and security.
One installed source of truth that other plugins and agents build on instead of
copying skill content around.

## Installation

```
/plugin marketplace add SyukPublic/ai-dev-toolkit
/plugin install engineering-paved-path@ai-dev-toolkit
```

This plugin has no dependencies and executes nothing on its own (one optional
diagnostic script, see below). Other plugins in this marketplace
(`architecture-review`, `sdd-engineering`) declare a dependency on it, so
installing either of those pulls this one in automatically — the command above
is only needed to install it on its own.

## Skills

| Skill | Scope | What it covers |
| ----- | ----- | -------------- |
| `react-best-practices` | Frontend | React component correctness: purity, hooks usage, memoization, keys, derive-don't-store, common runtime pitfalls. |
| `react-frontend-architecture` | Frontend | Where frontend code lives and how it is split: feature-based structure, colocation, import boundaries, barrel files, naming conventions. |
| `react-testing-library` | Frontend | Testing React UIs the Testing-Library way: accessible queries, `userEvent`, MSW, integration-first test structure (Vitest-oriented, works with Jest). |
| `next-best-practices` | Frontend | Next.js App Router: RSC boundaries, file conventions, data patterns, metadata, images/fonts, error handling, hydration, bundling. |
| `fastify-best-practices` | Backend | Fastify server rules (19 rule files): plugins, routes, schemas, hooks, decorators, auth, CORS, logging, error handling, performance, testing, WebSockets. |
| `onion-architecture` | Backend | Onion architecture for TypeScript backends: dependency direction, layers, ports and adapters, repositories, composition root, mechanical enforcement (dependency-cruiser). |
| `security` | Full-stack | Application security review: input validation, authn/authz, secrets handling, injection, uploads — OWASP-aligned checklists and worked examples. |
| `typescript-expert` | Full-stack | Advanced TypeScript: type-level programming, compiler performance, migration strategies, monorepos, tooling; ships a strict `tsconfig` reference, a utility-types cheatsheet, and a diagnostic script. |

Each skill is a directory with a `SKILL.md` (the rules and conventions Claude
follows) plus supporting material — `rules/` or `references/` files loaded on
demand, `examples.md` with good/bad patterns, and occasionally `scripts/`.

## How the skills get used

There are three ways a skill from this plugin ends up in context:

1. **Automatic triggering.** Claude loads a skill when the task matches its
   description — edit a Fastify route and `fastify-best-practices` engages;
   review auth code and `security` engages. This is the default mode; you don't
   have to do anything.
2. **Explicit invocation.** Ask for a skill by its namespaced name, or use the
   slash form:

   ```
   /engineering-paved-path:security
   Review this upload endpoint against the security checklist.
   ```

3. **Preloaded by agents.** Subagent definitions list always-on skills in their
   `skills:` frontmatter. Agents from this marketplace preload the core tier at
   spawn time:

   ```yaml
   skills:
     - engineering-paved-path:onion-architecture
     - engineering-paved-path:typescript-expert
     - engineering-paved-path:security
   ```

   Surface skills (React/Next/Fastify/testing) are deliberately *not*
   preloaded — agents load them with the `Skill` tool only when they touch that
   surface, which keeps agent contexts lean.

Always use the namespaced form `engineering-paved-path:<skill-name>` when
referencing these skills from other plugins, agent definitions, or spawn
prompts — bare names resolve only inside this plugin itself.

## Surface → skill map

A practical routing table for which skills apply to which kind of work
(the same mapping the `sdd-engineering` agents use):

| Surface | Skills |
| ------- | ------ |
| UI components and pages | `react-frontend-architecture`, `react-best-practices`, `next-best-practices` |
| UI tests | `react-testing-library` |
| Backend services and routes | `onion-architecture`, `fastify-best-practices` |
| Anything TypeScript | `typescript-expert` |
| Cross-cutting: untrusted input, secrets, authz | `security` |

## Bundled script

`typescript-expert` ships `scripts/ts_diagnostic.py` — a read-only diagnostic
that the skill invokes as
`python ${CLAUDE_SKILL_DIR}/scripts/ts_diagnostic.py` to inspect a project's
TypeScript setup. It is the only executable in the plugin; everything else is
markdown knowledge.

## Versioning

SemVer per [RELEASES.md](https://github.com/SyukPublic/ai-dev-toolkit/blob/main/docs/RELEASES.md);
release notes in [CHANGELOG.md](CHANGELOG.md). The plugin dependency graph for
the whole marketplace lives in
[docs/DEPENDENCIES.md](https://github.com/SyukPublic/ai-dev-toolkit/blob/main/docs/DEPENDENCIES.md).
