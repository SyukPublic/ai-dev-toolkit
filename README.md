# AI Agentic Development Toolkit

A [Claude Code plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces) with reusable, project-agnostic skills, agents, and MCP servers that can be installed into any project.

**[Browse the catalog →](https://syukpublic.github.io/ai-dev-toolkit/)** — search every plugin, skill, and agent.

## Installation

Requires **Claude Code 2.1.143 or newer** — older releases ignore `displayName` and do not enable a plugin's dependencies along with it. Full version matrix and reasoning: [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md).

Add the marketplace in Claude Code:

```
/plugin marketplace add SyukPublic/ai-dev-toolkit
```

Then install a plugin:

```
/plugin install <plugin-name>@ai-dev-toolkit
```

## Available plugins

| Plugin | Description | Depends on |
| ------ | ----------- | ---------- |
| [engineering-paved-path](plugins/engineering-paved-path/README.md) | 8 curated stack skills: React, Next.js, Fastify, onion architecture, testing, TypeScript, security | — |
| [research-tools](plugins/research-tools/README.md) | `researcher` — read-only codebase/web investigation with structured reports; `brainstormer` — pre-decision option exploration with a ranked decision matrix | — |
| [architecture-review](plugins/architecture-review/README.md) | `architecture-reviewer` — read-only layering/dependency-direction auditor | engineering-paved-path |
| [sdd-engineering](plugins/sdd-engineering/README.md) | Spec-driven development workflow: spec → plan → implement → verify → retro | all three above |

Plugins declare their dependencies in their manifests, and Claude Code resolves and installs them for you — installing `sdd-engineering` pulls in the other three. The full picture, including the runtime composition graph, is in [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).

## Updating

Claude Code caches marketplaces and plugins locally. To pick up new releases:

```
/plugin marketplace update ai-dev-toolkit
/plugin update <plugin-name>@ai-dev-toolkit
```

If a plugin appears stale after an update, uninstall and reinstall it.

Dependencies installed automatically on your behalf stay on disk after you remove the plugin that needed them. `claude plugin prune` lists those orphans and removes them after confirmation.

## Repository structure

```
.claude-plugin/
  marketplace.json      # marketplace catalog (name: ai-dev-toolkit)
plugins/
  <plugin-name>/        # one directory per plugin (see docs/PLUGIN-GUIDELINES.md)
docs/                   # contributor and maintainer documentation
site/                   # catalog website (GitHub Pages), rebuilt on every push to main
```

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) — how a plugin gets from proposal to pull request
- [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) — minimum Claude Code version per audience, and why
- [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md) — plugin dependency graph and runtime composition
- [docs/PLUGIN-GUIDELINES.md](docs/PLUGIN-GUIDELINES.md) — naming, required structure, manifest fields
- [docs/RELEASES.md](docs/RELEASES.md) — versioning (SemVer), tags, updates, rollback
- [docs/SECURITY.md](docs/SECURITY.md) — security model, secrets policy, incident response

## License

[MIT](LICENSE)
