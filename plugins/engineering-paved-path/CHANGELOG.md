# Changelog

## 1.0.3 - 2026-08-03

- `security`: rewrote the skill `description` so it stops engaging on infrastructure
  questions. It now says the skill reviews application **source code**, lists trigger
  terms, and names what is out of scope — VPC and security-group design, firewall
  rules, open ports, public IPs, TLS termination, OS/container hardening, cloud IAM.
  Supply-chain risk in npm dependencies stays explicitly in scope (OWASP A03), as does
  application configuration such as Helmet and CORS (A02).

  Measured at n=5 before and after: a near-miss question about VPC and security groups
  stopped falsely engaging the skill (40% → 80% correct non-engagement), and engagement
  on a genuine auth-code review improved as well (60% → 80%). The guidance itself is
  unchanged — only the targeting.

  **Correction (2026-08-04): the two figures above do not hold.** Each was a single
  five-run series, and at a rate near 50% that carries roughly ±22 points — far too
  little to separate 40% from 80%. Pooling every series since recorded against this
  description gives **7/20 (35%)** correct non-engagement and **8/22 (36%)** engagement,
  so there is no evidence the rewrite moved either number.

  The rewrite itself is still right, and the reason the measurement was misleading is
  the model it was taken on. Re-run unchanged against a stronger model
  (`claude-sonnet-5`, n=5), the same two cases score **5/5 and 5/5** — the description
  discriminates perfectly in both directions for a model able to follow it, while
  `claude-haiku-4-5` manages 4/20. The published numbers measured the model, not the
  targeting. Nothing in the skill changed as a result of this correction.

## 1.0.2 - 2026-08-03

- `fastify-best-practices`: moved the 19 rule files from `rules/` into `references/`.
- `next-best-practices`: moved its 19 topic files from the skill root into `references/`.
- Both: supporting-file links in `SKILL.md` now resolve through `${CLAUDE_SKILL_DIR}`
  instead of bare relative paths, which is what the plugin cache requires after install.

Guidance in both skills is unchanged — this is a file-layout change. `references/` is the
convention the rest of the catalog already uses (`typescript-expert`, `run-plan`,
`react-testing-library`), and it is the directory name the eval harness recognises as skill
payload, so the two skills become measurable instead of only testable for activation.

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
