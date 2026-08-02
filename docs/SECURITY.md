# Security Policy

## Trust model

Installing a plugin is a single trust decision: one `/plugin install` activates **all** of its components at once — skills, agents, hooks, MCP servers, and executables. Hooks and MCP servers run arbitrary code on the user's machine. Consequently:

- Every plugin README must state what the plugin executes: hooks, MCP servers, external binaries, network access.
- PRs that add or modify hooks, MCP servers, or executables receive mandatory line-by-line review by a code owner (see [CODEOWNERS](../CODEOWNERS)).
- Validation (`claude plugin validate .`) proves well-formedness, **not** safety — review is the security gate.

## Secrets policy

- No credentials, tokens, or API keys anywhere in the repository — including `.mcp.json`, hook scripts, examples, and tests.
- Plugins that need user credentials must obtain them via `userConfig` fields marked `"sensitive": true` or from environment variables, and must document which ones.
- Anything that looks like a real secret in a PR is grounds for immediate rejection. If a secret is merged, it is considered leaked and must be rotated, even if the commit is later removed.

## External plugin sources

This marketplace currently ships only local plugins (`plugins/…`). If an external plugin is ever listed, its source must be pinned with **both** a `ref` (tag) and a full 40-character commit `sha`, so a moved tag or branch cannot silently change what users install.

## Reporting a vulnerability

Report vulnerabilities privately via GitHub → **Security** → **Report a vulnerability** on this repository. Do not open public issues for exploitable problems.

## Incident response: a dangerous release was published

There is no remote kill switch: users keep the plugin in their local cache (`~/.claude/plugins/cache`) until they update or uninstall it. The response is therefore about stopping further installs and shipping a fix fast:

1. **Stop distribution.** Remove or replace the plugin's entry in `.claude-plugin/marketplace.json`. If the plugin is removed entirely, add it to the top-level `renames` map as `"<plugin-name>": null` so existing installs are notified.
2. **Ship the fix forward.** Publish a corrected release with a version bump — never reuse a version (see [RELEASES.md](RELEASES.md)). Users only receive it after `/plugin marketplace update` + `/plugin update`.
3. **Publish a GitHub Security Advisory** describing the impact, affected versions, and remediation.
4. **Notify users** in the README and release notes; instruct affected users to run `/plugin update <name>@ai-dev-toolkit` or uninstall and reinstall (stale caches are a known Claude Code issue).
5. **Rotate anything exposed** (tokens, keys) and run a post-mortem on how the release passed review.
