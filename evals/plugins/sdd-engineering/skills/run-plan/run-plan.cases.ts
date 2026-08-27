import type { WorkflowCase } from "../../../../src/index.js";

/**
 * Workflow-tier suite for sdd-engineering:run-plan. Every case runs in the assembled workspace
 * (src/workspace.ts) against the real on-disk skills and agents. Two kinds live here:
 *
 *   activation — does THIS skill engage (a Skill call or its SKILL.md read)? The positive stops
 *     the session the moment the skill engages, so the orchestration body never runs. Positives
 *     are `indicative` (a model may act inline — logged, not blocking, with the lifetime floor in
 *     eval:repeat catching "never once"); a false activation on the near-miss negative is a hard
 *     failure.
 * The PRE-IMPLEMENTATION invariants — everything up to and including the first spawn — are NOT
 * here. All three live as bespoke tests in run-plan.eval.ts, and the reason is measured rather
 * than stylistic: `kind: "trace"` stops the session only when EVERY expectation is satisfied at
 * once, so a run that misses one never stops at all. A trace version of the dispatch case (skill
 * engaged + plan read + implementer spawned) produced two 900 s vitest timeouts in five runs and a
 * row of 143 turns against a `maxTurns` of 20 — maxTurns does not bound a session once it
 * dispatches. Stopping at the FIRST spawn instead and asserting the rest afterwards took the same
 * case to 40-60 s a run with every row recorded.
 *
 * Nothing past the first spawn is measurable in this tier anyway: the workflow tier hard-blocks
 * Write/Edit/Bash (config.ts WORKFLOW_DISALLOWED_TOOLS), so a full pipeline run cannot reach its
 * end honestly here — see sandbox-write.eval.ts for exactly how far that blocklist reaches.
 */
export const cases: WorkflowCase[] = [
  {
    kind: "activation",
    name: "run-plan engages when asked to execute an approved plan by path",
    prompt:
      "Execute the approved implementation plan at docs/plans/2026-07-order-export.md through " +
      "the implementation pipeline.",
    skill: "run-plan",
    shouldActivate: true,
    indicative: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    // Drafting a plan is the planner's job — run-plan EXECUTES an existing approved plan.
    name: "near-miss negative — drafting a plan must NOT engage run-plan",
    prompt:
      "Draft an implementation plan for adding order export: break it into tasks with " +
      "acceptance criteria. Don't implement anything yet.",
    skill: "run-plan",
    shouldActivate: false,
    maxTurns: 4,
  },
];
