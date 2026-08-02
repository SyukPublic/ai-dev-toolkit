import type { WorkflowCase } from "../../../../src/index.js";

/**
 * Trigger (activation) suite for sdd-engineering:workflow-retro. Workflow-tier: each case runs
 * in the assembled workspace (src/workspace.ts) and asserts whether THIS skill engages (a Skill
 * call or its SKILL.md read). Positives are `indicative` (a model may act inline — logged, not
 * blocking); a false activation on the near-miss negative is a hard failure.
 */
export const cases: WorkflowCase[] = [
  {
    kind: "activation",
    name: "workflow-retro engages after a pipeline run when metrics are requested",
    prompt:
      "The SDD pipeline run just finished. Run a workflow retro on it — I want the true " +
      "token/duration metrics per agent, the parallelism picture, and what to optimize next " +
      "run.",
    skill: "workflow-retro",
    shouldActivate: true,
    indicative: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    // "Retrospective" is one of the skill's trigger terms, but the skill is a PIPELINE metrics
    // tool — a human team-meeting agenda is the discriminating near-miss.
    name: "near-miss negative — a team sprint-retro agenda must NOT engage the pipeline retro skill",
    prompt:
      "Draft a retrospective agenda for our team's sprint review meeting on Friday — an " +
      "icebreaker, what-went-well / what-didn't columns, and action items.",
    skill: "workflow-retro",
    shouldActivate: false,
    maxTurns: 4,
  },
];
