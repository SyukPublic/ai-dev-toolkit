# Changelog

## 1.2.0 - 2026-08-06

- `spec-creator`: the final self-check's eleven items are now stated to be the **whole** finalization
  gate, and a finding outside them explicitly does **not** block. Grounding a spec against the codebase
  can surface real mismatches — a dependency the spec assumes but the code does not have, a shape it
  calls "existing" that is not there, a name that does not resolve. Those are now reported under the
  report's existing **Inline proposals (non-blocking)** section, with what was checked and what was
  found, while `Status` stays decided by the eleven items alone. Both failure directions are named: do
  not drop such a finding silently, and do not promote it to a twelfth blocker.

  The release also names the ways a blocker gets re-introduced under another label, because that is
  what actually happened in measurement: "I need you to confirm this before I set `approved`", a
  "blocking question" that is not an interview-mode clarification, and a `Status: blocked` whose stated
  reason is a grounding mismatch are all the twelfth gate item by another name. Severity does not
  convert a note into a gate — state the severity, recommend the fix, set the Status the eleven items
  dictate. The rationale is in the prompt: `implementation-planner` runs its own input gate and its own
  grounding pass downstream, so a reported mismatch does not go unnoticed for not having been blocked on.

  Why: 1.1.0 made "any failing item is a HARD blocker" explicit over an enumerated list, and the
  enumeration then quietly narrowed the instruction in the other direction — it said what blocks but
  never what to do with a finding outside it. Measured on `claude-sonnet-5`, a spec that passes all
  eleven items while being factually wrong about the code was blocked anyway in 1 run of 5, once with
  the run labelling its own finding "outside the numbered checklist, found via codebase inspection".
  After this change that case measures **5/5 on `claude-sonnet-5` and 5/5 on `claude-opus-5`**, the
  model the agent declares, with grounding genuinely performed in both (19–25 turns on opus, 11 files
  read) rather than skipped.

  **The hard gate is unchanged, and that was the control.** A spec with an uncovered mandatory
  requirement still refuses `approved` at 5/5, and the no-false-positive case still declines to invent
  a coverage gap at 5/5, both re-measured after this change. What is new is only the treatment of
  findings the eleven items never covered.

- Backward compatible: additive instruction changes only — no self-check item added, removed or
  reworded, no severity change, and no change to the report format (the non-blocking section it uses
  already existed). A spec whose grounding surfaces nothing finalizes exactly as before.

## 1.1.0 - 2026-07-17

- `spec-creator`: finalization now hard-gates on requirement→AC coverage — a spec cannot reach `Status: approved` while any mandatory requirement (an in-scope user story or a stated must-have in Goals) lacks an acceptance criterion. New final self-check item 11; an uncovered requirement is resolved by adding the missing AC (next free append-only ID) or a `[NEEDS CLARIFICATION]`, and the spec stays `draft`.
- `spec-creator`: any failing final self-check item is now an explicit hard blocker for finalization — the report's Status stays `draft`, and prior user approval satisfies only the explicit-confirmation requirement (it does not override a failing check).
- Backward compatible: additive instruction changes only — no AC renumbering, no format changes; specs with full requirement coverage finalize exactly as before.

## 1.0.0 - 2026-07-17

- Initial release.
- Agents: `spec-creator`, `implementation-planner`, `implementer`, `test-writer`, `plan-verifier`.
- Skills: `run-plan` (pipeline orchestrator), `workflow-retro` (post-run metrics + insights), `engineering-insights` (durable project knowledge log), `mermaid-diagram` (diagram authoring support).
- Declares dependencies on `engineering-paved-path`, `research-tools`, and `architecture-review` (`^1.0.0` each); Claude Code resolves and installs them automatically.
