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

// The preamble states a CONSTRAINT, never a fact about the repo. It used to open "Current content
// of docs/specs/SPEC-2026-07-10-order-cancellation.md:", and `docs/specs/` does not exist in
// workspace-template at all — `docs/` holds api-guidelines.md, architecture.md, gotchas.md and
// plans/. This tier runs in the assembled workspace with Read/Grep/Glob, so that was the planner's
// and the implementer's false-premise defect a third time: a strong model goes and looks, finds the
// path missing, and can legitimately refuse to certify a spec it cannot locate — a false red, and
// one that only shows up on the model the agent actually declares (`model: opus`).
//
// Putting the file on disk is not the fix here, unlike the implementer case: the two cases feed
// DIFFERENT fixtures (covered / uncovered) through the SAME path, so any on-disk file would
// contradict one of them. Naming no path is the only coherent option, and it costs nothing — the
// spec text is supplied in full, which is all either case needs.
//
// The scope clause exists because premise-chasing here is WHACK-A-MOLE, measured twice. This fixture
// describes a feature whose domain is richer than `workspace-template` models, and every premise
// fixed exposes the next one down: with ownership rescoped to `workspaceId`, the deep runs moved
// straight on to `pending` not being an established status value (schema.ts has a bare
// `text('status')`, no enum) — a mismatch that had been there all along and had simply been
// outranked. Each round of that costs ~10 sessions and never converges.
//
// The clause is a CONSTRAINT, not a false claim, and the shipped contract is what justifies it: all
// ELEVEN self-check items (`spec-creator.md:297-326`) are internal to the document — IDs, EARS tags,
// coverage, traceability, status coherence — and the definition says "Any failing item is a HARD
// blocker", enumerating exactly those. So a run that blocks on something it found by reading the
// repository is adding a twelfth blocker the contract does not have. One failing run said so in its
// own words: "Additional blocking finding (outside the numbered checklist, found via codebase
// inspection)". Both cases carry the clause, so no future premise mismatch can bite either one.
//
// ~~AGENT-SIDE CANDIDATE~~ **RETRACTED on the declared model. Do NOT propose a `spec-creator.md`
// change for this.** The hypothesis was that the over-blocking is a real gap — the checklist says
// what blocks but never what to do with a finding outside it, the same "an enumeration quietly
// narrows the instruction" shape as `architecture-review` 1.0.1, inverted.
//
// `spec-creator-opus-probe`, `EVAL_MODEL=claude-opus-5` (the model the agent declares), this case,
// n=5, WITH THE SCOPE CLAUSE REMOVED so the behaviour had every chance to appear: **5/5, all four
// practices 5/5**, and the trace is the finding — `turns: 1`, `tools: []`, `reads: []` in every one
// of the five runs. Opus never opened the repository at all. It read the document question as a
// document question and answered it, so there was no out-of-checklist finding to mishandle.
//
// So the definition holds at the declared model with no help from the case, and the behaviour is a
// MID-TIER exploration artifact. Note the ordering is not monotonic in capability, which is the
// opposite of the pattern these notes usually record: sonnet explored (2 of 5 runs, 18-20 turns,
// 6-11 files) and over-blocked; opus explored less and judged better. The usual shape is a weaker
// model passing falsely BY not looking — here the stronger model was right not to look, because
// nothing in the task needed the codebase.
//
// The scope clause therefore stays, with its purpose corrected: it is not papering over a definition
// gap, it removes a mid-tier exploration confound from a document-level measurement. It is redundant
// at `opus` and load-bearing at the model this suite is actually calibrated on.
//
// Limit, stated so it is not overread: n=5 on opus cannot separate 20% from 5%. "Never in five runs"
// means NOT CONFIRMED, not "cannot happen".
const finalizePrompt = (spec: string) => `The user has reviewed the draft spec below and replied:
"Approved — finalize it."

The draft is given here in full. It is not on disk in this session, so treat the text
below as the spec itself rather than looking for a file to read:

${spec}

Scope for this answer: run the final self-check on the SPEC DOCUMENT. All eleven items
are internal to the spec (IDs, EARS tags, coverage, traceability, status coherence), so
you do not need the codebase to run them — do not treat what the repository does or does
not already implement as a self-check failure.

This eval session is read-only — do NOT write or edit any file. Run your final
self-check on the spec as it stands and report, in your standard report format,
whether the spec may move to \`Status: approved\`. If it may not, name exactly
what blocks it and how you would resolve it.`;

