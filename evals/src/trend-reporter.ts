/**
 * Local version-over-version trend. A tiny vitest reporter that appends each eval test's
 * pass/fail (with the current git sha) to results/history.jsonl. `eval:compare` reads this file
 * and is its ONLY consumer — `eval:repeat` aggregates results/records.jsonl instead (via
 * records/stats.ts), so removing this reporter disables compare alone. Nothing here calls a model.
 *
 * What it stores is the VITEST STATE, which is not always the measured outcome: an `indicative`
 * positive activation miss is a vitest `pass` (deliberately non-blocking) while its record.ts row
 * is `outcome: false`. The two layers therefore disagree by design for those cases, and
 * `eval:compare` cannot see an activation flip. Read the activation summary or `eval:repeat` for
 * that; this ledger's own value is that it also lists a case that FAILED BEFORE scoring — a
 * session that threw inside task() writes no record at all, so a history row with no matching
 * record is the signature of a case that never really ran.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { currentRunId } from "./run-id.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const HISTORY = join(HERE, "..", "results", "history.jsonl");

function gitSha(): string {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return "unknown";
  }
}

interface TaskLike {
  type?: string;
  name?: string;
  result?: { state?: string };
  tasks?: TaskLike[];
}

export default class TrendReporter {
  // Same id record.ts uses — both read it from EVAL_RUN_ID (see src/run-id.ts), so a history row and
  // its records row can finally be matched. Previously each stamped its own.
  private runId = currentRunId();
  private sha = gitSha();

  onFinished(files: TaskLike[] = []) {
    const rows: string[] = [];
    const walk = (task: TaskLike, file: string) => {
      const state = task.result?.state;
      // Only record tests that actually ran (pass/fail) — skips add noise to the trend.
      if (state === "pass" || state === "fail") {
        rows.push(
          JSON.stringify({
            run_id: this.runId,
            git_sha: this.sha,
            nodeid: `${file} > ${task.name ?? "?"}`,
            outcome: state,
          }),
        );
      }
      task.tasks?.forEach((t) => walk(t, file));
    };
    for (const f of files) (f.tasks ?? []).forEach((t) => walk(t, f.name ?? "?"));
    if (!rows.length) return;
    mkdirSync(dirname(HISTORY), { recursive: true });
    appendFileSync(HISTORY, rows.join("\n") + "\n");
  }
}
