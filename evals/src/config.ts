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

/**
 * Model for ACTIVATION cases only, defaulting to a stronger one than the tiers under judgement.
 *
 * Activation asks "does this skill get selected", which is a judgement task, and the cheap default
 * cannot perform it for broad subjects. Measured across every activation row recorded at
 * claude-haiku-4-5: framework- and version-specific skills engage in 100% of runs (react-best-
 * practices 11/11, react-testing-library 9/9, fastify 4/4, next 4/4, workflow-retro 6/6) while broad
 * foundational ones sit at 11-32% (security 12/37, typescript-expert 3/13, run-plan 5/27,
 * onion-architecture 2/18) — and a miss there is the model writing a full competent answer from its
 * own knowledge instead of consulting anything (median 967 output tokens on a miss, 12 on an
 * engagement; no tool calls at all in 29 of 78 misses). On the security pair, one variable changed,
 * haiku scored 4/20 correct outcomes and sonnet 10/10 with no content change. Those reds measured
 * the model, not the descriptions.
 *
 * Raised for THIS tier only, for two reasons. Activation runs no judge (its cases have no
 * `practices`; the verdict is the trace), so a stronger model here cannot create the self-preference
 * that raising EVAL_MODEL would — EVAL_JUDGE_MODEL is deliberately a stronger family than the model
 * under test, and the 51 judged quality cases must keep it that way. And activation is the cheaper
 * half: 26 short cases that early-stop on engagement, against 51 quality cases with 4k+ token
 * outputs plus a judge call each.
 *
 * An explicit EVAL_MODEL still wins, so a haiku-vs-sonnet comparison probe keeps working.
 */
export const EVAL_ACTIVATION_MODEL =
  process.env.EVAL_ACTIVATION_MODEL ?? process.env.EVAL_MODEL ?? "claude-sonnet-5";

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
