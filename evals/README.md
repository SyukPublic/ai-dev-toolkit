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

## Four tiers

| Tier | Task | What it measures | How |
|---|---|---|---|
| skill | `skillTask` | what SKILL.md itself teaches | SKILL.md injected as system prompt, **no tools** |
| retrieval | `runSkillRetrievalCases` | whether guidance living in `references/` is **reachable** and applied | judged exactly like the skill tier, but run against the on-disk workspace with tools — the model must consult the skill and `Read` the reference file itself |
| agent | `agentTask` | the agent definition end-to-end | definition injected, frontmatter tools granted (mutating tools stripped), runs from the workspace |
| workflow | `workflowTask` | the systemic effect: routing, skill activation, subagent dispatch | real on-disk config loaded from the workspace |

The skill tier injects **`SKILL.md` only**; `EVAL_SKILL_REFS=1` adds every `references/*.md`, which is
already more than production loads. Two skills need the retrieval tier because their SKILL.md is a
pure index — `fastify-best-practices` (75 lines, 24 link lines; `fp(`, `TypeBox`, `response schema`
occur zero times in the body) and `next-best-practices` (19 `See [references/…] for:` blocks). Their
reviews run in the retrieval tier, and their content cases register only under `EVAL_SKILL_REFS=1`.
Run with the flag on and the retrieval-vs-content **pair** is the localising diagnostic: the content
arm asks whether the guidance is right with everything already in context, the retrieval arm whether
it can be reached.

Writing a retrieval case: never forbid tool use in the prompt (the content tier's "treat the code as
already read, do not ask for tool access" preamble is backwards here), keep the fixture inline, name
the mechanism ("this project ships a skill … consult it and any reference file it points you to") so
the case measures retrieval rather than selection — selection is the activation tier's question — and
raise `maxTurns` to ~10, because `Skill` + `Read` come before the answer.

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

**Never run two `eval:repeat` jobs at the same time.** A repeat series delimits its own records
by a line offset into that one shared file — `startLine = recordCount()` before the runs, then
`loadRecords(startLine)` after (`src/repeat.ts`) — so concurrent jobs land inside each other's
window and each labelled aggregate absorbs the other's rows. Measured: two series launched
together each reported the *other* case as an extra block, one of them at n=3 because only three
of its runs had landed before the sibling finished. The per-case counts stay real — aggregation
groups by case — but `n` and the saved `repeat-<label>.json` no longer mean what the label says.
Run them one after another.

### Environment variables

| Var | Default | Meaning |
|---|---|---|
| `EVAL_MODEL` | `claude-haiku-4-5` | model under test for the judged tiers |
| `EVAL_ACTIVATION_MODEL` | `claude-sonnet-5` | model for activation cases only (see below); an explicit `EVAL_MODEL` overrides it |
| `EVAL_JUDGE_MODEL` | `claude-sonnet-5` | judge (stronger family to soften self-preference) |
| `EVAL_MAX_TURNS` | `8` | default turn cap per session |
| `EVAL_CONFIG` | `candidate` | `baseline` = don't inject the artifact (benchmark) |
| `EVAL_SKILL_REFS` | `0` | skill tier injects SKILL.md only; `1` also injects every `references/*.md` **and** registers the two index-shaped suites' content cases |
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

### Why activation runs on a stronger model

Activation asks whether a skill gets **selected**, which is a judgement task, and the cheap default
cannot perform it for broad subjects. Measured across every activation row recorded at
`claude-haiku-4-5`: framework- and version-specific skills engage in **every** run
(`react-best-practices` 11/11, `react-testing-library` 9/9, `fastify` 4/4, `next` 4/4,
`workflow-retro` 6/6), while broad foundational ones sit at **11-32%** (`security` 12/37,
`typescript-expert` 3/13, `run-plan` 5/27, `onion-architecture` 2/18). A miss there is not a trigger
failure: median **967** output tokens and no tool calls at all in 29 of 78 misses — the model writing
a full competent answer instead of consulting anything. An engagement is a median of 12 tokens.

On the `security` pair, one variable changed: haiku scored **4/20** correct outcomes, sonnet
**10/10**, same description. Those reds measured the model.

So `EVAL_ACTIVATION_MODEL` defaults to `claude-sonnet-5` for this tier only. Two reasons it is safe
here and not for the rest: activation runs **no judge** (its cases have no `practices` — the verdict
is the trace), so a stronger model cannot create the self-preference that `EVAL_JUDGE_MODEL` exists
to avoid; and activation is the cheaper half — 26 short cases that early-stop on engagement, against
51 judged quality cases with 4k+ token outputs. Raising `EVAL_MODEL` itself would put the model under
test in the judge's own family for all 51.

Two consequences worth knowing. The floor and the summary pool history **per model**, so switching
this makes them start from n=0 on the new model — the gate stays quiet until a case has
`EVAL_ACTIVATION_FAIL_N` rows on it. And a red in the judged tiers is still worth a
`EVAL_MODEL=claude-sonnet-5` probe before you treat it as a content gap: `security`'s NoSQL
operator-injection miss is 1/8 on haiku and 3/3 on sonnet.

Activation cases **hard-block subagent spawning**, and must keep doing so. A dispatched subagent
preloads paved-path skills in its own frontmatter and its file reads land in the *parent* trace, so
`skillEngaged` would report an activation the session never performed — measured: `architecture-
reviewer` preloads `onion-architecture` and turned a true zero into an apparent engagement. Because
`bypassPermissions` ignores an allow-list, this only works through `disallowedTools`.

`eval:compare` reads `records.jsonl`, so it **can** see an activation flip. `results/history.jsonl`
stores the **vitest state**, where an indicative miss is deliberately a `pass`, which is why compare
no longer uses it as its outcome source — measured divergence at the time of the switch:
`mermaid-diagram` 1/4 in records against 4/4 in history.

Because a flip between two single runs is weak evidence, compare classifies each one against the
case's **pooled lifetime rate at the same model**, and reports only flips that depart from that norm.
A case sitting at 12/37 flips on its own, and a case that always fails at a model has not "regressed"
by failing again. Everything else is listed under *within known variance* — visible, but not counted.
`pnpm eval:repeat <pattern> -n 5` is still the only way to say anything about those.

`history.jsonl` is still written, and now has a real consumer: since both ledgers key on the same
`EVAL_RUN_ID`, a case present in history but absent from records for that run is one that **died
before scoring** (the session threw inside `task()`, so `record()` never ran). Compare reports those
separately. Note `eval:repeat` passes `--reporter=dot`, which replaces the configured reporters, so
its runs write records but no history.

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
