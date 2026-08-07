/**
 * Load a skill / agent artifact from disk as text, to inject as a system prompt. This is what
 * makes skillTask/agentTask measure the artifact's CONTENT in isolation. Artifacts are resolved
 * out of the plugin catalog (plugins/<plugin>/{skills,agents}/...) by bare name — see paths.ts.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { MUTATING_TOOLS, EVAL_SKILL_REFS } from "../config.js";
import { skillDir, agentFile } from "./paths.js";

function stripFrontmatter(md: string): string {
  if (md.startsWith("---")) {
    const end = md.indexOf("\n---", 3);
    if (end !== -1) return md.slice(end + 4).replace(/^\n+/, "");
  }
  return md;
}

/**
 * SKILL.md plus references/*.md from a `references/` DIRECTORY. Note this is already MORE than
 * production injects: Claude Code loads only the SKILL.md body on invocation — every supporting
 * file (references/, flat examples.md / reference.md / rules/ …) is read on demand via the Read
 * tool ("loaded when needed", code.claude.com/docs/en/skills → Add supporting files). Flat
 * root .md files are deliberately NOT injected: the content tier measures what SKILL.md itself
 * teaches, and widening the set would need an arbitrary payload/not-payload convention
 * (README.md? AGENTS.md? eval fixtures?) no standard defines.
 *
 * `includeReferences` defaults to EVAL_SKILL_REFS (on). Pass it explicitly only from tests — the
 * knob is documented in config.ts, and the reason it exists is that "SKILL.md + references" and
 * "SKILL.md" are different measurements for the 5 skills that ship a references/ directory.
 */
export function skillContent(
  skillName: string,
  includeReferences: boolean = EVAL_SKILL_REFS,
): string {
  const dir = skillDir(skillName);
  const skillMd = join(dir, "SKILL.md");
  if (!existsSync(skillMd)) throw new Error(`SKILL.md not found: ${skillMd}`);
  const parts = [readFileSync(skillMd, "utf8")];
  const refs = join(dir, "references");
  if (includeReferences && existsSync(refs)) {
    for (const f of readdirSync(refs).filter((f) => f.endsWith(".md")).sort()) {
      parts.push(`\n\n## Reference: ${f}\n\n${readFileSync(join(refs, f), "utf8")}`);
    }
  }
  return parts.join("\n");
}

/** An agent definition with its frontmatter stripped (the behavioral prompt only). */
export function agentContent(agentName: string): string {
  const f = agentFile(agentName);
  return stripFrontmatter(readFileSync(f, "utf8"));
}

// Tools the eval refuses to hand a subagent: evals run with bypassPermissions, so a mutating
// tool could take real actions. An agent that declares these still runs — it just runs
// read-only, which is all an eval ever needs. Filtering the declared list is only half the
// guard; agentTask also passes the same list as `disallowedTools`, because bypassPermissions
// ignores an allow-list.
const MUTATING = new Set(MUTATING_TOOLS);
const READONLY_FALLBACK = ["Read", "Grep", "Glob"];

/**
 * The tools an agent DECLARES in its frontmatter (`tools: Read, Glob, Grep`), so the eval can run
 * a tool-using agent the way production does instead of crippling it to content-only. Derived per
 * agent from its own declaration — no per-agent wiring. Returns [] when the agent declares no
 * tools (genuine content-only agent). Mutating tools are stripped for safety; a `*` / "All tools"
 * grant collapses to the read-only fallback rather than handing over Write/Bash.
 */
export function agentTools(agentName: string): string[] {
  const f = agentFile(agentName);
  const md = readFileSync(f, "utf8");
  const fmEnd = md.startsWith("---") ? md.indexOf("\n---", 3) : -1;
  const frontmatter = fmEnd !== -1 ? md.slice(0, fmEnd) : "";
  const line = frontmatter.match(/^tools:\s*(.+)$/m);
  if (!line) return [];
  const raw = line[1].trim();
  if (raw === "*" || /all tools/i.test(raw)) return [...READONLY_FALLBACK];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !MUTATING.has(t));
}
