import type { WorkflowCase } from "../../../../src/index.js";

/**
 * Trigger (activation) suite for engineering-paved-path:onion-architecture. Workflow-tier: each
 * case runs in the assembled workspace (src/workspace.ts) and asserts whether THIS skill engages
 * (a Skill call or its SKILL.md read). Positives are `indicative` (a model may do the work inline
 * — logged, not blocking); a false activation on the near-miss negative is a hard failure.
 *
 * This skill had four quality cases and no activation coverage at all, which is a real blind spot:
 * typescript-expert measured 0/5 on activation while looking green in every ordinary run, and
 * run-plan's positive was outright invalid for the whole life of the repo. Neither was visible
 * without a case like this one plus `eval:repeat`.
 *
 * The negative is the mirror of react-frontend-architecture's: layer/placement vocabulary applied
 * to the FRONTEND, which belongs to that sibling skill. It tests that the trigger keys on
 * dependency-inward backend layering rather than on the words "where should this live".
 */
export const activationCases: WorkflowCase[] = [
  {
    kind: "activation",
    name: "onion-architecture engages on a backend layer-placement question",
    // LOW-RATE IN THIS WORKSPACE — roughly 1 run in 17, and mostly not because of the skill.
    // (An earlier note here read "UNMEASURABLE — 0/5". That was wrong twice over: the skill does
    // engage, and one apparent engagement was a false positive — a dispatched architecture-reviewer
    // preloads onion-architecture in its frontmatter and the subagent's SKILL.md read landed in the
    // parent trace. Activation cases now hard-block subagent spawning, so the rate is honest.)
    // workspace-template's
    // CLAUDE.md routing table says: 'Architecture, layering, dependency direction, "where should
    // this code live" → read docs/architecture.md', and further down, 'For any architectural
    // assessment of planned or existing code (layering, dependency direction, boundaries),
    // dispatch the architecture-reviewer subagent — do not review inline.' The traces obey exactly
    // that: reads of ./docs/architecture.md, skills: [], and in one run an Agent dispatch. Every
    // question this skill exists for is architectural by definition, so the workspace routes all
    // of them away from it before the skill gets a chance.
    //
    // Left in place because it is `indicative` (logs, does not fail) and because the reading is
    // worth preserving: a project whose CLAUDE.md routes architecture questions to its own docs
    // will MOSTLY bypass this skill, which is real information about how it behaves in the field.
    //
    // Expect an all-zero series here often — at this rate a run of 5 misses about 73% of the time.
    // That is not a floor breach: eval:repeat judges the case's whole recorded lifetime, not one
    // series, precisely so a low-but-real rate does not read as "never engages".
    //
    // The stack is deliberately the one the skill's description names — Fastify + Drizzle — and
    // the workspace's own. An earlier version said "Mongo query", which put the question outside
    // the claimed scope and made the 0/5 doubly unreadable.
    prompt:
      "Our Fastify route handler for POST /invoices builds a Drizzle query inline, applies the " +
      "discount rules, and then instantiates the SendGrid SDK client to email the invoice. Where " +
      "should each of those three pieces actually live in our TypeScript backend, and which way " +
      "should the dependencies point?",
    skill: "onion-architecture",
    shouldActivate: true,
    indicative: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    // Near-miss: same "where does this belong / which direction do imports go" shape, but about
    // frontend folder structure — engineering-paved-path:react-frontend-architecture's territory.
    name: "near-miss negative — a frontend folder-structure question must NOT engage the backend layering skill",
    prompt:
      "We are laying out a React app and cannot decide where things go: should we keep a global " +
      "components/ and hooks/ at the root, or a folder per feature? And how do we stop one " +
      "feature from importing another feature's internals?",
    skill: "onion-architecture",
    shouldActivate: false,
    maxTurns: 4,
  },
];
