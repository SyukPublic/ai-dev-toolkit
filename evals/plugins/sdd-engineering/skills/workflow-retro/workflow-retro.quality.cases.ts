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
//   plan-verifier: read-only, 58.4k output tokens            report bloat ⇒ tighten its contract
//     (the largest output in the run, on the fewest api_turns)
//
// That last figure was 29.8k until it was measured, and 29.8k did not plant the rule it was meant
// to plant. The practice sat at 0/5 on haiku AND 0/5 on sonnet — ten runs, every failure with empty
// judge evidence — so the model was not weighing the lead and rejecting it, it never raised the
// subject at all. Model ceiling was ruled out by that identical pair of rates, and the three usual
// case defects were ruled out one by one: SKILL.md:67 states the rule verbatim ("Big output_tokens
// on a read-only agent → report bloat; tighten its output contract"), the agent really is read-only
// (`writes_paths: []`), and the prompt invites the lead ("Where is this run wasting tokens").
//
// What was actually wrong is that 29.8k was the THIRD largest output of four. Both implementers
// emitted more (41.2k, 38.9k) and emitted it legitimately, because they wrote code. To reach the
// rule from that fixture you had to partition the agents by `writes_paths` first and only then
// compare within the read-only class — while the biggest number on the page belonged to someone
// entitled to it. The other two leads in this case need no such step: 41% against 91/87/89 is a
// visible outlier, and the duplicated reads are listed outright. So the fixture planted a valid
// instance of the rule but not a SALIENT one.
//
// 29.8k → 58.4k makes it the largest output in the run, produced on the fewest api_turns, by the
// one agent that wrote nothing. `totals.orchestrator_plus_agents.output` moved 122300 → 150900 to
// keep the fixture's arithmetic honest — all four totals still equal the sum of the journals.
// The practice's WORDING is deliberately untouched (only the figure it cites moved), so the
// re-measure attributes to salience and nothing else.
//
// Prediction, recorded before measuring so the result is honest either way: if the practice now
// fires, the earlier 0/5 was an artifact of fixture salience and this dimension is measurable. If
// it still reads 0/5 against an unmissable instance, the miss is the skill's — SKILL.md:67 is
// stated but not applied — and that is a genuine artifact finding, the session's first.
//
// RESULT (`retro-salience-fixed`, haiku, n=5): the first branch. The practice went 0/5 → 2/5 and
// the passing runs cite exactly the intended reasoning — "Yet outputs 58.4k tokens — more than
// either implementer (41.2k, 38.9k)" and "58.4k tokens on 54k input — nearly 1:1 ratio". So
// SKILL.md:67 IS applied once the instance is salient, and there is NO artifact defect here; the
// defect was the fixture's, and it is fixed. No collateral damage either: the cache-churn practice
// moved 2/5 → 3/5 and the timing case, which injects the same fixture, held at 5/5 with its
// writes_paths practice going 3/5 → 4/5.
//
// What 2/5 is NOT: a compound-practice failure. That was the obvious next hypothesis — the practice
// does join a detection to a remedy — and the evidence refutes it. All three failing runs carry
// EMPTY judge evidence, i.e. the model never raises the subject at all, rather than raising it and
// omitting the remedy. Splitting the conjunction would move nothing.
//
// What 2/5 probably IS: this case's own documented failure mode, one level down. The header above
// records that a single prompt asking for five leads scored 2/5 and that splitting BY TOPIC fixed
// it — but this case still carries three leads (context pack, cache churn, output bloat), and its
// name admits only two of them. Both case-level failures are runs where the cache lead AND the
// output lead were missed together, which is the attention-budget signature rather than a knowledge
// gap. The next step, if this dimension is wanted at a higher rate, is to give the output-bloat
// lead its own scoped prompt — the same split that fixed the mermaid review, the timing case, and
// run-plan's gate case.
//
// DONE — that split is the third case below. The cost case keeps the context and cache leads, which
// is exactly what its name always said, so it is NOT renamed and its lifetime pooling survives; only
// the output-bloat practice moved out. The new case scopes by dimension without naming the defect,
// and it carries a CONTROL the old arrangement had no room for: the implementers' 41.2k and 38.9k
// must NOT be called bloat, because agents that wrote code are entitled to their output. That
// control is what separates "spots the read-only outlier" from "flags whatever number is biggest",
// and without it a pass proves much less than it looks.
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
    // RENAMED (was "cost: turns the context and cache leads into concrete actions") because the cache
    // lead moved to its own case below and the old name would have been false. The rename resets this
    // case's lifetime pooling — the ledger keys on `file > test name` — so its pre-split rows stop
    // matching. Recorded because a silent rename reads as a data gap later.
    name: "cost: turns the duplicated reads into a context pack",
    kind: "quality",
    prompt: `Here is the retro metrics output for a pipeline run. Several agents read the same files. What is that costing, and what would you change? Every point you make should end in something we can actually do.

${RETRO_TASK}

${METRICS}`,
    // Gate on the SUBJECT plus every remedy wording an answer legitimately uses, not on this skill's
    // preferred phrase. The old slot was ["context pack", "context-pack", "pre-fetch", "prefetch"] and
    // it failed a run whose two judged practices both scored 4/4: the answer said "spawn prompt" four
    // times and never used the skill's vocabulary. Same class of defect as run-plan's inflected-form
    // slot — gate on the behaviour, leave the wording to the judge.
    grounding: [
      [
        "architecture.md",
        "context pack",
        "context-pack",
        "pre-fetch",
        "prefetch",
        "preload",
        "spawn prompt",
      ],
    ],
    practices: [
      "identifies the files read by all three agents — docs/architecture.md and the order-export plan — as context-pack candidates that should be pre-fetched into the spawn prompt instead of being re-read by every agent",
      "ends each point in a concrete action — an agent brief to refine, a file to pre-fetch, a frontmatter setting to change — rather than an observation with no follow-through",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
  {
    // The cache lead, split out for the same measured reason as the output-bloat lead. After the first
    // split it stayed at 3/5 with EMPTY judge evidence in both failures — so it was not a compound
    // practice failing on its remedy half, it was the subject never being raised: the context-pack
    // lead was outranking it in the shared prompt, exactly as that prompt had outranked output bloat.
    // With cache moved out, the case above is left with a single lead, so this terminates — there is
    // no third round of splitting to do here.
    name: "cost: reads a low cache hit rate as prompt churn",
    kind: "quality",
    prompt: `Here is the retro metrics output for a pipeline run. Look at how well each agent's prompt cache is working, and whether any of those numbers points at something we are doing wrong. Set the duplicated reads and the output volumes aside for this answer.

${RETRO_TASK}

${METRICS}`,
    // From the fixture, not the prompt: the prompt names no agent and no percentage.
    grounding: [["7c02", "41%", "41 %", "cache_hit_pct"]],
    practices: [
      "identifies agent-7c02 as the outlier on cache effectiveness — 41% against 87-91% for every other agent in the run",
      // Was: "…something in that agent's prompt prefix is changing between calls…". That named ONE
      // causal story and measured 2/5, and one failing run had found a different one that is at least
      // as good: "The 4 tool errors are the culprit. Each error recovery likely forced a new context
      // block (error message + explanation + retry prompt = different shape → cache miss)". agent-7c02
      // is in fact the only agent in the fixture with `tool_errors` at all, and the fixture header
      // lists those 4 errors as a planted lead in their own right — so the model tied two real signals
      // together and was penalised for not reciting the wording of a third. An enumeration inside a
      // practice adds requirements the contract never had; the claim under test is churn-vs-inevitable,
      // not which mechanism produces it.
      // 1 run in 11 fails BOTH of these, and it is the suite discriminating rather than a practice
      // defect — recorded so the next reader does not "fix" it. At 4127191 the failing run answered
      // "this points at concurrent file mutations breaking cache coherence" and prescribed "Slice
      // ownership — assign each agent disjoint file ownership". Both are coherent sentences about a
      // DIFFERENT problem: a prompt cache keys on the token prefix, not on file state, so neither
      // the diagnosis nor the remedy touches cache churn. The practices caught a wrong answer.
      //
      // Worth stating because the shape mimics two defects this repo HAS fixed — a detection
      // practice tied to one diagnosis, and a remedy practice that enumerates acceptable cures. The
      // difference is that here both already carry an explicit open set ("any concrete mechanism
      // counts: …" / three alternatives), and the answer landed outside not because it was a fourth
      // legitimate cure but because it was about something else. Check that distinction before
      // touching either line: if a future failure cites a real cache-prefix fix that is not one of
      // the three, THAT is the enumerated-remedy trap and the wording should open up.
      "reads that as prompt churn rather than as an unavoidable cost — something about what is sent to that agent varies between calls, so it re-creates cache instead of reading it (any concrete mechanism counts: an unstable prefix, retry cycles after its tool errors, a brief rebuilt per call)",
      "recommends a concrete fix — a stable shared prefix, moving the volatile part of the prompt to the end, or a steadier spawn brief for that agent",
      // Control: the other three agents are FINE, and saying so is part of reading the column right.
      "does NOT treat the other agents' cache behaviour as a problem — 91%, 87% and 89% are healthy and are not the finding",
    ],
    threshold: 0.7,
    maxTurns: 4,
  },
  {
    // The output-bloat lead, split out of the cost case above. Scoped by dimension and de-scoping the
    // other two leads, the way the mermaid review case says "Ignore styling for now" — it names the
    // dimension (how much each agent wrote, and whether that fits its job) without naming the agent
    // or the verdict, so the model still has to find that the biggest producer is the one that wrote
    // no files.
    name: "cost: reads a read-only agent's output volume as report bloat",
    kind: "quality",
    prompt: `Here is the retro metrics output for a pipeline run. Look at how much each agent WROTE — the output-token figures — and whether any of that volume is disproportionate to what the agent was there to do. Set the context-pack and cache questions aside for this answer.

${RETRO_TASK}

${METRICS}`,
    // Behavioural: the answer has to arrive at the right agent. These strings come from the FIXTURE,
    // not from the prompt, so this is not the prompt-echo trap — the prompt names no agent and no
    // figure. Several spellings because a correct answer may name the id, the role, or the number.
    grounding: [["plan-verifier", "agent-9d55", "58.4", "58400", "58,400"]],
    practices: [
      "identifies the plan-verifier (agent-9d55) as the outlier — it produced the largest output in the run while writing no files at all",
      "grounds that in its ROLE rather than in the raw number: a read-only agent producing more than either implementer, on the fewest api_turns, is disproportionate to the job it was given",
      "proposes tightening its output contract — a tighter report brief, a shorter or more structured deliverable — rather than only noting the figure",
      // Control. Without it, "flags the biggest number" passes as if it were "spots the read-only
      // outlier", and the practice above would prove almost nothing.
      "does NOT present the implementers' outputs (41.2k for agent-4b1f, 38.9k for agent-7c02) as bloat — those agents wrote code, so their volume is expected and is not the finding",
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
