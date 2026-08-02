# Changelog

## 1.1.0 - 2026-07-17

- `spec-creator`: finalization now hard-gates on requirement→AC coverage — a spec cannot reach `Status: approved` while any mandatory requirement (an in-scope user story or a stated must-have in Goals) lacks an acceptance criterion. New final self-check item 11; an uncovered requirement is resolved by adding the missing AC (next free append-only ID) or a `[NEEDS CLARIFICATION]`, and the spec stays `draft`.
- `spec-creator`: any failing final self-check item is now an explicit hard blocker for finalization — the report's Status stays `draft`, and prior user approval satisfies only the explicit-confirmation requirement (it does not override a failing check).
- Backward compatible: additive instruction changes only — no AC renumbering, no format changes; specs with full requirement coverage finalize exactly as before.

## 1.0.0 - 2026-07-17

- Initial release.
- Agents: `spec-creator`, `implementation-planner`, `implementer`, `test-writer`, `plan-verifier`.
- Skills: `run-plan` (pipeline orchestrator), `workflow-retro` (post-run metrics + insights), `engineering-insights` (durable project knowledge log), `mermaid-diagram` (diagram authoring support).
- Declares dependencies on `engineering-paved-path`, `research-tools`, and `architecture-review` (`^1.0.0` each); Claude Code resolves and installs them automatically.
