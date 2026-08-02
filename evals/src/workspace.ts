/**
 * The assembled eval workspace — the KEY adaptation for running plugin assets as project assets.
 *
 * In production these plugins are installed via the marketplace and their skills/agents are
 * addressed with a namespace (`engineering-paved-path:security`). The Agent SDK, however, loads
 * on-disk project config from `<cwd>/.claude/` — so instead of installing plugins for every eval
 * run, we assemble a THROWAWAY project directory once per process:
 *
 *   <tmp>/marketplace-eval-ws-XXXX/
 *   ├── CLAUDE.md + docs/ + src/     ← copied from evals/workspace-template/ (a small, neutral
 *   │                                   host project with a "Read when" routing table and
 *   │                                   documented layer contracts the suites assert against)
 *   └── .claude/
 *       ├── skills/<name>/           ← copied from plugins/<plugin>/skills/<name>/
 *       └── agents/<name>.md         ← copied from plugins/<plugin>/agents/<name>.md
 *
 * The tool tiers (agentTask, workflowTask) run with cwd = this workspace, so skills activate and
 * agents dispatch as PLAIN PROJECT assets (unnamespaced). That is a deliberate, documented
 * simplification: it measures the artifacts' behavior without requiring a `claude plugin install`
 * step per run. See evals/README.md.
 *
 * The workspace is read-mostly (workflowTask hard-blocks Write/Edit/Bash) and lives in the OS
 * temp dir — deleting it is always safe; it is rebuilt on the next run.
 */

import { cpSync, existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QUIET } from "./config.js";
import { WORKSPACE_TEMPLATE, listAgents, listSkills } from "./artifacts/paths.js";

let workspace: string | undefined;

/** Assemble (once per process) and return the absolute path of the eval workspace. */
export function evalWorkspace(): string {
  if (workspace) return workspace;
  if (!existsSync(WORKSPACE_TEMPLATE)) {
    throw new Error(`workspace template missing: ${WORKSPACE_TEMPLATE}`);
  }

  const dir = mkdtempSync(join(tmpdir(), "marketplace-eval-ws-"));
  cpSync(WORKSPACE_TEMPLATE, dir, { recursive: true });

  const skillsDir = join(dir, ".claude", "skills");
  const agentsDir = join(dir, ".claude", "agents");
  mkdirSync(skillsDir, { recursive: true });
  mkdirSync(agentsDir, { recursive: true });

  const skills = listSkills();
  const agents = listAgents();
  for (const s of skills) cpSync(s.dir, join(skillsDir, s.name), { recursive: true });
  for (const a of agents) cpSync(a.file, join(agentsDir, `${a.name}.md`));

  if (!QUIET) {
    console.log(
      `  eval workspace: ${dir} (${skills.length} skills, ${agents.length} agents from plugins/)`,
    );
  }
  workspace = dir;
  return dir;
}
