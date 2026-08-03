/**
 * The three ways to run a case. Each composes runtime + artifacts; nothing here talks to the
 * SDK directly.
 *
 *   skillTask / agentTask — inject the artifact's content as system prompt, load NO on-disk
 *     config → measures the artifact's CONTENT in isolation.
 *   workflowTask — load a real on-disk harness (settingSources:["project"]) → measures the
 *     SYSTEMIC effect: does a skill activate, does a subagent dispatch, does CLAUDE.md matter.
 *
 * The tool tiers run from the ASSEMBLED WORKSPACE (src/workspace.ts): a temp project whose
 * `.claude/skills` + `.claude/agents` are copied out of `plugins/*` — that is how plugin payloads
 * become loadable project assets without a plugin-install step.
 */

import { IS_BASELINE, MUTATING_TOOLS, WORKFLOW_ALLOWED_TOOLS, WORKFLOW_DISALLOWED_TOOLS } from "./config.js";
import { runClaude, type RunOptions } from "./runtime/run-claude.js";
import { runContent } from "./runtime/dispatch.js";
import { skillContent, agentContent, agentTools } from "./artifacts/load.js";
import { evalWorkspace } from "./workspace.js";

/**
 * Run a prompt with a skill's content injected (the 'candidate' condition). Under
 * EVAL_CONFIG=baseline the artifact is NOT injected — that is the benchmark's without-skill
 * baseline, i.e. the raw model, used to measure the skill's lift.
 */
export function skillTask(prompt: string, skillName: string, opts: RunOptions = {}) {
  const systemPrompt = IS_BASELINE ? undefined : skillContent(skillName);
  return runContent(prompt, { ...opts, systemPrompt });
}

/**
 * Run a prompt with a subagent's definition injected as the system prompt (baseline: none).
 *
 * A subagent is a TOOL-USING artifact — its whole method is "read the docs, grep the imports".
 * Running it content-only (no tools) both contradicts its own body ("you have Read/Glob/Grep")
 * and trips runClaude's "you have NO tools" directive, which makes a doc-grounded reviewer refuse
 * or downgrade every finding to `cannot-verify`. So we hand it exactly the tools it declares in
 * frontmatter and run it from the assembled workspace, where the documented contracts
 * (docs/architecture.md) and the paved-path skills it consults are on disk — the way production
 * does. Both conditions (candidate + baseline) get the same tools so the measured lift stays fair.
 */
export function agentTask(prompt: string, agentName: string, opts: RunOptions = {}) {
  const systemPrompt = IS_BASELINE ? undefined : agentContent(agentName);
  const allowedTools = agentTools(agentName);
  // Stripping mutating tools from the DECLARED list is not a guard on its own: bypassPermissions
  // ignores allowedTools (same reason workflowTask carries a blocklist). `implementer` declares
  // Write/Edit/Bash and its entire purpose is to use them, so without this an implementer eval
  // would run a real shell and write real files. Not overridable via opts — placed after the
  // spread deliberately.
  return runClaude(prompt, {
    allowedTools,
    cwd: evalWorkspace(),
    ...opts,
    systemPrompt,
    // Union, not replacement: a caller may ADD restrictions but can never drop the mandatory ones.
    disallowedTools: [...new Set([...MUTATING_TOOLS, ...(opts.disallowedTools ?? [])])],
  });
}

/**
 * Run a prompt against the assembled on-disk harness (workspace CLAUDE.md + the plugins' skills
 * and agents loaded as project assets). Use for workflow-level evals: skill activation, subagent
 * dispatch, CLAUDE.md routing. Ignores EVAL_CONFIG — the workflow tier has its own
 * control-vs-treatment design.
 *
 * Safety: keep allowedTools a read-only allow-list (no Bash/Write/Edit) — a fresh session
 * with bypassPermissions could otherwise take real actions.
 *
 * `disallowedTools` is the UNION of the mandatory blocklist and whatever the caller adds, because
 * an allow-list is inert under bypassPermissions: filtering a tool out of `allowedTools` does not
 * stop the model from using it. An activation case relies on this to actually block subagent
 * spawning — before the union it passed a filtered allow-list, the filter did nothing, and a
 * dispatched subagent's own preloaded skills showed up in the PARENT trace as a false activation.
 */
export function workflowTask(prompt: string, opts: RunOptions = {}) {
  return runClaude(prompt, {
    allowedTools: WORKFLOW_ALLOWED_TOOLS,
    cwd: evalWorkspace(),
    ...opts,
    disallowedTools: [...new Set([...WORKFLOW_DISALLOWED_TOOLS, ...(opts.disallowedTools ?? [])])],
    settingSources: ["project"],
  });
}
