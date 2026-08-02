import type { WorkflowCase } from "../../../../src/index.js";

/**
 * Trigger (activation) suite for engineering-paved-path:react-frontend-architecture.
 * Workflow-tier: each case runs in the assembled workspace (src/workspace.ts) and asserts
 * whether THIS skill engages (a Skill call or its SKILL.md read). Positives are `indicative`
 * (a model may do the work inline — logged, not blocking); a false activation on the near-miss
 * negative is a hard failure.
 */
export const cases: WorkflowCase[] = [
  {
    kind: "activation",
    name: "react-frontend-architecture engages on a frontend folder-structure task",
    prompt:
      "Our React app's components/ folder has ~80 files in one flat directory, with business " +
      "logic mixed into components. How should we restructure it into a feature-based layout, " +
      "and where do hooks, utils, and shared types belong?",
    skill: "react-frontend-architecture",
    shouldActivate: true,
    indicative: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    // The same "where does code live" question about the BACKEND is this skill's near-miss —
    // it may legitimately engage onion-architecture instead (not asserted here); only a false
    // activation of the React frontend skill fails.
    name: "near-miss negative — a backend module-layout question must NOT engage the frontend skill",
    prompt:
      "Our Fastify server's modules/ folder is getting messy — where should services, " +
      "repositories, and adapters live, and what belongs in the platform layer?",
    skill: "react-frontend-architecture",
    shouldActivate: false,
    maxTurns: 4,
  },
];
