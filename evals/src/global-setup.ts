/**
 * Runs ONCE in the main process, before any test worker is forked. Its whole job is to stamp the run
 * id, so `record.ts` (in workers) and `TrendReporter` (in the main process) agree on it. See
 * `run-id.ts` for the measurement that made this necessary.
 *
 * `??=`, not `=`: an explicit `EVAL_RUN_ID` in the environment wins, so a caller can group several
 * vitest invocations under one id on purpose. `eval:repeat` deliberately does NOT do that — each of
 * its runs is its own data point.
 */

import { newRunId, RUN_ID_ENV } from "./run-id.js";

export default function setup(): void {
  process.env[RUN_ID_ENV] ??= newRunId();
}
