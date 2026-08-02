import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Repo root — overridable for fixture-based builds in tests/verification.
// Resolved by locating the marketplace manifest instead of a fixed number of
// `..` hops: under `astro build` this module is bundled away from src/, so a
// path relative to import.meta.url no longer lands on the repo root (dev
// serves the real src file, which is why the bug only shows in built output).
function findRoot() {
  if (process.env.REPO_ROOT) return path.resolve(process.env.REPO_ROOT);
  const starts = [path.dirname(fileURLToPath(import.meta.url)), process.cwd()];
  for (const start of starts) {
    let dir = start;
    for (;;) {
      if (fs.existsSync(path.join(dir, '.claude-plugin', 'marketplace.json'))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
}

export const repoRoot = findRoot();

export function readRepoFile(rel) {
  const abs = path.join(repoRoot, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
}
