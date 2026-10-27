// SPDX-License-Identifier: MIT OR Apache-2.0
// Compare the pure Rust CLI's tagged-wire IPC capture with frozen TypeScript.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {encodeRequestWire, fromWire} from '../../../bindings/core/node/src/wire.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const cli = process.argv[2];
if (!cli) throw new Error('usage: node replay-arrow-ipc-cli.mjs ABSOLUTE_CLI_PATH');
const onlyLimit = process.argv.includes('--only-limit');
const skipLimit = process.argv.includes('--skip-limit');
const packet = JSON.parse(gunzipSync(await readFile(resolve(repo,
  'docs/helix/04-build/evidence/rust-migration/r5-arrow-ipc-capture-predecessor-20261027/typescript-arrow-ipc-capture.json.gz'))));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const message = units => String.fromCharCode(...units);
function call(op, fields) {
  const wire = encodeRequestWire({op: `arrow.ipc.${op}`, ...fields});
  const result = spawnSync(cli, ['arrow', 'ipc', '--stdin-wire'], {input: wire, encoding: 'utf8',
    maxBuffer: 12 * 1024 * 1024, env: {...process.env, PATH: ''}});
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.profile, 'umf.core-wire/1');
  if (envelope.status === 'error') return {kind: 'throw', code: envelope.code,
    message: message(envelope.messageUnits), path: message(envelope.pathUnits)};
  assert.equal(envelope.status, 'ok');
  return {kind: 'return', value: fromWire(JSON.parse(envelope.wire))};
}
let operations = 0;
for (const item of packet.cases.filter(item => onlyLimit ? item.name === 'at-limit' : !(skipLimit && item.name === 'at-limit'))) {
  const bytes = item.file
    ? await readFile(resolve(repo, 'fixtures/arrow/ipc-inputs', item.file))
    : item.name === 'empty' ? Buffer.alloc(0)
    : item.name === 'invalid' ? Buffer.from([0, 255, 0])
    : item.name === 'truncated' ? (await readFile(resolve(repo, 'fixtures/arrow/ipc-inputs/int64.stream.arrow'))).subarray(0, 20)
    : item.name === 'trailing' ? Buffer.concat([await readFile(resolve(repo, 'fixtures/arrow/ipc-inputs/int64.stream.arrow')), Buffer.from([0, 255, 7])])
    : Buffer.alloc(1_000_000);
  assert.deepEqual({byteLength: bytes.length, sha256: sha(bytes)}, item.input, item.name);
  const captured = call('capture', {bytes: bytes.toString('hex'), id: item.file ?? item.name}); operations++;
  assert.equal(captured.kind, 'return', `${item.name}: ${JSON.stringify(captured)}`);
  const json = JSON.stringify(captured.value);
  assert.deepEqual({jsonSha256: sha(Buffer.from(json)), jsonByteLength: Buffer.byteLength(json)}, item.document, item.name);
  const inspected = call('inspect', {document: captured.value}); operations++;
  assert.deepEqual(JSON.parse(JSON.stringify(inspected)), {kind: 'return', value: item.inspect}, `${item.name} inspect`);
  const exported = call('export', {document: captured.value}); operations++;
  assert.equal(exported.kind, 'return', `${item.name}: ${JSON.stringify(exported)}`);
  const output = Buffer.from(exported.value, 'hex');
  assert.deepEqual({byteLength: output.length, sha256: sha(output)}, item.export, item.name);
  assert.deepEqual(output, bytes, item.name);
  process.stderr.write(`passed ${item.name}${item.format ? `-${item.format}` : ''}\n`);
}
for (const item of onlyLimit ? [] : packet.mutations) {
  const inspected = call('inspect', {document: item.document}); operations++;
  assert.deepEqual(JSON.parse(JSON.stringify(inspected)), item.inspect, `${item.name} inspect`);
  const exported = call('export', {document: item.document}); operations++;
  assert.equal(exported.kind, 'throw', item.name);
  assert.equal(exported.code, item.exported.error.code, item.name);
  assert.equal(exported.message, item.exported.error.message, item.name);
}
if (!onlyLimit) {
  const oversized = call('capture', {bytes: '00'.repeat(1_000_001), id: 'oversize'}); operations++;
  assert.equal(oversized.kind, 'throw');
  assert.equal(oversized.code, packet.oversize.error.code);
  assert.equal(oversized.message, packet.oversize.error.message);
}
console.log(JSON.stringify({status: 'pass', cases: onlyLimit ? 1 : packet.cases.length - Number(skipLimit),
  mutations: onlyLimit ? 0 : packet.mutations.length, operations}));
