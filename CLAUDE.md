# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Identity

**AI Agentic Development Toolkit** — a Claude Code plugin marketplace, ported from the
`dev-digest-ai-marketplace` repository and rebranded. The content, eval harness, and
authoring rules carry over unchanged; only the naming differs.

The marketplace `name` is `ai-dev-toolkit`, deliberately identical to the GitHub repo slug so
`add` and `install` read consistently:

```
/plugin marketplace add SyukPublic/ai-dev-toolkit
/plugin install <plugin-name>@ai-dev-toolkit
```

"AI Agentic Development Toolkit" is a **display name only** — it appears in `README.md`, the
site chrome (`site/src/layouts/Base.astro`), and page titles, never as the manifest `name`.
Renaming `name` after a public release breaks existing installs and requires a `renames`
entry (see `docs/RELEASES.md`).

Nothing named `dev-digest` should reappear anywhere. If you port further material from the
old repo, rewrite `dev-digest-ai-marketplace` → `ai-dev-toolkit` and
`Dev Digest AI Marketplace` → `AI Agentic Development Toolkit` before committing.

## What this repository is

A [plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces), not an
application. There is no root package manifest and no root build — `evals/` and `site/` are
independent Node projects, and `plugins/` is content (Markdown + JSON) consumed by Claude
Code, not compiled by anything.

```
.claude-plugin/marketplace.json   catalog: name, owner, metadata.pluginRoot, plugins[]
plugins/<plugin-name>/            the shipped product (one trust unit per plugin)
evals/                            behavioral eval harness (vitest + Claude Agent SDK)
site/                             Astro catalog site → GitHub Pages
scripts/                          release automation (prepare-release, tag-releases, rollback)
docs/                             PLUGIN-GUIDELINES, RELEASES, SECURITY, DEPENDENCIES
```

### The four plugins and how they compose

`engineering-paved-path` (8 stack skills) and `research-tools` (`researcher` agent) are
leaves. `architecture-review` (`architecture-reviewer` agent) depends on the paved path.
`sdd-engineering` depends on all three and is the workflow layer: agents `spec-creator` →
`implementation-planner` → `implementer` / `test-writer` / `plan-verifier`, orchestrated by
the `run-plan` skill, with `workflow-retro`, `engineering-insights`, and `mermaid-diagram`
alongside.

Two composition mechanisms that are easy to miss when editing agent definitions:

- **Preloaded vs on-demand skills.** An agent's `skills:` frontmatter preloads a *core* tier
  always-on (`onion-architecture`, `typescript-expert`, `security`). The *surface* tier
  (React / Next.js / Fastify / testing) is loaded at runtime through the `Skill` tool only
  when the agent touches that surface. Moving a surface skill into `skills:` inflates every
  spawn's context — that split is intentional.
- **Cross-plugin skills are namespaced**: `engineering-paved-path:security`.

`docs/DEPENDENCIES.md` holds both graphs (declared dependencies + runtime composition) as
Mermaid. Claude Code resolves and installs declared dependencies automatically, so
`/plugin install sdd-engineering@ai-dev-toolkit` pulls in the other three. Two things this
depends on, both easy to break:

- Each `dependencies` entry must be a bare name string or `{ "name", "version" }`. The
  `"name@range"` string form is not supported and silently resolves as a plugin literally
  named `name@range`. The validator does not catch it.
- Ranges resolve against git tags named `<plugin-name>--v<version>` (**two** hyphens). The
  tag name is produced by `releaseTag()` in `scripts/lib/release-utils.mjs` — the single
  source of truth for both `tag-releases.mjs` and `rollback.mjs`. A single-hyphen tag is
  invisible to dependency resolution and disables the dependent plugin with
  `no-matching-tag`.

## Commands

Marketplace validation — the only thing CI enforces repo-wide:

```bash
claude plugin validate . --strict   # what .github/workflows/validate.yml runs
```

`--strict` promotes warnings to errors. Without it, a misspelled or misplaced manifest field
exits 0 and the plugin loads with that field silently ignored — so always run the strict form
locally too.

