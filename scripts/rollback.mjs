#!/usr/bin/env node
/**
 * Roll-forward rollback (see docs/RELEASES.md): restores the plugin directory
 * from a previous release tag, bumps the PATCH version past the bad release,
 * and prepends a changelog entry. Never deletes or reuses published versions.
 *
 * The changes are left staged in the working tree — review the diff and open
 * a PR; the new tag is created automatically after merge to main.
 *
 * Usage: node scripts/rollback.mjs <plugin> [--to <version>] [--root <repoRoot>]
 *   --to  target version to restore (default: latest release tag below the
 *         current manifest version)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  argValue,
  bumpVersion,
  changelogPath,
  compareVersions,
  git,
  manifestPath,
  parseVersion,
  prependChangelogEntry,
  readJson,
  releaseTagPrefix,
  resolveRepoRoot,
  setManifestVersion,
} from './lib/release-utils.mjs';

const args = process.argv.slice(2);
const rootValue = argValue(args, '--root');
const toValue = argValue(args, '--to');
const positional = args.filter((a) => !a.startsWith('--') && a !== rootValue && a !== toValue);
const [plugin] = positional;

if (!plugin) {
  console.error('Usage: node scripts/rollback.mjs <plugin> [--to <version>] [--root <repoRoot>]');
  process.exit(1);
}

const repoRoot = resolveRepoRoot(args, path.dirname(fileURLToPath(import.meta.url)));
const manifestFile = manifestPath(repoRoot, plugin);
if (!fs.existsSync(manifestFile)) {
  console.error(`No such plugin: "${plugin}" (${manifestFile} not found)`);
  process.exit(1);
}

const dirty = git(repoRoot, 'status', '--porcelain', '--', `plugins/${plugin}`);
if (dirty) {
  console.error(`plugins/${plugin} has uncommitted changes - commit or stash them first:\n${dirty}`);
  process.exit(1);
}

const current = readJson(manifestFile).version;
if (!parseVersion(current)) {
  console.error(`plugin ${plugin}: current version "${current}" is not valid SemVer`);
  process.exit(1);
}

const tagPrefix = releaseTagPrefix(plugin);
const versions = git(repoRoot, 'tag', '-l', `${tagPrefix}*`)
  .split('\n')
  .map((t) => t.slice(tagPrefix.length))
  .filter((v) => parseVersion(v))
  .sort(compareVersions);

let target;
if (toValue) {
  target = toValue.replace(/^v/, '');
  if (!versions.includes(target)) {
    console.error(
      `No release tag ${tagPrefix}${target}. Available: ${versions.map((v) => tagPrefix + v).join(', ') || 'none'}`,
    );
    process.exit(1);
  }
} else {
  const earlier = versions.filter((v) => compareVersions(v, current) < 0);
  if (!earlier.length) {
    console.error(
      `No release tag earlier than v${current} for ${plugin}. Available: ${versions.map((v) => tagPrefix + v).join(', ') || 'none'}`,
    );
    process.exit(1);
  }
  target = earlier[earlier.length - 1];
}

git(repoRoot, 'checkout', `${tagPrefix}${target}`, '--', `plugins/${plugin}`);

const next = bumpVersion(current, 'patch');
setManifestVersion(manifestFile, next);

prependChangelogEntry(changelogPath(repoRoot, plugin), next, [
  `Rolls the plugin back to the content of ${target} (reverts ${current}).`,
]);

console.log(`${plugin}: restored content of v${target}, rolling forward as v${next} (bad release: v${current})`);
console.log('\nNext steps: review `git status` and `git diff HEAD -- plugins/' + plugin + '`, then open a PR.');
console.log('For a security-driven rollback, also follow docs/SECURITY.md incident response.');
