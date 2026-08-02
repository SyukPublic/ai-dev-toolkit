# Releases

## Versioning model

- Every plugin carries an explicit **SemVer** `version` in its `.claude-plugin/plugin.json`. This is the **only** place a version lives — never duplicate it in the marketplace entry (the manifest silently wins, and duplication only causes drift).
- **A release does not exist without a version bump.** Claude Code delivers updates to users only when the manifest version changes; pushing commits without a bump ships nothing to existing users.
- SemVer semantics for plugins:
  - **MAJOR** — breaking changes: removed or renamed skills/commands, changed hook behavior users may depend on.
  - **MINOR** — new skills, agents, commands, or capabilities; backward compatible.
  - **PATCH** — fixes and internal changes with no interface impact.
- The marketplace-level `version` in `marketplace.json` is informational; bump it on structural catalog changes (plugins added/removed/renamed).

## Release procedure

1. Run `node scripts/prepare-release.mjs <plugin> <major|minor|patch>` — it bumps the version in the plugin's `plugin.json` and scaffolds a `CHANGELOG.md` entry. Replace the TODO line with real release notes and include everything in the PR.
2. CI is green and a code owner (see [CODEOWNERS](../CODEOWNERS)) has approved. Only code owners merge to `main` — merging to `main` **is** the release.
3. Tagging is automated: when a version bump lands on `main`, the `tag-releases.yml` workflow creates the annotated tag `<plugin-name>--vX.Y.Z` (e.g. `code-review--v1.2.0`) and a GitHub Release with the matching changelog section as notes. (Manual fallback: `node scripts/tag-releases.mjs --dry-run` to see what would be tagged; `claude plugin tag --push` from a plugin directory does the same for one plugin and additionally checks that `plugin.json` and the marketplace entry agree.)

**The `--v` separator is load-bearing.** Tags are not merely for humans: when a plugin declares a dependency with a semver range, Claude Code lists this repository's tags starting with `<plugin-name>--v` and fetches the highest version satisfying the range. A single-hyphen tag is invisible to that lookup and the dependent plugin is disabled with `no-matching-tag`. The prefix match is on the full plugin name, so hyphenated names are handled correctly.

Recommended (not yet enforced): protect `main` with a GitHub ruleset requiring code-owner review, and protect `*--v*` tags so only release owners can create them. Note for a solo maintainer: with "Require review from Code Owners" enabled, your own PRs need an admin bypass, since an author's approval does not count.

## How users receive updates

```
/plugin marketplace update ai-dev-toolkit
/plugin update <plugin-name>@ai-dev-toolkit
```

Claude Code caches plugins in `~/.claude/plugins/cache`; stale caches after updates are a known issue — the workaround is uninstall/reinstall. Document user-facing breaking changes prominently in the changelog.

Auto-update is off by default for third-party marketplaces, so users pick up a release either by enabling auto-update for the marketplace in `/plugin` or by running the commands above.

Dependencies that were installed automatically stay on disk after the plugins that pulled them in are removed. `claude plugin prune` lists those orphans and removes them after a confirmation prompt (`--dry-run` to preview, `-y` to skip the prompt); `claude plugin uninstall <plugin> --prune` does it as part of an uninstall.

## Rollback: roll forward only

Never delete, reuse, or decrease a published version. To undo a bad release `X.Y.Z`, run:

```
node scripts/rollback.mjs <plugin> [--to <version>]
```

It restores the plugin directory from the last good release tag (or `--to` a specific one), bumps the **patch** version past the bad release, and prepends a changelog entry ("reverts X.Y.Z"). Review the diff and open a PR like any release — the content rolls back, the version rolls forward. After merge, the tag is created automatically.

Downgrades are not reliably delivered to users, and a deleted tag or version leaves installs in an inconsistent state — rolling forward is the only dependable path. For a security-driven rollback, also follow the incident response in [SECURITY.md](SECURITY.md).
