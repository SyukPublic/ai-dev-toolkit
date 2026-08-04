/**
 * End-of-run activation summary. A vitest reporter that prints, per activation case, how often
 * the skill actually ENGAGED — this run and across every row recorded for that case.
 *
 * Why this exists: a positive activation case marked `indicative` never fails a single run (a
 * model may legitimately do the work inline instead of invoking the Skill tool), so its only
 * signal was a `console.warn` buried in vitest output. That made "engaged 4 times in 5" and
 * "never engaged once" look identical in a green suite — and a case whose prompt named a fixture
 * that did not exist stayed invisible behind it for the whole life of the repo. Rates are read,
 * never asserted: the floor that actually fails is in eval:repeat, the only place N exists.
 *
 * Nothing here calls a model; it only reads results/records.jsonl.
 */

import { EVAL_ACTIVATION_MODEL, ACTIVATION_FLOOR_MIN_N } from "./config.js";
import { GREEN, RED, YELLOW, DIM, RESET, rateColor } from "./ansi.js";
import {
  activationSeries,
  engagementByOutcome,
  loadRecords,
  recordCount,
  type ActivationAggregate,
  type Series,
} from "./records/stats.js";

const pct = (rate: number) => `${Math.round(rate * 100)}%`;

/** Correctness-oriented colour: for a negative case, NOT engaging is the pass. */
const engagedColor = (a: ActivationAggregate): string =>
  rateColor(a.shouldActivate ? a.engaged.rate : 1 - a.engaged.rate);

export default class ActivationReporter {
  private startLine = 0;

  // Snapshot the ledger before the run: worker processes each compute their own RUN_ID, so
  // slicing by line is the only reliable way to isolate "records this run produced".
  onInit(): void {
    this.startLine = recordCount();
  }

  onFinished(): void {
    const fresh = activationSeries(loadRecords(this.startLine));
    const nodeids = Object.keys(fresh).sort();
    if (nodeids.length === 0) return; // no activation cases ran — stay silent

    // Historical context comes from rows for the SAME model only. records.jsonl is append-only and
    // pools models, and a sonnet probe sitting next to a haiku series would otherwise inflate the
    // rate of the series being read right now. Engagement is recovered from `outcome` for rows
    // written before the activation metadata existed, so an existing ledger counts from day one.
    const polarity: Record<string, boolean> = {};
    for (const id of nodeids) polarity[id] = fresh[id].shouldActivate;
    const history = engagementByOutcome(
      loadRecords(0).filter((r) => (r.model ?? "unknown") === EVAL_ACTIVATION_MODEL),
      polarity,
    );

    console.log(`\n${"=".repeat(60)}\nActivation summary (${nodeids.length} case(s))\n${"=".repeat(60)}`);
    for (const id of nodeids) {
      const a = fresh[id];
      const want = a.shouldActivate
        ? `positive${a.indicative ? ", indicative" : ""}`
        : "negative — non-engagement is the pass";
      const c = engagedColor(a);
      console.log(
        `\n  ${c}${a.engaged.passed}/${a.engaged.total} ${pct(a.engaged.rate).padStart(4)}${RESET} engaged  ` +
          `${a.skill}  ${DIM}(${want})${RESET}`,
      );
      console.log(`      ${DIM}${a.nodeid.split(" > ").slice(-1)[0]}${RESET}`);

      const all: Series | undefined = history[id];
      if (all && all.total > a.engaged.total) {
        const c = rateColor(a.shouldActivate ? all.rate : 1 - all.rate);
        console.log(`      all recorded (${EVAL_ACTIVATION_MODEL}): ${c}${all.passed}/${all.total} ${pct(all.rate)}${RESET}`);
      }
      // Read the floor against the longest series available — this run alone is N=1, which can
      // never distinguish variance from a case that cannot pass.
      const n = all?.total ?? a.engaged.total;
      const engaged = all?.passed ?? a.engaged.passed;
      if (a.shouldActivate && engaged === 0 && n >= ACTIVATION_FLOOR_MIN_N) {
        console.log(
          `      ${RED}never engaged in ${n} recorded run(s)${RESET} — a zero is not noise. ` +
            `Confirm with ${DIM}pnpm eval:repeat <pattern> -n 5${RESET}, which fails the floor.`,
        );
      } else if (a.shouldActivate && a.engaged.passed === 0 && engaged > 0) {
        // Missed here but not always: the lifetime rate is the honest reading, and it is what the
        // floor judges — so say so, or a reader takes this run's zero for a verdict.
        console.log(`      ${YELLOW}missed this run${RESET}, but engages sometimes — not a floor breach`);
      }
    }
    // "As intended" folds the polarity in: a positive must engage, a negative must not. Counted
    // per row, so a case that ran more than once in a single pass is not rounded to a boolean.
    const correct = (a: ActivationAggregate) =>
      a.shouldActivate ? a.engaged.passed : a.engaged.total - a.engaged.passed;
    const asIntended = nodeids.reduce((n, id) => n + correct(fresh[id]), 0);
    const rows = nodeids.reduce((n, id) => n + fresh[id].engaged.total, 0);
    console.log(
      `\n${asIntended === rows ? GREEN : RED}${asIntended}/${rows}${RESET} activation outcome(s) ` +
        `as intended this run ${DIM}(positives engaging, negatives staying out)${RESET}\n`,
    );
  }
}
