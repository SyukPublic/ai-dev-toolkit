/**
 * The headless turn-loop driver. Runs one Claude Agent SDK session on the subscription and
 * extracts what the session ACTUALLY did (tools, subagents, skills, reads) — not its prose.
 */

import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { EVAL_EFFORT, EVAL_MODEL, MAX_TURNS, SPAWN_TOOLS } from "../config.js";
import { REPO_ROOT } from "../artifacts/paths.js";
import { subscriptionEnv } from "./env.js";

export interface Metrics {
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  /** Total tool_use blocks seen (NOT deduplicated — a measure of work done). */
  toolCallCount: number;
}

export interface Result {
  text: string;
  toolsUsed: string[];
  subagents: string[];
  /** Skills activated via the Skill tool (workflow mode); name may be "plugin:skill". */
  skillsInvoked: string[];
  filesRead: string[];
  numTurns: number;
  isError: boolean;
  /** SDK result subtype when not success (e.g. "error_max_turns"); "error" for thrown SDK failures. */
  errorSubtype?: string;
  /**
   * The model this run ACTUALLY used — the resolved `opts.model ?? EVAL_MODEL`, not the config
   * default. `results/records.jsonl` is append-only and accumulates runs across models (an
   * `EVAL_MODEL=... pnpm eval:repeat` probe lands in the same file as the default series), so
   * without this a row cannot be attributed after the fact and mixed series silently pool.
   */
  model: string;
  /**
   * The reasoning effort this run ACTUALLY requested — `opts.effort ?? EVAL_EFFORT`, or undefined
   * for the SDK default. Recorded for the same reason `model` is, and with one extra caveat: the
   * SDK silently downgrades a level the model does not support, so this is what was ASKED for.
   */
  effort?: string;
  metrics: Metrics;
}

export interface RunOptions {
  systemPrompt?: string;
  allowedTools?: string[];
  maxTurns?: number;
  cwd?: string;
  model?: string;
  /** Reasoning effort override; falls back to EVAL_EFFORT, then to the SDK default for the model. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** ["project"] loads on-disk CLAUDE.md + skills/agents; default [] keeps the run isolated. */
  settingSources?: Array<"user" | "project" | "local">;
  /** Tools hard-blocked even under bypassPermissions (mutation guard for the workflow tier). */
  disallowedTools?: string[];
  /**
   * Early-stop hook. Called after every tool_use with the trace collected SO FAR; return true to
   * end the session immediately. Lets a dispatch/trace case stop the moment its evidence is in
   * (e.g. the subagent was launched) instead of waiting for a heavy nested subagent to finish.
   * On an early stop the run is NOT an error and metrics reflect only what ran before the stop.
   */
  stopWhen?: (partial: Pick<Result, "subagents" | "filesRead" | "skillsInvoked" | "toolsUsed">) => boolean;
}

/**
 * Assemble the judged artifact from a session: the WHOLE transcript, not just the SDK's final text.
 *
 * `resultText` is the result message's `result` field, i.e. the LAST assistant message. Preferring it
 * (`resultText || textParts.join()`, the original) silently DISCARDED the deliverable whenever the
 * agent said anything after it. Measured: a `researcher` run whose entire recorded output was "The
 * background exploration agent has completed. My research report above already covers the complete
 * answer …" while the report itself was gone — the trace showed `toolCallCount: 59`, subagent
 * `Explore` and every relevant file read, but the wrap-up carried no `PROJECT` heading and no route
 * literal, so the grounding gate failed, the judge never ran, and the row read as a content failure.
 * A FALSE RED, invisible unless you notice 59 tool calls cannot fit the reported 6.5 s duration.
 *
 * `textParts` already holds every text block including the final one, so `resultText` is normally
 * redundant — hence the containment check rather than an unconditional join: nothing is lost, and the
 * usual case does not get the last message twice.
 *
 * The cost, and its exact scope. Intermediate narration ("Let me search more broadly…") is now part
 * of the judged artifact in every tier, so:
 *   - A NEGATIVE practice ("does not do X") can only get STRICTER — extra text can add evidence
 *     against the agent, never remove it. False greens are impossible for these by construction.
 *     Confirmed empirically: the one big swing seen after this change (planner `stop-and-ask` 2/5 →
 *     5/5) was haiku behaving differently, not masking — 3 of 5 pre-fix outputs contained "Phase 1"
 *     or "traceability" and 0 of 5 post-fix ones did, and narration cannot delete a word.
 *   - A POSITIVE practice ("does X") is the exposed direction: narration can supply the evidence the
 *     report itself never printed. Not observed causing a flip, but n=5 against a model as variable
 *     as haiku cannot rule it out. If a positive practice ever passes suspiciously, read the output
 *     file and check whether the quote came from the report or from the search narration.
 */
export function assembleText(textParts: string[], resultText: string): string {
  const transcript = textParts.join("\n");
  if (resultText && !transcript.includes(resultText)) {
    return [transcript, resultText].filter(Boolean).join("\n");
  }
  return transcript || resultText;
}

