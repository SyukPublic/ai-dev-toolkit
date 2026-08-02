import type { WorkflowCase } from "../../../../src/index.js";

/**
 * Trigger (activation) suite for engineering-paved-path:fastify-best-practices. Workflow-tier:
 * each case runs in the assembled workspace (src/workspace.ts) and asserts whether THIS skill
 * engages (a Skill call or its SKILL.md read). Positives are `indicative` (a model may do the
 * work inline — logged, not blocking); a false activation on the near-miss negative is a hard
 * failure.
 */
export const cases: WorkflowCase[] = [
  {
    kind: "activation",
    name: "fastify-best-practices engages on a new Fastify route task",
    prompt:
      "I'm adding a new Fastify route POST /orders/:id/notes to our server. Set up proper " +
      "JSON Schema validation and error handling for it — what's the right way to do this " +
      "in Fastify?",
    skill: "fastify-best-practices",
    shouldActivate: true,
    indicative: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — the same route task on Express must NOT engage the Fastify skill",
    prompt:
      "We're adding a POST /orders/:id/notes route to an Express app. How should we validate " +
      "the request body and handle errors in Express middleware?",
    skill: "fastify-best-practices",
    shouldActivate: false,
    maxTurns: 4,
  },
];
