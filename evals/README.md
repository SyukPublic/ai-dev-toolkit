# evals

Behavioral evals for the plugins in this marketplace — **skills**, **subagents**, and the
**workflow-level** behavior they produce together. Built on [vitest](https://vitest.dev) +
the [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk), running on your local
**Claude Code subscription** — no API token, no external services.

> Eval runs are **local / on-demand only**. They need an authenticated Claude Code install
> (or an OpenRouter key, see below) and real model sessions, so they are **not run in CI** —
> CI is limited to `pnpm typecheck` and structural checks.

## Layout

```
evals/
├── src/                          the harness (runner, scoring, records, CLIs)
├── workspace-template/           neutral host project copied into the eval workspace
├── proxy/ · scripts/             optional LiteLLM proxy for cheap non-Anthropic models
└── plugins/                      eval suites, mirroring the plugin catalog
    ├── engineering-paved-path/skills/{security,onion-architecture}/
    ├── architecture-review/agents/architecture-reviewer/
    ├── sdd-engineering/agents/spec-creator/
    └── sdd-engineering/workflow/
```

Each suite is a trio: `<name>.eval.ts` (registration), `<name>.cases.ts` (prompts +
practices), `fixtures/` (inlined inputs). Suites are colocated with the **plugin** that ships
the artifact they test; `pnpm eval:scaffold` generates the trio in the right place.

## How plugin assets become runnable (the workspace)

The harness was designed for a repo whose assets live in `.claude/skills` / `.claude/agents`.
In this repo the assets are **plugin payloads** (`plugins/<plugin>/skills/<name>/`,
`plugins/<plugin>/agents/<name>.md`). The adaptation is deliberately simple:

- **Content tier** (`skillTask` / `agentTask` artifact injection): artifacts are resolved by
  bare name out of the plugin catalog — `src/artifacts/paths.ts` scans
  `plugins/*/skills/<name>` and `plugins/*/agents/<name>.md`.
- **Tool tiers** (`agentTask` cwd, `workflowTask`): `src/workspace.ts` assembles a throwaway
  temp project once per process — it copies `workspace-template/` (a small neutral host
  project: `CLAUDE.md` with a "Read when" routing table, `docs/` with documented layer
  contracts, a stub `server/` module) and then copies **every** plugin's skills and agents
  into the workspace's `.claude/`. Sessions run with `cwd` = that workspace and
  `settingSources: ["project"]`.

Note on namespacing: installed as plugins, these skills are invoked namespaced
(`engineering-paved-path:security`). In the eval workspace they run as **plain project
skills** (unnamespaced) — a documented simplification that measures the artifacts' behavior
without a `claude plugin install` step per run. (`skillEngaged` in `src/dsl/case.ts` accepts
both the bare and the `plugin:skill` form, so cases stay valid either way.)

## Three tiers

| Tier | Task | What it measures | How |
|---|---|---|---|
| skill | `skillTask` | what SKILL.md itself teaches | content injected as system prompt, **no tools** |
| agent | `agentTask` | the agent definition end-to-end | definition injected, frontmatter tools granted (mutating tools stripped), runs from the workspace |
| workflow | `workflowTask` | the systemic effect: routing, skill activation, subagent dispatch | real on-disk config loaded from the workspace |

Two scorers: a deterministic **grounding gate** (substring slots, `patternMatch`) runs first;
the **LLM judge** (binary PASS/FAIL per practice, verbatim-evidence rule, stronger judge
model) runs only when the gate passes.

## Running

```bash
cd evals
pnpm install

pnpm eval             # everything (model-backed; slow, costs sessions)
pnpm eval:skills      # content tier only
pnpm eval:agents      # agent tier only
pnpm eval:workflow    # workflow tier only
pnpm vitest run plugins/engineering-paved-path/skills/security   # one suite

pnpm eval:quality     # static SKILL.md checks for all plugins/*/skills — no model
pnpm eval:scaffold    # list artifacts + scaffold an eval trio for one

pnpm eval:repeat <pattern> -n 2 --label before    # stability across N runs
pnpm eval:delta before after                      # per-practice diff of two labeled series
pnpm eval:benchmark <pattern> -n 5                # lift: with vs without the artifact
pnpm eval:compare                                 # pass/fail flips between the last two runs

pnpm typecheck        # what CI runs
```

Every case run — pass or fail — appends a durable record to `results/records.jsonl` (full
model output under `results/outputs/`). `results/` is gitignored and append-only; deleting it
is always safe.

### Environment variables

| Var | Default | Meaning |
|---|---|---|
| `EVAL_MODEL` | `claude-haiku-4-5` | model under test |
| `EVAL_JUDGE_MODEL` | `claude-sonnet-5` | judge (stronger family to soften self-preference) |
| `EVAL_MAX_TURNS` | `8` | default turn cap per session |
| `EVAL_CONFIG` | `candidate` | `baseline` = don't inject the artifact (benchmark) |
| `EVAL_BACKEND` | `subscription` | `openrouter` = route inference via OpenRouter |
| `OPENROUTER_API_KEY` | — | required when `EVAL_BACKEND=openrouter` |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api` | point at `http://localhost:4000` for the LiteLLM proxy |
| `EVAL_QUIET` | — | suppress per-run trace/verdict output |
| `EVAL_REPEAT_MAX` | `5` | ceiling `eval:repeat -n` is capped to |
| `EVAL_ACTIVATION_FLOOR_N` | `2` | shortest series a zero is reported on |
| `EVAL_ACTIVATION_FAIL_N` | `5` | shortest series a zero **fails** the run on |
| `EVAL_REPEAT_WARN_SESSIONS` | `12` | warn before spending more model sessions than this |

### Reading activation results

A positive activation case is marked `indicative`: a model may legitimately do the work inline
instead of invoking the `Skill` tool, so **one miss never fails the suite**. That makes the raw
pass/fail useless on its own — "engaged 4 times in 5" and "never engaged once" both show up as a
green suite. Two things close that gap:

- Every run ends with an **activation summary**: per case, how often the skill engaged this run and
  across every row recorded for the same `EVAL_MODEL`. Negatives are shown with their polarity
  folded in, so *not* engaging reads as the pass. It reports; it never fails a run.
- `eval:repeat` enforces the **activation floor**: an indicative positive that has **never** engaged
  exits non-zero. The verdict is computed over the case's whole recorded **lifetime** at the current
  `EVAL_MODEL` (at least `EVAL_ACTIVATION_FAIL_N` rows), not over the series you just ran.

Judging the lifetime is what makes the gate worth trusting. A skill that engages 1 run in 17 —
measured, `onion-architecture`, whose workspace `CLAUDE.md` routes most architectural questions
away — produces an all-zero series of 5 about 73% of the time. Failing on that would make the gate
noise, and a gate that cries wolf gets ignored, which is how an invalid case survived unnoticed for
the life of the repo. "Not once, ever" is a different claim, and it is the one worth blocking on.
The activation summary still flags a zero in the current run from `EVAL_ACTIVATION_FLOOR_N`, marking
it as a miss rather than a verdict when the lifetime disagrees.

When the floor trips, suspect the **case** before the skill. The prompt may name a path that does
not exist in `workspace-template/` (a skill cannot engage on a missing file, and the model is often
obeying the skill's own gate by refusing), or that workspace's `CLAUDE.md` may route the question
elsewhere. `results/outputs/` holds the trace that settles it.

Suspect the **model** third, and check it before editing any description. Activation splits sharply
by subject at the default `EVAL_MODEL`: framework- and version-specific skills (React, Next.js,
Fastify, React Testing Library) engage on `claude-haiku-4-5` in every recorded run, while broad
foundational ones (`security`, `typescript-expert`, `onion-architecture`) sit at 11-32% — and a
miss there is not a trigger failure but the model answering competently from its own knowledge
(median 967 output tokens on a miss, 12 on an engagement). Re-running the same pair on
`EVAL_MODEL=claude-sonnet-5` separates a weak description from a weak model in one probe: for
`security` it moved 30%/10% to 100%/100% with no content change at all.

Activation cases **hard-block subagent spawning**, and must keep doing so. A dispatched subagent
preloads paved-path skills in its own frontmatter and its file reads land in the *parent* trace, so
`skillEngaged` would report an activation the session never performed — measured: `architecture-
reviewer` preloads `onion-architecture` and turned a true zero into an apparent engagement. Because
`bypassPermissions` ignores an allow-list, this only works through `disallowedTools`.

Note that `results/history.jsonl` stores the **vitest state**, where an indicative miss is a
`pass` — so `eval:compare` cannot see an activation flip. Use the summary or `eval:repeat`
(both read `records.jsonl`, which stores the measured outcome) for that question.

### Optional: cheap models via the LiteLLM proxy

The Agent SDK speaks only the Anthropic wire protocol, so non-Anthropic models need a
translating proxy for the tool tiers. `pnpm proxy:up` (Docker) starts LiteLLM on
`localhost:4000` accepting both Anthropic and OpenAI formats; then set
`EVAL_BACKEND=openrouter`, `OPENROUTER_BASE_URL=http://localhost:4000`, and pick any
OpenRouter model as `EVAL_MODEL`. Content-only calls go to OpenRouter directly (no proxy
needed).

## Safety

- Sessions run with `bypassPermissions`, so tool grants are the only guard: `workflowTask`
  allows only read/plan tools and **hard-blocks** `Write`/`Edit`/`Bash` via `disallowedTools`;
  `agentTask` strips mutating tools from an agent's frontmatter grant.
- Tool tiers run inside the throwaway temp workspace, not this repo.
- On the subscription backend, any `ANTHROPIC_API_KEY` in the environment is removed from the
  child process so eval runs never silently bill API tokens.

## Case shapes (quick reference)

- **Quality case** (skills/agents): `prompt` + `practices[]` (judged) + optional
  `grounding[]` (cheap gate; a slot may be an array of alternatives) + `threshold`.
- **Workflow case**: discriminated union — `dispatch` (expect a subagent), `activation`
  (skill engages / must NOT engage; positive cases may be `indicative`), `trace` (several
  expectations in one session), `contrast` (treatment vs empty-dir control).

See `src/dsl/case.ts` for the exact types, and the migrated suites under `plugins/` for
worked examples.
