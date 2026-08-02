#!/usr/bin/env node
/** Indexer tests: run build-index.mjs against fixtures and assert the output. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(scriptDir, '..');
const outDir = path.join(siteDir, '.test-output');
fs.mkdirSync(outDir, { recursive: true });

function runIndexer(rootRel, outFile) {
  return spawnSync(process.execPath, [
    path.join(scriptDir, 'build-index.mjs'),
    '--root', path.join(siteDir, rootRel),
    '--out', outFile,
  ], { encoding: 'utf8' });
}

// 1. Good fixture: every artifact type is indexed correctly.
const goodOut = path.join(outDir, 'good.json');
const good = runIndexer('test-fixtures/repo-good', goodOut);
assert.equal(good.status, 0, `indexer failed on good fixture:\n${good.stdout}${good.stderr}`);
const index = JSON.parse(fs.readFileSync(goodOut, 'utf8'));

assert.equal(index.schemaVersion, 1);
assert.equal(index.marketplace.name, 'fixture-marketplace');
assert.deepEqual(index.marketplace.counts, { plugins: 1, skills: 1, agents: 1, commands: 1, mcpServers: 1 });
assert.equal(index.artifacts.length, 5);

const byId = new Map(index.artifacts.map((a) => [a.id, a]));
const plugin = byId.get('plugin:fixture-plugin');
assert.ok(plugin, 'plugin artifact missing');
assert.equal(plugin.displayName, 'Fixture Plugin');
assert.equal(plugin.version, '1.0.0');
assert.equal(plugin.installCommand, '/plugin install fixture-plugin@fixture-marketplace');
assert.deepEqual(plugin.security.hooks, ['PostToolUse']);
assert.deepEqual(plugin.security.mcpServers, ['sample-server']);
assert.equal(plugin.security.executables, false);
assert.ok(plugin.tokenEstimate > 0, 'tokenEstimate should be positive');
assert.ok(plugin.body.includes('component layout'), 'plugin body should come from README');
assert.ok(!plugin.body.includes('#'), 'body should be stripped of markdown');

const skill = byId.get('skill:fixture-plugin/sample-skill');
assert.ok(skill, 'skill artifact missing');
assert.equal(skill.invocation, '/fixture-plugin:sample-skill');
assert.equal(skill.plugin, 'fixture-plugin');
assert.equal(skill.category, 'development', 'children inherit plugin category');
assert.match(skill.description, /Reviews recent changes/);

const agent = byId.get('agent:fixture-plugin/sample-agent');
assert.ok(agent, 'agent artifact missing');
assert.match(agent.description, /read-only research agent/);

const command = byId.get('command:fixture-plugin/sample-command');
assert.ok(command, 'command artifact missing');
assert.equal(command.invocation, '/fixture-plugin:sample-command');

const mcp = byId.get('mcp-server:fixture-plugin/sample-server');
assert.ok(mcp, 'mcp-server artifact missing');

// 2. Bad fixture: missing description/version must fail the build.
const bad = runIndexer('test-fixtures/repo-bad', path.join(outDir, 'bad.json'));
assert.notEqual(bad.status, 0, 'indexer must fail on missing description/version');
assert.match(bad.stderr, /missing description/);
assert.match(bad.stderr, /missing version/);

// 3. Real repo: must always build (empty catalog is valid).
const realOut = path.join(outDir, 'real.json');
const real = runIndexer('..', realOut);
assert.equal(real.status, 0, `indexer failed on the real repo:\n${real.stdout}${real.stderr}`);
const realIndex = JSON.parse(fs.readFileSync(realOut, 'utf8'));
assert.equal(realIndex.marketplace.name, 'ai-dev-toolkit');

console.log('All indexer tests passed.');
