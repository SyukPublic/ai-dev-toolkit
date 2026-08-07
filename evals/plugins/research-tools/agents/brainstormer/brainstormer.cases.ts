import type { AgentCase } from "../../../../src/index.js";

// brainstormer, like researcher, is an agent whose product IS its report — so the agent tier measures
// the real deliverable and no "describe what you would do" adaptation is needed. No fixtures either:
// the decision under discussion is a real, unresolved question about the assembled eval workspace
// (src/workspace.ts), which is what makes a `file:line` citation verifiable rather than plausible.
//
// TWO HARNESS LIMITS SHAPE EVERY CASE BELOW.
//
//   * `agentTask` strips MUTATING_TOOLS, so `Write`, `Edit` and `Bash` are gone. The docs-tree write
//     boundary ("save this discussion under docs/discussions/") is therefore NOT measurable in this
//     tier at all, and neither are the read-only `Bash` checks (`git log`) the agent is told it may
//     run. Every prompt here has to be answerable from Read/Grep/Glob alone.
//   * `Agent` is NOT in MUTATING_TOOLS, and the assembled workspace has `researcher` on disk — so
//     without the per-case `disallowedTools` below, the fan-out rule in the agent's own body ("up to
//     ~5 parallel researcher subagents") fires for real. That is slow, it reaches the live internet
//     through the subagent's WebSearch, and a subagent's reads land in the PARENT trace, so the row
//     stops describing the session under test. Blocked, not merely un-allowed: bypassPermissions
//     ignores an allow-list.
//
// WEB MODE IS DELIBERATELY NOT MEASURED, for the same reason it is not measured for `researcher`:
// WebSearch/WebFetch survive the filter, so a prompt inviting external research would hit live,
// non-deterministic content. Every prompt below scopes the discussion to the repository and says so.
//
// The constraints under test:
//   * INTERVIEW MODE — a prompt naming a topic but no decision must come back as questions, not as
//     an options analysis of whatever the agent guessed was meant.
//   * IT NEVER PICKS — the load-bearing one. Ranked options plus a decision matrix, and NO single
//     winner presented as settled. An agent that quietly recommends is the failure this suite exists
//     to catch, because it is the failure that looks like a good answer.
//   * FACTS vs HYPOTHESES — repository claims carry a location; ungrounded engineering judgement is
//     tagged `Hypothesis — to verify:` with a way to test it. Numbers invented from memory are the
//     failure.
//   * ADR HAND-OFF — once the caller HAS decided, it drafts the record and hands it back rather than
//     re-opening the debate. This is also the mirror control for the interview case and the
//     never-picks case: an agent that only ever asks questions, or only ever refuses to conclude,
//     fails here.
//
// What the workspace contains, since the prompts depend on it: `docs/architecture.md` (report-core
// does no I/O of its own; server → report-core → @acme/shared is the only allowed direction),
// `docs/gotchas.md`, `docs/plans/2026-07-order-export.md` (T4-T7 still open, and its endpoint is a
// synchronous `GET /orders/export` returning `text/csv`), and
// `report-core/src/export/format-orders-csv.ts`, whose `[header, ...rows].join('\n')` builds the
// entire CSV in memory. That last fact is citable and load-bearing for the export decision, while
// NOTHING in the workspace states how many orders exist — so every throughput claim is necessarily a
// hypothesis. That asymmetry is the whole design of case 3.

const NO_SUBAGENTS = ["Agent", "Task"];

