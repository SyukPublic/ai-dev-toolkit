import type { WorkflowCase } from "../../../../src/index.js";

/**
 * Trigger (activation) suite for engineering-paved-path:react-best-practices. Workflow-tier:
 * each case runs in the assembled workspace (src/workspace.ts) and asserts whether THIS skill
 * engages (a Skill call or its SKILL.md read). Positives are `indicative` (a model may do the
 * work inline — logged, not blocking); a false activation on the near-miss negative is a hard
 * failure.
 */
export const cases: WorkflowCase[] = [
  {
    kind: "activation",
    name: "react-best-practices engages on a hooks anti-pattern review",
    prompt:
      "Review this React pattern in our app: we store a derived value in useState and sync it " +
      "with a useEffect whenever the props change. Is that a good pattern, and how should the " +
      "component and its hooks be refactored?",
    skill: "react-best-practices",
    shouldActivate: true,
    indicative: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — the same derived-state question in Vue must NOT engage the React skill",
    prompt:
      "In our Vue 3 component we compute a derived value with watch + ref. Is that idiomatic " +
      "Vue, or should we be using computed instead?",
    skill: "react-best-practices",
    shouldActivate: false,
    maxTurns: 4,
  },
];
