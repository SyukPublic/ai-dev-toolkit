import type { SkillCase } from "../../../../src/index.js";
import { fixtureReader } from "../../../../src/index.js";

const fx = fixtureReader(import.meta.url);

// Content tier: SKILL.md injected, no tools — so the script output the skill would normally
// produce with `retro_metrics.py` is handed over inline instead.
//
// metrics.json plants one instance of each lead the skill tells the retro to chase:
//
//   PLANTED                                                  SKILL RULE
//   agent-4b1f resumed_via_send_message, duration 8760s      a resumed agent's duration includes
//     against 61 api_turns                                     the idle gap → Σ agent time and
//                                                              parallel_factor are skewed bounds
//   service.ts in writes_paths of BOTH implementers          overlapping writes between concurrent
//                                                              agents ⇒ the slices were not disjoint
//   agent-7c02 cache_hit_pct 41                              < ~60% on a long agent ⇒ prompt churn
//   agent-7c02 tool_errors 4                                 classify them, don't just count
//   architecture.md + the plan read by all three agents      context-pack candidates
//   plan-verifier: read-only, 29.8k output tokens            report bloat ⇒ tighten its contract
//
// The leads are split across two cases BY TOPIC rather than gathered into one "analyse this"
// prompt, and that grouping is load-bearing. A first version asked a single prompt to surface
// five unrelated leads and scored 2/5 — an answer has a budget of attention, and a prompt that
// asks for six things gets a thin pass at each. Each prompt below asks about one dimension, and
// its practices stay inside that dimension.
//
// The resumed-agent trap also lives as ONE practice, not four. It was originally its own case
// with four graded sub-claims; the model passed the first (it spotted the resumption) and failed
// the rest, which were re-statements of the same insight. That scored elaboration, not knowledge.

const RETRO_TASK = `The script output is provided inline — treat it as already read and answer directly in your reply (do not ask for tool access or to run anything).`;

const METRICS = `\`\`\`json
${fx("metrics.json")}
\`\`\``;

export const qualityCases: SkillCase[] = [
  {
    name: "timing: catches the non-disjoint slices and the resumed agent's skewed duration",
    kind: "quality",
    prompt: `Here is the retro metrics output for a pipeline run. What do the timing, parallelism and phase-isolation numbers actually tell us? Be sceptical of any figure that is not what it appears to be.

${RETRO_TASK}

${METRICS}`,
    grounding: [["resumed", "SendMessage", "idle"]],
    practices: [
      "flags that `server/src/modules/orders/service.ts` appears in the writes_paths of BOTH concurrent implementers, and concludes the plan's slices were not actually disjoint",
      "notices that agent-4b1f was resumed via SendMessage, so its 8760-second duration includes the idle gap between passes and `sum_agent_duration_s` and `parallel_factor` are skewed bounds for this run",
      "does not present the 1.23 parallel factor as a clean measurement of how parallel the run was",
    ],
    threshold: 0.6,
    maxTurns: 4,
  },
  {
    name: "cost: turns the context and cache leads into concrete actions",
    kind: "quality",
    prompt: `Here is the retro metrics output for a pipeline run. Where is this run wasting tokens, and what would you change? Every point you make should end in something we can actually do.

${RETRO_TASK}

${METRICS}`,
    grounding: [["context pack", "context-pack", "pre-fetch", "prefetch"]],
    practices: [
      "identifies the files read by all three agents — docs/architecture.md and the order-export plan — as context-pack candidates that should be pre-fetched into the spawn prompt instead of being re-read by every agent",
      "flags agent-7c02's 41% cache hit rate as prompt churn on a long-running agent and recommends a stable shared prefix",
      "flags the plan-verifier's 29.8k output tokens as report bloat for a read-only agent, and proposes tightening its output contract",
      "ends each point in a concrete action — an agent brief to refine, a file to pre-fetch, a frontmatter setting to change — rather than an observation with no follow-through",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
  {
    name: "refuses to present parent-visible usage as the run total",
    kind: "quality",
    prompt: `We ran the pipeline on a laptop that has since been wiped, so the journals are gone. I still have what the orchestrator session reported at the end: 31.2k input and 12.4k output tokens across four agents. Write up the retro from that — I want the totals for the run and a ledger row.

Answer directly and concretely.`,
    grounding: [["lower bound", "lower-bound", "excludes", "undercount"]],
    practices: [
      "refuses to present the 31.2k / 12.4k figures as the run's totals, explaining that a parent session's usage does not include its subagents' tokens",
      "labels the reconstructed figures as a lower bound that excludes subagent usage, and says the real totals are substantially higher — the skill's own estimate is a 5–10× undercount",
      "identifies that only the subagent journals carry the missing usage, so an accurate total is unavailable for this run rather than merely inconvenient to compute",
      "still produces what can honestly be produced from the conversation, rather than refusing outright — labelled in-context, not presented as deep-mode numbers",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
];
