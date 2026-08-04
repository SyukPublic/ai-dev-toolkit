/**
 * Deterministic proof for `assembleText` — the judged-artifact assembly in run-claude.ts.
 *
 * These exist because the bug they cover could only be reproduced by luck: the session shape that
 * triggered it (deliverable, then a trailing wrap-up after a background subagent) appeared in 1 run
 * of 5 and cannot be forced, so a model series could not demonstrate the repair. A unit test can.
 */

import { describe, expect, it } from "vitest";
import { assembleText } from "./run-claude.js";

const REPORT = "## 🔎 Research Report — PROJECT\n\nGET /orders, GET /orders/:id, POST /orders/:id/refunds";
const WRAPUP = "The background exploration agent has completed. My research report above already covers it.";

describe("assembleText", () => {
  it("keeps a deliverable that is followed by a trailing wrap-up", () => {
    // The regression under test: `resultText || textParts.join()` returned only WRAPUP here, so the
    // report vanished, the grounding gate failed on the missing PROJECT heading, and the row read as
    // a content failure.
    const text = assembleText([REPORT, WRAPUP], WRAPUP);
    expect(text).toContain("Research Report — PROJECT");
    expect(text).toContain("/orders/:id/refunds");
    expect(text).toContain(WRAPUP);
  });

  it("does not repeat the final message when resultText is already the last text block", () => {
    // The common case. An unconditional join would duplicate it, inflating token counts and giving
    // the judge the same sentence twice.
    const text = assembleText([REPORT, WRAPUP], WRAPUP);
    expect(text.split(WRAPUP).length - 1).toBe(1);
  });

  it("appends resultText when the stream never carried it as a text block", () => {
    const text = assembleText([REPORT], "A summary only the result message carried.");
    expect(text).toContain(REPORT);
    expect(text).toContain("A summary only the result message carried.");
  });

  it("falls back to resultText when no assistant text was collected", () => {
    expect(assembleText([], "result-only")).toBe("result-only");
  });

  it("returns the transcript when there is no resultText — an early stop never reaches it", () => {
    expect(assembleText(["a", "b"], "")).toBe("a\nb");
  });

  it("returns an empty string when the session produced nothing", () => {
    expect(assembleText([], "")).toBe("");
  });

  it("preserves message order, so the judge reads the session as it happened", () => {
    expect(assembleText(["first", "second", "third"], "third")).toBe("first\nsecond\nthird");
  });
});
