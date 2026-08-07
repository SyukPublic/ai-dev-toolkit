/**
 * Pins the RETRIEVAL tier's tool wiring (`retrievalToolOptions`, config.ts).
 *
 * Why this is a unit test and not a series: both invariants below fail SILENTLY, and one of them has
 * already cost a real measurement in this repo — activation cases once filtered `Task`/`Agent` out of
 * `allowedTools` only, which is inert under bypassPermissions, so subagents kept spawning and a
 * dispatched agent's preloaded skills landed in the PARENT trace. `onion-architecture` then read
 * "1/2 engaged" against a true 0/14. In the retrieval tier the same bug credits a subagent's `Read`
 * to the session under test, i.e. a false green on exactly what the tier measures.
 *
 * 55 recorded retrieval rows currently show `subagents: []` and tools drawn only from
 * {`Skill`, `Read`}, so the wiring is right today. That is an observation; this file makes it an
 * assertion. Same reasoning that put `assembleText` under test.
 */

import { describe, it, expect } from "vitest";
import {
  MUTATING_TOOLS,
  SPAWN_TOOLS,
  WORKFLOW_ALLOWED_TOOLS,
  retrievalToolOptions,
} from "./config.js";

describe("retrievalToolOptions", () => {
  it("blocks every spawn tool rather than merely leaving it out of the allow-list", () => {
    const { allowedTools, disallowedTools } = retrievalToolOptions();
    for (const spawn of SPAWN_TOOLS) {
      expect(allowedTools, `${spawn} must not be granted`).not.toContain(spawn);
      // The load-bearing half: under bypassPermissions only disallowedTools actually stops a tool.
      expect(disallowedTools, `${spawn} must be BLOCKED, not just un-allowed`).toContain(spawn);
    }
  });

  it("keeps Skill and Read, because they ARE the mechanism under test", () => {
    // Drop either and every retrieval case silently degrades to "answer from memory" — which is
    // indistinguishable from the model ceiling this tier legitimately reports, so a harness defect
    // would present as a finding.
    const { allowedTools } = retrievalToolOptions();
    expect(allowedTools).toContain("Skill");
    expect(allowedTools).toContain("Read");
  });

  it("can only restrict the workflow grant, never widen it", () => {
    const { allowedTools } = retrievalToolOptions();
    for (const t of allowedTools) expect(WORKFLOW_ALLOWED_TOOLS).toContain(t);
    expect(allowedTools.length).toBeLessThan(WORKFLOW_ALLOWED_TOOLS.length);
  });

  it("never names a mutating tool in the allow-list", () => {
    // workflowTask unions WORKFLOW_DISALLOWED_TOOLS on top, so mutating tools are blocked either
    // way. Asserted here so the guarantee does not rest on that union alone.
    const { allowedTools } = retrievalToolOptions();
    for (const m of MUTATING_TOOLS) expect(allowedTools).not.toContain(m);
  });

  it("guards the guard: the workflow grant really does contain a spawn tool to filter", () => {
    // Without this, every assertion above passes trivially if SPAWN_TOOLS is ever emptied or
    // WORKFLOW_ALLOWED_TOOLS stops listing Task/Agent.
    expect(SPAWN_TOOLS.size).toBeGreaterThan(0);
    expect(WORKFLOW_ALLOWED_TOOLS.some((t) => SPAWN_TOOLS.has(t))).toBe(true);
  });

  it("returns a fresh array each call, so a caller cannot mutate the shared config", () => {
    const a = retrievalToolOptions();
    a.disallowedTools.push("Bogus");
    expect(retrievalToolOptions().disallowedTools).not.toContain("Bogus");
    expect([...SPAWN_TOOLS]).not.toContain("Bogus");
  });
});