/** Run one headless Claude turn-loop and extract what it ACTUALLY did (not its prose). */
export async function runClaude(prompt: string, opts: RunOptions = {}): Promise<Result> {
  const allowedTools = opts.allowedTools ?? [];
  // With no tools, a subagent/skill prompt that says "read files" will loop on denied tool
  // calls until max-turns. For these content-only evals the input is already in the prompt,
  // so tell the model to answer directly.
  let systemPrompt = opts.systemPrompt;
  if (allowedTools.length === 0) {
    const directive =
      "\n\nYou have NO tools available in this session. Do not attempt any tool calls. " +
      "Answer directly and completely from the information given in the prompt.";
    systemPrompt = (systemPrompt ?? "") + directive;
  }

  const model = opts.model ?? EVAL_MODEL;
  const effort = opts.effort ?? EVAL_EFFORT;
  const options: Options = {
    model,
    // Omitted entirely when unset, so every pre-existing row's conditions stay reproducible —
    // passing `effort: undefined` explicitly would be the same thing, but this keeps the intent
    // legible next to the SDK's "default depends on the model" semantics.
    ...(effort ? { effort } : {}),
    maxTurns: opts.maxTurns ?? MAX_TURNS,
    permissionMode: "bypassPermissions", // safe: evals only read/plan and tools are allow-listed
    systemPrompt,
    allowedTools,
    disallowedTools: opts.disallowedTools,
    cwd: opts.cwd ?? REPO_ROOT,
    // Default: do NOT load on-disk config — isolates the injected artifact. workflowTask overrides.
    settingSources: opts.settingSources ?? [],
    env: subscriptionEnv(),
  };

  const textParts: string[] = [];
  const tools: string[] = [];
  const subagents: string[] = [];
  const skills: string[] = [];
  const reads: string[] = [];
  let resultText = "";
  let isError = false;
  let errorSubtype: string | undefined;
  let numTurns = 0;
  let toolCallCount = 0;
  // Resource metrics, read defensively off the result message (field names verified against the
  // installed SDK's types). On the subscription path total_cost_usd is meaningless, so we ignore
  // it and surface tokens only. Fall back to 0 whenever a field is absent — never throw.
  let durationMs = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let stoppedEarly = false;
  // Wall-clock fallback: on an early stop we break before the result message that carries
  // duration_ms/usage, so those stay 0. Stamp duration ourselves, and accumulate output tokens
  // off each assistant message, so an early-stopped case still reports meaningful metrics.
  const startedAt = Date.now();

  // The SDK throws on an error result (e.g. max-turns). We still want the partial output
  // and the tool/subagent trace we collected, so catch and fall through with isError=true.
  try {
    loop: for await (const msg of query({ prompt, options })) {
      if (msg.type === "assistant") {
        numTurns++;
        outputTokens += (msg.message as any).usage?.output_tokens ?? 0;
        for (const block of msg.message.content as any[]) {
          if (block.type === "text") textParts.push(block.text);
          else if (block.type === "tool_use") {
            tools.push(block.name);
            toolCallCount++;
            const input = block.input ?? {};
            if (SPAWN_TOOLS.has(block.name)) {
              const sub = input.subagent_type ?? input.agent_type ?? input.name;
              if (sub) subagents.push(sub);
            }
            if (block.name === "Read") {
              const fp = input.file_path ?? input.path;
              // Normalize to POSIX separators so downstream forward-slash substring checks
              // (filesRead .includes("a/b/c.md")) match on Windows too; no-op on Linux/WSL.
              if (fp) reads.push(fp.replace(/\\/g, "/"));
            }
            if (block.name === "Skill") {
              const s = input.skill ?? input.command;
              if (s) skills.push(s);
            }
            // Evidence is in — break the loop before a heavy nested subagent runs to completion.
            // Breaking the async iterator triggers its return()/abort, tearing down the subprocess.
            if (
              opts.stopWhen?.({
                subagents: [...new Set(subagents)],
                filesRead: reads,
                skillsInvoked: [...new Set(skills)],
                toolsUsed: [...new Set(tools)],
              })
            ) {
              stoppedEarly = true;
              break loop;
            }
          }
        }
      } else if (msg.type === "result") {
        isError = msg.subtype !== "success";
        if (isError) errorSubtype = msg.subtype;
        const m = msg as any;
        numTurns = m.num_turns ?? 0;
        durationMs = m.duration_ms ?? 0;
        inputTokens = m.usage?.input_tokens ?? 0;
        outputTokens = m.usage?.output_tokens ?? 0;
        if (m.result) resultText = m.result;
      }
    }
  } catch (err) {
    isError = true;
    // The SDK surfaces max-turns as a thrown error (not a result message) on this path — classify
    // it so callers can tell an EXPECTED turn-cap end (negative activation case) from a real crash.
    errorSubtype = /maximum number of turns/i.test(String(err)) ? "error_max_turns" : "error";
    // A turn-cap end is never a crash, even when the session produced no prose at all — for a
    // trace-asserted case the TRACE is the measurement, and an activation negative is designed to
    // run to the cap. Re-throwing here was the cause of the long-unexplained shrinking denominator:
    // the throw escapes `await task(...)`, which sits OUTSIDE the try/finally that calls record(), so
    // the case vanished from the ledger entirely and the series silently averaged over fewer runs
    // than it printed. It also failed the case, which for a negative is the opposite of the truth.
    // A genuine error with nothing collected still surfaces.
    if (!resultText && textParts.length === 0 && errorSubtype !== "error_max_turns") {
      throw err; // nothing usable collected and not a turn-cap end — surface the failure
    }
  }

  // Early stop never reached the result message, so fall back to the wall-clock duration.
  if (stoppedEarly && durationMs === 0) durationMs = Date.now() - startedAt;

  return {
    text: assembleText(textParts, resultText),
    toolsUsed: [...new Set(tools)],
    subagents: [...new Set(subagents)],
    skillsInvoked: [...new Set(skills)],
    filesRead: reads,
    numTurns,
    isError,
    errorSubtype,
    model,
    effort,
    metrics: { durationMs, inputTokens, outputTokens, toolCallCount },
  };
}
