/**
 * Run the same eval pattern N times to measure stability (LLM evals are probabilistic — one
 * green run proves little). Wraps `vitest run`, so vitest flags (-t, path patterns) pass through;
 * only -n/--times and --label are consumed here. Aggregates the records written during the runs
 * into per-test pass rate, a per-practice breakdown, and metric stats (mean ± stddev).
 *
 *   pnpm eval:repeat skills/onion-architecture -n 5 --label baseline
 *
 * --label saves the aggregate to results/repeat-<label>.json so two labeled series can be diffed
 * with `pnpm eval:delta baseline candidate`.
 */

import { mkdirSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { GREEN, RED, DIM, RESET, rateColor } from "./ansi.js";
import { ACTIVATION_FLOOR_FAIL_N, EVAL_MODEL, REPEAT_WARN_SESSIONS } from "./config.js";
import { gitInfo } from "./git.js";
import { countTests, runVitestOnce } from "./run-vitest.js";
import { RESULTS_DIR } from "./artifacts/paths.js";
import {
  activationFloorBreaches,
  aggregate,
  loadRecords,
  recordCount,
  type NodeAggregate,
  type Stats,
} from "./records/stats.js";

/**
 * vitest treats a path pattern as a SUBSTRING filter, so a bare directory arg like
 * `agents/architecture-reviewer` also matches any sibling whose name EXTENDS it (e.g. a future
 * `agents/architecture-reviewer-x/...`), silently doubling the run onto the wrong agent. Expand
 * any positional arg that points at a directory into the exact `.eval.ts` file paths inside it
 * (which are NOT substrings of a sibling directory's files), so the run stays scoped to exactly
 * the intended eval. Args that already name a file, or that don't resolve to a directory, pass
 * through.
 */
function resolveEvalPatterns(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    // Preserve flags and the value that follows a value-taking flag (e.g. -t <pattern>).
    if (a.startsWith("-")) {
      out.push(a);
      if (a === "-t" || a === "--testNamePattern") out.push(args[++i]);
      continue;
    }
    if (existsSync(a) && statSync(a).isDirectory()) {
      const evals = readdirSync(a)
        .filter((f) => f.endsWith(".eval.ts"))
        .map((f) => join(a, f));
      if (evals.length) {
        out.push(...evals);
        continue;
      }
    }
    out.push(a);
  }
  return out;
}

const pct = (rate: number) => `${Math.round(rate * 100)}%`;
const statLine = (label: string, s: Stats) =>
  `      ${label}: ${s.mean.toFixed(0)} ± ${s.stddev.toFixed(0)} [${s.min}–${s.max}]`;

