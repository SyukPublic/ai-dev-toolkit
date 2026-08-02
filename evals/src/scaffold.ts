/**
 * Discover the skills/agents shipped by plugins/* and scaffold eval files for one of them.
 *
 *   pnpm eval:scaffold                 # list every skill/agent and whether it has evals
 *   pnpm eval:scaffold <skill-name>    # create evals/plugins/<plugin>/skills/<name>/{...}
 *   pnpm eval:scaffold --agent <name>  # same under evals/plugins/<plugin>/agents/<name>/
 *
 * Eval files are colocated with the PLUGIN that ships the artifact (mirrors plugins/ layout).
 * Refuses to overwrite existing files.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GREEN, DIM, YELLOW, RESET } from "./ansi.js";
import { EVALS_DIR, PLUGINS_DIR, listAgents, listSkills } from "./artifacts/paths.js";

const evalPath = (plugin: string, tier: "skills" | "agents", name: string) =>
  join(EVALS_DIR, "plugins", plugin, tier, name, `${name}.eval.ts`);
const hasEval = (plugin: string, tier: "skills" | "agents", name: string) => existsSync(evalPath(plugin, tier, name));

function list(): void {
  console.log(`\n${"=".repeat(56)}\nSkills (${PLUGINS_DIR}/*/skills)\n${"=".repeat(56)}`);
  for (const s of listSkills()) {
    const mark = hasEval(s.plugin, "skills", s.name) ? `${GREEN}✓ evals${RESET}` : `${DIM}— no evals${RESET}`;
    console.log(`  ${`${s.plugin}:${s.name}`.padEnd(48)} ${mark}`);
  }
  console.log(`\n${"=".repeat(56)}\nAgents (${PLUGINS_DIR}/*/agents)\n${"=".repeat(56)}`);
  for (const a of listAgents()) {
    const mark = hasEval(a.plugin, "agents", a.name) ? `${GREEN}✓ evals${RESET}` : `${DIM}— no evals${RESET}`;
    console.log(`  ${`${a.plugin}:${a.name}`.padEnd(48)} ${mark}`);
  }
  console.log(`\nScaffold one:  pnpm eval:scaffold <skill-name>   |   pnpm eval:scaffold --agent <agent-name>`);
}

function casesTemplate(kind: "Skill" | "Agent"): string {
  return `import type { ${kind}Case } from "../../../../src/index.js";

// To inline a fixture file into a prompt, uncomment these two lines and drop the file in
// fixtures/, then use fx("your-fixture.ext") inside a prompt string:
//   import { fixtureReader } from "../../../../src/index.js";
//   const fx = fixtureReader(import.meta.url);

export const cases: ${kind}Case[] = [
  {
    name: "TODO describe the good behavior this checks",
    kind: "quality",
    prompt: "TODO the user/task prompt the ${kind.toLowerCase()} should handle",
    practices: [
      "TODO a specific, binary, citable thing the answer must do",
      "TODO another one — keep each verifiable from a verbatim quote",
    ],
    // grounding: ["exact-substring-that-must-appear-before-judging"], // optional cheap gate
    // threshold: 0.6,
    // maxTurns: 8,
  },
  // Keep it minimal — one or two cases is enough to start.
];
`;
}

function evalTemplate(tier: "skills" | "agents", name: string): string {
  const describe = tier === "skills" ? "describeSkill" : "describeAgent";
  const run = tier === "skills" ? "runSkillCases" : "runAgentCases";
  return `import { ${describe}, ${run} } from "../../../../src/index.js";
import { cases } from "./${name}.cases.js";

${describe}("${name}", () => ${run}("${name}", cases));
`;
}

function scaffold(tier: "skills" | "agents", name: string): void {
  const kind = tier === "skills" ? "Skill" : "Agent";
  const available = tier === "skills" ? listSkills() : listAgents();
  const ref = available.find((r) => r.name === name);
  if (!ref) {
    // Without a plugin home there is nowhere to put the files — refuse instead of guessing.
    console.error(`${YELLOW}error:${RESET} '${name}' not found among ${tier} in plugins/*/.`);
    console.error(`  available ${tier}: ${available.map((r) => `${r.plugin}:${r.name}`).join(", ") || "(none)"}`);
    process.exit(1);
  }

  const dir = join(EVALS_DIR, "plugins", ref.plugin, tier, name);
  const files: [string, string][] = [
    [join(dir, `${name}.eval.ts`), evalTemplate(tier, name)],
    [join(dir, `${name}.cases.ts`), casesTemplate(kind)],
    [join(dir, "fixtures", ".gitkeep"), ""],
  ];

  const existing = files.filter(([f]) => existsSync(f)).map(([f]) => f);
  if (existing.length) {
    console.error(`${YELLOW}refusing to overwrite:${RESET}\n  ${existing.join("\n  ")}`);
    process.exit(1);
  }

  mkdirSync(join(dir, "fixtures"), { recursive: true });
  for (const [f, content] of files) writeFileSync(f, content);

  console.log(`${GREEN}scaffolded plugins/${ref.plugin}/${tier}/${name}:${RESET}`);
  for (const [f] of files) console.log(`  ${f.replace(EVALS_DIR + "/", "")}`);
  console.log(`\nNext: fill in ${name}.cases.ts, then run  pnpm vitest run ${tier}/${name}`);
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.length === 0) return list();
  const agentIdx = argv.indexOf("--agent");
  if (agentIdx !== -1) {
    const name = argv[agentIdx + 1];
    if (!name) return void console.error("usage: pnpm eval:scaffold --agent <agent-name>");
    return scaffold("agents", name);
  }
  scaffold("skills", argv[0]);
}

main();
