/**
 * One id for one vitest run, shared by every writer.
 *
 * Why this exists. `record.ts` used to stamp its own id at MODULE IMPORT time, which is per worker,
 * not per run — so a single `pnpm eval` produced several. Measured at sha 06a216c: one run split into
 * five ids (27 rows across 11 files, then `workflow-retro`, `spec-creator`, `review-workflow` and
 * `security` each with their own id, 25 s apart), and the ledger holds six such sub-5-second clusters.
 * Overall 257 ids in records.jsonl against 26 in history.jsonl, whose `TrendReporter` gets it right
 * only because it runs once in the MAIN process.
 *
 * That made `run_id` useless as a run identifier and blocked pointing `eval:compare` at records.jsonl
 * — the richer ledger, and the only one that can see an activation flip. `global-setup.ts` stamps the
 * id once in the main process before any worker forks; everything else reads it from the environment.
 *
 * Both ledgers now key on the same value, which also enables the cross-check history's doc comment has
 * always claimed and nothing implemented: a history row with no matching records row is a case that
 * died before scoring.
 */

export const RUN_ID_ENV = "EVAL_RUN_ID";

/** `20260804T190028` — second precision, sortable, no separators. */
export function newRunId(date: Date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
}

/**
 * The current run's id. Falls back to a fresh stamp so anything importing this outside a configured
 * vitest run (a one-off script, a bare `tsx` invocation) still works instead of throwing — a missing
 * id must never be the reason a session's measurement is lost.
 */
export function currentRunId(): string {
  return process.env[RUN_ID_ENV] || newRunId();
}
