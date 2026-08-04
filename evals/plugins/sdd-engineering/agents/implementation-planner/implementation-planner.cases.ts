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

// A prompt here may state a CONSTRAINT but never a FACT about the repo, because this tier runs in the
// assembled workspace and the agent can go and look. This preamble used to add "Assume the host
// project is a TypeScript monorepo with a Fastify server package and a React client package" —
// workspace-template/ has one server/src/modules/orders/ module and zero .tsx files. Measured on
// sonnet (planner-sonnet-n5): it globbed for the client, found nothing, and refused to plan on
// fabricated paths under its own "no source -> no claim" rule. Haiku passed the same case by taking
// the sentence at face value, which is what made the n=2 smoke look green. The host project is
// whatever the workspace actually contains; the agent reads CLAUDE.md itself.
const READ_ONLY = `This eval session is READ-ONLY — you have no Write or Edit tools and cannot create
the plan file. Return whatever you would have written as your final reply instead: if you would write
a plan, give the plan's full content in the reply; if your protocol says stop and ask, return exactly
that instead of a plan.

The spec is provided inline below — treat it as already read at the path given. Ground your answer in
this project as you find it; the feature's domain is new to the codebase, which is expected.`;

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
      // Was "does NOT decide the open questions itself — it does not pick a schedule or a fallback
      // behaviour and carry on planning as if the spec had said so". Measured 2/4 on sonnet, failing
      // on "Recommendation: default to a global daily cadence…" — but the agent then STOPPED, which
      // satisfied the conjunction's real intent. The agent's contract MANDATES the recommendation
      // ("each with why it blocks and your recommended answer", agent body Pass 1), and the same
      // suite's stop-and-ask case rewards it at 4/4, so the old wording had this suite scoring one
      // behaviour in both directions. What the contract actually forbids is silently ADOPTING an
      // answer: "a gap is a question or a recommendation, not something you silently patch."
      "treats the open questions as questions — it may recommend an answer, but does not adopt one as though the spec had settled it and plan on top of it",
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
    // Both negative practices here were compound, and both failed on behaviour the agent's contract
    // REQUIRES. Measured on sonnet after the preamble fix (planner-sonnet-fix-a):
    //   * "does not write a provisional or partial plan alongside them" — 1/4, failing on citations
    //     like "the plan will need to introduce, not reuse: an invoices/billing module…". That is a
    //     requirements-review finding, and Pass 1 says to return "your requirement-review findings
    //     and improvement recommendations gathered so far". What is forbidden is narrower and
    //     concrete: a plan FILE — "Do not produce a 'provisional' plan file."
    //   * "or that requirements are missing" — 2/4, failing on "I'd flag this back to spec-creator …
    //     but it doesn't need to block planning". The contract: "If you believe the spec is wrong or
    //     incomplete, that is a question or a recommendation back to the caller."
    // So both halves are re-scoped to the artifact rather than to the topic.
    practices: [
      "asks whether to execute as multi-agent with parallel implementers or as a single sequential agent",
      "returns blocking questions rather than a development plan — no phased task breakdown and no traceability matrix",
      "gives a recommended answer for the question it asks rather than only posing it",
      "does not treat the spec as failing the input gate — it does not call it a draft or say it has unresolved [NEEDS CLARIFICATION] markers",
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
      // Was "does not write production code — it describes the work to be done rather than emitting
      // the implementation itself". It passed 100% only while the case was broken: until the preamble
      // was fixed the agent refused to plan, so it never emitted anything to judge. The first series
      // where the plan actually got written (planner-sonnet-fix-c) put it at 2/5, and both failure
      // modes are behaviour this agent's contract REQUIRES in the multi-agent mode this case supplies:
      //   * "export default async function ordersRoutes(app: FastifyInstance) { const service = new
      //     OrdersService(app.container);" — the mandated VERBATIM lift of the workspace's own
      //     server/src/modules/orders/routes.ts into the Shared scaffold. The agent body: "every
      //     multi-agent plan MUST hand implementers READY FRAGMENTS ... lifts the reusable boilerplate
      //     VERBATIM", and "embed the COMPLETE function body".
      //   * "export interface CurrencyConversionProvider { convert(...) }" — a port signature, i.e.
      //     the Design step of the working loop, not an implementation.
      // The prohibition it was reaching for is file-level ("Do not edit, create, or delete any source,
      // config, or test file") and cannot fire in a read-only session at all. So judge the DELIVERABLE:
      // a plan whose code is cited context or a contract, versus the finished feature.
      "delivers a plan, not the feature — any code it includes is cited existing context or an interface contract, not the working implementation",
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
