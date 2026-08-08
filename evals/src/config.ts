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
 * Reasoning effort for the model under test. Unset = whatever the SDK defaults to for that model,
 * which is what every row recorded before this knob existed was taken at.
 *
 * It exists because an AGENT DEFINITION CAN DECLARE ONE (`effort: xhigh` on four of this repo's
 * agents) and the agent tier cannot honour it: `agentTask` injects the definition as a system
 * prompt, so the frontmatter is prose to the session, not configuration. Without this the tier
 * structurally cannot measure the agent as it actually runs in production — a real gap for
 * `brainstormer`, whose two open reds are both judgement-shaped and were only ever measured on
 * haiku at default effort.
 *
 * Available levels depend on the model and the SDK silently DOWNGRADES an unsupported one, so a
 * green run is not proof the level applied. `effort` is stamped on every record next to `model`
 * for the same reason `model` is: `records.jsonl` pools by case name, and a mixed-effort series
 * would otherwise pool silently.
 */
export const EVAL_EFFORT = process.env.EVAL_EFFORT as
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"
  | undefined;

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

/**
 * Whether the content tier injects a skill's `references/*.md` alongside its `SKILL.md`.
 *
 * Default ON, which is the long-standing behaviour — but it is not obviously the right one, and this
 * knob exists to MEASURE that rather than to argue about it. Three facts frame the question:
 *
 * - `CLAUDE.md` states this tier measures "what `SKILL.md` itself teaches". With references injected
 *   that is true for the 7 skills which ship none, and false for the 5 that do.
 * - Neither setting matches production, and they miss it in opposite directions. Claude Code injects
 *   only the `SKILL.md` body and the model DECIDES to read a reference with the `Read` tool. Injecting
 *   everything removes that decision; injecting nothing removes the material. So this tier cannot
 *   measure retrieval either way, and a red in it does not say whether guidance or retrieval failed.
 * - The payload is wildly uneven: `fastify-best-practices` injects 177,440 chars of which `SKILL.md`
 *   is 4,574 (references are 38x the skill), `next-best-practices` 81,484, and every other skill
 *   <= 22,539. The two bloated suites are also the two weakest measured — `fastify` 5/5, 4/5, 3/5 and
 *   `next` 5/5, 3/5 — while `onion-architecture` (13,772, no references) returned 23/23 practices at
 *   5/5. That is correlational only, on three points, which is exactly why it needs an A/B.
 *
 * Setting this to "0" is therefore an EXPERIMENT, not a fix. It is a no-op for the 7 reference-free
 * skills (pinned by a unit test), so flipping it can never silently move those suites. If it is ever
 * made the default, note that `records.jsonl` pools lifetime rates by CASE NAME and not by injected
 * payload, so every historical row for the 5 affected suites was measured under the other setting.
 *
 * MEASURED, AND THE ANSWER IS "NOT AT THIS BUDGET" — do not re-run this A/B blind.
 * `fastify-testing-fullrefs` vs `fastify-testing-skillonly`, one case, n=5 each, same sha. Headline
 * looked decisive: the grounding gate (slot `["inject", "inject("]`) passed 1/5 with references and
 * 4/5 without, at equal output length. It does not survive pooling. The same full-refs configuration
 * had passed that gate 6/7 across every earlier series, so full-refs pools to 7/12 (58%) against
 * skill-only's 4/5 (80%) and the arms do not separate. There is no confound — the commits between the
 * two shas touch other suites only, and the flag defaults ON so arm 1 was byte-identical to history.
 * It is within-configuration variance, and n=5 cannot see through it: separating 58% from 80% needs
 * roughly 50 runs per arm, and pooling every case in the 5 affected suites at n=2 would still cost
 * ~60 sessions. Outcome rates are the wrong instrument for this question.
 *
 * What the A/B DID establish, and it is worth keeping: when this case fails, the model answers with a
 * different, adjacent, legitimate diagnosis — "`await app.close()` is not in a try-finally block, so
 * if the assertion throws, cleanup never runs; use `t.after()`" — and never says `inject` at all. The
 * grounding slot is doing its job: the skill's answer IS `inject()`, so a reply that never reaches it
 * has not demonstrated the guidance, whatever else it got right.
 *
 * So the (b)-vs-(c) policy choice cannot be settled empirically here and should be decided on the
 * construct grounds instead, which are not empirical at all: the tier's stated purpose ("what
 * SKILL.md itself teaches") argues for injecting SKILL.md only, while wanting to measure retrieval
 * argues for keeping both configurations and reading the PAIR.
 *
 * DECIDED (2026-08-07) — the default is now OFF, and neither branch of that dilemma was given up.
 *
 * The construct side wins on the default: this tier's stated purpose is what SKILL.md teaches, and
 * production loads only the SKILL.md body. What made the flip look expensive was the belief that it
 * would silence two suites, and the honest measurement of that turned out worse than the note above
 * assumed: `fastify-best-practices/SKILL.md` is a 75-line INDEX (24 link lines; `fastify-plugin`,
 * `fp(`, `TypeBox`, `response schema` and `fast-json-stringify` occur ZERO times in it), and
 * `next-best-practices/SKILL.md` is 153 lines of which nineteen are `See [references/…] for:`
 * blocks. Injecting those bodies alone hands the model a table of contents with no tools — so it is
 * not two cases that go dark, it is all six.
 *
 * The retrieval side keeps its measurement instead of losing it: those six cases moved to the new
 * RETRIEVAL tier (see runSkillRetrievalCases), which runs them against the assembled on-disk
 * harness so the model must consult the skill and Read the reference itself — the decision
 * progressive disclosure is actually making in production, and the one thing an injected system
 * prompt structurally cannot measure. Measured on the case this whole question started from
 * (`fastify-retrieval-named`, haiku, n=5): 5/5 with all four practices 5/5, every run tracing
 * `Skill` → `Read references/testing.md` in exactly 4 turns. Against 9/17 pooled for the same case
 * in the content tier with the full 178k-char payload injected — suggestive that the mega-payload
 * was hurting the measurement, but NOT a measurement of it: the two arms differ in the prompt's
 * task line as well as in where the guidance came from. Do not quote it as a rate improvement.
 *
 * The PAIR diagnostic survives too, as an opt-in: the two index-shaped suites still ship their
 * content cases, registered only when `EVAL_SKILL_REFS=1`. Run with the flag on and a
 * retrieval-vs-content gap localises a failure to retrieval rather than to the guidance, which is
 * exactly what option (c) wanted; run with the default and neither tier is measuring a table of
 * contents.
 *
 * Consequence to keep in mind: every content-tier row recorded before this flip was taken with
 * references ON. `skill_refs` is stamped per row (absent on pre-instrumentation rows, reported as
 * "unknown" and documented as refs-era), and `eval:compare` warns on a mixed set — so the
 * lifetimes of the 10 remaining content cases in the 3 reference-bearing suites that DO teach in
 * their SKILL.md (`react-testing-library`, `typescript-expert`, `run-plan`) needed rebuilding
 * before they could be pooled cleanly.
 *
 * REBUILT, and the flip cost those three suites nothing — measured rather than assumed.
 * `content-skillonly`, haiku, 10 cases × 5, the first rows in this ledger carrying
 * `skill_refs: false`. **9 of 10 cases green**; the only red is `typescript-expert > TS2589` at 2/5,
 * a documented deliberate red, better than its 2/15 lifetime. Practice by practice against the
 * pre-flip pooled rates, **26 of 28 are unchanged within noise**, and both apparent drops survive
 * inspection as variance rather than lost guidance:
 *
 *   - `react-testing-library` MSW over `vi.mock('axios')`, 7/7 → 3/5. NOT the flip: `SKILL.md:221`
 *     carries the rule AND the rationale the practice asks for ("MSW is the default … because it
 *     intercepts at the network layer and keeps tests decoupled from the HTTP client"), repeated in
 *     the Don't table at `SKILL.md:277`. `references/mocking.md` adds only setup code.
 *   - `typescript-expert` flatten the `WithMeta<T>` intersection, 4/13 → 0/5. At a 31 % true rate
 *     0/5 is a p≈0.16 event, and it is one of the two stable 0/5 practices already recorded there.
 *
 * Which is what the static reading predicted before any session was spent: for these three the
 * references are supplements, not the substance (`waitFor` 9 body occurrences against 0 in refs;
 * `run-plan`'s `dirty` 3 against 0). The whole cost of the flip landed on the two index-shaped
 * suites, and the retrieval tier absorbed it.
 */
