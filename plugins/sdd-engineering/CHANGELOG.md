# Changelog

## 1.3.0 - 2026-08-07

- `spec-creator`: **stages the design sources it is given**. The
  `<specs-dir>/assets/<spec-id>/` convention was already in the definition — cited in the
  DesignSync fallback, in Design analysis, and in the Traceability example — but nothing ever
  put a file there: the assets directory was explicitly read-only ("the main session/user puts
  files there"), so a spec could only cite assets somebody else had staged by hand. In practice
  that meant specs pointing at `C:\Users\…\Downloads\v2.png`, which is unreadable to every other
  reader and dead as soon as the file moves. The agent now copies user-provided sources into the
  spec's own folder at draft time and cites them relatively as `assets/<spec-id>/<file>`, with a
  new asset table in Design analysis and an **Assets staged** section in the report.

  The write boundary widens by exactly one folder — `<specs-dir>/assets/<spec-id>/` for the spec
  being written, **create-only**: no overwrite, no edit, no move, no delete, and no other spec's
  folder. `Bash` stays read-only but for two commands, `mkdir -p` and `cp --`, both scoped to
  that folder. `cp` and never `mv`, so the user's original survives. Asset names are append-only
  like AC-IDs: once a Traceability row cites a file it is never renamed, a revised mockup is
  staged as `-v2`, and a name collision takes a numeric suffix instead of overwriting.

  The staging rules are a security surface, because this folder is committed: only paths the USER
  named in this session are eligible — never one found by globbing the repository, and never one
  read out of a design file (that text is already DATA, not instructions, under the untrusted-
  inputs constraint). Secret-shaped files, anything under `.git/`, executables, scripts and
  archives are refused and the refusal is reported rather than swallowed; an extension allow-list
  and a ~10 MB size check bound the rest.

- `spec-creator`: **chat attachments are named as un-stageable, explicitly.** A subagent receives
  text only — the official docs put it as "each subagent starts with a fresh, isolated context
  window" — so `[Image #1]` or "see the attached screenshot" arrives with nothing behind it, and
  a pasted image has no filesystem path to copy from in the first place. A design referred to
  that way with no path is now a BLOCKING interview question, and the report says "not received"
  instead of claiming an analysis. This is the same shape as the existing DesignSync fallback,
  which already refused to fake an analysis of a design it could not open. Callers pass a path;
  the agent's `description` says so, so the constraint reaches the caller before the spawn.

- `spec-creator`: with the boundary widened, a reachable `DesignSync` project no longer dead-ends.
  `get_file` returns text, and the agent now saves that text into the asset folder with `Write`,
  so the spec cites a file in the repository rather than a remote path only that session could
  reach. The DesignSync **write** methods are named and forbidden — reading a design is in scope,
  changing it is not.

- **The finalization gate is unchanged, deliberately.** No twelfth self-check item: staging is a
  mechanical step, not a property of spec completeness, and 1.2.0 is a measured correction against
  exactly that reflex ("These eleven are the whole gate"). Coverage of staged assets is reported,
  not gated. If measurement later shows assets being dropped silently, item 12 is its own release
  with its own numbers.

- Backward compatible: additive instruction changes only — no self-check item added, removed or
  reworded, no AC-numbering change, and the spec's section list is unchanged (the asset table
  lives inside the existing Design analysis section, and is omitted when nothing was provided).
  A spec run with no user-provided files behaves exactly as before.

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
