# Plugin dependency graph

How the plugins in this marketplace relate to each other: what each one declares
in its manifest, and how they compose at runtime into the spec-driven
development (SDD) workflow.

## Declared dependencies (`plugin.json`)

Arrows point from the dependent plugin to its dependency; edge labels are the
semver ranges from the `dependencies` field.

```mermaid
flowchart TD
  SDD["sdd-engineering<br/>5 agents / 4 skills"]
  EPP["engineering-paved-path<br/>8 stack skills"]
  RT["research-tools<br/>agents: researcher, brainstormer"]
  AR["architecture-review<br/>agent: architecture-reviewer"]

  SDD -->|"^1.0.0"| EPP
  SDD -->|"^1.0.0"| RT
  SDD -->|"^1.0.0"| AR
  AR  -->|"^1.0.0"| EPP

  classDef sdd fill:#dbe7fb,stroke:#3b6fd4,color:#12294f,stroke-width:1.5px;
  classDef epp fill:#d7ede4,stroke:#2f8f6f,color:#123527,stroke-width:1.5px;
  classDef rt  fill:#fdeacc,stroke:#c98a2b,color:#3d2a08,stroke-width:1.5px;
  classDef ar  fill:#e6dff5,stroke:#7a5fc0,color:#241a44,stroke-width:1.5px;
  class SDD sdd
  class EPP epp
  class RT rt
  class AR ar
```

Claude Code resolves and installs these dependencies automatically, listing what
it added at the end of the install output. Installing the top of the graph is
enough — there is no dependency order to follow:

```
/plugin marketplace add SyukPublic/ai-dev-toolkit
/plugin install sdd-engineering@ai-dev-toolkit
```

The ranges resolve against this repository's release tags
(`<plugin-name>--vX.Y.Z`, see [RELEASES.md](RELEASES.md)), so each dependency is
fetched at the highest tagged version satisfying `^1.0.0`. Enabling a plugin
enables its dependencies too, and disabling one is refused while another enabled
plugin still needs it — that pair of behaviours needs Claude Code 2.1.143 or
newer, and a local-folder marketplace reads tags only from 2.1.196
([COMPATIBILITY.md](COMPATIBILITY.md)). To install a single leaf plugin on its own, name it
directly — `/plugin install research-tools@ai-dev-toolkit`.

## Runtime composition

Who spawns whom, and which skills each agent loads. Solid arrows are agent
spawns and frontmatter skill preloads; dotted arrows are on-demand or manual
steps. Cross-plugin skills are invoked in the namespaced form, e.g.
`engineering-paved-path:security`.

```mermaid
flowchart LR
  subgraph SDDP["sdd-engineering"]
    direction TB
    RUNPLAN["run-plan<br/><i>skill - orchestrator</i>"]
    SC["spec-creator"]
    IP["implementation-planner"]
    IMPL["implementer"]
    TW["test-writer"]
    PV["plan-verifier"]
    RETRO["workflow-retro<br/><i>skill - manual, after a run</i>"]
    INS["engineering-insights<br/><i>skill</i>"]
    MMD["mermaid-diagram<br/><i>skill</i>"]
  end

  subgraph RTP["research-tools"]
    direction TB
    BRS["brainstormer"]
    RES["researcher"]
  end

  subgraph ARP["architecture-review"]
    ARV["architecture-reviewer"]
  end

  subgraph EPPP["engineering-paved-path"]
    direction TB
    CORE["onion-architecture<br/>typescript-expert - security<br/><i>preloaded</i>"]
    SURF["react-best-practices - react-frontend-architecture<br/>react-testing-library - next-best-practices<br/>fastify-best-practices<br/><i>on demand</i>"]
  end

  SC -->|"preceding step"| IP
  IP -->|"plan = input"| RUNPLAN

  RUNPLAN -->|"waves"| IMPL
  RUNPLAN -->|"gap pass"| TW
  RUNPLAN -->|"review (parallel)"| PV
  RUNPLAN -->|"review (parallel)"| ARV
  RUNPLAN -.->|"revision request"| IP
  RUNPLAN -.->|"after the run"| RETRO

  SC -.->|"fan-out research"| RES
  IP -.->|"fan-out research"| RES

  BRS -.->|"fan-out research (up to ~5)"| RES
  BRS -.->|"decision reached"| SC
  BRS -.->|"Skill tool, if installed"| MMD
  BRS -.->|"Skill tool, if installed"| INS

  SC -->|"preload"| MMD
  SC -->|"preload security"| CORE
  IMPL -->|"preload"| CORE
  TW -->|"preload ts-expert"| CORE
  ARV -->|"preload"| CORE

  IMPL -.->|"Skill tool"| SURF
  TW -.->|"Skill tool"| SURF
  ARV -.->|"Skill tool"| SURF

  BRS -.->|"Skill tool, nothing preloaded"| CORE
  BRS -.->|"Skill tool, nothing preloaded"| SURF

  RETRO -.->|"insight"| INS

  classDef sdd fill:#dbe7fb,stroke:#3b6fd4,color:#12294f,stroke-width:1.5px;
  classDef epp fill:#d7ede4,stroke:#2f8f6f,color:#123527,stroke-width:1.5px;
  classDef rt  fill:#fdeacc,stroke:#c98a2b,color:#3d2a08,stroke-width:1.5px;
  classDef ar  fill:#e6dff5,stroke:#7a5fc0,color:#241a44,stroke-width:1.5px;
  class RUNPLAN,SC,IP,IMPL,TW,PV,RETRO,INS,MMD sdd
  class RES,BRS rt
  class ARV ar
  class CORE,SURF epp
```

