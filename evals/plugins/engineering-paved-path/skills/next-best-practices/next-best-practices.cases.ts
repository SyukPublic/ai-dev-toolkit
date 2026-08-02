import type { WorkflowCase } from "../../../../src/index.js";

/**
 * Trigger (activation) suite for engineering-paved-path:next-best-practices. Workflow-tier:
 * each case runs in the assembled workspace (src/workspace.ts) and asserts whether THIS skill
 * engages (a Skill call or its SKILL.md read). Positives are `indicative` (a model may do the
 * work inline — logged, not blocking); a false activation on the near-miss negative is a hard
 * failure.
 */
export const cases: WorkflowCase[] = [
  {
    kind: "activation",
    name: "next-best-practices engages on an App Router data-fetching + metadata task",
    prompt:
      "In our Next.js App Router app, the product page needs server-component data fetching " +
      "plus per-page metadata for SEO. Where do the fetch calls and generateMetadata belong, " +
      "and what are the file conventions?",
    skill: "next-best-practices",
    shouldActivate: true,
    indicative: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — the same questions in a Vite SPA must NOT engage the Next.js skill",
    prompt:
      "In our Vite + React single-page app (no framework router), where should data fetching " +
      "live and how do we set the document title per page?",
    skill: "next-best-practices",
    shouldActivate: false,
    maxTurns: 4,
  },
];