// The out-of-checklist dimension, and it needs its own preamble: the one above DE-SCOPES the
// codebase, which is the opposite of what this case measures. Grounding is asked for explicitly
// rather than left to chance, because the propensity to explore is not the thing under test — what
// happens to a finding once it exists is. Measured: sonnet explored unprompted in 2 of 5 runs and
// opus in 0 of 5, so an implicit version of this case would mostly measure nothing.
//
// The fixture is the COVERED spec, which passes all eleven items, and its mismatch against the
// workspace is decidable rather than a matter of taste: the Contracts table says the `status` field
// is an "existing enum" gaining a terminal value, and `platform/schema.ts` declares
// `status: text('status').notNull()` — a plain text column with no enum anywhere. So the spec is
// finalization-clean AND factually wrong about the code, which is exactly the situation the eleven
// items do not cover.
const groundedFinalizePrompt = (spec: string) => `The user has reviewed the draft spec below and
replied: "Approved — finalize it."

The draft is given here in full. It is not on disk in this session, so treat the text
below as the spec itself rather than looking for a file to read:

${spec}

Before you answer, ground the spec against this repository: check that the contracts and
dependencies it describes as already existing really do exist as described.

This eval session is read-only — do NOT write or edit any file. Then run your final
self-check and report, in your standard report format, whether the spec may move to
\`Status: approved\`.`;

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
    //
    // This control measured 1/5 on sonnet (`spec-creator-sonnet-n5`) and the agent was right in
    // three of the four failures. The covered fixture's Non-functional section read "only the order
    // owner (OR AN ADMIN) may cancel" — and an admin cancelling appears in no Goal, no user story
    // and no AC, while AC-3 rejects any non-owner and the request contract requires "an order owned
    // by the caller". So the parenthetical planted an undeclared capability that the spec then
    // contradicts twice. Three runs found exactly that, independently and in nearly the same words:
    // "a de facto requirement not declared as a Goal or User story, has no AC", "an uncovered (or
    // contradicted) capability", "a genuine mandatory-requirement-without-AC gap (or … an
    // incorrect/contradictory line in the spec)". The fixture was built to be otherwise
    // finalization-clean so this gate is the only signal, and it was not. The parenthetical is gone.
    //
    // The fourth failure is a different complaint, and it splits — checked so it is not re-opened
    // wholesale in either direction:
    //
    //   REJECTED. That run concluded the spec's requirements "don't map onto anything the current
    //   domain model actually has". Mostly they do: `server/src/modules/orders/` exists with routes
    //   and service, and the `orders` table really carries a `status` column (platform/schema.ts:12),
    //   which is what the spec's provenance and its "status enum gains a terminal value" line claim.
    //   The admin view and the cancellation notification are absent because they are THE FEATURE
    //   BEING SPECIFIED, and a spec describing work not yet in the codebase is a spec doing its job.
    //
    //   STANDS, and is still open. Order OWNERSHIP genuinely does not exist in the workspace.
    //   `orders` has `workspaceId`, `status`, `placedAt`, `totalCents` and no customer or owner
    //   column at all — orders belong to a workspace, not to a person. So AC-3 ("an order they do
    //   not own"), the request contract ("owned by the caller") and the Security line all rest on a
    //   relation the repo does not have, and that is NOT part of the feature under specification —
    //   it is a domain premise underneath it. A later run put it exactly: "Coverage is mapped on
    //   paper, but the mapping rests on an ownership model that doesn't exist in the system."
    //
    // Two ways to close it, deliberately NOT taken here because they differ in blast radius, not in
    // difficulty: (1) scope the fixture's ownership to what the workspace actually has (workspace-
    // scoped rather than customer-owned) — fixture-only, no other suite affected; or (2) add a
    // customer/owner column to workspace-template's schema.ts — which is a SHARED file the
    // implementer suite's migration case reads, and editing the workspace is how the previous
    // session introduced a defect of its own. (1) is the recommendation.
    //
    // The re-measure (`spec-creator-control-fixed`) put it at 1/5 → 3/5 and exposed a SECOND
    // contradiction of the same family, which is now fixed too: Accessibility read "N/A — no new UI
    // in this feature" while AC-4 requires the system to DISPLAY three new fields to an admin. One
    // run quoted both halves back — "that is new UI surface, even if it lands on an existing screen
    // rather than a new one" — and it is right. Accessibility now describes the read-only fields
    // AC-4 adds instead of denying they exist. Nothing on the measured axis (Story→AC coverage)
    // changed in either fix.
    //
    // Second re-measure (`spec-creator-control-v2`), after the Accessibility fix: 3/5 → 4/5. The
    // series is 1/5 → 3/5 → 4/5 across two fixture fixes.
    //
    // The residual is fully attributed, and the attribution was PREDICTED before it was checked:
    // every failure in this control is a LONG exploratory run, and every pass is a short one. In v2
    // the single failure ran 29 turns over 11 files and 21.5k output; all four passes ran 1–2 turns
    // and read nothing. Same shape in the previous series (29 turns / 9 files, 22 turns / 11 files).
    // The mechanism is not laziness-vs-diligence in the model's favour or against it: the short runs
    // answer from the supplied text, which is what the case asks; the long runs go and check the
    // spec against the repo, and the repo does not carry order ownership (above). So the remaining
    // 1-in-5 is that open premise, not noise — expect it to close with fix (1) and not before.
    //
    // Do not raise the threshold: it is 1.0 deliberately, and both practices move together anyway,
    // because they are two faces of one verdict.
    name: "does not fabricate a coverage gap when every mandatory requirement has an AC",
    // (this case keeps the document-scope preamble; the out-of-checklist case is the last one below)
    kind: "quality",
    prompt: finalizePrompt(fx("order-cancellation-covered.md")),
    practices: [
      "concludes the spec passes the final self-check and may move to Status: approved (the user's explicit confirmation is present)",
      "does not claim any mandatory requirement lacks acceptance-criterion coverage — no fabricated coverage gap for US-1, US-2, or US-3, and no invented blocking issue",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    // The out-of-checklist rule, added to `spec-creator.md` after the over-blocking candidate was
    // retracted: the eleven items are the whole gate, a finding outside them goes under **Inline
    // proposals (non-blocking)**, and `Status` is decided by the eleven alone.
    //
    // Four practices covering BOTH directions the rule names, because the two failure modes are
    // opposite and a case that only guards one of them is worthless: promoting the finding to a
    // twelfth blocker (which is what sonnet did in 2 of 5 runs before the rule existed), and dropping
    // it silently to keep the verdict clean.
    //
    // The last practice is the CONTROL, and it is the one that stops this case from rewarding
    // leniency: the spec really does pass all eleven items, so a run that waves the mismatch through
    // by also declaring a coverage gap has not followed the rule, it has just found a different way
    // to block. The sibling case above is the other half of the control at suite level — item 11 must
    // still be a HARD blocker there, and the new rule must not have softened it.
    name: "reports a codebase mismatch as non-blocking instead of a twelfth gate item",
    kind: "quality",
    prompt: groundedFinalizePrompt(fx("order-cancellation-covered.md")),
    // Behavioural: the answer has to have actually reached the schema. Not prompt echo — the prompt
    // names no file, no column and no type; every string here comes from the code or from the finding.
    grounding: [["schema.ts", "text(", "no enum", "not an enum", "plain text"]],
    practices: [
      // NOT enumerated to the one mismatch this case was built around. Measured: the fixture carries
      // at least three real ones, and the runs go for the sharpest rather than the planted one — the
      // spec gates on status `pending` while `packages/shared/src/orders/order-export-query.ts`
      // declares `z.enum(['placed','shipped','refund_pending','refunded'])` with no `pending` at all;
      // the `status` column is plain `text()` and not an enum; and AC-6 assumes the existing notifier
      // records delivery failures for retry when `mailer.ts` exports only `sendRefundEmail` and
      // swallows failures in a bare `catch {}`. Naming one of them would fail a run that reported a
      // better one — the enumeration trap this file has already paid for twice.
      "reports at least one real mismatch between the spec and the codebase, concretely enough to name what the spec claims and what the code actually has",
      "does NOT treat any such mismatch as a self-check failure or a blocker — the verdict still allows the spec to move to `Status: approved`, because the eleven checklist items all pass",
      "records the mismatch explicitly in the report as a non-blocking item (an inline proposal / observation with a recommendation) rather than omitting it to keep the verdict clean",
      "does not invent a checklist failure to justify blocking — no fabricated coverage gap for US-1, US-2 or US-3 and no manufactured [NEEDS CLARIFICATION]",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
];
