# research-tools

Research and decision-support agents: structured, verifiable investigation of codebases and the web, and pre-decision option exploration with a ranked decision matrix.

## What's inside

| Component | Type | Description |
| --------- | ---- | ----------- |
| `researcher` | agent | Finds information inside the project (code, config, docs, git history) or on the internet, and returns a strictly structured report with sources. Never modifies anything. |
| `brainstormer` | agent | Argues a decision out **before** it is made: verified ground truth, genuinely distinct options with an advocate and a red-team pass each, and a ranked decision matrix. It never picks the winner. |

The two are sequential, not alternatives. `researcher` establishes what is true; `brainstormer` uses that ground truth to weigh what to do about it, and fans its own broad fact-finding out to parallel `researcher` subagents.

## Installation

```
/plugin marketplace add SyukPublic/ai-dev-toolkit
/plugin install research-tools@ai-dev-toolkit
```

No dependencies — the plugin installs and works on its own. `brainstormer` invokes stack skills from sibling plugins (`engineering-paved-path`, `sdd-engineering`) through the `Skill` tool **when they happen to be installed**; that is deliberately not a declared dependency, so a missing skill degrades the grounding for that one surface rather than blocking anything. Installing `sdd-engineering` brings both sibling plugins in for free.

## `researcher` — when to use it

Delegate to `researcher` instead of searching in the main conversation when:

- **The search is broad** — sweeping many files, directories, or naming conventions would flood the main context with file dumps; the agent reads in its own context and hands back only the conclusion with citations.
- **You need evidence, not vibes** — every claim in its report carries a `file:line` or a URL, and what it could not find is listed explicitly.
- **A workflow needs facts before acting** — the `sdd-engineering` agents (`spec-creator`, `implementation-planner`) fan out fact-finding to `researcher` during the spec and planning stages for exactly this reason.

For a quick single-fact lookup where you already know the file, a direct search in the main conversation is cheaper.

### How to use it

Once installed, `researcher` is available as a subagent type in every Claude Code session. Spawn it by asking Claude to delegate:

- "Use the researcher agent to find where rate limiting is configured in this repo."
- "Have researcher look up the current best practice for rotating JWT signing keys."
- "Researcher: does the codebase have any usage of the deprecated crypto API?"

The main conversation launches it via the agent/task mechanism; the agent does the searching in its own context and hands back only the report. It works in two modes and reports them separately:

- **PROJECT** — the answer lives in the repository. Uses `Grep`, `Glob`, `Read`, and read-only `Bash` (e.g. `git log`, `git show`). Every finding cites a concrete `file:line`.
- **WEB** — the answer is external (library docs, standards, current facts). Uses `WebSearch`/`WebFetch`. Every claim carries a source URL.

If the request is ambiguous or contains no concrete question, the agent does not guess — it returns a short "Clarification needed" block (1–4 questions, each with a best-guess default) and waits.

### Report format

Every report leads with a TL;DR, presents findings in a table with exact locations/sources, lists what was NOT found, and ends with a confidence rating (High / Medium / Low) plus a one-line reason.

## `brainstormer` — when to use it

Use it in the window where the decision does not exist yet: choosing a stack, an architecture, a migration strategy, a data model, a rollout approach. It is the phase *before* a spec.

- "Let's brainstorm how to structure background jobs in this service."
- "Compare the options for our multi-tenancy model — pros and cons of each."
- "Which approach should we take for the export feature? Discuss it before we plan anything."

Each round it fact-checks first, then puts every viable option through an **advocate** pass (its strongest case) and a **skeptic / red-team** pass (failure modes, hidden costs, what breaks at scale), and updates a ranked decision matrix. Low-stakes questions collapse to one balanced pros-and-cons list — the machinery scales to the stakes.

Two properties make its output usable as input to a real decision:

- **Facts and judgement never blur.** Every factual claim carries a `file:line`, a URL, or a research-report reference. Every ungrounded engineering judgement is tagged `Hypothesis — to verify:` with a way to test it.
- **It does not decide for you.** It ranks and compares; it refuses to present one option as settled. When you *have* decided and ask for it, it produces an ADR-ready draft (context / decision / consequences / alternatives considered) for you to place.

### Where it sits relative to the other agents

| Agent | Phase | Position |
| ----- | ----- | -------- |
| `researcher` | any | Finds facts, takes no position |
| `brainstormer` | before a decision | Argues trade-offs to reach one |
| `implementation-planner` (`sdd-engineering`) | after a decision | Plans an already-decided change |

That ordering is also the cheapest path into the SDD workflow: brainstorm the decision, hand the outcome to `spec-creator` as user-approved decisions, and its interview round-trip disappears.

### Getting the best results

- **Name the decision, not the topic.** "Which queue for delayed jobs — SQS, Redis, or Postgres-backed?" beats "let's talk about queues"; a prompt with no concrete decision comes back as clarifying questions.
- **State the constraints you already know** — team size, deadline, what is already in the stack, what is off the table. They become matrix criteria instead of hypotheses.
- **Iterate.** It is built for multiple rounds; each round folds new facts into the matrix. Answer its "Questions for you" and re-spawn rather than starting over.
- **Ask for the summary explicitly** if you want one on disk — by default it answers in chat and writes nothing.

## Tool constraints, per agent

The plugin no longer makes a single plugin-wide read-only claim, because its two agents differ. Both are constrained by design *and* by their tool lists.

**`researcher` — read-only, no exceptions** (`Read, Grep, Glob, Bash, WebSearch, WebFetch`):

- **No `Write`/`Edit` tools.** It cannot create, modify, or delete files.
- **`Bash` is restricted to non-mutating commands** (`git log`, `git diff`, `ls`, `rg`, ...). No `git commit/push/checkout`, no `rm`/`mv`/`mkdir`, no installs, builds, migrations, or output redirections.
- **No sub-agents and no deep-research harness** — it does its own focused searching.
- **Honesty over completeness.** Reports always include a "Not found" section; a claim without a source (a `file:line` or a URL) is never made.
- **Research only.** It reports findings back to the caller; it does not propose or perform implementation.

**`brainstormer` — read-only by default, with one narrow write path** (`Read, Grep, Glob, Bash, WebSearch, WebFetch, Write, Agent, Skill`):

- **`Write` is bounded to documentation and gated on an explicit request.** Default behaviour is to answer in chat and write nothing. A durable summary goes only into the host project's docs tree — default convention `docs/discussions/<topic>.md`, and the caller may pass a different path. Never code, configs, `CLAUDE.md`/`AGENTS.md`, the insights file, or anything outside the docs tree; an existing target is read and extended, never overwritten.
- **No `Edit`.** It cannot rewrite existing files in place.
- **`Bash` is read-only**, on the same terms as `researcher`.
- **It never writes an accepted ADR.** That space is for decisions already made; it hands the draft back instead.
- **It spawns `researcher` subagents** (up to ~5 in parallel) for broad fact-finding, and no other agent type.
- **It never implements.** No source, config, or test file is touched, and it does not decide on your behalf.

## Versioning

SemVer per [RELEASES.md](https://github.com/SyukPublic/ai-dev-toolkit/blob/main/docs/RELEASES.md); release notes in [CHANGELOG.md](CHANGELOG.md). How this plugin fits the wider set: [docs/DEPENDENCIES.md](https://github.com/SyukPublic/ai-dev-toolkit/blob/main/docs/DEPENDENCIES.md).
