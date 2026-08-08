/**
 * Persist one eval run. Every case — passing OR failing — leaves a durable record: the verdict
 * with its per-practice evidence, the grounding result, resource metrics, the trace, git
 * provenance, and the configuration it ran under. The full model output is written alongside so
 * it can be re-read (or re-judged) later instead of being thrown away.
 *
 * `results/` is gitignored and append-only — deleting it is always safe.
 */

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import { EVAL_CONFIG, EVAL_JUDGE_MODEL, EVAL_SKILL_REFS } from "../config.js";
import { RESULTS_DIR } from "../artifacts/paths.js";
import { gitInfo } from "../git.js";
import { currentRunId } from "../run-id.js";
import type { Result } from "../runtime/run-claude.js";
import type { Verdict } from "../scoring/llm-judge.js";

const RECORDS = join(RESULTS_DIR, "records.jsonl");
const OUTPUTS = join(RESULTS_DIR, "outputs");

// One id per RUN, read from the environment (global-setup.ts stamps it in the main process before
// workers fork). Stamping it here instead was per WORKER, which split one `pnpm eval` into several
// ids and made run_id useless for grouping — see src/run-id.ts.
const RUN_ID = currentRunId();
const { sha: GIT_SHA, dirty: DIRTY } = gitInfo();

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "case";

export interface RecordData {
  result: Result;
  verdict?: Verdict;
  grounded?: number;
  threshold?: number;
  /**
   * Explicit pass/fail when the case's assertion is not derivable from result/verdict alone —
   * e.g. a negative activation case legitimately runs to the turn cap (isError=true yet PASSING),
   * and an indicative positive miss can end cleanly (isError=false yet a MISS). Without this the
   * `!result.isError` fallback below mis-records exactly those workflow cases.
   */
  outcome?: boolean;
  extra?: Record<string, unknown>;
}

/**
 * Append a record for the currently-running test. Call from a `finally` so it fires even when
 * the assertions that follow it throw — that is what keeps a failing configuration's series
 * from being silently empty.
 */
export function record(label: string, data: RecordData): void {
  const { result, verdict, grounded, threshold, extra } = data;
  const state = expect.getState();
  const nodeid = `${state.testPath ?? "?"} > ${state.currentTestName ?? label}`;

  // outcome: an explicit caller verdict wins; else grounding gate failure short-circuits to
  // false; else the judge threshold; else "did the run itself succeed" (last-resort fallback).
  const outcome =
    data.outcome ??
    (grounded !== undefined && grounded < 1
      ? false
      : verdict && threshold !== undefined
        ? verdict.score >= threshold
        : !result.isError);

  const outDir = join(OUTPUTS, RUN_ID);
  mkdirSync(outDir, { recursive: true });
  const outputFile = join("outputs", RUN_ID, `${slugify(label)}.md`);
  writeFileSync(join(RESULTS_DIR, outputFile), result.text);

  const row = {
    schema: 1,
    run_id: RUN_ID,
    git_sha: GIT_SHA,
    dirty: DIRTY,
    config: EVAL_CONFIG,
    // Which models produced this row. `model` is the resolved per-run value, so an
    // `EVAL_MODEL=... pnpm eval:repeat` probe stays distinguishable from the default series it
    // gets appended next to; `judge_model` is the config default, which is exact while
    // src/dsl/case.ts remains the only llmJudge caller (it passes no override).
    model: result.model,
    judge_model: EVAL_JUDGE_MODEL,
    // The reasoning effort ASKED for (absent = the SDK's default for that model, which is what every
    // row before this field was taken at). Same grouping hazard as `model` and `skill_refs`: an
    // `EVAL_EFFORT=xhigh` probe lands in this same append-only file, and a rate that pools two effort
    // levels is not a rate. Note the SDK silently downgrades an unsupported level, so this records the
    // request, not the confirmed setting.
    effort: result.effort,
    // WHAT was injected for a skill-tier row: SKILL.md alone, or SKILL.md plus its references/.
    // Recorded for the same reason `model` is — those are two different measurements for the 5 skills
    // that ship a references/ directory (fastify injects 177,440 chars against SKILL.md's 4,574), and
    // without this field a probe run with EVAL_SKILL_REFS=0 would pool silently into the default
    // series and quietly move every lifetime rate it touched. Always written, including on the 7
    // skills and the agent/workflow tiers where it makes no difference, because a field that is
    // sometimes absent cannot be grouped on. Rows predating it read as `undefined` — which is
    // accurate, not a gap: they were all taken with references injected, but the ledger cannot prove
    // that per row, so `skillRefsUsed` reports them as "unknown" rather than assuming.
    skill_refs: EVAL_SKILL_REFS,
    nodeid,
    label,
    outcome,
    // HOW the session ended, which the row could not express before. `outcome` alone conflates a
    // content failure with a run that never produced content: a turn-cap end, an API error, a crash.
    // `runClaude` already classifies this (`error_max_turns` vs `error`) and it was being thrown away,
    // so nothing downstream could tell a truncated answer from a bad one — the ledger had to be
    // cross-read against durations and tool counts by hand. Note `is_error: true` is NORMAL and
    // PASSING for a negative activation case, which is designed to run to the cap; it is a
    // description of the ending, not a verdict.
    is_error: result.isError,
    error_subtype: result.errorSubtype,
    score: verdict?.score,
    threshold,
    practices: verdict?.results ?? [],
    grounded,
    num_turns: result.numTurns,
    metrics: result.metrics,
    trace: {
      tools: result.toolsUsed,
      subagents: result.subagents,
      skills: result.skillsInvoked,
      reads: result.filesRead,
    },
    output_file: outputFile,
    ...extra,
  };

  mkdirSync(RESULTS_DIR, { recursive: true });
  appendFileSync(RECORDS, JSON.stringify(row) + "\n");
}
