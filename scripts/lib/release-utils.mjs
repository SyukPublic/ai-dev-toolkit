import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v ?? '');
  return m ? { major: +m[1], minor: +m[2], patch: +m[3] } : null;
}

export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  return pa.major - pb.major || pa.minor - pb.minor || pa.patch - pb.patch;
}

export function bumpVersion(version, kind) {
  const v = parseVersion(version);
  if (!v) throw new Error(`"${version}" is not a valid SemVer version (expected X.Y.Z)`);
  if (kind === 'major') return `${v.major + 1}.0.0`;
  if (kind === 'minor') return `${v.major}.${v.minor + 1}.0`;
  if (kind === 'patch') return `${v.major}.${v.minor}.${v.patch + 1}`;
  throw new Error(`unknown bump kind "${kind}" (use major|minor|patch)`);
}

export function argValue(args, flag, fallback = undefined) {
  const i = args.indexOf(flag);
  return i === -1 ? fallback : args[i + 1];
}

export function resolveRepoRoot(args, scriptDir) {
  const root = argValue(args, '--root');
  return root ? path.resolve(root) : path.resolve(scriptDir, '..');
}

export function git(repoRoot, ...gitArgs) {
  return execFileSync('git', gitArgs, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

export const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/**
 * Rewrites ONLY the `version` value in a manifest and leaves every other byte alone.
 *
 * Deliberately not `writeFileSync(file, JSON.stringify(manifest, null, 2))`: re-serialising
 * the parsed object reformats the whole file, expanding this repo's compact
 * `"author": { "name": ... }`, single-line `keywords` and single-line `dependencies` entries.
 * The result is a one-line version change buried in style churn, hand-reverted for 1.0.1,
 * 1.0.2 and 1.0.3 before this helper existed (sdd-engineering 1.1.0 was missed and shipped
 * expanded).
 *
 * The match is anchored to a two-space indent so it can only hit the top-level field —
 * every `dependencies` entry carries a nested `version` key. Both the match count and a
 * re-parse of the result are asserted, so a manifest formatted some other way fails loudly
 * instead of being patched in the wrong place.
 */
export function setManifestVersion(file, version) {
  const content = fs.readFileSync(file, 'utf8');
  const versionRe = /^ {2}("version"\s*:\s*)"[^"]*"/gm;
  const hits = content.match(versionRe) ?? [];
  if (hits.length !== 1) {
    throw new Error(
      `expected exactly one top-level "version" field in ${file}, found ${hits.length}`,
    );
  }
  const next = content.replace(versionRe, (_match, key) => `  ${key}${JSON.stringify(version)}`);
  if (JSON.parse(next).version !== version) {
    throw new Error(`patching "version" in ${file} did not set the top-level field`);
  }
  fs.writeFileSync(file, next);
}

/**
 * Release tag naming. The `--v` separator is not cosmetic: Claude Code lists
 * repository tags starting with `<plugin-name>--v` when it resolves a semver
 * range from another plugin's `dependencies`. A single-hyphen tag is invisible
 * to that lookup and the dependent plugin is disabled with `no-matching-tag`.
 * `claude plugin tag` produces the same name from the manifest.
 */
export const releaseTagPrefix = (plugin) => `${plugin}--v`;
export const releaseTag = (plugin, version) => `${releaseTagPrefix(plugin)}${version}`;

export const manifestPath = (repoRoot, plugin) =>
  path.join(repoRoot, 'plugins', plugin, '.claude-plugin', 'plugin.json');
export const changelogPath = (repoRoot, plugin) => path.join(repoRoot, 'plugins', plugin, 'CHANGELOG.md');

/** Prepends a `## <version> - <date>` section; returns false if one already exists. */
export function prependChangelogEntry(file, version, items) {
  const entry = `## ${version} - ${todayISO()}\n\n${items.map((i) => `- ${i}`).join('\n')}\n`;
  let content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '# Changelog\n\n';
  const versionRe = new RegExp(`^## ${version.replace(/\./g, '\\.')}(\\s|$)`, 'm');
  if (versionRe.test(content)) return false;
  const idx = content.search(/^## /m);
  const next =
    idx === -1
      ? content.trimEnd() + '\n\n' + entry
      : content.slice(0, idx) + entry + '\n' + content.slice(idx);
  fs.writeFileSync(file, next.trimEnd() + '\n');
  return true;
}

/** Returns the body of the `## <version>` changelog section, or null. */
export function extractChangelogSection(content, version) {
  const re = new RegExp(`^## ${version.replace(/\./g, '\\.')}[^\\n]*$`, 'm');
  const m = re.exec(content);
  if (!m) return null;
  const rest = content.slice(m.index + m[0].length);
  const next = rest.search(/^## /m);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}