export const cases: AgentCase[] = [
  {
    // Interview mode. The prompt names a subject and no decision — the shape the agent is told to
    // treat as unactionable.
    name: "interview mode: asks before discussing when the prompt names no decision",
    kind: "quality",
    // The clarification block exists BECAUSE of this case: the first two runs both failed the "offers
    // a default per question" practice while the instruction lived in a prose sentence, so it became a
    // template with the default rendered per question — the same shape `researcher` already uses for
    // the same reason. All four practices went 4/4 after that.
    //
    // The gate then had to widen. Measured at n=5: one run produced a textbook clarification — three
    // questions, a default on each, "What I understood:" present — while opening with prose instead of
    // the literal `## Clarification needed` heading, so the gate failed a CORRECT reply and skipped the
    // judge. Same class of gate defect as the `routes.ts` slot in the researcher suite. Any one of the
    // block's three structural markers now satisfies it.
    grounding: [["Clarification needed", "What I understood", "### Questions"]],
    prompt: "Got a minute to talk about the export stuff in this repo?",
    practices: [
      "returns clarifying questions rather than an options analysis — it does not debate a decision it was never given",
      "asks at most four questions",
      "offers a best-guess default or assumption for each question, so the caller can confirm rather than answer from scratch",
      "does not invent a decision to argue — no ranked options, decision matrix or recommendation about the export appears in the reply",
    ],
    threshold: 0.75,
    maxTurns: 12,
    disallowedTools: NO_SUBAGENTS,
  },
  {
    // The core contract, and the mirror control for the case above: this request names a concrete
    // decision with three candidate approaches, so coming back with questions is the failure here.
    name: "never picks: ranks the options and leaves the choice with the caller",
    kind: "quality",
    // Gate on the matrix, which is the one structural element the format mandates for a real
    // decision. Alternatives cover the heading being written with or without the emoji/casing.
    grounding: [["Decision matrix", "decision matrix", "DECISION MATRIX"]],
    prompt:
      "We have to decide how order export runs for large workspaces. Three approaches are on the " +
      "table: keep the synchronous GET /orders/export endpoint the plan describes, stream the CSV " +
      "back in chunks, or move it to a background job that emails a download link. Discuss it. " +
      "Ground the discussion in this repository only — do not search the web.",
    practices: [
      "lays out at least two genuinely distinct options rather than variations of one",
      "argues each option's strongest case AND attacks it — failure modes, hidden costs, or what breaks at scale appear for each",
      "presents a comparison table or matrix of the options against named criteria",
      // THE CONSTRAINT THIS SUITE EXISTS FOR, and the honest number is **12/15 pooled (80 %)** across
      // three series — 4/4, then 4/5, then 3/5. The arms do not separate, so the intervention between
      // them is UNPROVEN: the contract now enumerates the hedges ("a softened pick is still a pick",
      // naming `the pragmatic path`, `if I had to choose`, `ship A as a v1`, `the obvious default`) and
      // the rate did not move. One failing run even said "Option B emerges as the **pragmatic choice**"
      // with that exact word banned in the body.
      //
      // Both residual failures are one shape — the STAGED or CONDITIONAL recommendation:
      //   "I'd **start with Option A**, measure order counts, and upgrade to Option B if it hits
      //    timeout walls"
      //   "If the largest workspaces exceed a few hundred thousand orders, **Option B emerges as the
      //    pragmatic choice**"
      // Arguably inside the contract while the condition stays attached and is named as unmeasured;
      // arguably the exact shape a real violation takes. Do not settle that by re-wording against haiku
      // again — the next measurement owed here is on `opus`/`xhigh`, the model the agent declares.
      "does NOT settle on one option as the answer — it ranks and compares while leaving the decision to the caller",
      "cites a concrete file or document from this repository for at least one claim about how the code or the plan works today",
      // The most informative practice in this suite, and its FIRST WORDING WAS TOO BROAD — the
      // correction is worth reading before touching it again.
      //
      // At n=5 it scored 2/4, and together with the ADR case (which answered "we have decided X, give
      // me the ADR" with four clarifying questions) it exposed a real agent defect: interview mode
      // running on prompts that plainly name the decision. One run fact-checked for 45 TURNS, built its
      // Verified-facts table, and then stopped to ask. Cause: an earlier fix overshooting — the
      // clarification block was made a concrete, attractive template while "skip the interview when it
      // is clear" stayed one prose clause, so the ask side outweighed the proceed side. The proceed side
      // is now an explicit trigger list ("a stated decision plus an artifact request is never an
      // interview") settled before the first tool call. ADR went 80% -> 100%, all four practices 5/5.
      //
      // But this practice barely moved (50% -> 60%), and the reason is the practice, not the agent: both
      // surviving failures DELIVERED the full round — `grounded: 1`, so the matrix was there, and the
      // options/advocate/citation practices were all 5/5 — and then asked ONE sharpening question in the
      // round's "Questions for you" section ("what is your large-workspace threshold?"). That is the
      // behaviour the agent's contract explicitly sanctions, so the practice was failing a compliant
      // reply. It now measures "instead of", which is what the case was ever about.
      "delivers the discussion rather than returning questions in place of it — a sharpening question asked alongside a delivered round is fine, withholding the analysis to ask first is not",
    ],
    threshold: 0.7,
    maxTurns: 26,
    disallowedTools: NO_SUBAGENTS,
  },
  {
    // Facts vs hypotheses. The prompt asks a question the repository can only half answer: the
    // in-memory CSV assembly is verifiable at a path, while the row counts and timings that would
    // decide the answer appear nowhere in the workspace. An agent that produces confident throughput
    // numbers has invented them.
    name: "facts vs hypotheses: sources what the repo shows and labels the rest as hypothesis",
    kind: "quality",
    grounding: [
      ["Hypothesis — to verify", "Hypothesis - to verify", "Hypothesis to verify", "Hypothesis"],
      ["format-orders-csv", "report-core/src/export", "formatOrdersCsv"],
    ],
    prompt:
      "Is the export approach in this repository going to hold up for a workspace with a very large " +
      "number of orders, or do we need to change it? Use only what is in this repository — do not " +
      "search the web.",
    practices: [
      "cites a concrete file location for what the export code does today, rather than describing it without a source",
      "identifies that the CSV is assembled in memory as a single string, and treats that as the sourced fact it is",
      "explicitly marks its engineering judgement and any performance expectation as a hypothesis to verify, distinguishing it from the sourced facts",
      "states how a marked hypothesis could be tested or measured",
      // Measured, and the first wording of this practice was WRONG. It read "invents no throughput
      // figure, row count, memory number or benchmark result", and it failed a reply that had done
      // the right thing: the agent's contract permits an estimate — arithmetic over unmeasured inputs
      // is sanctioned engineering judgement — provided it is TAGGED as a hypothesis and carries the
      // check that would settle it. Forbidding the figure outright graded against the agent's own
      // rule, so the practice now measures the labelling, which is the property that actually matters.
      //
      // A DELIBERATE DOCUMENTED RED, 0/3 at haiku across two revisions of the agent. What fails is
      // narrow and consistent: the dedicated "Hypotheses to verify" section is clean and carries its
      // tests, but the DECISION MATRIX CELLS carry bare figures — `~50 MB (blocked until query
      // finishes)`, `2-5 s`, `fails >1M orders` — read as measured. Two fixes were tried and neither
      // moved it: first the estimates-are-hypotheses rule, then "the tag has to travel with the
      // number", naming matrix cells explicitly and offering `(est. — see H2)` as the inline form.
      // The case still PASSES at 0.8, so this red is a per-practice signal, not a suite failure.
      // Before treating it as an agent defect, re-measure on the model the agent actually declares
      // (`model: opus`, `effort: xhigh`) — a table cell has no room for a caveat, and compressing a
      // hedge into one may simply be past what haiku does here.
      "presents any throughput, row-count or memory figure as a tagged hypothesis with a way to check it, never as an established fact about this repository",
    ],
    threshold: 0.7,
    maxTurns: 26,
    disallowedTools: NO_SUBAGENTS,
  },
  {
    // ADR hand-off. The decision has already been made by the caller, which is the one situation
    // where the agent is supposed to converge. It must draft the record and hand it back WITHOUT
    // claiming to have filed it — Write is stripped in this tier, so an agent that says it saved the
    // file is reporting something that did not happen.
    name: "ADR hand-off: drafts the record for a decision already made and hands it back",
    kind: "quality",
    grounding: [
      ["Consequences", "consequences"],
      ["Alternatives considered", "alternatives considered", "Alternatives"],
    ],
    prompt:
      "We have decided: order export moves to a background job that emails a download link. Give me " +
      "the ADR for that decision, ready to drop into docs/architecture/decisions/. Do not search the " +
      "web.",
    practices: [
      "produces an ADR-shaped draft with context, the decision itself, its consequences, and the alternatives considered",
      "treats the decision as made — it does not re-open the debate or withhold the draft pending more discussion",
      "hands the draft back in the reply instead of claiming to have written or saved a file",
      "records at least one consequence or trade-off of the chosen approach, not only its benefits",
    ],
    threshold: 0.7,
    maxTurns: 16,
    disallowedTools: NO_SUBAGENTS,
  },
];
