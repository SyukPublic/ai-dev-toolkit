#!/usr/bin/env node
/**
 * Prepares a plugin release: bumps the SemVer version in the plugin's
 * plugin.json and scaffolds a CHANGELOG.md entry. Include both in your PR —
 * merging to main is the release (see docs/RELEASES.md).
 *
 * Usage: node scripts/prepare-release.mjs <plugin> <major|minor|patch> [--root <repoRoot>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  argValue,
  bumpVersion,
  changelogPath,
  manifestPath,
  prependChangelogEntry,
  readJson,
  resolveRepoRoot,
  writeJson,
} from './lib/release-utils.mjs';

const args = process.argv.slice(2);
const rootValue = argValue(args, '--root');
const positional = args.filter((a) => !a.startsWith('--') && a !== rootValue);
const [plugin, kind] = positional;

if (!plugin || !['major', 'minor', 'patch'].includes(kind)) {
  console.error('Usage: node scripts/prepare-release.mjs <plugin> <major|minor|patch> [--root <repoRoot>]');
  process.exit(1);
}

const repoRoot = resolveRepoRoot(args, path.dirname(fileURLToPath(import.meta.url)));
const manifestFile = manifestPath(repoRoot, plugin);
if (!fs.existsSync(manifestFile)) {
  console.error(`No such plugin: "${plugin}" (${manifestFile} not found)`);
  process.exit(1);
}

const manifest = readJson(manifestFile);
const current = manifest.version ?? '0.0.0';
let next;
try {
  next = bumpVersion(current, kind);
} catch (e) {
  console.error(`plugin ${plugin}: ${e.message}`);
  process.exit(1);
}

manifest.version = next;
writeJson(manifestFile, manifest);

const added = prependChangelogEntry(changelogPath(repoRoot, plugin), next, [
  'TODO: describe the changes in this release.',
]);

console.log(`${plugin}: ${manifest.version === next ? `${current} -> ${next}` : next}`);
console.log(`  - version updated in ${path.relative(repoRoot, manifestFile)}`);
console.log(
  added
    ? '  - changelog entry scaffolded - replace the TODO line'
    : `  - changelog already has a ${next} section, left as is`,
);
console.log('\nNext steps: fill in the changelog, run `claude plugin validate .`, open a PR.');
console.log('The release tag is created automatically after the PR merges to main.');
