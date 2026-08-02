## What

<!-- What does this PR add or change? Which plugin(s)? Link the proposal issue. -->

## Checklist

- [ ] `claude plugin validate .` passes locally
- [ ] Components live at the plugin root (not inside `.claude-plugin/`)
- [ ] All hook/MCP paths use `${CLAUDE_PLUGIN_ROOT}`; no `../` paths
- [ ] Hook scripts are portable (POSIX shell, forward slashes)
- [ ] Plugin is project-agnostic (works in any repository)
- [ ] No secrets or credentials anywhere (see docs/SECURITY.md)
- [ ] `version` bumped in `.claude-plugin/plugin.json` (SemVer, see docs/RELEASES.md)
- [ ] `CHANGELOG.md` entry added
- [ ] Plugin README documents what the plugin executes
- [ ] Tested locally: `/plugin marketplace add ./` + `/plugin install <name>@ai-dev-toolkit`
