/**
 * Version-over-version comparison: which cases flipped between two runs.
 *
 *   pnpm eval:compare              # last two runs
 *   pnpm eval:compare --list       # list recorded runs
 *   pnpm eval:compare <a> <b>      # two specific run ids
 *
 * Reads results/records.jsonl, NOT results/history.jsonl. history stores the VITEST STATE, where an
 * indicative activation miss is deliberately a `pass` — so the old version of this tool was
 * structurally blind to every activation positive. Measured divergence at the time: `mermaid-diagram`
 * 1/4 in records against 4/4 in history, `typescript-expert` 3/11 against 6/6. records carries the
 * real outcome plus `model`, `config` and per-practice verdicts.
 *
 * This became possible only once a vitest run had ONE id (see src/run-id.ts). Before that, record.ts
 * stamped its id per worker and a single `pnpm eval` split into several ids, so records could not be
 * grouped into runs at all. **Rows written before that fix keep their split ids** and will show up here
 * as several small runs — that is history, not a bug.
 *
 * history.jsonl still earns its keep, and now actually delivers what its own doc comment always
 * claimed: because both ledgers share the run id, a case present in history but ABSENT from records for
 * the same run is a case that died before scoring (the session threw inside task(), so record() never
 * ran). Nothing implemented that cross-check until now; see "died before scoring" below.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DIM, GREEN, RED, RESET, YELLOW } from "./ansi.js";
import { loadRecords, skillRefsUsed, type EvalRecord } from "./records/stats.js";

const HISTORY = join(dirname(fileURLToPath(import.meta.url)), "..", "results", "history.jsonl");

/**
 * A case counts as STABLE at a model when its pooled lifetime rate sits at one of the extremes. Only
 * then does a single flip mean something.
 *
 * This is the rule the old tool lacked, and without it a records-backed compare is worse than the
 * history-backed one it replaces: activation positives for broad subjects genuinely sit at 11–32% on
 * haiku (`security` 12/37, `run-plan` 5/27, `onion-architecture` 2/18), so they flip almost every run.
 * Reporting those as regressions would bury the real ones. Same reasoning, and the same "judge the
 * LIFETIME, not the series" discipline, as the activation floor in repeat.ts.
 */
const STABLE_HI = 0.9;
const STABLE_LO = 0.1;
/** Below this many lifetime rows the extremes are not trustworthy either — 3/3 is not 100%. */
const MIN_LIFETIME = 5;

export type FlipVerdict = "regressed" | "improved" | "variance";

/**
 * Classify a flip. A flip matters when the LATER run departs from the case's own norm — not merely
 * when the lifetime rate is extreme.
 *
 * Getting this wrong was caught while testing against the real ledger: a case whose lifetime at haiku
 * is 0/5 flipped pass→fail and was reported as a REGRESSION, when failing is precisely what it always
 * does there — the anomaly was the other run passing. Symmetrically, a case at 11/12 that passed in the
 * later run is not an "improvement"; the earlier run was the outlier. Only two of the four combinations
 * are news.
 */
export function classifyFlip(
  passedInB: boolean,
  lt: { passed: number; total: number; rate: number },
  /**
   * B's session ended in a genuine failure (`error_subtype: "error"` — an API error, a crash) rather
   * than by producing a bad answer. Such a row is not a regression at any lifetime rate: measured, an
   * `API Error: 529 Overloaded` cost a whole run of five and its rows carry `outputTokens: 0` with an
   * empty `practices`, which reads as a failing case. A turn-cap end is NOT this — it is the normal,
   * passing ending for a negative activation case, so callers must not pass `error_max_turns` here.
   */
  bFailedToRun = false,
): FlipVerdict {
  if (lt.total < MIN_LIFETIME) return "variance"; // 3/3 is not 100%
  if (bFailedToRun) return "variance";
  if (lt.rate >= STABLE_HI && !passedInB) return "regressed";
  if (lt.rate <= STABLE_LO && passedInB) return "improved";
  return "variance";
}

interface Run {
  sha: string;
  dirty: boolean;
  models: Set<string>;
  configs: Set<string>;
  /** Skill-payload settings behind the run: "refs" / "skill-only" / "unknown". See skillRefsUsed. */
  skillRefs: Set<string>;
  outcomes: Map<string, boolean>;
  labels: Map<string, string>;
  /** nodeids whose session failed to RUN (not a bad answer). Absent on rows predating the field. */
  failedToRun: Set<string>;
}

function loadRuns(records: EvalRecord[]): Map<string, Run> {
  const runs = new Map<string, Run>();
  for (const r of records) {
    const run =
      runs.get(r.run_id) ??
      ({
        sha: r.git_sha,
        dirty: Boolean(r.dirty),
        models: new Set<string>(),
        configs: new Set<string>(),
        skillRefs: new Set<string>(),
        outcomes: new Map<string, boolean>(),
        labels: new Map<string, string>(),
        failedToRun: new Set<string>(),
      } satisfies Run);
    if (r.model) run.models.add(r.model);
    if (r.config) run.configs.add(r.config);
    for (const s of skillRefsUsed([r])) run.skillRefs.add(s);
    run.outcomes.set(r.nodeid, r.outcome);
    run.labels.set(r.nodeid, r.label);
    // "error", not "error_max_turns": a turn-cap end is the normal, passing ending for a negative
    // activation case, while "error" means the session never got to produce an answer.
    if (r.error_subtype === "error") run.failedToRun.add(r.nodeid);
    runs.set(r.run_id, run);
  }
  return runs;
}

