import type { SkillCase } from "../../../../src/index.js";
import { fixtureReader } from "../../../../src/index.js";

const fx = fixtureReader(import.meta.url);

// Content tier: SKILL.md plus its references/ directory is injected, no tools. This measures the
// orchestration RULES the skill states — which is the part of run-plan a general model does not
// have. Whether the skill ACTIVATES is a separate question, measured in run-plan.cases.ts and
// currently unresolved (see .plans).
//
// The triage case is the sharpest thing in this suite. Stage 5's table is explicit about routing,
// and two rows cut against a model's instinct to fix everything it was shown:
//
//   Arch MEDIUM / LOW            → follow-up; do NOT iterate on these
//   AMBIGUOUS-IN-SPEC            → NEVER "fix" code; surface to the user / spec-creator
//
// The gate case plants two independent blockers that both fire before any spawn — a plan whose
// task lines carry no `→ AC-… → test_…` and which has no traceability matrix at all, plus a
// BLOCKING open question, plus a dirty working tree. A model that "gets started" on any of it
// has skipped Gate 0 and pre-flight.

const TASK = `Answer directly and concretely — no need to ask for tool access or more files.`;

export const qualityCases: SkillCase[] = [
  {
    name: "triage: routes each finding by severity and refuses to code around the ambiguity",
    kind: "quality",
    prompt: `Both reviewers have reported on the order-export run. Triage the findings: for each one, say what happens to it now.

${TASK}

${fx("review-findings.md")}`,
    grounding: [["AMBIGUOUS", "ambiguous"]],
    practices: [
      "routes the CRITICAL and HIGH architecture findings (A2 the client/server boundary crossing, A1 the direct repository construction) to a fix iteration, dispatched to the implementer that owns those files per the ownership map",
      "routes the MISSING and DIVERGENT requirements R1, R2 and R3 to the fix iteration as must-fix work",
      "does NOT iterate on the MEDIUM and LOW architecture findings A3 and A4 — they are recorded as follow-ups or tech-debt candidates in the final report",
      "refuses to change code for R4, the AMBIGUOUS-IN-SPEC requirement, and surfaces it to the user or spec-creator for a spec decision instead of guessing what 'reasonably fast' means",
      "treats R5 (PARTIAL, Minor) as a follow-up rather than must-fix work, and routes R7's missing test to the test-writer rather than to an implementer",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
  {
    // SPLIT into this case and the plan-structure case below, on measurement. As one case asking
    // for all three planted blockers at once it scored 1/5 (`runplan-content-n5`) while the gate
    // dimension itself was perfect — denominator 4, because one run failed the grounding gate:
    //
    //   stops instead of spawning              4/4    flags the BLOCKING question   4/4
    //   does not begin any partial work        4/4    flags the dirty tree          3/4
    //   plan structure invalid (compound)      1/4    sends the plan back           1/4
    //
    // The failing answers are good answers. They stop, refuse to spawn, name the BLOCKING question
    // and the dirty tree, and say what to do about each — one opens "Two blockers", having found
    // two of the three. What they miss is the only planted defect that is an ABSENCE (no
    // `→ AC-… → test_…` on the task lines, no traceability matrix) while the other two are
    // PRESENCES: an explicit `BLOCKING:` marker and a `git status` block. Proving an absence costs
    // more than spotting a presence, and an answer has an attention budget — a third sub-question
    // does not add a section, it displaces one.
    //
    // The send-back practice scored 1/4 for a second reason: it makes the remedy conditional on the
    // detection, so it could only pass when the structural practice above it also passed.
    //
    // Renaming resets this case's lifetime pooling (the ledger keys on `file > test name`), so its
    // pre-split rows stop matching. Recorded because a silent rename reads as a data gap later.
    name: "gate: refuses to start while a BLOCKING question is open and the tree is dirty",
    kind: "quality",
    prompt: `Here is the plan we want you to run, and the state of the working tree. Get the pipeline going.

${TASK}

${fx("malformed-plan.md")}`,
    // STEMS, not inflected forms. This slot used to read ["STOP", "stop", "blocked", "cannot"] and
    // failed a textbook refusal 1 run in 5 — before the split and again after it, at the same rate.
    // The answer opened "I'm halting the pipeline at Gate 0 — two blockers prevent execution", used
    // a 🛑 and a "Blocking Issues" heading, named both blockers and gave a resolution for each. It
    // matched nothing: "blocked" is not a substring of "Blocking", and the model wrote "halting"
    // rather than "stop". The judge never ran (grounded: 0), so a correct answer scored zero on a
    // word form. Matching is case-insensitive (pattern-match.ts:16-17), which also made the
    // "STOP"/"stop" pair a no-op. Gate on the behaviour, leave the wording to the judge.
    grounding: [["block", "stop", "halt", "cannot", "refus"]],
    practices: [
      "stops instead of spawning anything, and says plainly that the run cannot start yet",
      "flags the BLOCKING open question about voided invoices as a separate reason to stop, and surfaces it for a decision rather than picking an answer",
      "flags the dirty working tree from `git status` as its own blocker and asks the user to resolve it, explaining that reviewers audit the uncommitted diff so a dirty baseline corrupts the review",
      "does not begin any partial work — no implementers spawned, no phase started, no code written while the blockers stand",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
  // The other half of the split above, scoped by DIMENSION against the same fixture — the shape
  // that took the mermaid review from 0/5 to two working cases and the workflow-retro timing case
  // from 1/4 to 3/3. The prompt de-scopes the two loud blockers the way mermaid's says "Ignore
  // styling for now", so the structural absence is what the answer's attention is on. It names the
  // dimension without naming the defect: the model still has to find WHICH pieces are missing.
  //
  // The compound practice is decomposed into its two independent claims, and the send-back is kept
  // as its own practice rather than as a clause conditional on detecting them.
  {
    name: "gate: rejects a plan whose tasks trace to nothing",
    kind: "quality",
    prompt: `Before you launch anything, check this plan's STRUCTURE against what the pipeline needs in order to run it and review it afterwards. Set the open questions and the state of the working tree aside for this answer.

${TASK}

${fx("malformed-plan.md")}`,
    // Gates on a verdict being reached, not on the substance — the same stems as the sibling case,
    // and for the reason recorded there: the inflected forms failed a correct refusal on wording.
    // NOT on "traceability"/"acceptance": the prompt would then be feeding the model the word the
    // grounding checks for, which is the documented way to gate on prompt echo instead of behaviour.
    grounding: [["block", "stop", "halt", "cannot", "refus", "invalid", "re-plan", "replan"]],
    practices: [
      "flags that the task lines T1, T2 and T3 carry no acceptance-criterion or test references",
      "flags that the plan carries no traceability matrix at all",
      "sends the plan back to be re-planned rather than proceeding without those pieces",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
  {
    name: "orchestration rules: eager launch, the real barrier, and a design brief for subagents",
    kind: "quality",
    prompt: `We are about to run a 4-phase plan through the pipeline. Phase 2 and Phase 3 both depend only on Phase 1; Phase 4 depends on Phase 2. Phase 1 finished first, then Phase 2 finished while Phase 3 is still running.

Two questions. First: can Phase 4 start now, or does it wait for Phase 3 and the rest of the wave? Second: the user attached three screenshots of the new export screen in the chat — how do the implementers get that design?

${TASK}`,
    grounding: [["Phase 4", "phase 4"]],
    practices: [
      "says Phase 4 can start immediately — a phase launches the moment every phase in its `depends on:` has reported done, so waves schedule work but do not act as a barrier",
      "identifies the test-writer gap pass as the first true barrier, the point that does wait for every phase to finish",
      "says the implementers cannot see the attached screenshots at all, because subagents do not receive chat attachments",
      "resolves that by verbalising the designs into a textual design brief — layout, components, states, exact copy — embedded in each spawn prompt that needs it, and explicitly rejects referring the subagent to the attachment",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
];
