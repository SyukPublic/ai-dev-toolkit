import type { WorkflowCase } from "../../../../src/index.js";

/**
 * Trigger (activation) suite for engineering-paved-path:typescript-expert. Workflow-tier:
 * each case runs in the assembled workspace (src/workspace.ts) and asserts whether THIS skill
 * engages (a Skill call or its SKILL.md read). Positives are `indicative` (a model may do the
 * work inline — logged, not blocking); a false activation on the near-miss negative is a hard
 * failure.
 */
export const cases: WorkflowCase[] = [
  {
    kind: "activation",
    name: "typescript-expert engages on a type-level programming task",
    prompt:
      "I need a TypeScript utility type that makes every key of a nested object deeply " +
      "readonly, and our generic inference breaks inside a conditional type — help me get the " +
      "type-level programming right.",
    skill: "typescript-expert",
    shouldActivate: true,
    indicative: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    // Same general area (static typing), different language — the skill covers TS/JS, so the
    // near-miss must leave the JS ecosystem entirely to stay a clean negative.
    name: "near-miss negative — a Python typing question must NOT engage the TypeScript skill",
    prompt:
      "Add type hints to this Python function and explain when to use Protocol versus an " +
      "abstract base class:\n\ndef total(orders): return sum(o.amount for o in orders)",
    skill: "typescript-expert",
    shouldActivate: false,
    maxTurns: 4,
  },
];
