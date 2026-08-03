# Changelog

## 1.0.1 - 2026-08-02

- `react-testing-library`: split `SKILL.md` (603 lines) into a 278-line always-loaded
  core plus a `references/` directory read on demand — `setup.md`, `spec-templates.md`,
  `patterns.md`, `mocking.md`, `matchers.md`. Guidance is unchanged; the always-on
  context cost of loading the skill drops by roughly half.

## 1.0.0

Initial release. Eight curated, project-agnostic engineering skills:

- `react-best-practices` — React component correctness and runtime rules.
- `react-frontend-architecture` — frontend project structure, colocation, and import boundaries.
- `react-testing-library` — integration-first React UI testing with Testing Library.
- `next-best-practices` — Next.js App Router conventions, RSC boundaries, and data patterns.
- `fastify-best-practices` — Fastify plugin, route, schema, and operations rules.
- `onion-architecture` — dependency-inward layering for TypeScript backends.
- `security` — application security review rules, checklists, and examples.
- `typescript-expert` — advanced TypeScript expertise with a bundled `ts_diagnostic.py` script (invoked via `${CLAUDE_SKILL_DIR}/scripts/ts_diagnostic.py`).