export const EVAL_SKILL_REFS = (process.env.EVAL_SKILL_REFS ?? "0") !== "0";

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

/**
 * The tool wiring the RETRIEVAL tier forces on every case (see runSkillRetrievalCases). Kept here
 * rather than inline in the runner so it can be pinned by a unit test — `retrieval-tools.test.ts`.
 *
 * Two things it has to get right, and both fail SILENTLY:
 *
 *  - **Spawn tools must be blocked, not merely un-allowed.** Under bypassPermissions an allow-list
 *    is inert; this exact bug has already cost a measurement here. Activation cases used to filter
 *    `Task`/`Agent` out of `allowedTools` only, subagents kept spawning, a dispatched agent's own
 *    preloaded skills landed in the PARENT trace, and `onion-architecture` read "1/2 engaged"
 *    against a true 0/14. In this tier the same bug would credit a subagent's `Read` to the session
 *    under test — a false green on the one thing the tier exists to measure.
 *  - **`Skill` and `Read` must survive the filter.** They ARE the mechanism. Drop either and every
 *    retrieval case silently becomes "answer from memory", which is indistinguishable from the model
 *    ceiling this tier legitimately reports (`next > RSC boundaries` on haiku) — so the harness
 *    defect would read as a finding.
 *
 * Mutating tools are not this function's job: `workflowTask` unions WORKFLOW_DISALLOWED_TOOLS with
 * whatever a caller adds, so they stay blocked regardless. The test asserts the allow-list never
 * names one anyway, so the guarantee does not rest on that union alone.
 */
export function retrievalToolOptions(): { allowedTools: string[]; disallowedTools: string[] } {
  return {
    allowedTools: WORKFLOW_ALLOWED_TOOLS.filter((t) => !SPAWN_TOOLS.has(t)),
    disallowedTools: [...SPAWN_TOOLS],
  };
}

// --- Output verbosity -------------------------------------------------------
// Set EVAL_QUIET to suppress per-run trace/verdict spam during multi-run aggregation.
export const QUIET = Boolean(process.env.EVAL_QUIET);
