# research-tools

Read-only research agent that investigates codebases and the web and returns structured, verifiable reports.

## What's inside

| Component | Type | Description |
| --------- | ---- | ----------- |
| `researcher` | agent | Finds information inside the project (code, config, docs, git history) or on the internet, and returns a strictly structured report with sources. Never modifies anything. |

## Installation

```
/plugin marketplace add SyukPublic/ai-dev-toolkit
/plugin install research-tools@ai-dev-toolkit
```

No dependencies — the plugin is self-contained.

## When to use it

Delegate to `researcher` instead of searching in the main conversation when:

- **The search is broad** — sweeping many files, directories, or naming conventions would flood the main context with file dumps; the agent reads in its own context and hands back only the conclusion with citations.
- **You need evidence, not vibes** — every claim in its report carries a `file:line` or a URL, and what it could not find is listed explicitly.
- **A workflow needs facts before acting** — the `sdd-engineering` agents (`spec-creator`, `implementation-planner`) fan out fact-finding to `researcher` during the spec and planning stages for exactly this reason.

For a quick single-fact lookup where you already know the file, a direct search in the main conversation is cheaper.

## How to use the agent

Once installed, `researcher` is available as a subagent type in every Claude Code session. Spawn it by asking Claude to delegate:

- "Use the researcher agent to find where rate limiting is configured in this repo."
- "Have researcher look up the current best practice for rotating JWT signing keys."
- "Researcher: does the codebase have any usage of the deprecated crypto API?"

The main conversation launches it via the agent/task mechanism; the agent does the searching in its own context and hands back only the report. It works in two modes and reports them separately:

- **PROJECT** — the answer lives in the repository. Uses `Grep`, `Glob`, `Read`, and read-only `Bash` (e.g. `git log`, `git show`). Every finding cites a concrete `file:line`.
- **WEB** — the answer is external (library docs, standards, current facts). Uses `WebSearch`/`WebFetch`. Every claim carries a source URL.

If the request is ambiguous or contains no concrete question, the agent does not guess — it returns a short "Clarification needed" block (1–4 questions, each with a best-guess default) and waits.

## Hard read-only constraints

The agent is constrained by design and by its tool list (`Read, Grep, Glob, Bash, WebSearch, WebFetch`):

- **No `Write`/`Edit` tools.** It cannot create, modify, or delete files.
- **`Bash` is restricted to non-mutating commands** (`git log`, `git diff`, `ls`, `rg`, ...). No `git commit/push/checkout`, no `rm`/`mv`/`mkdir`, no installs, builds, migrations, or output redirections.
- **No sub-agents and no deep-research harness** — it does its own focused searching.
- **Honesty over completeness.** Reports always include a "Not found" section; a claim without a source (a `file:line` or a URL) is never made.
- **Research only.** It reports findings back to the caller; it does not propose or perform implementation.

## Report format

Every report leads with a TL;DR, presents findings in a table with exact locations/sources, lists what was NOT found, and ends with a confidence rating (High / Medium / Low) plus a one-line reason.

## Getting the best results

- **Ask one concrete question per spawn.** "Where is rate limiting configured and what are the current limits?" beats "look into rate limiting".
- **Front-load the constraints.** Scope (which package/directory), mode hint (project vs web), and any known dead ends — this skips the clarification round-trip.
- **Batch independent questions as parallel spawns**, not one agent with five questions — reports stay focused and the searches run concurrently.

## Versioning

SemVer per [RELEASES.md](https://github.com/SyukPublic/ai-dev-toolkit/blob/main/docs/RELEASES.md); release notes in [CHANGELOG.md](CHANGELOG.md). How this plugin fits the wider set: [docs/DEPENDENCIES.md](https://github.com/SyukPublic/ai-dev-toolkit/blob/main/docs/DEPENDENCIES.md).