/**
 * The two ledgers cannot be compared on `nodeid` directly — they are built differently:
 *
 *   history: `plugins/…/review-workflow.eval.ts > API-route task reads api-guidelines …`
 *   records: `E:/…/plugins/…/review-workflow.eval.ts > workflow:review > API-route task reads …`
 *
 * history's comes from the vitest reporter (relative path, describe level flattened away); records' is
 * `state.testPath` plus `state.currentTestName`, which is absolute and keeps the describe chain. So the
 * key is (file BASENAME, LEAF test name), which both can produce. Collision risk: two cases with the
 * same leaf name in one file under different describes. None exist here, and a collision would only
 * hide a died-before-scoring row, never invent one.
 */
export const crossKey = (nodeid: string): string => {
  const parts = nodeid.split(" > ");
  const base = parts[0].split(/[\\/]/).pop() ?? parts[0];
  return `${base}|${parts[parts.length - 1]}`;
};

/**
 * run_id → executed leaf cases, for the died-before-scoring cross-check.
 *
 * Restricted to `*.eval.ts`, because only those call `record()`. `history.jsonl` is written by a vitest
 * reporter and so also holds the pure unit tests under `src/`, which never write a records row by
 * design — counting those made the first full run report 181 phantom casualties.
 */
function loadHistoryNodes(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  if (!existsSync(HISTORY)) return out;
  for (const line of readFileSync(HISTORY, "utf8").split("\n").filter(Boolean)) {
    const r = JSON.parse(line) as { run_id: string; nodeid: string };
    if (!r.nodeid.split(" > ")[0].endsWith(".eval.ts")) continue;
    const set = out.get(r.run_id) ?? new Set<string>();
    set.add(r.nodeid);
    out.set(r.run_id, set);
  }
  return out;
}

/**
 * The describe labels records has seen per file, e.g. `skill:security`, `agent:test-writer`. Rows for
 * those appear in history written before the reporter was fixed to emit leaf tests only — a `describe`
 * block carries a result state too. Derived from the data rather than pattern-matched on `skill:`/
 * `agent:`/`workflow:`, so it stays correct if the tier prefixes ever change.
 */
function suiteLabels(records: EvalRecord[]): Set<string> {
  const out = new Set<string>();
  for (const r of records) {
    const parts = r.nodeid.split(" > ");
    const base = parts[0].split(/[\\/]/).pop() ?? parts[0];
    for (const middle of parts.slice(1, -1)) out.add(`${base}|${middle}`);
  }
  return out;
}

/** Pooled lifetime pass rate for a case AT ONE MODEL. Pooling across models compares nothing. */
function lifetime(records: EvalRecord[], nodeid: string, model: string | undefined) {
  const rows = records.filter((r) => r.nodeid === nodeid && (r.model ?? "unknown") === (model ?? "unknown"));
  const passed = rows.filter((r) => r.outcome).length;
  return { passed, total: rows.length, rate: rows.length ? passed / rows.length : 0 };
}

const shortNode = (nodeid: string, label: string) => {
  const file = nodeid.split(" > ")[0].split(/[\\/]/).pop() ?? "?";
  return `${file} > ${label}`;
};

