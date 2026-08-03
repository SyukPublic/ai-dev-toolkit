import type { AgentCase } from "../../../../src/index.js";

// researcher is the one agent whose product IS a report, so the read-only tier measures the real
// deliverable — no "describe what you would do" adaptation is needed, and no fixtures either: the
// PROJECT cases search the assembled eval workspace (src/workspace.ts) for real, which is what makes
// a file:line citation verifiable rather than plausible.
//
// WEB MODE IS DELIBERATELY NOT MEASURED. agentTask grants the agent's declared frontmatter tools
// minus the mutating ones, so WebSearch and WebFetch survive and a web case would hit the live
// internet: non-deterministic content, and slow enough to matter (a near-miss activation negative
// once spent 199s inside a researcher session with WebSearch). What is measured here is the half that
// is stable — interview discipline, PROJECT search, and the honesty rules on the report shape. If a
// web case is ever added, expect its findings to be unassertable and gate only on the report's
// structure.
//
// The constraints under test:
//   * INTERVIEW MODE — a prompt with no concrete question must produce the "Clarification needed"
//     block and STOP, with a default offered per question. Guessing is the failure.
//   * SKIP THE INTERVIEW WHEN CLEAR — the mirror control. An agent that asks every time passes the
//     case above for the wrong reason, so the specific request must NOT come back as questions.
//   * HONESTY — "Not found" is never omitted, and a missing thing is reported as missing rather than
//     approximated from something adjacent.
//   * CITATION — every PROJECT finding cites a concrete file:line it actually opened.
//
// What the workspace contains, since the prompts depend on it: CLAUDE.md, docs/architecture.md,
// docs/api-guidelines.md, docs/gotchas.md, docs/plans/2026-07-order-export.md, and
// server/src/modules/orders/{routes.ts,service.ts}. routes.ts exposes GET /orders, GET /orders/:id and
// POST /orders/:id/refunds, and its own comment says "(No export endpoint yet.)" while a PLAN for
// that endpoint does exist — which is why the export question below has a genuinely two-part answer.
// Nothing in the workspace mentions Stripe or webhooks, which is what makes that a clean
// "not found" target rather than a trick.

export const cases: AgentCase[] = [
  {
    // Interview mode. The prompt names a topic and no question — the shape the agent is told to
    // treat as unactionable.
    name: "interview mode: asks before researching when the request has no concrete question",
    kind: "quality",
    grounding: ["Clarification needed"],
    prompt: "Can you take a look into the payments side of things for us?",
    practices: [
      "returns its clarifying questions rather than a research report — it does not report findings about payments",
      "asks at most four questions",
      "offers a best-guess default or assumption for each question it asks, so the caller can confirm rather than answer from scratch",
      "does not guess what was meant and research it anyway — no findings, file citations or conclusions about payments appear in the reply",
    ],
    threshold: 0.75,
    maxTurns: 12,
  },
  {
    // PROJECT mode against the real workspace, and the mirror control for the case above: this
    // request is specific, so coming back with questions is the failure here.
    name: "project mode: answers a specific question from the code and cites where",
    kind: "quality",
    // Measured: gating on the literal "routes.ts" failed a correct report. It carried the PROJECT
    // heading, named all three routes and said "No export endpoint currently exists", but wrote its
    // scope as `server/src/modules/orders/` — "routes and service files" — without ever spelling the
    // filename. Gate on the mode marker plus a route string it can only produce by having read the
    // code; whether the citation is precise enough is the judge's call, not the gate's.
    grounding: ["PROJECT", ["/orders/:id/refunds", "/orders/:id", "refunds"]],
    prompt:
      "Which HTTP routes does the orders module expose in this repository, and is there an endpoint " +
      "for exporting orders?",
    practices: [
      "researches instead of asking for clarification — the request is specific enough to act on",
      "lists the orders routes it found, including the refund route as well as the two GET routes",
      "cites a concrete file location for the routes it reports rather than describing them without a source",
      "states that no export endpoint is implemented, rather than presenting one as existing",
      "marks the report as PROJECT-scope research",
    ],
    threshold: 0.7,
    maxTurns: 15,
  },
  {
    // Honesty. The target genuinely does not exist anywhere in the workspace, and something
    // superficially adjacent does (the refund route), which is the bait: an agent that pattern-matches
    // "payments" onto refunds will report a finding that is not an answer.
    name: "honesty: reports the missing subject as not found instead of approximating it",
    kind: "quality",
    // Measured: at maxTurns 15 this case never reached its report at all. Proving a thing is ABSENT
    // costs far more search turns than finding one that is present — the run spent every turn on
    // Grep/Glob/Read and was cut off mid-search, leaving only "Let me search more broadly…" narration
    // and therefore no "Not found" section to gate on. The cap was the defect, not the agent.
    grounding: [["Not found", "not found", "no Stripe", "No Stripe"]],
    prompt:
      "Find where this repository handles Stripe webhooks, and how it verifies the webhook " +
      "signature. Report what you find, and if it is not there say so — a short search is enough, " +
      "do not exhaust the repository before reporting.",
    practices: [
      "states plainly that it found no Stripe webhook handling in the repository",
      "says where it looked or what it searched for, rather than only asserting absence",
      "does not present the orders refund route as if it were the Stripe webhook handling that was asked about",
      "invents no file path, line number or function name for the missing handler",
      "gives a confidence level with a reason for it",
    ],
    threshold: 0.75,
    maxTurns: 30,
  },
];
