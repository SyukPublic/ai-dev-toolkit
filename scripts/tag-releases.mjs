#!/usr/bin/env node
/**
 * Tags plugin releases: for every plugin whose manifest version has no
 * <plugin>--vX.Y.Z tag yet, creates an annotated tag and (when pushing) a
 * GitHub Release with the matching changelog section as notes.
 *
 * The tag name is the convention Claude Code parses when resolving plugin
 * dependency version ranges (see releaseTag in lib/release-utils.mjs).
 *
 * Runs in CI on every push to main (.github/workflows/tag-releases.yml).
 * Local usage: node scripts/tag-releases.mjs [--dry-run] [--no-push] [--root <repoRoot>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  changelogPath,
  extractChangelogSection,
  git,
  parseVersion,
  readJson,
  releaseTag,
  resolveRepoRoot,
} from './lib/release-utils.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const push = !dryRun && !args.includes('--no-push');
const repoRoot = resolveRepoRoot(args, path.dirname(fileURLToPath(import.meta.url)));

const pluginsDir = path.join(repoRoot, 'plugins');
const pluginDirs = fs.existsSync(pluginsDir)
  ? fs
      .readdirSync(pluginsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((name) => fs.existsSync(path.join(pluginsDir, name, '.claude-plugin', 'plugin.json')))
  : [];

let created = 0;
for (const dir of pluginDirs) {
  const manifest = readJson(path.join(pluginsDir, dir, '.claude-plugin', 'plugin.json'));
  const name = manifest.name ?? dir;
  const version = manifest.version;
  if (!parseVersion(version)) {
    console.warn(`skip ${name}: version "${version}" is not valid SemVer`);
    continue;
  }
  const tag = releaseTag(name, version);
  if (git(repoRoot, 'tag', '-l', tag)) continue; // already released

  if (dryRun) {
    console.log(`would tag ${tag}`);
    created++;
    continue;
  }

  git(repoRoot, 'tag', '-a', tag, '-m', `${name} v${version}`);
  console.log(`tagged ${tag}`);
  created++;

  if (!push) continue;
  git(repoRoot, 'push', 'origin', tag);

  const clFile = changelogPath(repoRoot, dir);
  const notes =
    (fs.existsSync(clFile) && extractChangelogSection(fs.readFileSync(clFile, 'utf8'), version)) ||
    `Release ${version} of ${name}.`;
  try {
    execFileSync(
      'gh',
      ['release', 'create', tag, '--title', `${name} v${version}`, '--notes', notes, '--verify-tag'],
      { cwd: repoRoot, stdio: 'inherit' },
    );
  } catch {
    console.warn(`gh release create failed for ${tag} - the tag is pushed; create the GitHub Release manually if wanted`);
  }
}

console.log(
  created === 0
    ? 'All plugin versions are already tagged.'
    : `${dryRun ? 'Would create' : 'Created'} ${created} tag(s).`,
);
