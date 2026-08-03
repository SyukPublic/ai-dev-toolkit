/**
 * All tunables in one place. No logic here — just the knobs the rest of the package reads.
 * Nothing in this module imports from another src module (it is the bottom of the dependency
 * graph): config knows nothing of runtime, scoring, or the SDK.
 */

// --- Models -----------------------------------------------------------------
// Cheap model under test by default; the judge is a stronger family to soften self-preference.
export const EVAL_MODEL = process.env.EVAL_MODEL ?? "claude-haiku-4-5";
export const EVAL_JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? "claude-sonnet-5";
export const MAX_TURNS = Number(process.env.EVAL_MAX_TURNS ?? "8");

// --- Configuration tag ------------------------------------------------------
// "candidate" = artifact injected (normal). "baseline" = no artifact (benchmark lift baseline).
export const EVAL_CONFIG = process.env.EVAL_CONFIG ?? "candidate";
export const IS_BASELINE = EVAL_CONFIG === "baseline";

// --- Scoring / statistics thresholds ---------------------------------------
export const DEFAULT_THRESHOLD = 0.6; // judge score gate for a quality case
export const FLAKY_LOW = 0.2; // pass rate strictly inside (20%, 80%) is "flaky"
export const FLAKY_HIGH = 0.8;
export const COST_REGRESSION_RATIO = 1.25; // candidate mean tokens > 125% of baseline

// --- Activation floor -------------------------------------------------------
// An `indicative` positive activation case never fails a single run: a model legitimately does
// the work inline instead of invoking the Skill tool, so one miss proves nothing. "Never once in
// N tries" is a different claim, and it is NOT noise — it is the shape of a description that
// cannot win, or of a case that cannot pass (a prompt naming a fixture that does not exist).
// eval:repeat enforces the floor because it is the only place N exists; a single `vitest run`
// has N=1 and can only report.
// Two thresholds, because reporting a zero and ASSERTING one need different evidence. A skill that
// engages 70% of the time (measured: `security` is 7/10) scores 0/2 about once in eleven series, so
// failing at N=2 would cry wolf on a working skill — and a gate that cries wolf gets ignored, which
// is how the invalid run-plan case survived in the first place. Reporting starts at 2; the exit
// code waits for 5, the same n this repo already requires before believing any other rate.
export const ACTIVATION_FLOOR_MIN_N = Number(process.env.EVAL_ACTIVATION_FLOOR_N ?? "2");
export const ACTIVATION_FLOOR_FAIL_N = Number(process.env.EVAL_ACTIVATION_FAIL_N ?? "5");

// --- Cost tripwire ----------------------------------------------------------
// cases × runs above this and eval:repeat says so before spending it. Set from the real incident
// that motivated it: a mangled -t value turned an intended 2-session run into 26.
export const REPEAT_WARN_SESSIONS = Number(process.env.EVAL_REPEAT_WARN_SESSIONS ?? "12");

// --- Tool allow-lists -------------------------------------------------------
// Subagent-spawning tool name varies by harness; count both.
export const SPAWN_TOOLS = new Set(["Task", "Agent"]);
// Tools no eval ever needs and bypassPermissions must not be allowed to hand over. Used BOTH to
// filter an agent's declared frontmatter tools and as the agent tier's hard blocklist — an
// allow-list alone is inert under bypass, and `implementer` declares Write/Edit/Bash and exists
// to use them, so the allow-list is not a guard for it.
export const MUTATING_TOOLS = ["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash"];
// workflowTask runs with bypassPermissions in the assembled temp workspace (tasks.ts passes
// `cwd: evalWorkspace()`, NOT the repo) — keep this read-only anyway: the workspace is a real
// checkout-shaped directory and the blocklist below is what actually stops a write, here or
// anywhere else the cwd is later pointed.
export const WORKFLOW_ALLOWED_TOOLS = ["Read", "Grep", "Glob", "Task", "Agent", "Skill"];
// bypassPermissions IGNORES the allow-list above, so without a hard blocklist a workflow
// session can Write/Edit/Bash whatever it is pointed at. disallowedTools blocks tools even
// under bypass, and it reaches spawned subagents too (a dispatched implementer reported being
// denied Write/Edit/Bash inside its own nested session).
export const WORKFLOW_DISALLOWED_TOOLS = ["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash"];

// --- Output verbosity -------------------------------------------------------
// Set EVAL_QUIET to suppress per-run trace/verdict spam during multi-run aggregation.
export const QUIET = Boolean(process.env.EVAL_QUIET);
