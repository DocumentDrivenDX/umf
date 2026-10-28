import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyInputs} from './build-access-rrf-receipts.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const evidence = new URL('../../../docs/helix/04-build/evidence/rust-migration/', import.meta.url);
const packetFile = new URL('r8-postgres-search-rrf-20261027/predecessor.json', evidence);
const requiredSources = [
  'scripts/rust-migration/r8/build-access-rrf-receipts.mjs',
  'scripts/rust-migration/r8/replay-access-rrf-cli.mjs',
  'scripts/rust-migration/r8/postgres-search-rrf-predecessor.py',
  'bindings/core/node/index.js', 'bindings/core/node/src/access-rrf.js',
  'bindings/core/node/tests/access-rrf-predecessor-replay.mjs', 'bindings/core/node/tests/access-rrf-replay.js',
  'bindings/core/wasm/index.js', 'bindings/core/wasm/src/access-rrf.js',
  'bindings/core/wasm/tests/access-rrf-current-source.chromium.mjs',
];
const artifactNames = ['nodeAddon', 'wasm', 'wasmGlue', 'referenceBundle', 'nodeBundle', 'browserBundle'];

async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), 'umf-rrf-builder-'));
  t.after(() => rm(base, {recursive: true, force: true}));
  const repo = join(base, 'repo'), dist = join(base, 'dist');
  await mkdir(repo, {recursive: true}); await mkdir(dist, {recursive: true});
  const files = {};
  for (const path of requiredSources) {
    const full = join(repo, path); await mkdir(join(full, '..'), {recursive: true});
    await writeFile(full, `fixture:${path}`); files[path] = sha(await readFile(full));
  }
  const artifacts = {};
  for (const name of artifactNames) {
    const path = `${name}.bin`; await writeFile(join(dist, path), `artifact:${name}`);
    artifacts[name] = {path, sha256: sha(await readFile(join(dist, path)))};
  }
  const ordered = Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([path, hash]) => `${path}\0${hash}\0`).join('');
  const manifestPath = join(base, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify({format: 'umf.r8.compact-dataset-verify-build/1', sourceClosure: {sha256: sha(Buffer.from(ordered)), files}, artifacts}));
  const predecessor = join(base, 'predecessor.json');
  await writeFile(predecessor, await readFile(packetFile));
  const raw = {};
  raw.node = join(base, 'node.json'); raw.bun = join(base, 'bun.json'); raw.chromium = join(base, 'chromium.json');
  for (const [host, path] of Object.entries(raw)) {
    const receipt = {host, format: host === 'chromium' ? 'umf-r8-access-rrf-chromium-current-source/1' : 'umf-r8-access-rrf-node-current-source/1', profile: 'umf-r8-access-rrf/0.1.0', cases: 5, mismatches: [], packetSha256: sha(await readFile(predecessor))};
    if (host === 'node') receipt.runtime = 'Node v26.12.1';
    if (host === 'bun') receipt.runtime = 'Bun 1.4.3';
    if (host !== 'chromium') receipt.nodeAddonSha256 = artifacts.nodeAddon.sha256;
    if (host === 'chromium') Object.assign(receipt, {browser: '153.0.8010.12', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36', wasmGlueSha256: artifacts.wasmGlue.sha256, wasmBinarySha256: artifacts.wasm.sha256});
    await writeFile(path, JSON.stringify(receipt));
  }
  return {repo, dist, manifestPath, predecessor, raw};
}

test('accepts pinned host identities and a closed source/artifact/packet cohort', async t => {
  const input = await fixture(t);
  const result = await verifyInputs(input);
  assert.deepEqual(result.hosts, ['node', 'bun', 'chromium']);
  assert.equal(result.receipts.node.host, 'node');
});

test('rejects swapped Node and Bun raw receipts', async t => {
  const input = await fixture(t);
  const node = await readFile(input.raw.node); const bun = await readFile(input.raw.bun);
  await writeFile(input.raw.node, bun); await writeFile(input.raw.bun, node);
  await assert.rejects(verifyInputs(input), /node raw receipt reports host bun/);
});

test('rejects stale source closure bytes', async t => {
  const input = await fixture(t);
  await writeFile(join(input.repo, requiredSources[0]), 'changed after manifest');
  await assert.rejects(verifyInputs(input), /STALE_SOURCE/);
});

test('rejects stale artifact bytes', async t => {
  const input = await fixture(t);
  await writeFile(join(input.dist, 'wasm.bin'), 'changed after manifest');
  await assert.rejects(verifyInputs(input), /STALE_ARTIFACT wasm/);
});

test('rejects changed predecessor packet bytes', async t => {
  const input = await fixture(t);
  await writeFile(input.predecessor, `${await readFile(input.predecessor, 'utf8')} `);
  await assert.rejects(verifyInputs(input), /STALE_PACKET/);
});

test('rejects runtime and browser version substitutions', async t => {
  const input = await fixture(t);
  const node = JSON.parse(await readFile(input.raw.node, 'utf8')); node.runtime = 'Bun 1.4.3';
  await writeFile(input.raw.node, JSON.stringify(node));
  await assert.rejects(verifyInputs(input), /node runtime pin mismatch/);
  const original = await fixture(t);
  const chromium = JSON.parse(await readFile(original.raw.chromium, 'utf8')); chromium.browser = 'other';
  await writeFile(original.raw.chromium, JSON.stringify(chromium));
  await assert.rejects(verifyInputs(original), /Chromium browser\/version pin mismatch/);
});
