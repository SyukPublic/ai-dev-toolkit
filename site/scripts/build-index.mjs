#!/usr/bin/env node
/**
 * Scans the marketplace repository and generates the catalog index that the
 * site consumes and republishes as the public API at /api/index.json.
 *
 * Usage: node scripts/build-index.mjs [--root <repoRoot>] [--out <file>]
 *
 * Exits non-zero when the catalog violates quality rules (missing
 * descriptions or versions, duplicate ids), so CI fails before deploying
 * a degraded catalog.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const REPO = 'SyukPublic/ai-dev-toolkit';
const SCHEMA_VERSION = 1;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i === -1 ? fallback : args[i + 1];
};

const repoRoot = path.resolve(scriptDir, argValue('--root', '../..'));
const outFile = path.resolve(scriptDir, argValue('--out', '../src/data/index.json'));

const errors = [];
const today = new Date().toISOString().slice(0, 10);

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const exists = (file) => fs.existsSync(file);
const relPath = (abs) => path.relative(repoRoot, abs).split(path.sep).join('/');

function gitDate(rel) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', rel], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out || today;
  } catch {
    return today;
  }
}

// Plain-text version of a markdown body, truncated — used only for search.
function stripMarkdown(md) {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);
}

function walk(dir) {
  if (!exists(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const marketplaceFile = path.join(repoRoot, '.claude-plugin', 'marketplace.json');
if (!exists(marketplaceFile)) {
  console.error(`marketplace.json not found at ${marketplaceFile}`);
  process.exit(1);
}
const marketplace = readJson(marketplaceFile);
const pluginRootRel = marketplace.metadata?.pluginRoot ?? '.';
const installCommand = (plugin) => `/plugin install ${plugin}@${marketplace.name}`;

const artifacts = [];
const counts = { plugins: 0, skills: 0, agents: 0, commands: 0, mcpServers: 0 };

for (const entry of marketplace.plugins ?? []) {
  if (typeof entry.source !== 'string') {
    console.warn(`skipping "${entry.name}": external sources are not indexed yet`);
    continue;
  }
  const sourceRel = entry.source.startsWith('./')
    ? entry.source
    : path.posix.join(pluginRootRel, entry.source);
  const pluginDir = path.resolve(repoRoot, sourceRel);
  const manifestFile = path.join(pluginDir, '.claude-plugin', 'plugin.json');
  if (!exists(manifestFile)) {
    errors.push(`plugin ${entry.name}: missing ${relPath(manifestFile)}`);
    continue;
  }
  const manifest = readJson(manifestFile);
  const name = manifest.name ?? entry.name;
  const description = manifest.description ?? entry.description ?? '';
  const version = manifest.version ?? null;
  const category = manifest.category ?? entry.category ?? null;
  const keywords = manifest.keywords ?? entry.keywords ?? [];
  if (!description) errors.push(`plugin ${name}: missing description`);
  if (!version) errors.push(`plugin ${name}: missing version in plugin.json (required by docs/RELEASES.md)`);

  // Security summary: what installing this plugin activates.
  const security = { hooks: [], mcpServers: [], executables: false };
  const hooksFile = path.join(pluginDir, 'hooks', 'hooks.json');
  if (exists(hooksFile)) {
    try {
      const h = readJson(hooksFile);
      security.hooks = Object.keys(h.hooks ?? h);
    } catch {
      errors.push(`plugin ${name}: invalid hooks/hooks.json`);
    }
  }
  const mcpFile = path.join(pluginDir, '.mcp.json');
  if (exists(mcpFile)) {
    try {
      const mcp = readJson(mcpFile);
      security.mcpServers = Object.keys(mcp.mcpServers ?? mcp);
    } catch {
      errors.push(`plugin ${name}: invalid .mcp.json`);
    }
  }
  const binDir = path.join(pluginDir, 'bin');
  security.executables = exists(binDir) && fs.readdirSync(binDir).length > 0;

  // Rough always-on context cost of installing the plugin.
  let chars = 0;
  for (const sub of ['skills', 'agents', 'commands']) {
    for (const f of walk(path.join(pluginDir, sub))) chars += fs.statSync(f).size;
  }
  for (const f of [hooksFile, mcpFile]) if (exists(f)) chars += fs.statSync(f).size;

  const readmeFile = path.join(pluginDir, 'README.md');
  const readme = exists(readmeFile) ? fs.readFileSync(readmeFile, 'utf8') : '';

  artifacts.push({
    id: `plugin:${name}`,
    type: 'plugin',
    name,
    displayName: manifest.displayName ?? entry.displayName ?? name,
    description,
    keywords,
    category,
    plugin: name,
    version,
    installCommand: installCommand(name),
    invocation: null,
    path: relPath(pluginDir),
    lastModified: gitDate(relPath(pluginDir)),
    body: stripMarkdown(readme),
    security,
    tokenEstimate: Math.ceil(chars / 4),
  });
  counts.plugins++;

  const childBase = { keywords, category, plugin: name, version, installCommand: installCommand(name) };

  const skillsDir = path.join(pluginDir, 'skills');
  if (exists(skillsDir)) {
    for (const dirent of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!dirent.isDirectory()) continue;
      const skillFile = path.join(skillsDir, dirent.name, 'SKILL.md');
      if (!exists(skillFile)) {
        errors.push(`plugin ${name}: skills/${dirent.name}/ has no SKILL.md`);
        continue;
      }
      const { data, content } = matter(fs.readFileSync(skillFile, 'utf8'));
      const skillName = data.name ?? dirent.name;
      if (!data.description) errors.push(`skill ${name}/${skillName}: missing description in SKILL.md frontmatter`);
      artifacts.push({
        id: `skill:${name}/${skillName}`,
        type: 'skill',
        name: skillName,
        displayName: skillName,
        description: data.description ?? '',
        ...childBase,
        invocation: `/${name}:${skillName}`,
        path: relPath(skillFile),
        lastModified: gitDate(relPath(skillFile)),
        body: stripMarkdown(content),
      });
      counts.skills++;
    }
  }

  const agentsDir = path.join(pluginDir, 'agents');
  for (const agentFile of walk(agentsDir).filter((f) => f.endsWith('.md'))) {
    const { data, content } = matter(fs.readFileSync(agentFile, 'utf8'));
    const agentName = data.name ?? path.basename(agentFile, '.md');
    if (!data.description) errors.push(`agent ${name}/${agentName}: missing description in frontmatter`);
    artifacts.push({
      id: `agent:${name}/${agentName}`,
      type: 'agent',
      name: agentName,
      displayName: agentName,
      description: data.description ?? '',
      ...childBase,
      invocation: null,
      path: relPath(agentFile),
      lastModified: gitDate(relPath(agentFile)),
      body: stripMarkdown(content),
    });
    counts.agents++;
  }

  const commandsDir = path.join(pluginDir, 'commands');
  for (const cmdFile of walk(commandsDir).filter((f) => f.endsWith('.md'))) {
    const { data, content } = matter(fs.readFileSync(cmdFile, 'utf8'));
    const cmdName = data.name ?? path.basename(cmdFile, '.md');
    if (!data.description) errors.push(`command ${name}/${cmdName}: missing description in frontmatter`);
    artifacts.push({
      id: `command:${name}/${cmdName}`,
      type: 'command',
      name: cmdName,
      displayName: cmdName,
      description: data.description ?? '',
      ...childBase,
      invocation: `/${name}:${cmdName}`,
      path: relPath(cmdFile),
      lastModified: gitDate(relPath(cmdFile)),
      body: stripMarkdown(content),
    });
    counts.commands++;
  }

  for (const server of security.mcpServers) {
    artifacts.push({
      id: `mcp-server:${name}/${server}`,
      type: 'mcp-server',
      name: server,
      displayName: server,
      description: `MCP server bundled with the ${name} plugin`,
      ...childBase,
      invocation: null,
      path: relPath(mcpFile),
      lastModified: gitDate(relPath(mcpFile)),
      body: '',
    });
    counts.mcpServers++;
  }
}

const seen = new Set();
for (const a of artifacts) {
  if (seen.has(a.id)) errors.push(`duplicate artifact id: ${a.id}`);
  seen.add(a.id);
}

if (errors.length) {
  console.error('Catalog quality errors:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const index = {
  schemaVersion: SCHEMA_VERSION,
  generatedAt: today,
  marketplace: {
    name: marketplace.name,
    repo: REPO,
    description: marketplace.description ?? '',
    counts,
  },
  artifacts,
};

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(index, null, 2) + '\n');
console.log(`Indexed ${artifacts.length} artifacts from ${counts.plugins} plugin(s) -> ${relPath(outFile) || outFile}`);
