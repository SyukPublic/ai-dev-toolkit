# Plugin Guidelines

Requirements for every plugin published in this marketplace. `claude plugin validate .` must pass, but validation only proves well-formedness — these guidelines also cover what the validator cannot check.

## Naming

- Plugin `name` must be **kebab-case**: lowercase letters, digits, and hyphens only.
- The name becomes the command prefix (`/<plugin-name>:<skill-name>`), so keep it short and easy to type.
- The name must be unique within the marketplace and must not impersonate official Anthropic plugins or marketplaces.
- Use `displayName` for a human-friendly label. Never rename `name` after release without a `renames` entry in `marketplace.json` (see [RELEASES.md](RELEASES.md)) — renaming breaks existing installs.

## Required structure

```
plugins/<plugin-name>/
├── .claude-plugin/
│   └── plugin.json        # manifest — the ONLY thing inside .claude-plugin/
├── README.md              # what the plugin does and what it executes
├── CHANGELOG.md           # per-release notes
├── skills/                # skills: <skill-name>/SKILL.md
├── agents/                # subagent definitions (*.md)
├── commands/              # flat .md commands (optional)
├── hooks/hooks.json       # hook configuration (optional)
└── .mcp.json              # MCP server definitions (optional)
```

Rules the validator will NOT save you from:

- Components (`skills/`, `agents/`, `commands/`, …) live at the **plugin root**, never inside `.claude-plugin/`. Misplacing them fails silently — the plugin installs but contributes nothing.
- A `CLAUDE.md` inside a plugin does nothing. Ship instructions as skills (`skills/<name>/SKILL.md`).

## Manifest (`.claude-plugin/plugin.json`)

Required by this marketplace (stricter than the official schema, which only requires `name`):

| Field | Notes |
| ----- | ----- |
| `name` | kebab-case, matches the directory name |
| `version` | SemVer, bumped on every release (see [RELEASES.md](RELEASES.md)) |
| `description` | one sentence, project-agnostic |
| `author.name` | person or team |
| `license` | SPDX id, normally `MIT` |
| `keywords` | for discoverability — plugin directory sites index these |
| `displayName` | human-readable label shown in the `/plugin` picker; may contain spaces and any casing |

Optional: `homepage`, `repository`.

`category` does **not** belong here. It is a marketplace-specific field (alongside `source`, `tags`, `strict`, and `relevance`) and lives only in the plugin's entry in `marketplace.json`. Claude Code ignores it in `plugin.json`, and `claude plugin validate --strict` fails on it.

Do **not** set `version` in the marketplace entry either — the plugin manifest is the single source of truth. A marketplace-entry version is silently overridden by `plugin.json` and only causes drift.

### Declaring dependencies

List dependencies in the `dependencies` array of `plugin.json`. Each entry is either a bare plugin name or an object with a semver range — the `"<name>@<range>"` string form is **not** supported and resolves as a plugin literally named `<name>@<range>`:

```json
"dependencies": [
  { "name": "engineering-paved-path", "version": "^1.0.0" }
]
```

Ranges resolve against git tags on this repository, so a constrained dependency only works if the upstream plugin's releases are tagged as `<plugin-name>--v<version>` (see [RELEASES.md](RELEASES.md)). No matching tag means the dependent plugin is disabled with `no-matching-tag`.

## Portability and paths

- Use `${CLAUDE_PLUGIN_ROOT}` for every file reference in hooks and MCP configs. Plugins execute from a cache (`~/.claude/plugins/cache`), not from the cloned repo — bare relative paths break after installation.
- Never use `../` in any source or path; the validator rejects it, and the cache copy would break it anyway.
- Hook scripts must be portable: POSIX shell, forward slashes, no Windows-only or bash-only assumptions. Windows users run hooks through Git Bash, where backslash paths break.

## Scope and size

- Plugins must be **generic** — usable in any project, with no product-specific bindings.
- Prefer several small, focused plugins over one large one: each plugin is a single trust unit and adds always-on context overhead (`claude plugin details` shows the projected token cost).
