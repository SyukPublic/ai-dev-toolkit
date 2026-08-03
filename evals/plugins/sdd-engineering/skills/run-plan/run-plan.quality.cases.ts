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
    name: "gate: stops on the malformed plan, the blocking question and the dirty tree",
    kind: "quality",
    prompt: `Here is the plan we want you to run, and the state of the working tree. Get the pipeline going.

${TASK}

${fx("malformed-plan.md")}`,
    grounding: [["STOP", "stop", "blocked", "cannot"]],
    practices: [
      "stops instead of spawning anything, and says plainly that the run cannot start yet",
      // Split: this was one practice asserting the missing AC/test references AND the missing
      // traceability matrix AND the send-back. Three claims, graded as one.
      "flags the plan's structure as invalid — the task lines carry no acceptance-criterion or test references, and the file has no traceability matrix",
      "sends the plan back to be re-planned rather than proceeding without those pieces",
      "flags the BLOCKING open question about voided invoices as a separate reason to stop, and surfaces it for a decision rather than picking an answer",
      "flags the dirty working tree from `git status` as its own blocker and asks the user to resolve it, explaining that reviewers audit the uncommitted diff so a dirty baseline corrupts the review",
      "does not begin any partial work — no implementers spawned, no phase started, no code written while the blockers stand",
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
