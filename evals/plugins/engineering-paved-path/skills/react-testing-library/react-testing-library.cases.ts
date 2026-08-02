import type { WorkflowCase } from "../../../../src/index.js";

/**
 * Trigger (activation) suite for engineering-paved-path:react-testing-library. Workflow-tier:
 * each case runs in the assembled workspace (src/workspace.ts) and asserts whether THIS skill
 * engages (a Skill call or its SKILL.md read). Positives are `indicative` (a model may do the
 * work inline — logged, not blocking); a false activation on the near-miss negative is a hard
 * failure.
 */
export const cases: WorkflowCase[] = [
  {
    kind: "activation",
    name: "react-testing-library engages on an async component-test task",
    prompt:
      "Write component tests with Vitest for our React OrderSummary component — it fetches " +
      "data, shows a spinner, then renders rows. How should I query the DOM and await the " +
      "async UI correctly?",
    skill: "react-testing-library",
    shouldActivate: true,
    indicative: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — an end-to-end Playwright task must NOT engage the RTL skill",
    prompt:
      "Write end-to-end browser tests for the checkout flow with Playwright — real page " +
      "navigation against a running backend, no component mocking.",
    skill: "react-testing-library",
    shouldActivate: false,
    maxTurns: 4,
  },
];
