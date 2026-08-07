/**
 * `classifyFlip` decides what `eval:compare` calls a regression, and it is the whole point of pointing
 * that tool at records.jsonl rather than history.jsonl. It gets a unit test because the first version
 * was WRONG in a way that only showed up against the real ledger: a case whose lifetime at a model is
 * 0/5 flipped pass→fail and was announced as a regression, when failing is what it always does there.
 */

import { describe, expect, it } from "vitest";
import { classifyFlip, crossKey } from "./compare.js";

const lt = (passed: number, total: number) => ({ passed, total, rate: total ? passed / total : 0 });

describe("classifyFlip", () => {
  it("calls it a regression when a normally-passing case fails in the later run", () => {
    expect(classifyFlip(false, lt(11, 12))).toBe("regressed");
  });

  it("calls it an improvement when a normally-failing case passes in the later run", () => {
    expect(classifyFlip(true, lt(0, 12))).toBe("improved");
  });

  it("does NOT call it an improvement when a normally-passing case passes — the other run was the outlier", () => {
    expect(classifyFlip(true, lt(11, 12))).toBe("variance");
  });

  it("does NOT call it a regression when a normally-failing case fails — that is its norm", () => {
    // The exact bug found against the ledger: mermaid-diagram activation, lifetime 0/5 at haiku.
    expect(classifyFlip(false, lt(0, 5))).toBe("variance");
  });

  it("treats a mid-range case as variance in both directions — these flip on their own", () => {
    // Real rates from the activation tier on haiku: security 12/37, run-plan 5/27, typescript 3/13.
    expect(classifyFlip(true, lt(12, 37))).toBe("variance");
    expect(classifyFlip(false, lt(12, 37))).toBe("variance");
  });

  it("refuses to judge on thin history — 3/3 is not 100%", () => {
    expect(classifyFlip(false, lt(3, 3))).toBe("variance");
    expect(classifyFlip(true, lt(0, 2))).toBe("variance");
  });

  it("has no history at all to judge from", () => {
    expect(classifyFlip(false, lt(0, 0))).toBe("variance");
  });

  it("never calls a session that failed to RUN a regression, however stable the case is", () => {
    // The measured case: API Error 529 cost a whole run of five, and its rows carry outputTokens 0
    // with an empty practices array — which otherwise reads as a rock-solid case regressing.
    expect(classifyFlip(false, lt(20, 20), true)).toBe("variance");
    expect(classifyFlip(false, lt(11, 12), true)).toBe("variance");
  });

  it("still reports the regression when the session ran fine and simply answered badly", () => {
    expect(classifyFlip(false, lt(20, 20), false)).toBe("regressed");
  });
});

describe("crossKey", () => {
  // The two ledgers build nodeids differently, and the first full run after the cross-check landed
  // reported 181 phantom "died before scoring" rows because of it. These are the two real shapes.
  const HISTORY = "plugins/sdd-engineering/workflow/review-workflow.eval.ts > API-route task reads api-guidelines";
  const RECORDS =
    "E:/Sources/x/evals/plugins/sdd-engineering/workflow/review-workflow.eval.ts > workflow:review > API-route task reads api-guidelines";

  it("matches a history row to its records row despite path and describe differences", () => {
    expect(crossKey(HISTORY)).toBe(crossKey(RECORDS));
  });

  it("keys on the file basename, so an absolute and a relative path agree", () => {
    expect(crossKey(RECORDS)).toBe("review-workflow.eval.ts|API-route task reads api-guidelines");
  });

  it("handles Windows separators, which is how records paths arrive on this machine", () => {
    expect(crossKey("E:\\x\\evals\\plugins\\a\\b.eval.ts > tier > case name")).toBe("b.eval.ts|case name");
  });

  it("does not confuse two different cases in the same file", () => {
    const a = "x/b.eval.ts > tier > first case";
    const b = "x/b.eval.ts > tier > second case";
    expect(crossKey(a)).not.toBe(crossKey(b));
  });

  it("survives a nodeid with no describe level at all", () => {
    expect(crossKey("x/b.eval.ts > only case")).toBe("b.eval.ts|only case");
  });
});
