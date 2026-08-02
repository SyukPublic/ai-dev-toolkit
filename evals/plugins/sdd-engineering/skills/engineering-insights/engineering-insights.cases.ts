import type { WorkflowCase } from "../../../../src/index.js";

/**
 * Trigger (activation) suite for sdd-engineering:engineering-insights. Workflow-tier: each case
 * runs in the assembled workspace (src/workspace.ts) and asserts whether THIS skill engages
 * (a Skill call or its SKILL.md read). The positive stops on engagement, BEFORE the skill's
 * body can Write anything. Positives are `indicative` (a model may act inline — logged, not
 * blocking); a false activation on the near-miss negative is a hard failure.
 *
 * A second activation pair for this skill (different scenario) lives in the workflow suite:
 * plugins/sdd-engineering/workflow/review-workflow.cases.ts.
 */
export const cases: WorkflowCase[] = [
  {
    kind: "activation",
    name: "engineering-insights engages on a confirmed non-obvious discovery",
    prompt:
      "Just confirmed why our order-total test was flaky: the DB seeding ran in parallel with " +
      "the assertion — a race, not a rounding bug. Worth writing this down as a gotcha so the " +
      "team doesn't chase it again.",
    skill: "engineering-insights",
    shouldActivate: true,
    indicative: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic in general must NOT record an insight",
    prompt:
      "Explain in general why database seeding races can make tests flaky and how to prevent " +
      "them.",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 4,
  },
];