Reading the graph:

- **`run-plan` is the orchestration hub** — it drives the implementation waves,
  the test gap pass, and the parallel review stage, and can send the plan back
  to `implementation-planner` for a split when a phase is oversized.
- **`researcher` serves the early stages** — `spec-creator`,
  `implementation-planner`, and `brainstormer` fan out fact-finding to it instead
  of doing long searches in their own context.
- **`brainstormer` sits one step before the pipeline** — it argues a decision out
  *before* a spec exists, and its outcome is what `spec-creator` takes in as
  user-approved decisions. Every skill it uses is invoked on demand and **none is
  declared as a dependency**, which is deliberate: a hard edge from
  `research-tools` to `sdd-engineering` would close the cycle
  `research-tools → sdd-engineering → research-tools`. Its dotted edges to
  `mermaid-diagram` and `engineering-insights` are therefore best-effort — present
  whenever `sdd-engineering` is installed (which is the common case, since
  installing it pulls `research-tools` in), and skipped with a note when it is
  not.
- **`engineering-paved-path` splits into two tiers**: a core tier
  (`onion-architecture`, `typescript-expert`, `security`) preloaded by agents
  at spawn time via the `skills:` frontmatter, and a surface tier
  (React / Next.js / Fastify / testing) loaded on demand via the `Skill` tool
  only when an agent touches that surface. This keeps agent contexts lean.
- **`workflow-retro` sits outside the pipeline** — the user invokes it manually
  after a run; confirmed non-obvious findings flow into the host project's
  insights file via `engineering-insights`.

## Summary

Versions are deliberately absent here — they live only in each plugin's
`plugin.json`, and a number repeated in prose goes stale on the next release.
Read the current one from the manifest, or from `/api/index.json` on the
[catalog site](https://syukpublic.github.io/ai-dev-toolkit/).

| Plugin | Contents | Depends on |
| ------ | -------- | ---------- |
| [engineering-paved-path](../plugins/engineering-paved-path/README.md) | 8 skills: react-best-practices, react-frontend-architecture, react-testing-library, next-best-practices, fastify-best-practices, onion-architecture, security, typescript-expert | — |
| [research-tools](../plugins/research-tools/README.md) | `researcher` agent (read-only: code, config, git, web); `brainstormer` agent (pre-decision option exploration, docs-only write on request) | — |
| [architecture-review](../plugins/architecture-review/README.md) | `architecture-reviewer` agent (read-only layering/boundary audit) | engineering-paved-path `^1.0.0` |
| [sdd-engineering](../plugins/sdd-engineering/README.md) | agents: spec-creator, implementation-planner, implementer, test-writer, plan-verifier; skills: run-plan, workflow-retro, engineering-insights, mermaid-diagram | all three `^1.0.0` |

Related conventions:

- Skills are invoked across plugins in the namespaced form
  `<plugin-name>:<skill-name>`.
- Supporting scripts inside skills resolve via `${CLAUDE_SKILL_DIR}`, never via
  repo-relative paths.
- Versions live only in each plugin's `plugin.json` (see
  [RELEASES.md](RELEASES.md)); merging a version bump to `main` creates the
  `<plugin-name>--vX.Y.Z` tag automatically. Note the **two** hyphens before the
  `v`: that is the form the ranges above resolve against, and a single-hyphen tag
  is invisible to dependency resolution.
