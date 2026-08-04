/**
 * The first test here is the load-bearing one: it runs INSIDE a vitest worker and asserts the worker
 * can see the id that `global-setup.ts` stamped in the main process. That is the assumption the whole
 * shared-run-id design rests on (default pool is `forks` on vitest 2.x, so workers inherit
 * `process.env` at spawn), and if it ever stops holding, `record.ts` silently falls back to a
 * per-worker stamp and `run_id` quietly becomes ungroupable again — exactly the bug this replaced.
 */

import { describe, expect, it } from "vitest";
import { currentRunId, newRunId, RUN_ID_ENV } from "./run-id.js";

describe("run id propagation", () => {
  it("is visible inside a test worker, stamped by globalSetup in the main process", () => {
    expect(process.env[RUN_ID_ENV]).toBeTruthy();
    expect(process.env[RUN_ID_ENV]).toMatch(/^\d{8}T\d{6}$/);
  });

  it("currentRunId returns the environment value verbatim, so every writer agrees", () => {
    expect(currentRunId()).toBe(process.env[RUN_ID_ENV]);
  });
});

describe("newRunId", () => {
  it("formats to second precision with no separators", () => {
    expect(newRunId(new Date("2026-08-04T19:00:28.123Z"))).toBe("20260804T190028");
  });

  it("is lexicographically sortable, which is what --list and 'last two runs' rely on", () => {
    const earlier = newRunId(new Date("2026-08-04T09:00:00Z"));
    const later = newRunId(new Date("2026-08-04T19:00:00Z"));
    expect([later, earlier].sort()).toEqual([earlier, later]);
  });
});
