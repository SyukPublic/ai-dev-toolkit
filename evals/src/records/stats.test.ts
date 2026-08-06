/**
 * The only non-model tests in the package — pure statistics math on fixed arrays.
 *   pnpm vitest run src/records/stats.test.ts
 */

import { describe, expect, test } from "vitest";
import {
  activationFloorBreaches,
  activationSeries,
  calcStats,
  computeFlags,
  engagementByOutcome,
  skillRefsUsed,
  type EvalRecord,
} from "./stats.js";

const series = (passed: number, total: number) => ({ passed, total, rate: total ? passed / total : 0 });

/** A minimal record; only the fields under test are ever interesting. */
const rec = (over: Partial<EvalRecord>): EvalRecord => ({
  schema: 1,
  run_id: "r",
  git_sha: "abc1234",
  dirty: false,
  config: "candidate",
  model: "claude-haiku-4-5",
  nodeid: "f.eval.ts > d > a case",
  label: "a case",
  outcome: true,
  practices: [],
  num_turns: 1,
  metrics: { durationMs: 0, inputTokens: 0, outputTokens: 0, toolCallCount: 0 },
  trace: { tools: [], subagents: [], skills: [], reads: [] },
  output_file: "outputs/r/a-case.md",
  ...over,
});

/** An activation row: `activated` is the raw fact, `outcome` folds the polarity in. */
const act = (over: Partial<EvalRecord>): EvalRecord =>
  rec({ case_kind: "activation", skill: "s", should_activate: true, indicative: true, ...over });

describe("skillRefsUsed", () => {
  test("reports one setting when a series is homogeneous", () => {
    expect(skillRefsUsed([rec({ skill_refs: true }), rec({ skill_refs: true })])).toEqual(["refs"]);
    expect(skillRefsUsed([rec({ skill_refs: false })])).toEqual(["skill-only"]);
  });

  test("reveals a mixed series, which is the whole point", () => {
    // A rate pooled across these two is meaningless for any skill shipping references/.
    expect(skillRefsUsed([rec({ skill_refs: true }), rec({ skill_refs: false })])).toEqual([
      "refs",
      "skill-only",
    ]);
  });

  test("reports a pre-field row as unknown rather than assuming it had references", () => {
    // Those rows really were all taken with references injected, but the row cannot prove it, so
    // this reports instead of asserting — the same call made for `model` when it was added.
    expect(skillRefsUsed([rec({})])).toEqual(["unknown"]);
    expect(skillRefsUsed([rec({}), rec({ skill_refs: true })])).toEqual(["refs", "unknown"]);
  });

  test("is empty for no rows, so a caller cannot mistake absence for agreement", () => {
    expect(skillRefsUsed([])).toEqual([]);
  });
});

