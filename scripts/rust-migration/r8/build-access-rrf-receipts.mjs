#!/usr/bin/env node
// Bind raw host replays to a verified R8 source/build cohort and frozen packet.
import {createHash} from 'node:crypto';
import {readFile, mkdir, writeFile, stat} from 'node:fs/promises';
import {isAbsolute, join, resolve, sep} from 'node:path';
import {pathToFileURL} from 'node:url';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(`RECEIPT_REJECTED: ${message}`); };
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const safeRel = path => typeof path === 'string' && path.length > 0 && !isAbsolute(path) && !path.split(/[\\/]/).includes('..');
const closureSha = files => sha(Buffer.from(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([path, hash]) => `${path}\0${hash}\0`).join('')));
const artifacts = ['nodeAddon', 'wasm', 'wasmGlue', 'referenceBundle', 'nodeBundle', 'browserBundle'];
const hosts = ['node', 'bun', 'chromium'];
const expected = {
  node: {runtime: 'Node v26.12.1'},
  bun: {runtime: 'Bun 1.4.3'},
  chromium: {
    browser: '153.0.8010.12',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36',
  },
};
const packetPin = '3e4467f63ff324c35fe4b46824a75d830608a03bf3ee08f722e85ddc370243a1';
const requiredSources = [
  'scripts/rust-migration/r8/build-access-rrf-receipts.mjs',
  'scripts/rust-migration/r8/replay-access-rrf-cli.mjs',
  'scripts/rust-migration/r8/postgres-search-rrf-predecessor.py',
  'bindings/core/node/index.js', 'bindings/core/node/src/access-rrf.js',
  'bindings/core/node/tests/access-rrf-predecessor-replay.mjs', 'bindings/core/node/tests/access-rrf-replay.js',
  'bindings/core/wasm/index.js', 'bindings/core/wasm/src/access-rrf.js',
  'bindings/core/wasm/tests/access-rrf-current-source.chromium.mjs',
];

async function inside(base, relative) {
  if (!safeRel(relative)) fail(`unsafe relative path ${relative}`);
  const path = resolve(base, relative);
  if (!path.startsWith(resolve(base) + sep)) fail(`path escapes root: ${relative}`);
  return path;
}
async function digest(path) { return sha(await readFile(path)); }