function main() {
  const args = process.argv.slice(2);
  const records = loadRecords();
  const runs = loadRuns(records);
  if (runs.size === 0) {
    console.log("No runs recorded yet. Run `pnpm eval` first.");
    return;
  }

  if (args.includes("--list")) {
    for (const [id, r] of runs) {
      const passed = [...r.outcomes.values()].filter(Boolean).length;
      const models = [...r.models].join(",") || "unknown";
      console.log(
        `${id}  sha ${(r.sha + (r.dirty ? "-dirty" : "")).padEnd(16)} ` +
          `${String(passed).padStart(3)}/${String(r.outcomes.size).padEnd(3)} passed  ${models}`,
      );
    }
    return;
  }

  const ids = args.length === 2 ? args : [...runs.keys()].slice(-2);
  if (ids.length < 2) return console.log("Need at least two runs to compare.");
  const missing = ids.filter((id) => !runs.has(id));
  if (missing.length) return console.log(`Unknown run id(s): ${missing.join(", ")}  (try --list)`);
  const [a, b] = ids.map((id) => runs.get(id)!);

  console.log(`A ${ids[0]}  sha ${a.sha}${a.dirty ? "-dirty" : ""}  ${[...a.models].join(",")}`);
  console.log(`B ${ids[1]}  sha ${b.sha}${b.dirty ? "-dirty" : ""}  ${[...b.models].join(",")}`);
  if (a.sha === b.sha) {
    console.log(`${DIM}note: same git sha — differences are run-to-run noise, not a version change.${RESET}`);
  }
  // A model switch restarts every pooled statistic, so a cross-model diff measures the model rather
  // than the change. Same trap the activation floor and summary already guard against.
  const sameModel = [...a.models].join(",") === [...b.models].join(",");
  if (!sameModel) {
    console.log(
      `${YELLOW}warning: different models (${[...a.models].join(",") || "?"} vs ` +
        `${[...b.models].join(",") || "?"}) — this diff measures the model, not the change.${RESET}`,
    );
  }
  // The same trap as the model switch, one level down and much easier to miss: for the 5 skills that
  // ship a references/ directory, "SKILL.md" and "SKILL.md + references" are different measurements
  // (fastify injects 177,440 chars against SKILL.md's 4,574), and nothing else in the output would
  // reveal that the two runs were not asking the same question. "unknown" is a pre-field row, so a
  // mixed set including it is only suspect for those 5 suites.
  const refs = new Set([...a.skillRefs, ...b.skillRefs]);
  if (refs.size > 1) {
    console.log(
      `${YELLOW}warning: mixed skill payloads (${[...refs].join(", ")}) — for the skills that ship ` +
        `references/, this diff measures what was injected, not the change.${RESET}`,
    );
  }
  const configs = new Set([...a.configs, ...b.configs]);
  if (configs.size > 1) {
    console.log(`${YELLOW}warning: mixed configs (${[...configs].join(", ")}) — candidate and baseline are not comparable.${RESET}`);
  }

  const gained: string[] = [];
  const lost: string[] = [];
  const unstable: string[] = [];

  for (const node of [...a.outcomes.keys()].sort()) {
    if (!b.outcomes.has(node)) continue;
    const oa = a.outcomes.get(node)!;
    const ob = b.outcomes.get(node)!;
    if (oa === ob) continue;

    const label = b.labels.get(node) ?? a.labels.get(node) ?? node;
    // Lifetime is taken at B's model, since B is the run being judged. When the two runs used
    // different models the comparison is suspect anyway and the warning above says so.
    const lt = lifetime(records, node, [...b.models][0]);
    const pct = `${lt.passed}/${lt.total} ${Math.round(lt.rate * 100)}%`;
    const bFailedToRun = b.failedToRun.has(node);
    const why = bFailedToRun ? `${DIM} [session errored, not a bad answer]${RESET}` : "";
    const line = `${shortNode(node, label)}  ${DIM}lifetime ${pct}${RESET}${why}`;

    const verdict = classifyFlip(ob, lt, bFailedToRun);
    if (verdict === "regressed") lost.push(`- ${line}`);
    else if (verdict === "improved") gained.push(`+ ${line}`);
    else unstable.push(`${ob ? "+" : "-"} ${line}`);
  }

  console.log(`\n${GREEN}improved (fail→pass): ${gained.length}${RESET}`);
  gained.forEach((n) => console.log(`   ${n}`));
  console.log(`${RED}regressed (pass→fail): ${lost.length}${RESET}`);
  lost.forEach((n) => console.log(`   ${n}`));

  if (unstable.length) {
    // Deliberately NOT counted as improvements or regressions: these cases flip on their own.
    console.log(
      `\n${DIM}within known variance: ${unstable.length} — flipped, but not away from the norm:` +
        ` either the lifetime rate at this\n  model sits between ${Math.round(STABLE_LO * 100)}% and` +
        ` ${Math.round(STABLE_HI * 100)}%, or the OTHER run was the outlier and this one matches\n` +
        `  its usual behaviour. Fewer than ${MIN_LIFETIME} lifetime rows lands here too. Use` +
        ` \`pnpm eval:repeat <pattern> -n 5\`\n  to say anything about these.${RESET}`,
    );
    unstable.forEach((n) => console.log(`   ${DIM}${n}${RESET}`));
  }
  if (!gained.length && !lost.length && !unstable.length) console.log("\n(no flips between these runs)");

  // Cases vitest ran but that never reached scoring: the session threw inside task(), so record()
  // never wrote a row. Only detectable because both ledgers now share the run id.
  const history = loadHistoryNodes();
  const suites = suiteLabels(records);
  for (const [id, run] of [
    [ids[0], a],
    [ids[1], b],
  ] as const) {
    const ran = history.get(id);
    if (!ran) continue;
    const scored = new Set([...run.outcomes.keys()].map(crossKey));
    const dead = [...ran].filter((n) => {
      const key = crossKey(n);
      return !scored.has(key) && !suites.has(key);
    });
    if (!dead.length) continue;
    console.log(`\n${YELLOW}died before scoring in ${id}: ${dead.length}${RESET}`);
    console.log(`${DIM}  vitest executed these but no record was written — the session threw inside task().${RESET}`);
    dead.forEach((n) => console.log(`   ! ${n}`));
  }
}

// Run ONLY when invoked as a script. Without this guard, importing `classifyFlip` from a test would
// execute main() as an import side effect — the same footgun as `scripts/tag-releases.mjs`, which once
// created and pushed four real release tags because an ESM import ran its top-level code.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
