import type { AgentCase } from "../../../../src/index.js";
import { fixtureReader } from "../../../../src/index.js";

const fx = fixtureReader(import.meta.url);

// This agent is the best fit the agent tier has: implementation-planner's product is a DOCUMENT, so
// the read-only tier measures the real deliverable rather than a description of one. What it cannot
// measure is the on-disk half of the contract — that the plan lands at docs/plans/<feature>.md and
// that an existing plan is edited in place with filled Commit cells preserved. Those need write
// access; here the plan is returned in the reply.
//
// The constraints under test are the ones a raw model does not have:
//
//   * INPUT GATE — an approved spec is required. A draft (any [NEEDS CLARIFICATION] marker) means
//     STOP and advise spec-creator; it must not be patched with invented requirements.
//   * STOP-AND-ASK, PASS 1 — if the execution mode is missing, return blocking questions (always
//     including multi-agent vs single-agent) and write no plan. Not even a "provisional" one.
//   * THE GATES MUST NOT ALWAYS FIRE — with an approved spec and the mode supplied, a plan is
//     required. That is the control, and it is why the third case exists.
//   * TRACEABILITY — every task maps to AC-IDs.
//
// Fixtures, and the traps in them:
//   * spec-draft.md is a DRAFT: AC-4 and AC-5 carry [NEEDS CLARIFICATION]. The schedule and the
//     conversion-failure behaviour are exactly the things a model likes to decide for itself, which
//     is the failure the gate exists to prevent.
//   * spec-approved.md is clean: zero markers, and every user story covered by an acceptance
//     criterion — AC-7 exists because an earlier version left US-3 (unsubscribe) uncovered, and the
//     agent rightly refused to plan past it. See the note at the bottom of this file.
//
// Grounding never gates on an AC id: the playbook records ["AC-5","AC-6"] failing a flawless
// traceability matrix, because the artifact numbers its own rows and quotes requirement text.

const READ_ONLY = `This eval session is READ-ONLY — you have no Write or Edit tools and cannot create
the plan file. Return whatever you would have written as your final reply instead: if you would write
a plan, give the plan's full content in the reply; if your protocol says stop and ask, return exactly
that instead of a plan.

The spec is provided inline below — treat it as already read at the path given. Assume the host
project is a TypeScript monorepo with a Fastify server package and a React client package, and that
you have already read its CLAUDE.md.`;

export const cases: AgentCase[] = [
  {
    // Gate 1: a draft spec must stop the run. Kept separate from the execution-mode gate so a miss
    // is attributable to one gate rather than to "some gate fired".
    name: "input gate: refuses to plan from a spec that still has open clarifications",
    kind: "quality",
    // Measured: gating on the literal "spec-creator" failed a textbook-correct refusal. The agent
    // opened with "The input gate failed — the spec contains two explicit [NEEDS CLARIFICATION]
    // markers ... I cannot write a plan until these are resolved" and listed its blocking questions,
    // but paraphrased the referral instead of naming the agent. Gate on the refusal, which is the
    // behaviour under test; whether it names spec-creator stays a judged practice that can miss
    // without voiding the case.
    grounding: [["cannot write a plan", "input gate", "Blocking question", "blocking question"]],
    prompt: `Create the development plan for the invoice reminder digest, from the spec at
docs/specs/SPEC-014-invoice-reminder-digest.md. Execute as multi-agent.

${READ_ONLY}

${fx("spec-draft.md")}`,
    practices: [
      "refuses to produce a development plan, and says so explicitly rather than returning a partial or provisional plan",
      "names the unresolved clarifications in the spec as the reason it stopped — the digest schedule and the conversion-provider-failure behaviour",
      "sends the spec back to be completed before planning — naming spec-creator, or otherwise saying the spec must be resolved and re-approved first",
      "does NOT decide the open questions itself — it does not pick a schedule or a fallback behaviour and carry on planning as if the spec had said so",
    ],
    threshold: 0.75,
    maxTurns: 20,
  },
  {
    // Gate 2: the execution mode. The spec here is APPROVED, so the only thing that may stop the run
    // is the missing mode — which makes this case discriminating rather than a rerun of gate 1.
    name: "stop-and-ask: asks for the execution mode instead of guessing it",
    kind: "quality",
    grounding: [["single-agent", "single agent"]],
    prompt: `Create the development plan for the invoice reminder digest, from the approved spec at
docs/specs/SPEC-014-invoice-reminder-digest.md.

${READ_ONLY}

${fx("spec-approved.md")}`,
    practices: [
      "asks whether to execute as multi-agent with parallel implementers or as a single sequential agent",
      "returns its questions instead of a plan, and does not write a provisional or partial plan alongside them",
      "gives a recommended answer for the question it asks rather than only posing it",
      "accepts the spec itself as approved — it does not claim the spec is a draft or that requirements are missing",
    ],
    threshold: 0.75,
    maxTurns: 20,
  },
  {
    // Pass 2: spec approved AND mode supplied, so the gates must NOT fire. This is where the plan's
    // own structure is measured, and it is also the control that proves the gates above discriminate
    // rather than always stopping.
    name: "plans against an approved spec with traceable tasks once the mode is given",
    kind: "quality",
    grounding: [["Traceability", "traceability"]],
    prompt: `Create the development plan for the invoice reminder digest, from the approved spec at
docs/specs/SPEC-014-invoice-reminder-digest.md. Execute as multi-agent with parallel implementers.

${READ_ONLY}

${fx("spec-approved.md")}`,
    practices: [
      "produces the plan rather than stopping to ask — the spec is approved and the execution mode was supplied, so neither gate applies",
      "breaks the work into phases, and states for each phase whether its tasks can run in parallel or must be sequential",
      "maps its tasks back to the spec's acceptance criteria, so each task states which criteria it satisfies",
      "assigns a test to the criteria it covers rather than leaving verification unstated",
      "does not write production code — it describes the work to be done rather than emitting the implementation itself",
    ],
    threshold: 0.7,
    maxTurns: 25,
  },
];

// A FOURTH CASE WAS ATTEMPTED AND REMOVED — "reports a non-blocking spec finding without stopping".
// It is recorded here rather than left in place, because the dimension is real but this fixture cannot
// measure it, and an undiscriminating case is worse than no case.
//
// The idea was to plant an imperfection in the approved spec that a reviewer should report as a
// recommendation while still producing the plan, proving the stop-and-ask gates discriminate instead of
// firing whenever anything is imperfect. Both plants failed, for the same underlying reason:
//
//   1. US-3 (unsubscribe) covered by no acceptance criterion. The agent stopped and called it a
//      blocking specification gap — correctly. A whole user story with no AC needs a preference store,
//      an endpoint and digest-time filtering, which is design, so it is what "ambiguous in a way that
//      changes the design" means. AC-7 was added to the fixture in response.
//   2. AC-6, "renders correctly as both HTML and plain text", as a weakly-testable criterion. The agent
//      answered "All 7 ACs are testable and deterministic" and planned. Also defensible: a competent
//      engineer operationalises that as "both renderings exist and both contain the invoice rows".
//
// Whether an imperfection is blocking is itself an engineering judgement, so a practice asserting one
// answer grades the case author's opinion rather than the agent's contract. The planning case above
// already proves the gates do not always fire — it supplies an approved spec and an execution mode and
// requires a plan — which is the part of this dimension that IS objective. Do not re-add a variant of
// this case without a plant whose blocking status is a FACT rather than a call.
