import { test, expect } from "vitest";
import { describeWorkflow, runWorkflowCases, workflowTask, patternMatch, logTrace } from "../../../../src/index.js";
import { record } from "../../../../src/records/record.js";
import { cases } from "./run-plan.cases.js";

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
});