describe("calcStats", () => {
  test("mean / min / max / sample stddev of a known array", () => {
    const s = calcStats([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(s.mean).toBe(5);
    expect(s.min).toBe(2);
    expect(s.max).toBe(9);
    // sample stddev (n−1) of this classic array ≈ 2.138 (population would be 2.0)
    expect(s.stddev).toBeCloseTo(2.138, 3);
    expect(s.n).toBe(8);
  });

  test("empty → zeros with n=0; singleton → stddev 0", () => {
    expect(calcStats([])).toEqual({ mean: 0, stddev: 0, min: 0, max: 0, n: 0 });
    expect(calcStats([42])).toEqual({ mean: 42, stddev: 0, min: 42, max: 42, n: 1 });
  });
});

describe("computeFlags", () => {
  test("non_discriminating: 100% in both", () => {
    expect(computeFlags(series(5, 5), series(5, 5))).toContain("non_discriminating");
  });

  test("always_failing (n>0, rate 0) is NOT missing_data", () => {
    const flags = computeFlags(series(0, 5), series(0, 5));
    expect(flags).toContain("always_failing");
    expect(flags).not.toContain("missing_data");
  });

  test("missing_data (n=0) is NOT always_failing", () => {
    const flags = computeFlags(series(0, 0), series(0, 5));
    expect(flags).toContain("missing_data");
    expect(flags).not.toContain("always_failing");
  });

  test("flaky is exclusive of the 20% and 80% boundaries", () => {
    expect(computeFlags(series(1, 2), series(5, 5))).toContain("flaky"); // 50%
    expect(computeFlags(series(1, 5), series(5, 5))).not.toContain("flaky"); // exactly 20%
    expect(computeFlags(series(4, 5), series(5, 5))).not.toContain("flaky"); // exactly 80%
  });

  test("cost_regression when candidate tokens exceed 125% of baseline", () => {
    expect(computeFlags(series(5, 5), series(5, 5), { candTokens: 130, baseTokens: 100 })).toContain(
      "cost_regression",
    );
    expect(computeFlags(series(5, 5), series(5, 5), { candTokens: 120, baseTokens: 100 })).not.toContain(
      "cost_regression",
    );
  });
});

describe("activationSeries", () => {
  test("ignores rows without activation metadata", () => {
    expect(activationSeries([rec({}), rec({ outcome: false })])).toEqual({});
  });

  test("counts engagement, not case pass — an indicative miss is outcome:true-adjacent noise", () => {
    // Three runs of one indicative positive: engaged once. `outcome` is false on the two misses,
    // but the number that matters here is 1/3 ENGAGED.
    const rows = [
      act({ activated: true, outcome: true }),
      act({ activated: false, outcome: false }),
      act({ activated: false, outcome: false }),
    ];
    const a = activationSeries(rows)["f.eval.ts > d > a case"];
    expect(a.engaged).toEqual(series(1, 3));
    expect(a.shouldActivate).toBe(true);
    expect(a.indicative).toBe(true);
  });

  test("a negative case reports engagement raw — a HIGH rate is its failure", () => {
    const rows = [
      act({ should_activate: false, indicative: false, activated: true, outcome: false }),
      act({ should_activate: false, indicative: false, activated: false, outcome: true }),
    ];
    const a = activationSeries(rows)["f.eval.ts > d > a case"];
    expect(a.engaged).toEqual(series(1, 2));
    expect(a.shouldActivate).toBe(false);
  });

  test("keyed by nodeid, so a renamed case splits instead of pooling", () => {
    const out = activationSeries([
      act({ nodeid: "f.eval.ts > d > old name", activated: true }),
      act({ nodeid: "f.eval.ts > d > new name", activated: false }),
    ]);
    expect(Object.keys(out).sort()).toEqual(["f.eval.ts > d > new name", "f.eval.ts > d > old name"]);
  });

  test("models are deduped and sorted; a missing model reads as unknown", () => {
    const a = activationSeries([
      act({ activated: true, model: "claude-sonnet-5" }),
      act({ activated: true, model: "claude-haiku-4-5" }),
      act({ activated: true, model: undefined }),
    ])["f.eval.ts > d > a case"];
    expect(a.models).toEqual(["claude-haiku-4-5", "claude-sonnet-5", "unknown"]);
  });
});

describe("engagementByOutcome", () => {
  test("recovers engagement from outcome for a POSITIVE case (engaged === outcome)", () => {
    const rows = [
      rec({ outcome: true, case_kind: undefined }),
      rec({ outcome: false, case_kind: undefined }),
      rec({ outcome: false, case_kind: undefined }),
    ];
    expect(engagementByOutcome(rows, { "f.eval.ts > d > a case": true })).toEqual({
      "f.eval.ts > d > a case": series(1, 3),
    });
  });

  test("inverts for a NEGATIVE case — a passing negative means it did NOT engage", () => {
    const rows = [rec({ outcome: true }), rec({ outcome: true }), rec({ outcome: false })];
    expect(engagementByOutcome(rows, { "f.eval.ts > d > a case": false })).toEqual({
      "f.eval.ts > d > a case": series(1, 3),
    });
  });

  test("an explicit `activated` field wins over the derivation", () => {
    // outcome:true on a positive would imply engaged, but the row states otherwise — trust the row.
    const rows = [rec({ outcome: true, activated: false })];
    expect(engagementByOutcome(rows, { "f.eval.ts > d > a case": true })).toEqual({
      "f.eval.ts > d > a case": series(0, 1),
    });
  });

  test("a nodeid with unknown polarity is skipped, never assumed positive", () => {
    expect(engagementByOutcome([rec({ outcome: false })], {})).toEqual({});
    expect(engagementByOutcome([rec({ nodeid: "other" })], { "f.eval.ts > d > a case": true })).toEqual({});
  });
});

describe("activationFloorBreaches", () => {
  const zeros = (n: number, over: Partial<EvalRecord> = {}) =>
    Array.from({ length: n }, () => act({ activated: false, outcome: false, ...over }));

  test("an indicative positive that has never engaged in its lifetime is a breach", () => {
    const b = activationFloorBreaches(zeros(2), zeros(5), 5);
    expect(b).toHaveLength(1);
    // Reports the LIFETIME series, not the two rows of the current invocation.
    expect(b[0].engaged).toEqual(series(0, 5));
  });

  test("a zero series does NOT breach when the lifetime shows it engages sometimes", () => {
    // The onion-architecture shape: ~1 in 17, so an all-zero series of 5 is the expected outcome.
    const lifetime = [...zeros(16), act({ activated: true, outcome: true })];
    expect(activationFloorBreaches(zeros(5), lifetime, 5)).toEqual([]);
  });

  test("a lifetime shorter than minN is omitted — too little evidence to assert never", () => {
    expect(activationFloorBreaches(zeros(2), zeros(4), 5)).toEqual([]);
    expect(activationFloorBreaches(zeros(2), zeros(5), 5)).toHaveLength(1);
  });

  test("only cases in scope are judged — an unrelated old zero series never fails the run", () => {
    const other = zeros(9, { nodeid: "f.eval.ts > d > some other case" });
    expect(activationFloorBreaches(zeros(2), [...zeros(5), ...other], 5)).toHaveLength(1);
    // Nothing from this invocation → nothing to fail on, however bad the ledger looks.
    expect(activationFloorBreaches([], other, 5)).toEqual([]);
  });

  test("a NEGATIVE case never breaches — not engaging is what it asks for", () => {
    const rows = zeros(5, { should_activate: false });
    expect(activationFloorBreaches(rows, rows, 5)).toEqual([]);
  });

  test("a non-indicative positive never breaches — it already hard-fails the suite", () => {
    const rows = zeros(5, { indicative: false });
    expect(activationFloorBreaches(rows, rows, 5)).toEqual([]);
  });

  test("lifetime engagement is recovered from rows predating the metadata", () => {
    // Old rows carry neither case_kind nor `activated`; polarity comes from the in-scope rows.
    const old = Array.from({ length: 6 }, () => rec({ outcome: true }));
    expect(activationFloorBreaches(zeros(2), old, 5)).toEqual([]);
  });
});
