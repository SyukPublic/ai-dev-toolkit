/**
 * Run one child `vitest` quietly, with a live spinner + elapsed seconds so a long model run
 * visibly makes progress instead of hanging the terminal in silence. Full per-run trace is
 * suppressed (EVAL_QUIET) and captured; the caller prints the outcome line once the run ends.
 * Falls back to a single static line when stdout is not a TTY (CI logs).
 */

import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DIM, RESET } from "./ansi.js";

const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Vitest's own ESM entry, run with the CURRENT node binary and NO shell.
 *
 * This replaced `pnpm exec vitest` + `shell: true`, which was there because pnpm is a `.cmd` shim
 * on Windows that spawn cannot resolve without a shell. The cure was worse than the disease:
 * `shell: true` re-joins the args ARRAY into one command string with no quoting whatsoever, so
 * every argument containing a space was re-split by the shell. `-t "engages on a backend
 * layer-placement question"` reached vitest as `-t engages` plus five stray positional FILE
 * patterns — which silently widened a one-case run into a whole-suite run (26 model sessions
 * instead of 2) while the name filter `engages` matched every positive activation case. Resolving
 * the entry through require() keeps it correct under pnpm's hoisting, and dropping the shell means
 * arguments are passed through verbatim.
 */
const VITEST_ENTRY = (() => {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve("vitest/package.json")), "vitest.mjs");
})();

/** How many test cases the pattern matches, via `vitest list` (no model calls). null on error. */
export function countTests(vitestArgs: string[]): number | null {
  try {
    const out = execFileSync(process.execPath, [VITEST_ENTRY, "list", ...vitestArgs], {
      cwd: EVALS_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const n = out.split("\n").filter((l) => l.includes(" > ")).length;
    return n || null;
  } catch {
    return null;
  }
}

/** Run vitest once; resolves with the child's combined stdout+stderr (for crash diagnosis). */
export function runVitestOnce(label: string, vitestArgs: string[], extraEnv: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve) => {
    const start = Date.now();
    let out = "";
    const child = spawn(process.execPath, [VITEST_ENTRY, "run", "--reporter=dot", ...vitestArgs], {
      cwd: EVALS_DIR,
      env: { ...process.env, EVAL_QUIET: "1", ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));

    let timer: ReturnType<typeof setInterval> | undefined;
    if (process.stdout.isTTY) {
      let f = 0;
      const tick = () => {
        const secs = Math.round((Date.now() - start) / 1000);
        process.stdout.write(`\r  ${label}  ${FRAMES[(f = (f + 1) % FRAMES.length)]} running… ${DIM}${secs}s${RESET}   `);
      };
      tick();
      timer = setInterval(tick, 120);
    } else {
      process.stdout.write(`  ${label} running…\n`);
    }

    child.on("close", () => {
      if (timer) {
        clearInterval(timer);
        process.stdout.write("\r\x1b[K"); // clear the spinner line; caller prints the result
      }
      resolve(out);
    });
  });
}
