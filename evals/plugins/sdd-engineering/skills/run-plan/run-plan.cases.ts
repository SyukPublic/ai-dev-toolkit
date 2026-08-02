import type { WorkflowCase } from "../../../../src/index.js";

/**
 * Trigger (activation) suite for sdd-engineering:run-plan. Workflow-tier: each case runs in
 * the assembled workspace (src/workspace.ts) and asserts whether THIS skill engages (a Skill
 * call or its SKILL.md read). The positive stops the session the moment the skill engages, so
 * the orchestration body never actually runs. Positives are `indicative` (a model may act
 * inline — logged, not blocking); a false activation on the near-miss negative is a hard
 * failure. The Gate-0 behavior ("no plan, no run") is asserted by a bespoke test in
 * run-plan.eval.ts.
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
