import { test, expect } from "vitest";
import {
  describeSkill,
  describeWorkflow,
  runSkillCases,
  runWorkflowCases,
  workflowTask,
  patternMatch,
  logTrace,
  activated,
} from "../../../../src/index.js";
import { record } from "../../../../src/records/record.js";
import { cases } from "./run-plan.cases.js";
import { qualityCases } from "./run-plan.quality.cases.js";

// The content tier measures the orchestration RULES the skill states — gate behaviour, Stage 5
// triage routing, eager launch. It is deliberately independent of whether the skill ACTIVATES,
// which the workflow tier below measures. That activation question is SETTLED, and the old
// "unresolved design call" note that stood here is retracted: the tier runs on
// EVAL_ACTIVATION_MODEL (claude-sonnet-5), where this skill's positive engages 8/8 and its
// near-miss negative 0/8 across every recorded row. The old ~25% figure was haiku, and mostly
// rows taken while the case named a plan fixture that did not exist. See .plans, "run-plan
// activation — the old design question is now moot".
describeSkill("run-plan", () => runSkillCases("run-plan", qualityCases));

describeWorkflow("run-plan trigger", () => {
  runWorkflowCases(cases);

  // Bespoke Gate-0 case. run-plan's SKILL.md: "No path given, or the file does not exist →
  // STOP. Report the blocker and list docs/plans/*.md ... as candidate hints. Never guess which
  // plan was meant, never run without one." So a bare "run the plan" with no path must end in a
  // blocker/ask — and must NOT start orchestrating (no subagents spawned). Asserted with the
  // deterministic pattern gate (alternative slots) instead of a judge; a session that never
  // reaches the skill still fails honestly (its answer won't ask for a plan path).
  test("hard gate: no plan path → stops at the gate and asks, spawns nothing", async () => {
    const result = await workflowTask("Run the plan.", { maxTurns: 6 });
    logTrace("run-plan gate: no plan path", result);
    const gate = patternMatch(result.text, [
      ["plan path", "path to the plan", "which plan", "plan file", "no plan", "docs/plans"],
    ]);
    const outcome = gate === 1 && result.subagents.length === 0;
    try {
      expect(result.subagents, `subagents spawned: ${result.subagents.join(", ")}`).toHaveLength(0);
      expect(gate, `no blocker/ask for the plan path in output:\n${result.text}`).toBe(1);
    } finally {
      record("run-plan gate: no plan path stops", { result, outcome });
    }
  });

  // PRE-IMPLEMENTATION invariant 1: given a VALID plan by path, the orchestrator engages, reads the
  // plan, and DELEGATES the open phase instead of doing the work.
  // `docs/plans/2026-07-order-export.md` is on disk in the assembled workspace with Phase 1 complete
  // and Phase 2 (T4-T7) open, so a correct run spawns exactly one implementer — the cheapest
  // dispatch this skill can make.
  //
  // Bespoke rather than `kind: "trace"`, and that is a MEASURED choice. As a trace case its three
  // expectations formed the stop condition, so a run missing any one of them never stopped: two of
  // five runs hit the 900 s vitest timeout and recorded nothing, and one recorded row showed 143
  // turns against `maxTurns: 20`. maxTurns does not bound a session that dispatches. Stopping at the
  // FIRST spawn and asserting the three facts afterwards is the same measurement with a bounded
  // cost — the wave-balance case below has run 40-60 s every time on exactly that shape.
  // Re-measured after the change: 5/5 on haiku, 46 s ± 21 s, every row recorded.
  //
  // What a green does NOT say, so nobody reads more into it: the three facts are a CONJUNCTION, not
  // an ordering. And "the orchestrator never writes code itself" is unassertable here — Write/Edit/
  // Bash are blocked, so it could not have, whatever it intended.
  //
  // The clean-tree clause is a constraint on the SESSION, not a false fact about the project — the
  // same latitude the retrieval tier takes with "this project ships a skill … consult it". Pre-flight
  // step 1 runs `git status`; Bash is blocked and the workspace is a copied temp dir that is not a
  // git repo at all, so without it the run stalls at a check it can never satisfy. The prompt names
  // the mechanism for the reason recorded on the wave-balance case: only the activation branch pins
  // EVAL_ACTIVATION_MODEL (case.ts:214), so this runs on haiku, where an unnamed prompt would spend
  // the run re-measuring selection — which the activation pair already owns at 8/8 on sonnet.
  test("pre-implementation: reads the plan and delegates the open phase to an implementer", async () => {
    const result = await workflowTask(
      "This project ships a skill for driving an approved plan through the implementation " +
        "pipeline — use it. Run the approved plan at docs/plans/2026-07-order-export.md. The " +
        "working tree is clean — I committed everything a moment ago, and this session has no " +
        "shell, so take the clean tree as given and carry on from there.",
      { maxTurns: 20, stopWhen: (p) => p.subagents.length > 0 },
    );
    logTrace("run-plan pre-implementation: delegates the open phase", result);
    const readPlan = result.filesRead.some((f) => f.includes("docs/plans/2026-07-order-export.md"));
    const delegated = /implementer|impl-p/i.test(result.subagents[0] ?? "");
    const engaged = activated(result, "run-plan");
    const outcome = readPlan && delegated && engaged;
    try {
      expect(
        engaged,
        `run-plan not engaged | skills: ${result.skillsInvoked.join(", ")} | reads: ${result.filesRead.join(", ")}`,
      ).toBe(true);
      expect(readPlan, `plan not read | reads: ${result.filesRead.join(", ")}`).toBe(true);
      expect(
        result.subagents[0] ?? "",
        `first spawn is not an implementer | subagents: ${result.subagents.join(", ")}`,
      ).toMatch(/implementer|impl-p/i);
    } finally {
      record("run-plan pre-implementation: delegates the open phase", { result, outcome });
    }
  });

  // Bespoke wave-balance case — the second PRE-IMPLEMENTATION invariant, and bespoke for the same
  // reason as the one above: it has a NEGATIVE half no case kind expresses. SKILL.md, pre-flight
  // step 5: "Wave-balance gate (multi-agent, BEFORE any spawn) … Largest phase in a wave >2× the
  // median of its wave siblings → do NOT spawn: send the plan back for a split — spawn
  // implementation-planner with a revision request naming the oversized phase (template 7)."
  // Both halves have to hold, and asserting them in ONE session is cheaper than a trace case plus
  // a separate negative — and stronger, because they are then the same run.
  //
  // The fixture is docs/plans/2026-08-audit-trail.md in the assembled workspace. It is
  // structurally VALID on purpose (Execution mode, task lines shaped `→ AC-… → test_…`, a full
  // traceability matrix, "None blocking" open questions), so Gate 0 passes and the wave-balance
  // gate is the only thing between the model and a spawn — a red here cannot be Gate 0 firing for
  // some other reason. Wave 1 is Phases 1-3, all parallel-safe with no `depends on:`: 2 tasks,
  // 2 tasks, and 10 tasks over 9 named files. Median 2 against a largest of 10 clears the 2× line
  // by a wide margin, so a miss is a miss rather than a judgement call about sizing.
  //
  // The clean-tree clause is the same session constraint the trace case carries, for the same
  // reason (Bash is blocked; the workspace is not a git repo), and the prompt names the mechanism
  // for the reason recorded there — this test runs on the default EVAL_MODEL, not on
  // EVAL_ACTIVATION_MODEL, so an unnamed prompt would spend the run on selection. It names the
  // skill and nothing else: the gate, the sizing and the remedy are all still the model's to find.
  //
  // It asserts the FIRST spawn, and stops the session there. That is the contract's own wording —
  // "wave-balance gate (multi-agent, BEFORE any spawn)" — so the first Agent call is exactly the
  // decision under test: a revision request (correct) or an implementer (the violation).
  //
  // Stopping at the first spawn rather than at the planner's is not a refinement, it is what makes
  // the case affordable and trustworthy. MEASURED on the first version of this test, which waited
  // for a planner spawn that never came: 653 s, 329 tool calls, eight subagents (`impl-p1`,
  // `impl-p2`, `impl-p3`, plus improvised writers), and ELEVEN REAL FILES created in the assembled
  // workspace — `packages/shared/src/audit/*.ts`, `server/src/modules/audit/*.ts` — despite
  // WORKFLOW_DISALLOWED_TOOLS. See sandbox-write.eval.ts for what is and is not blocked. Stopping
  // at the first spawn took the same case to 61 s and closed the exposure, because no nested
  // session ever starts.
  //
  // MEASURED, and the candidate is CLOSED as a model ceiling rather than an artifact defect:
  // haiku 1/5, sonnet (EVAL_MODEL=claude-sonnet-5) 4/5, 62 s a run. The gate is reachable and the
  // wording works — haiku simply builds the wave schedule and spawns straight through it, with
  // `wave-balance`, `median`, `split` and `oversized` appearing NOWHERE in a failing transcript.
  // So the case discriminates between the two models, which is what a deliberate red is for.
  // Standing rule for this case: it is a SONNET case. A red at haiku says nothing about SKILL.md.
  //
  // The spawn identity is matched by PATTERN, not by equality, and that is deliberate. run-claude
  // captures `subagent_type ?? agent_type ?? name`, and the first run proved both forms reach it:
  // `implementer` (a type) and `impl-p1` (run-plan's own `impl-p<N>` naming). Template 7 names the
  // revision spawn `plan-split-rev`, so an equality check on "implementation-planner" would fail a
  // CORRECT run on the same vocabulary trap the grounding slots hit three times in one session.
  test("wave-balance gate: an oversized phase goes back to the planner, not to implementers", async () => {
    const result = await workflowTask(
      "This project ships a skill for driving an approved plan through the implementation " +
        "pipeline — use it. Run the approved plan at docs/plans/2026-08-audit-trail.md. The " +
        "working tree is clean — I committed everything a moment ago, and this session has no " +
        "shell, so take the clean tree as given and carry on.",
      { maxTurns: 20, stopWhen: (p) => p.subagents.length > 0 },
    );
    logTrace("run-plan wave-balance: oversized phase", result);
    const first = result.subagents[0] ?? "";
    const isReplan = /implementation-planner|plan-split|plan-rev/i.test(first);
    const isImplementer = /implementer|impl-p/i.test(first);
    const outcome = isReplan && !isImplementer;
    try {
      expect(
        first,
        `first spawn is not a re-plan request | subagents: ${result.subagents.join(", ")}`,
      ).toMatch(/implementation-planner|plan-split|plan-rev/i);
      expect(
        first,
        `first spawn is an implementer despite the unbalanced wave | subagents: ${result.subagents.join(", ")}`,
      ).not.toMatch(/implementer|impl-p/i);
    } finally {
      record("run-plan wave-balance: oversized phase re-plans", { result, outcome });
    }
  });
});
