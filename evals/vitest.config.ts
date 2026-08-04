import { defineConfig } from "vitest/config";
import TrendReporter from "./src/trend-reporter.js";
import ActivationReporter from "./src/activation-reporter.js";

export default defineConfig({
  test: {
    // Stamps EVAL_RUN_ID once in the main process before workers fork, so records.jsonl and
    // history.jsonl key on the SAME run id. Without it record.ts stamped its own per worker and one
    // run became several — see src/run-id.ts for the measurement.
    globalSetup: ["./src/global-setup.ts"],
    // *.eval.ts = model-backed evals; src/**/*.test.ts = the pure stats unit tests.
    include: ["**/*.eval.ts", "src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "workspace-template/**"],
    // Real Claude sessions (and a subagent dispatch) are slow — give them room. 480s, not 240s:
    // a dispatch case runs a FULL nested architecture-reviewer session inside the main one, and
    // with a mandatory Gate verdict + full evidence-gathering that nested session alone can run
    // 60–130s+, which pushes a full `pnpm eval` run past a 240s ceiling (timeout, not a content
    // failure).
    //
    // Raised 480s -> 900s: a timeout is not a result, it is a LOST ROW. Measured on sonnet,
    // implementation-planner's control case ("plans against an approved spec") writes a full
    // development plan — phases, traceability matrix, per-phase disjoint scope — and runs up to
    // 540s. At 480s two of five runs recorded nothing at all, which reads in the summary as a
    // failing case rather than as missing data. The ceiling has to clear the slowest legitimate
    // case, not the median one.
    testTimeout: 900_000,
    hookTimeout: 480_000,
    // One session per test; a few files can run concurrently. Keep it modest to stay cheap.
    fileParallelism: true,
    // TrendReporter writes the history ledger; ActivationReporter prints the activation summary
    // (read-only over records.jsonl). Neither calls a model, and neither can fail a run.
    reporters: ["default", new TrendReporter(), new ActivationReporter()],
  },
});