function printTest(agg: NodeAggregate, times: number): void {
  const shortId = agg.nodeid.split(" > ").slice(-1)[0];
  console.log(`\n  ${rateColor(agg.pass.rate)}${agg.pass.passed}/${agg.pass.total} ${pct(agg.pass.rate)}${RESET}  ${shortId}`);
  const practices = Object.entries(agg.practices);
  if (practices.length) {
    for (const [text, s] of practices) {
      console.log(`      ${rateColor(s.rate)}${s.passed}/${s.total} ${pct(s.rate).padStart(4)}${RESET}  ${text}`);
    }
  }
  console.log(statLine("turns   ", agg.metrics.numTurns));
  console.log(statLine("duration", agg.metrics.durationMs));
  console.log(statLine("tok_out ", agg.metrics.outputTokens));
  if (times < 5) console.log(`      ${DIM}(n=${times}: stddev indicative only)${RESET}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  // Runs are capped to keep token spend bounded — LLM sessions are expensive. The default of 2 is
  // enough to catch a blatantly flaky case; 5 is the point where the printed stddev stops being
  // "indicative only" (see printTest). Raise the ceiling for a deliberate stability run with
  // EVAL_REPEAT_MAX, which is also what -n is capped to.
  const MAX_TIMES = Number(process.env.EVAL_REPEAT_MAX ?? "5");
  const DEFAULT_TIMES = 2;
  let times = DEFAULT_TIMES;
  let label: string | undefined;
  const vitestArgs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-n" || a === "--times") times = Number(argv[++i]);
    else if (a === "--label") label = argv[++i];
    else vitestArgs.push(a);
  }
  if (vitestArgs.length === 0 || !Number.isFinite(times) || times < 1) {
    console.error(
      `usage: pnpm eval:repeat <vitest pattern> [-n times<=${MAX_TIMES}] [-t testNamePattern] [--label name]`,
    );
    process.exit(1);
  }
  if (times > MAX_TIMES) {
    console.error(`  ${DIM}capping -n ${times} → ${MAX_TIMES} (token economy)${RESET}`);
    times = MAX_TIMES;
  }
  vitestArgs.splice(0, vitestArgs.length, ...resolveEvalPatterns(vitestArgs));

  const startLine = recordCount();
  let line = startLine;
  const nCases = countTests(vitestArgs);
  console.log(`\nRepeat: ${vitestArgs.map((a) => (a.includes(" ") ? JSON.stringify(a) : a)).join(" ")}`);
  console.log(`  ${nCases ?? "?"} test case(s) × ${times} runs  (full traces in results/outputs/)\n`);
  // Cost tripwire. Each case is a real model session, and a pattern that matches more than intended
  // is invisible in the summary that follows — it just looks like a broader series. Quoting the
  // args above makes a mangled -t value legible; this makes an unexpectedly wide match legible.
  if (nCases !== null && nCases * times > REPEAT_WARN_SESSIONS) {
    console.log(
      `  ${RED}${nCases * times} model sessions${RESET} — more than ${REPEAT_WARN_SESSIONS}. ` +
        `If that is more than you meant, check the pattern above:\n` +
        `  ${DIM}a -t value is ONE argument (quote it), and every bare positional is a separate` +
        ` file filter.${RESET}\n`,
    );
  }
  for (let i = 1; i <= times; i++) {
    const captured = await runVitestOnce(`run ${i}/${times}`, vitestArgs);
    const fresh = loadRecords(line);
    line = recordCount();
    if (fresh.length === 0) {
      console.log(`  run ${i}/${times}  ${RED}no records — run crashed${RESET}`);
      if (captured) console.log(captured.split("\n").slice(-6).join("\n"));
      continue;
    }
    const passed = fresh.filter((r) => r.outcome).length;
    const mark = passed === fresh.length ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    console.log(`  run ${i}/${times}  ${mark} ${passed}/${fresh.length} cases`);
    // A run that recorded FEWER rows than the pattern matches is the shape that quietly shrinks a
    // denominator: the summary below then averages over 4 runs while printing "5 runs", and the
    // rate reads slightly better than it was measured. record() fires in a finally, so a missing
    // row means the case died before scoring (a throwing task(), or a vitest-level timeout) — the
    // child's own output is the only place that says which. Dump it instead of losing it.
    if (nCases !== null && fresh.length < nCases) {
      const missing = nCases - fresh.length;
      console.log(
        `        ${RED}${missing} case(s) produced no record${RESET} ${DIM}— died before scoring;` +
          ` child output follows${RESET}`,
      );
      if (captured) {
        for (const l of captured.split("\n").filter((l) => /error|fail|timed? ?out|✗|unhandled/i.test(l)).slice(-8)) {
          console.log(`        ${DIM}${l.trim()}${RESET}`);
        }
      }
    }
  }

  const records = loadRecords(startLine);
  const tests = aggregate(records);
  const nodeids = Object.keys(tests).sort();

  console.log(`\n${"=".repeat(60)}\nRepeat summary (${times} runs)\n${"=".repeat(60)}`);
  if (nodeids.length === 0) {
    console.log("  (no records produced — check the pattern / -t filter)");
  }
  for (const id of nodeids) printTest(tests[id], times);

  if (label) {
    const git = gitInfo();
    mkdirSync(RESULTS_DIR, { recursive: true });
    const file = join(RESULTS_DIR, `repeat-${label}.json`);
    writeFileSync(file, JSON.stringify({ label, git_sha: git.sha, dirty: git.dirty, times, vitestArgs, tests }, null, 2));
    console.log(`\n${GREEN}Saved as '${label}'${RESET} -> ${file}`);
    console.log(`Compare with: pnpm eval:delta <baseline-label> ${label}`);
  }

  // The activation floor. `indicative` deliberately stops one miss from failing a suite, but it
  // cannot tell a 4-in-5 skill from one that has never engaged at all — so "never engaged, ever" is
  // asserted HERE, where an exit code is ours to set.
  //
  // Judged on the case's whole recorded LIFETIME at this model, not on this series: a skill that
  // engages 1 run in 17 (measured: onion-architecture) produces an all-zero series of 5 about 73%
  // of the time, and failing on that would make the gate noise. Scoped to the cases this invocation
  // actually ran, so it never fails on an unrelated old series.
  const lifetime = loadRecords(0).filter((r) => (r.model ?? "unknown") === EVAL_MODEL);
  const breaches = activationFloorBreaches(records, lifetime, ACTIVATION_FLOOR_FAIL_N);
  if (breaches.length) {
    console.log(`\n${RED}Activation floor: ${breaches.length} case(s) have NEVER engaged${RESET}`);
    for (const b of breaches) {
      console.log(
        `  ${RED}0/${b.engaged.total}${RESET} lifetime (${EVAL_MODEL})  ${b.skill}  ` +
          `${DIM}${b.nodeid.split(" > ").slice(-1)[0]}${RESET}`,
      );
    }
    console.log(
      `\n${DIM}Not once in ${ACTIVATION_FLOOR_FAIL_N}+ runs is not model variance. Before touching` +
        ` the skill's description,\n  check the case itself: is every path in the prompt present in` +
        ` the workspace, and does the\n  workspace CLAUDE.md route the question elsewhere? Read` +
        ` results/outputs/ for the trace —\n  a skill cannot engage on a file that does not exist.` +
        `${RESET}`,
    );
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
