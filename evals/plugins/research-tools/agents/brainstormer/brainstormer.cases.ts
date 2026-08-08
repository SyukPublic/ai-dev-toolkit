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
// MEASURE THIS SUITE ON THE MODEL THE AGENT DECLARES. `brainstormer` declares `model: opus` and
// `effort: xhigh`, and the tier honours neither on its own — the definition is injected as a system
// prompt, so the frontmatter is prose to the session. With `EVAL_MODEL=claude-opus-5
// EVAL_EFFORT=xhigh` all four cases are 5/5 and every practice sits at 5/5 except one at 4/5; at the
// default haiku, two practices were stable reds and neither survived contact with the declared model.
// Both are annotated below. The cost of being right about it: `never picks` runs 35 turns / 246 s /
// 17.2k output tokens at opus-xhigh against 37 / 79 s / 5.9k at haiku, so a full n=5 series is over
// two hours. Use haiku for wiring and regressions; reach for opus-xhigh before believing a red.
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
      // Reworded after the first opus/xhigh row failed it, and the failure was the PRACTICE fighting
      // the agent's own template: the clarification block ends with a mandatory
      // "### What I'll discuss once answered" line, and the judge read that promise ("then argue out
      // the genuinely distinct options — advocate and red-team each — and hand back ranked…") as the
      // analysis itself. Naming what it WILL weigh is required output, not a leaked verdict.
      "does not deliver the options analysis it was not yet asked for — no ranked options, no decision matrix and no recommendation about the export; naming what it will weigh once answered is expected and does not count",
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
      // THE CONSTRAINT THIS SUITE EXISTS FOR — and the model is what decides it, not the wording.
      //
      // At haiku: **12/15 pooled** across three series (4/4, 4/5, 3/5), arms indistinguishable. The
      // contract was made to enumerate the hedges ("a softened pick is still a pick", naming
      // `the pragmatic path`, `if I had to choose`, `ship A as a v1`) and the rate did not move — one
      // failing run used the banned phrase verbatim. Every residual failure was one shape, the staged or
      // conditional recommendation: "I'd **start with Option A**, measure order counts, and upgrade to
      // Option B if it hits timeout walls".
      //
      // At `claude-opus-5` + `EVAL_EFFORT=xhigh`: **5/5**, all six practices of this case 5/5. So the
      // hedged pick was a haiku behaviour. The enumerated-hedges paragraph stays in the contract — it
      // costs nothing and it names a real failure mode — but do NOT credit it with a rate improvement,
      // and do not tune this practice against haiku.
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
    // The first slot cost this case three runs at opus/xhigh and every one of them was a GATE defect:
    // all three carried the template's `### 🔬 Hypotheses to verify` heading and **zero** occurrences
    // of the singular "Hypothesis" (the plural is not a superstring of it), so `grounded: 0.5` and the
    // judge never ran — on replies whose hypothesis sections were the best this suite has produced
    // ("Any figure I could give you would be arithmetic over inputs nobody has measured", five numbered
    // items each with a **Check:**). The plural heading is now the primary alternative.
    grounding: [
      ["Hypotheses to verify", "Hypothesis — to verify", "Hypothesis - to verify", "Hypothesis"],
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
      // RESOLVED, AND IT WAS A MODEL CEILING — the most useful thing this suite established.
      //
      // At haiku it was **0/5**, stable across two revisions of the rule (the estimates-are-hypotheses
      // rule, then "the tag has to travel with the number", which named matrix cells explicitly). The
      // failures were always the same: a clean "Hypotheses" section alongside bare `~50 MB`, `2-5 s`,
      // `fails >1M orders` in the DECISION MATRIX CELLS. It was recorded as a deliberate red with the
      // note "re-measure on the model the agent declares before calling it an agent defect".
      //
      // Measured: `claude-opus-5` + `EVAL_EFFORT=xhigh` (see EVAL_EFFORT — the agent tier could not
      // honour `effort: xhigh` frontmatter until that knob existed), **6/7**. So neither rule revision
      // was the fix and neither was wrong; compressing a hedge into a table cell was simply past what
      // haiku does. **Do not "fix" this practice against haiku.** Anything measured here at 0/5 while
      // the declared model sits near-perfect is a statement about the eval model, not the artifact.
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
