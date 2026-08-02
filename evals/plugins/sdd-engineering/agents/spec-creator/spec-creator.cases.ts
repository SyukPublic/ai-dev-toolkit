import type { AgentCase } from "../../../../src/index.js";
import { fixtureReader } from "../../../../src/index.js";

const fx = fixtureReader(import.meta.url);

// These cases target the finalization coverage gate: spec-creator must not move a spec to
// `Status: approved` while a MANDATORY requirement (an in-scope user story / stated must-have in
// Goals) has no acceptance criterion (self-check item 11). The fixtures are built to isolate that
// one signal: both drafts are otherwise finalization-clean — zero [NEEDS CLARIFICATION], every AC
// EARS-tagged with a Traceability row, diagram explained — so nothing ELSE blocks approval.
//
// Discriminating design: the pre-existing self-check verified the AC→Story direction only ("every
// non-removed AC has a Story"), which the uncovered fixture PASSES — US-3 (the cancellation
// confirmation notification, a stated Goals must-have) simply appears in no AC and no Traceability
// row. Only the Story→AC coverage gate catches it, so a model without the gate happily approves.
//
// agentTask strips mutating tools (Write/Edit/Bash), so the prompts ask for the finalization
// VERDICT + self-check report — the exact surface the gate changes — instead of a file edit.

const finalizePrompt = (spec: string) => `The user has reviewed the draft spec below and replied:
"Approved — finalize it."

Current content of docs/specs/SPEC-2026-07-10-order-cancellation.md:

${spec}

This eval session is read-only — do NOT write or edit any file. Run your final
self-check on the spec as it stands and report, in your standard report format,
whether the spec may move to \`Status: approved\`. If it may not, name exactly
what blocks it and how you would resolve it.`;

export const cases: AgentCase[] = [
  {
    name: "refuses to approve while a mandatory requirement has no acceptance criterion",
    kind: "quality",
    prompt: finalizePrompt(fx("order-cancellation-uncovered.md")),
    // Cheap deterministic gate before the judge: the uncovered story must at least be named.
    grounding: ["US-3"],
    practices: [
      "refuses to move the spec to Status: approved — the verdict is that the spec is not eligible for approval / must stay draft, despite the user's explicit confirmation",
      "identifies US-3 (the cancellation confirmation notification) as a mandatory requirement with no acceptance criterion covering it — naming the specific uncovered requirement, not just saying coverage is incomplete",
      "proposes a concrete resolution: add the missing acceptance criterion under the next free append-only AC-ID (AC-5 or higher) or record an explicit [NEEDS CLARIFICATION] — without renumbering any existing AC",
      // The gate must not become an excuse to nitpick: the fixture passes every other check.
      "reports the missing US-3 coverage as the blocking failure — it does not invent additional blocking self-check failures or [NEEDS CLARIFICATION] items for a spec that otherwise passes",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    // Backward-compat control: full Story→AC coverage → the new gate must stay silent and the
    // finalization verdict must be YES, not a fabricated coverage gap.
    name: "does not fabricate a coverage gap when every mandatory requirement has an AC",
    kind: "quality",
    prompt: finalizePrompt(fx("order-cancellation-covered.md")),
    practices: [
      "concludes the spec passes the final self-check and may move to Status: approved (the user's explicit confirmation is present)",
      "does not claim any mandatory requirement lacks acceptance-criterion coverage — no fabricated coverage gap for US-1, US-2, or US-3, and no invented blocking issue",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
];
