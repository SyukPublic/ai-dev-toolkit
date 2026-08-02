import type { WorkflowCase } from "../../../../src/index.js";

/**
 * Trigger (activation) suite for sdd-engineering:mermaid-diagram. Workflow-tier: each case runs
 * in the assembled workspace (src/workspace.ts) and asserts whether THIS skill engages (a Skill
 * call or its SKILL.md read). Positives are `indicative` (a model may draw inline — logged, not
 * blocking); a false activation on the near-miss negative is a hard failure.
 */
export const cases: WorkflowCase[] = [
  {
    kind: "activation",
    name: "mermaid-diagram engages on a sequence-diagram request",
    prompt:
      "Draw a sequence diagram of our checkout flow — client → API → payment provider → " +
      "webhook back to the API — as a diagram embedded in markdown.",
    skill: "mermaid-diagram",
    shouldActivate: true,
    indicative: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — a prose-only flow description must NOT engage the diagram skill",
    prompt:
      "Describe our checkout flow step by step in plain prose — no diagrams or figures, just " +
      "text.",
    skill: "mermaid-diagram",
    shouldActivate: false,
    maxTurns: 4,
  },
];
