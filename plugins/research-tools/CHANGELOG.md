# Changelog

## 1.1.0 - 2026-08-07

- New `brainstormer` agent: pre-decision discussion and option exploration. Each round establishes verified ground truth first (fanning broad fact-finding out to up to ~5 parallel `researcher` subagents), then argues every genuinely distinct option through an advocate and a red-team pass, and maintains a ranked decision matrix. It never picks a winner — the choice stays with the caller — and it can hand back an ADR-ready draft once the caller has decided.
- Facts and judgement are kept apart by construction: every factual claim carries a `file:line`, a URL, or a research-report reference, and every ungrounded judgement is tagged `Hypothesis — to verify:` together with the check that would settle it. Estimates count as judgement — arithmetic over inputs nobody measured is a hypothesis however sound the arithmetic is, and the tag has to travel with the number rather than living only in a summary section.
- Surface skills (`engineering-paved-path:*`, `sdd-engineering:mermaid-diagram`, `sdd-engineering:engineering-insights`) are invoked on demand through the `Skill` tool and **not** declared as dependencies: the plugin stays installable on its own, and a missing skill degrades the grounding for that surface instead of blocking the discussion.
- The plugin is no longer read-only at the plugin level. `researcher` is unchanged and still carries no write tools; `brainstormer` adds `Write`, bounded to the host project's docs tree (default convention `docs/discussions/<topic>.md`) and used only when the caller explicitly asks for a durable summary. The read-only guarantee is now documented per agent — see [README.md](README.md).
- Plugin description and keywords widened from "read-only research agent" to research **and** decision support.

## 1.0.0 - 2026-07-17

- Initial release.
- `researcher` agent: read-only investigation of the project (code, config, docs, git history) and the web, with strictly structured PROJECT/WEB reports, mandatory "Not found" section, source citations, and an interview mode for ambiguous requests.
