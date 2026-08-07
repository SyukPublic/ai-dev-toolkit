# Contributing

Thank you for considering a contribution! This document describes how a plugin travels from an idea to a published release.

## Ground rules

Every plugin in this marketplace must be **project-agnostic**: it has to be useful when installed into an arbitrary repository. Plugins tied to a specific product, codebase, or internal workflow will not be accepted.

The marketplace is curated — not every proposal will land. Maintainers may decline plugins that duplicate existing ones, have an unclear use case, or carry a disproportionate token or security cost.

## From proposal to pull request

1. **Open a plugin proposal issue** using the "Plugin proposal" template. Describe the purpose, the components (skills, agents, MCP servers), and why the plugin is generic. Wait for a maintainer to approve the direction before investing in implementation.
2. **Develop the plugin** on a branch (or fork) under `plugins/<plugin-name>/`, following [docs/PLUGIN-GUIDELINES.md](docs/PLUGIN-GUIDELINES.md).
3. **Register it** in `.claude-plugin/marketplace.json` (with `metadata.pluginRoot` set to `./plugins`, `"source": "<plugin-name>"` is enough).
4. **Validate and test locally:**

   ```
   claude plugin validate .
   ```

   Then in a Claude Code session: run `/plugin marketplace add ./` from the repo root, `/plugin install <plugin-name>@ai-dev-toolkit`, and exercise every skill, agent, and command the plugin ships.

   This step needs **Claude Code 2.1.196 or newer**, and `--strict` validation needs **2.1.222 or newer** — see [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md). Below 2.1.196 a local-folder marketplace ignores release tags and resolves dependencies from the working tree, so the check silently stops matching what published users get.
5. **Open a pull request** and fill in the PR template. CI must be green — [validate.yml](.github/workflows/validate.yml) runs the same validator.
6. **Review.** Code owners (see [CODEOWNERS](CODEOWNERS)) review every PR. Security-sensitive components — hooks, MCP servers, executables — get line-by-line scrutiny (see [docs/SECURITY.md](docs/SECURITY.md)).
7. **Merge = release.** A merged PR must bump the plugin's version per [docs/RELEASES.md](docs/RELEASES.md) — `node scripts/prepare-release.mjs <plugin> <major|minor|patch>` does the bump and changelog scaffolding for you. Publication to users happens the moment it lands on `main`; the release tag is created automatically.

## Review criteria

- Complies with the structure and manifest requirements of [docs/PLUGIN-GUIDELINES.md](docs/PLUGIN-GUIDELINES.md).
- No secrets or credentials anywhere (see [docs/SECURITY.md](docs/SECURITY.md)).
- Hooks and scripts are portable (POSIX shell, forward slashes) and use `${CLAUDE_PLUGIN_ROOT}`.
- `version` bumped and `CHANGELOG.md` updated.
- Plugin README documents what the plugin does and what it executes.