Local end-to-end check of a plugin, from the repo root in a Claude Code session:

```
/plugin marketplace add ./
/plugin install <plugin-name>@ai-dev-toolkit
```

Release (see `docs/RELEASES.md` — merging to `main` **is** the release):

```bash
node scripts/prepare-release.mjs <plugin> <major|minor|patch>   # bump + changelog stub
node scripts/tag-releases.mjs --dry-run                         # manual fallback; CI tags automatically
node scripts/rollback.mjs <plugin> [--to <version>]             # roll forward past a bad release
```

Site (npm, `site/`):

```bash
cd site
npm ci
npm test        # scripts/test-index.mjs — index builder against test-fixtures/
npm run dev     # rebuilds the index, then astro dev
npm run build   # rebuilds the index, then astro build
```

`npm run index` regenerates `src/data/index.json` by scanning `plugins/` and
`.claude-plugin/marketplace.json`. It **exits non-zero** on missing descriptions/versions or
duplicate ids, so a degraded catalog fails CI before deploy. It derives `lastModified` from
`git log`, so the Pages workflows check out with `fetch-depth: 0`.

**Never regenerate `site/package-lock.json` with a plain `npm install` on Windows.** npm
resolves optional dependencies against the current platform and drops the Linux-only ones —
here the top-level `@emnapi/core` and `@emnapi/runtime`. Everything passes locally and then
CI dies on `npm ci` with `Missing: @emnapi/... from lock file`. Force the target platform
instead, and delete `node_modules` first so npm resolves from registry metadata rather than
from the installed tree:

```bash
cd site && rm -rf node_modules package-lock.json
npm install --package-lock-only --os=linux --cpu=x64 --libc=glibc
npm ci   # confirm it still installs on this machine
```

Evals (pnpm, `evals/`) — model-backed, **local/on-demand only, never in CI**:

```bash
cd evals
pnpm install

pnpm eval                 # everything (slow, consumes real sessions)
pnpm eval:skills          # content tier
pnpm eval:agents          # agent tier
pnpm eval:workflow        # workflow tier
pnpm vitest run plugins/engineering-paved-path/skills/security   # a single suite

pnpm eval:quality         # static SKILL.md checks, no model
pnpm eval:scaffold        # list artifacts / scaffold an eval trio
pnpm eval:repeat <pattern> -n 2 --label before   # stability across runs
pnpm eval:delta before after                     # per-practice diff of two labeled series
pnpm eval:benchmark <pattern> -n 5               # lift: with vs without the artifact
pnpm eval:compare                                # flips between the last two runs, vs each case's lifetime rate

pnpm typecheck            # the only eval-side check CI would run
```

Key env vars: `EVAL_MODEL` (default `claude-haiku-4-5`), `EVAL_JUDGE_MODEL` (default
`claude-sonnet-5` — a stronger family, to soften self-preference), `EVAL_CONFIG=baseline`
(skip artifact injection, for benchmarks), `EVAL_BACKEND=openrouter`, `EVAL_MAX_TURNS`.
Full table in `evals/README.md`.

## Eval harness architecture

Three tiers, each isolating a different failure mode:

| Tier | Task | Measures | Mechanism |
| ---- | ---- | -------- | --------- |
| skill | `skillTask` | what `SKILL.md` itself teaches | content injected as system prompt, **no tools** |
| agent | `agentTask` | the agent definition end-to-end | definition injected, frontmatter tools granted minus mutating ones, runs from the workspace |
| workflow | `workflowTask` | routing, skill activation, subagent dispatch | real on-disk config loaded from the workspace |

Scoring is two-stage: a deterministic **grounding gate** (`patternMatch`, substring slots)
runs first; the **LLM judge** (binary PASS/FAIL per practice, verbatim-evidence rule) runs
only if the gate passes. Cheap failures stay cheap.

A suite is a trio colocated with the plugin that ships the artifact:
`<name>.eval.ts` (registration) + `<name>.cases.ts` (prompts and practices) + `fixtures/`.
`pnpm eval:scaffold` puts them in the right place — mirror `plugins/` exactly.

