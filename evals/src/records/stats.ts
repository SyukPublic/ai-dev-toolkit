/**
 * Pure statistics over persisted records — no model, no I/O beyond reading records.jsonl.
 * The math lives here and is unit-tested in stats.test.ts; repeat/delta/benchmark only assemble
 * their own output shapes on top of these primitives.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RESULTS_DIR } from "../artifacts/paths.js";
import { FLAKY_LOW, FLAKY_HIGH, COST_REGRESSION_RATIO } from "../config.js";

const RECORDS = join(RESULTS_DIR, "records.jsonl");

export interface Stats {
  mean: number;
  stddev: number;
  min: number;
  max: number;
  n: number;
}

/** Sample standard deviation (n−1). Empty → all zeros with n=0; consumers decide by `n`. */
export function calcStats(values: number[]): Stats {
  const n = values.length;
  if (n === 0) return { mean: 0, stddev: 0, min: 0, max: 0, n: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const stddev = n < 2 ? 0 : Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  return { mean, stddev, min, max, n };
}

export interface PracticeVerdict {
  practice: string;
  passed: boolean;
  evidence: string;
}

export interface EvalRecord {
  schema: number;
  run_id: string;
  git_sha: string;
  dirty: boolean;
  config: string;
  /** Model under test, resolved per run. Absent on rows written before it was recorded. */
  model?: string;
  judge_model?: string;
  /** Reasoning effort requested; absent on rows taken before the knob existed (= SDK default). */
  effort?: string;
  /**
   * Whether the skill tier injected `references/*.md` alongside `SKILL.md` for this row. Absent on
   * rows written before it was recorded — see `skillRefsUsed`, which reports those as "unknown"
   * rather than assuming a value they cannot prove.
   */
  skill_refs?: boolean;
  nodeid: string;
  label: string;
  outcome: boolean;
  /**
   * Activation metadata, written by the `kind: "activation"` branch of the case runner (absent on
   * every other kind, and on rows predating it). `outcome` already folds shouldActivate in, so
   * these exist to make the case *identifiable*, not to re-derive its pass/fail.
   */
  case_kind?: string;
  skill?: string;
  should_activate?: boolean;
  indicative?: boolean;
  activated?: boolean;
  score?: number;
  threshold?: number;
  practices: PracticeVerdict[];
  grounded?: number;
  /**
   * How the session ENDED, not a verdict — optional because rows written before it was persisted do
   * not carry it. `is_error: true` with `error_subtype: "error_max_turns"` is the normal, PASSING
   * ending for a negative activation case. Use these to tell a truncated or failed run from a genuine
   * content miss before diagnosing a red.
   */
  is_error?: boolean;
  error_subtype?: string;
  num_turns: number;
  metrics: { durationMs: number; inputTokens: number; outputTokens: number; toolCallCount: number };
  trace: { tools: string[]; subagents: string[]; skills: string[]; reads: string[] };
  output_file: string;
}

/** Count the lines currently in records.jsonl — a marker to slice "new since a run started". */
export function recordCount(): number {
  if (!existsSync(RECORDS)) return 0;
  return readFileSync(RECORDS, "utf8").split("\n").filter(Boolean).length;
}

/** Load records, optionally only those appended after `sinceLine`. */
export function loadRecords(sinceLine = 0): EvalRecord[] {
  if (!existsSync(RECORDS)) return [];
  return readFileSync(RECORDS, "utf8")
    .split("\n")
    .filter(Boolean)
    .slice(sinceLine)
    .map((l) => JSON.parse(l) as EvalRecord);
}

export interface Series {
  passed: number;
  total: number;
  rate: number;
}

const series = (passed: number, total: number): Series => ({ passed, total, rate: total ? passed / total : 0 });

export interface NodeAggregate {
  nodeid: string;
  label: string;
  pass: Series;
  /** Per practice text → pass series across the runs. Empty for workflow (no judge). */
  practices: Record<string, Series>;
  metrics: {
    durationMs: Stats;
    inputTokens: Stats;
    outputTokens: Stats;
    numTurns: Stats;
    toolCallCount: Stats;
  };
}

/** Aggregate a flat record list into per-nodeid stats. Pass a single config's records. */
export function aggregate(records: EvalRecord[]): Record<string, NodeAggregate> {
  const byNode = new Map<string, EvalRecord[]>();
  for (const r of records) {
    const arr = byNode.get(r.nodeid) ?? [];
    arr.push(r);
    byNode.set(r.nodeid, arr);
  }

  const out: Record<string, NodeAggregate> = {};
  for (const [nodeid, rows] of byNode) {
    const passed = rows.filter((r) => r.outcome).length;

    // Per-practice: count only rows where that practice was actually judged.
    const pPassed = new Map<string, number>();
    const pTotal = new Map<string, number>();
    for (const r of rows) {
      for (const pv of r.practices) {
        pTotal.set(pv.practice, (pTotal.get(pv.practice) ?? 0) + 1);
        if (pv.passed) pPassed.set(pv.practice, (pPassed.get(pv.practice) ?? 0) + 1);
      }
    }
    const practices: Record<string, Series> = {};
    for (const [text, total] of pTotal) practices[text] = series(pPassed.get(text) ?? 0, total);

    out[nodeid] = {
      nodeid,
      label: rows[rows.length - 1].label,
      pass: series(passed, rows.length),
      practices,
      metrics: {
        durationMs: calcStats(rows.map((r) => r.metrics?.durationMs ?? 0)),
        inputTokens: calcStats(rows.map((r) => r.metrics?.inputTokens ?? 0)),
        outputTokens: calcStats(rows.map((r) => r.metrics?.outputTokens ?? 0)),
        numTurns: calcStats(rows.map((r) => r.num_turns ?? 0)),
        toolCallCount: calcStats(rows.map((r) => r.metrics?.toolCallCount ?? 0)),
      },
    };
  }
  return out;
}

export interface ActivationAggregate {
  nodeid: string;
  label: string;
  skill: string;
  shouldActivate: boolean;
  indicative: boolean;
  /** How often the skill actually engaged — the raw fact, independent of what the case wanted. */
  engaged: Series;
  /** Distinct models that produced these rows; >1 means the rate pools incomparable runs. */
  models: string[];
}

/**
 * Per-case activation stats over the rows that carry activation metadata. Keyed by nodeid, so a
 * case renamed mid-series splits into two entries rather than silently pooling.
 *
 * `engaged` counts engagement, NOT case pass: for a negative case a HIGH engaged rate is the
 * failure. Reporting the raw fact is deliberate — it is the number that distinguishes "engaged 4
 * times in 5" from "never engaged once", which a pass rate alone hides for a negative case and an
 * `indicative` flag hides for a positive one.
 */
export function activationSeries(records: EvalRecord[]): Record<string, ActivationAggregate> {
  const byNode = new Map<string, EvalRecord[]>();
  for (const r of records) {
    if (r.case_kind !== "activation") continue;
    const arr = byNode.get(r.nodeid) ?? [];
    arr.push(r);
    byNode.set(r.nodeid, arr);
  }

  const out: Record<string, ActivationAggregate> = {};
  for (const [nodeid, rows] of byNode) {
    const last = rows[rows.length - 1];
    out[nodeid] = {
      nodeid,
      label: last.label,
      skill: last.skill ?? "?",
      shouldActivate: last.should_activate ?? true,
      indicative: Boolean(last.indicative),
      engaged: series(rows.filter((r) => r.activated).length, rows.length),
      models: [...new Set(rows.map((r) => r.model ?? "unknown"))].sort(),
    };
  }
  return out;
}

/**
 * Engagement recovered from `outcome` for rows that predate the activation metadata. For an
 * activation case `outcome === (activated === shouldActivate)`, so given the polarity the
 * engagement is exact arithmetic, not an inference: activated = shouldActivate ? outcome : !outcome.
 *
 * Polarity is supplied per nodeid by the caller (from rows that DO carry metadata), which is what
 * keeps this honest — a nodeid whose polarity is unknown is skipped rather than assumed positive.
 * Without this, the historical rate would restart from zero on every existing records.jsonl and the
 * summary would report "1/1" for a case that has engaged once in twelve tries.
 */
export function engagementByOutcome(
  records: EvalRecord[],
  polarity: Record<string, boolean>,
): Record<string, Series> {
  const engaged = new Map<string, number>();
  const total = new Map<string, number>();
  for (const r of records) {
    const shouldActivate = polarity[r.nodeid];
    if (shouldActivate === undefined) continue;
    total.set(r.nodeid, (total.get(r.nodeid) ?? 0) + 1);
    const didEngage = r.activated ?? (shouldActivate ? r.outcome : !r.outcome);
    if (didEngage) engaged.set(r.nodeid, (engaged.get(r.nodeid) ?? 0) + 1);
  }
  const out: Record<string, Series> = {};
  for (const [nodeid, n] of total) out[nodeid] = series(engaged.get(nodeid) ?? 0, n);
  return out;
}

/**
 * Indicative positive activation cases that have engaged ZERO times across their whole recorded
 * LIFETIME — the floor. Returned rather than thrown so the caller owns the exit code (a reporter
 * cannot set one; eval:repeat can).
 *
 * `scope` limits it to cases that ran in the current invocation (never fail on somebody's unrelated
 * old series); `lifetime` is what the verdict is computed from, and should be pre-filtered to one
 * model. Judging the lifetime rather than the current series is what makes the gate trustworthy in
 * both directions:
 *
 *   - A low-but-real rate stops being a false alarm. `onion-architecture` engages about 1 run in 17
 *     (its workspace CLAUDE.md routes most architectural questions away), so an all-zero series of 5
 *     is the EXPECTED outcome ~73% of the time. Failing on that would make the gate noise; its
 *     lifetime is non-zero, so it never breaches.
 *   - "Never once, ever" keeps failing, which is the claim worth gating on: run-plan's invalid case
 *     sat at a true 0/13 for the life of the repo because its prompt named a fixture that did not
 *     exist.
 *
 * The returned aggregate reports the LIFETIME series, so the printed `0/N` is the whole evidence
 * base and not just this run's slice.
 */
export function activationFloorBreaches(
  scope: EvalRecord[],
  lifetime: EvalRecord[],
  minN: number,
): ActivationAggregate[] {
  const cases = activationSeries(scope);
  const polarity: Record<string, boolean> = {};
  for (const [id, a] of Object.entries(cases)) polarity[id] = a.shouldActivate;
  const life = engagementByOutcome(lifetime, polarity);

  return Object.values(cases)
    .filter((a) => a.shouldActivate && a.indicative)
    .map((a) => ({ ...a, engaged: life[a.nodeid] ?? a.engaged }))
    .filter((a) => a.engaged.total >= minN && a.engaged.passed === 0);
}

/**
 * The distinct skill-payload settings behind a row set: `"refs"`, `"skill-only"`, `"unknown"`.
 *
 * The sibling of the `models` field on an aggregate, and it exists for the same reason: MORE THAN ONE
 * VALUE MEANS THE RATE POOLS INCOMPARABLE RUNS. For the 5 skills that ship a `references/` directory,
 * "SKILL.md" and "SKILL.md + references" are different measurements — `fastify-best-practices` injects
 * 177,440 chars against `SKILL.md`'s 4,574 — so a lifetime rate mixing them means nothing, and the
 * mixing is otherwise invisible because the ledger pools by case name alone.
 *
 * "unknown" is a row from before `skill_refs` was recorded. Those were all taken with references
 * injected, but the row cannot prove it, so this reports rather than assumes — the same call made for
 * `model` when it was added. Treat a set containing "unknown" alongside a real value as suspect for
 * the 5 affected suites, and as harmless for the other 7 (where the setting is a no-op, pinned by
 * src/artifacts/skill-refs.test.ts).
 */
export function skillRefsUsed(records: EvalRecord[]): string[] {
  const seen = new Set<string>();
  for (const r of records) {
    seen.add(r.skill_refs === undefined ? "unknown" : r.skill_refs ? "refs" : "skill-only");
  }
  return [...seen].sort();
}

/** Split a record list by its `config` tag. */
export function byConfig(records: EvalRecord[]): Record<string, EvalRecord[]> {
  const out: Record<string, EvalRecord[]> = {};
  for (const r of records) (out[r.config] ??= []).push(r);
  return out;
}

export type Flag = "non_discriminating" | "always_failing" | "flaky" | "cost_regression" | "missing_data";

/**
 * Deterministic analyst flags for one candidate/baseline pair (a test or a practice). Empty
 * (n=0) and a measured zero are never conflated: n=0 → missing_data; n>0 rate 0 → always_failing.
 */
export function computeFlags(
  cand: Series | undefined,
  base: Series | undefined,
  opts: { candTokens?: number; baseTokens?: number } = {},
): Flag[] {
  const flags: Flag[] = [];
  const cn = cand?.total ?? 0;
  const bn = base?.total ?? 0;

  if (cn === 0 || bn === 0) flags.push("missing_data");

  const cr = cn ? cand!.rate : undefined;
  const br = bn ? base!.rate : undefined;
  if (cr !== undefined && br !== undefined) {
    if (cr === 1 && br === 1) flags.push("non_discriminating");
    if (cr === 0 && br === 0) flags.push("always_failing");
  }
  for (const r of [cr, br]) {
    if (r !== undefined && r > FLAKY_LOW && r < FLAKY_HIGH && !flags.includes("flaky")) flags.push("flaky");
  }
  const { candTokens, baseTokens } = opts;
  if (candTokens && baseTokens && candTokens > baseTokens * COST_REGRESSION_RATIO) flags.push("cost_regression");

  return flags;
}
