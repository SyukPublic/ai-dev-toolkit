# Changelog

## 1.0.1 - 2026-08-05

- `architecture-reviewer`: the working loop no longer implies that a project's documented invariants
  live only in a package's `AGENTS.md`, `CLAUDE.md` or `README`. Step 3 now also names a project-level
  architecture document (e.g. `docs/architecture.md`), says to treat that list as examples rather than
  the set of places to look, and requires following a pointer the project's instruction file gives —
  an instruction file that says "for architecture and dependency direction, read `docs/architecture.md`"
  is telling the reviewer where the contracts are. It also says to `Grep` the docs for an invariant's
  name before concluding it is undocumented.

  Why: measured at n=10 on `claude-sonnet-5`, one run in ten read the project's instruction file, did
  **not** follow its explicit pointer to the architecture document, and then reported that it could not
  locate the documented invariant — while still naming an "Onion rule N" for a different finding, which
  the agent's own hard rule forbids ("cite rules from the source, never from memory"). Reading the
  architecture document and passing the case correlated perfectly across those ten runs: the single run
  that skipped the document was the single run that failed.

  **What is and is not established.** The mechanism is established: skipping the document causes the
  citation failure, and the pointer the run needed was inside a file it had already read. The *size* of
  the improvement is **not** measured and deliberately not claimed — at a 90% baseline, ten runs cannot
  separate 90% from 98%, and a clean 10/10 afterwards would occur about a third of the time with no
  change at all. This release is justified by the mechanism and by the contract violation, not by a
  measured rate.

  Guidance is otherwise unchanged; no rule, severity or output-format change.

## 1.0.0 - 2026-07-17

- Initial release.
- `architecture-reviewer` agent: read-only Onion Architecture audit of existing code — dependency direction, forbidden-import boundaries, structural erosion — with severity-calibrated findings, verbatim `file:line` evidence, and a mandatory PASS/FAIL gate verdict.
- Depends on `engineering-paved-path` `^1.0.0` (preloads `onion-architecture`, `typescript-expert`, `security`; loads surface skills on demand).