Two adaptations worth knowing before debugging a surprising result:

- The harness was designed for repos with `.claude/skills` / `.claude/agents`. Here artifacts
  are plugin payloads, so `src/artifacts/paths.ts` resolves them **by bare name** across
  `plugins/*/skills/<name>` and `plugins/*/agents/<name>.md`. Duplicate bare names across
  plugins are therefore ambiguous.
- Tool tiers run in a throwaway temp workspace assembled once per process by
  `src/workspace.ts`: it copies `workspace-template/` (a neutral host project) and then every
  plugin's skills and agents into that workspace's `.claude/`. Skills consequently run
  **unnamespaced** there, unlike a real install. `skillEngaged` accepts both the bare and
  `plugin:skill` forms, so cases stay valid either way.

Safety invariants: sessions run with `bypassPermissions`, so tool grants are the only guard —
`workflowTask` hard-blocks `Write`/`Edit`/`Bash` via `disallowedTools`, `agentTask` strips
mutating tools. On the subscription backend any `ANTHROPIC_API_KEY` is removed from the child
process so runs never silently bill API tokens. Every run appends to
`results/records.jsonl`; `results/` is gitignored, append-only, and always safe to delete.

## Rules for authoring plugins

`claude plugin validate .` proves well-formedness only. These are the rules it cannot check —
the first two fail *silently*:

- Components (`skills/`, `agents/`, `commands/`, `hooks/`) live at the **plugin root**, never
  inside `.claude-plugin/`. The plugin installs fine and contributes nothing.
- A `CLAUDE.md` inside a plugin does nothing. Ship instructions as `skills/<name>/SKILL.md`.
- Reference every file through `${CLAUDE_PLUGIN_ROOT}` (and `${CLAUDE_SKILL_DIR}` inside
  skills). Plugins execute from `~/.claude/plugins/cache`, not from the clone — bare relative
  paths break after install. Never use `../`.
- Hook scripts must be POSIX shell with forward slashes. Windows users run them under Git
  Bash, where backslash paths break.
- `version` lives **only** in `plugins/<name>/.claude-plugin/plugin.json`. A version in the
  marketplace entry is silently overridden and only causes drift. No version bump means no
  release — Claude Code ships nothing to existing users.
- Manifest requires `name` (kebab-case, matching the directory), `version`, `description`,
  `author.name`, `license`, `keywords`, `displayName` — stricter than the official schema,
  which requires only `name`.
- `category` is a **marketplace-entry** field, not a manifest field. It belongs in
  `marketplace.json` next to `source`; in `plugin.json` it is ignored at load time and fails
  `--strict`.
- Prefer several small plugins over one large one: each is a single trust unit and adds
  always-on context cost (`claude plugin details` projects it).

**Project-agnostic is the admission criterion.** A plugin must be useful dropped into an
arbitrary repository; anything bound to a specific product, codebase, or internal workflow
does not belong here. This is the constraint that defines the marketplace, not a style
preference — apply it when writing skill and agent prose too (name conventions like "the host
project's Onion Architecture", not a particular service).

## Repo conventions

- **`.plans/` is excluded via `.git/info/exclude`, not `.gitignore`** — deliberately, so
  neither its contents nor its name appears in the public repo. After a fresh clone the
  exclusion must be re-added: `echo .plans/ >> .git/info/exclude`. Never commit from it and
  never move the exclusion into `.gitignore`.
- Branches follow `stages/NN`, numbered in sequence; `main` is the default and merging to it
  publishes.
- CI: `validate.yml` on every push/PR; `site-build.yml` on PRs and non-main pushes;
  `deploy-pages.yml` and `tag-releases.yml` on `main`. Evals are never wired into CI.
- Security-sensitive changes (hooks, MCP servers, executables) get line-by-line code-owner
  review; validation is not the security gate. `docs/SECURITY.md` has the incident-response
  procedure — note there is no remote kill switch, so response is "stop distribution, roll
  forward, advise".
