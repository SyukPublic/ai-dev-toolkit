# Changelog

## 1.0.0 - 2026-07-17

- Initial release.
- `architecture-reviewer` agent: read-only Onion Architecture audit of existing code — dependency direction, forbidden-import boundaries, structural erosion — with severity-calibrated findings, verbatim `file:line` evidence, and a mandatory PASS/FAIL gate verdict.
- Depends on `engineering-paved-path` `^1.0.0` (preloads `onion-architecture`, `typescript-expert`, `security`; loads surface skills on demand).