export async function verifyInputs({repo, manifestPath, dist, predecessor, raw}) {
  repo = resolve(repo); dist = resolve(dist);
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  const manifestHash = sha(manifestBytes);
  if (manifest.format !== 'umf.r8.compact-dataset-verify-build/1') fail('wrong build manifest format');
  const files = manifest.sourceClosure?.files;
  if (!files || typeof files !== 'object' || Array.isArray(files) || closureSha(files) !== manifest.sourceClosure.sha256) fail('invalid source closure digest');
  for (const [path, hash] of Object.entries(files)) {
    if (!/^[a-f0-9]{64}$/.test(hash)) fail(`invalid source hash ${path}`);
    if (await digest(await inside(repo, path)) !== hash) fail(`STALE_SOURCE ${path}`);
  }
  for (const source of requiredSources) if (!files[source]) fail(`required replay source absent from manifest: ${source}`);
  if (Object.keys(manifest.artifacts ?? {}).sort().join() !== artifacts.slice().sort().join()) fail('artifact inventory mismatch');
  const artifactPins = {};
  for (const name of artifacts) {
    const artifact = manifest.artifacts[name];
    if (!artifact || !safeRel(artifact.path) || !/^[a-f0-9]{64}$/.test(artifact.sha256)) fail(`invalid artifact pin ${name}`);
    if (await digest(await inside(dist, artifact.path)) !== artifact.sha256) fail(`STALE_ARTIFACT ${name}`);
    artifactPins[name] = {path: artifact.path, sha256: artifact.sha256};
  }
  const packetBytes = await readFile(predecessor);
  const packetHash = sha(packetBytes);
  if (packetHash !== packetPin) fail('STALE_PACKET predecessor hash differs from frozen RRF packet');
  const packet = JSON.parse(packetBytes);
  if (packet.format !== 'umf.r8.postgres-search-rrf-python-predecessor/0.1' || packet.cases?.length !== 9) fail('unexpected predecessor packet');
  const expectedNames = packet.cases.filter(row => row.input?.fusion === 'rrf' && row.outcomeKind === 'result').map(row => row.name).concat(['non-involutive-key-order-permutation']);
  if (expectedNames.length !== 5) fail('predecessor does not yield the pinned five-case replay');

  const receipts = {};
  for (const host of hosts) {
    if (!raw[host]) fail(`missing ${host} raw receipt`);
    const receipt = await json(raw[host]);
    const format = host === 'chromium' ? 'umf-r8-access-rrf-chromium-current-source/1' : 'umf-r8-access-rrf-node-current-source/1';
    if (receipt.host !== host) fail(`${host} raw receipt reports host ${receipt.host}`);
    if (receipt.format !== format || receipt.profile !== 'umf-r8-access-rrf/0.1.0' || receipt.cases !== 5 || !Array.isArray(receipt.mismatches) || receipt.mismatches.length) fail(`${host} raw format/profile/case/mismatch gate`);
    if (host !== 'chromium' && receipt.runtime !== expected[host].runtime) fail(`${host} runtime pin mismatch: ${receipt.runtime}`);
    const binding = {manifest: resolve(manifestPath), sha256: manifestHash, sourceClosureSha256: manifest.sourceClosure.sha256, artifacts: artifactPins};
    const replaySources = Object.fromEntries(requiredSources.map(source => [source, files[source]]));
    const result = {format: receipt.format, profile: receipt.profile, cases: receipt.cases, mismatches: receipt.mismatches, status: 'pass', host, buildBinding: binding, predecessorPacketSha256: packetHash, replaySources};
    if (host === 'chromium') {
      if (receipt.browser !== expected.chromium.browser || receipt.userAgent !== expected.chromium.userAgent) fail('Chromium browser/version pin mismatch');
      if (receipt.packetSha256 !== packetHash || receipt.wasmGlueSha256 !== artifactPins.wasmGlue.sha256 || receipt.wasmBinarySha256 !== artifactPins.wasm.sha256) fail('Chromium packet/artifact evidence mismatch');
      Object.assign(result, {browser: receipt.browser, userAgent: receipt.userAgent, packetSha256: packetHash, wasmGlueSha256: artifactPins.wasmGlue.sha256, wasmBinarySha256: artifactPins.wasm.sha256});
    } else {
      if (receipt.packetSha256 !== packetHash) fail(`${host} packet hash mismatch`);
      if (receipt.nodeAddonSha256 !== artifactPins.nodeAddon.sha256) fail(`${host} Node addon artifact hash mismatch`);
    }
    receipts[host] = result;
  }
  return {manifestBytes, manifestHash, sourceClosureSha256: manifest.sourceClosure.sha256, packetBytes, packetHash, hosts, receipts};
}

export async function build({repo, manifestPath, dist, predecessor, raw, out}) {
  repo = resolve(repo); dist = resolve(dist); out = resolve(out);
  if (out === repo || out.startsWith(repo + sep) || out === dist || out.startsWith(dist + sep)) fail('output must be separate from source and dist');
  try { await stat(out); fail('output already exists; refusing to replace prior or historical evidence'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const verified = await verifyInputs({repo, manifestPath, dist, predecessor, raw});
  await mkdir(out, {recursive: true});
  await writeFile(join(out, 'build-manifest.json'), verified.manifestBytes);
  await writeFile(join(out, 'predecessor.json'), verified.packetBytes);
  for (const host of hosts) await writeFile(join(out, `${host}.json`), JSON.stringify(verified.receipts[host], null, 2) + '\n');
  const summary = {format: 'umf.r8.access-rrf-current-source-receipt/1', status: 'pass', manifestSha256: verified.manifestHash, sourceClosureSha256: verified.sourceClosureSha256, predecessorPacketSha256: verified.packetHash, hosts, scope: 'Current-source Node/Bun/Chromium replay only; no installed SDK, PostgreSQL execution, default routing, release qualification, or archive claim.'};
  await writeFile(join(out, 'receipt.json'), JSON.stringify(summary, null, 2) + '\n');
  const names = ['build-manifest.json', 'predecessor.json', ...hosts.map(host => `${host}.json`), 'receipt.json'];
  const sums = [];
  for (const name of names) sums.push(`${await digest(join(out, name))}  ${name}`);
  await writeFile(join(out, 'SHA256SUMS'), sums.join('\n') + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [repo, manifestPath, dist, predecessor, node, bun, chromium, out] = process.argv.slice(2);
  if (!out) fail('usage: node build-access-rrf-receipts.mjs REPO MANIFEST DIST PREDECESSOR NODE_RAW BUN_RAW CHROMIUM_RAW OUT');
  await build({repo, manifestPath, dist, predecessor, raw: {node, bun, chromium}, out});
}
