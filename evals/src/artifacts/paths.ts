/**
 * Filesystem anchors + plugin artifact resolution.
 *
 * In this repo the skills and agents under test do NOT live in a `.claude/` directory — they are
 * plugin payloads under `plugins/<plugin>/skills/<name>/` and `plugins/<plugin>/agents/<name>.md`.
 * These resolvers scan the plugin catalog and map a bare artifact name ("security",
 * "architecture-reviewer") to its on-disk location, so eval cases keep addressing artifacts by
 * name exactly as they did when the assets lived in `.claude/`.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
export const EVALS_DIR = join(HERE, "..", "..");
export const REPO_ROOT = join(EVALS_DIR, "..");
export const PLUGINS_DIR = join(REPO_ROOT, "plugins");
export const RESULTS_DIR = join(EVALS_DIR, "results");
/** Template for the assembled eval workspace (see src/workspace.ts). */
export const WORKSPACE_TEMPLATE = join(EVALS_DIR, "workspace-template");

export interface SkillRef {
  plugin: string;
  name: string;
  /** Absolute path to the skill directory (contains SKILL.md). */
  dir: string;
}

export interface AgentRef {
  plugin: string;
  name: string;
  /** Absolute path to the agent's .md file. */
  file: string;
}

function pluginNames(): string[] {
  if (!existsSync(PLUGINS_DIR)) return [];
  return readdirSync(PLUGINS_DIR)
    .filter((d) => statSync(join(PLUGINS_DIR, d)).isDirectory())
    .sort();
}

/** Every skill shipped by any plugin: `plugins/<plugin>/skills/<name>/SKILL.md`. */
export function listSkills(): SkillRef[] {
  const out: SkillRef[] = [];
  for (const plugin of pluginNames()) {
    const skillsDir = join(PLUGINS_DIR, plugin, "skills");
    if (!existsSync(skillsDir)) continue;
    for (const name of readdirSync(skillsDir).sort()) {
      const dir = join(skillsDir, name);
      if (statSync(dir).isDirectory() && existsSync(join(dir, "SKILL.md"))) {
        out.push({ plugin, name, dir });
      }
    }
  }
  return out;
}

/** Every agent shipped by any plugin: `plugins/<plugin>/agents/<name>.md`. */
export function listAgents(): AgentRef[] {
  const out: AgentRef[] = [];
  for (const plugin of pluginNames()) {
    const agentsDir = join(PLUGINS_DIR, plugin, "agents");
    if (!existsSync(agentsDir)) continue;
    for (const f of readdirSync(agentsDir).sort()) {
      if (f.endsWith(".md") && f !== "README.md") {
        out.push({ plugin, name: f.replace(/\.md$/, ""), file: join(agentsDir, f) });
      }
    }
  }
  return out;
}

function resolveOne<T extends { plugin: string }>(kind: string, name: string, matches: T[]): T {
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new Error(
      `${kind} '${name}' not found in any plugin (searched ${PLUGINS_DIR}/*/${kind}s/). ` +
        `Is the plugin that ships it present in this checkout?`,
    );
  }
  throw new Error(
    `${kind} '${name}' is ambiguous — shipped by plugins: ${matches.map((m) => m.plugin).join(", ")}. ` +
      `Rename one of them or resolve by explicit path.`,
  );
}

/** Absolute directory of the named skill, wherever its plugin ships it. */
export function skillDir(skillName: string): string {
  return resolveOne("skill", skillName, listSkills().filter((s) => s.name === skillName)).dir;
}

/** Absolute path of the named agent's .md, wherever its plugin ships it. */
export function agentFile(agentName: string): string {
  return resolveOne("agent", agentName, listAgents().filter((a) => a.name === agentName)).file;
}
