// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay the pure RRF subset of the frozen Python _finish predecessor through the CLI.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {encodeRequestWire, fromWire} from '../../../bindings/core/node/src/wire.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const cli = process.argv[2];
if (!cli) throw new Error('usage: node replay-access-rrf-cli.mjs ABSOLUTE_CLI_PATH');
const packetPath = resolve(repo, 'docs/helix/04-build/evidence/rust-migration/r8-postgres-search-rrf-20261027/predecessor.json');
const packetBytes = await readFile(packetPath);
const packetText = packetBytes.toString('utf8');
const packet = JSON.parse(packetText);
const PROFILE = 'umf-r8-access-rrf/0.1.0';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const message = units => String.fromCharCode(...units);

let invocationCount = 0;
function invoke(request, args = [], {raw = false} = {}) {
  invocationCount++;
  const input = raw ? request : encodeRequestWire(request);
  const result = spawnSync(cli, ['access', 'rrf', '--stdin-wire', ...args], {
    input, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, env: {...process.env, PATH: ''},
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
function decoded(envelope) {
  assert.equal(envelope.profile, 'umf.core-wire/1');
  if (envelope.status === 'error') return {kind: 'error', code: envelope.code, message: message(envelope.messageUnits)};
  assert.equal(envelope.status, 'ok');
  return {kind: 'ok', value: fromWire(JSON.parse(envelope.wire))};
}
function makeRequest(item) {
  const identities = new Map();
  const keys = [];
  const legs = item.input.legs.map(leg => leg.map(hit => {
    const key = JSON.stringify(hit.keyComponents);
    if (!identities.has(key)) { identities.set(key, keys.length); keys.push(hit.keyComponents); }
    return identities.get(key);
  }));
  // Python tuple ordering for this predecessor's string-only ASCII keys.
  const sorted = keys.map((key, identity) => ({key, identity}))
    .sort((a, b) => {
      for (let i = 0; i < Math.min(a.key.length, b.key.length); i++) {
        if (a.key[i] < b.key[i]) return -1;
        if (a.key[i] > b.key[i]) return 1;
      }
      return a.key.length - b.key.length;
    });
  // keyOrder is the sequence of dense identities in Python key order.
  const keyOrder = sorted.map(entry => entry.identity);
  // JSON.parse rounds the frozen 10**400 number to Infinity; recover its exact
  // source decimal token so the request preserves Python's integer input.
  const caseText = packetText.slice(packetText.indexOf(`"name": "${item.name}"`));
  const constantText = caseText.match(/"constant": ([0-9]+)/)?.[1];
  assert.ok(constantText, `missing exact constant token for ${item.name}`);
  return {
    profile: PROFILE, op: 'access.rrf.score', constant: constantText,
    topK: item.input.topK, keyCount: keys.length, keyOrder, legs,
  };
}
function floatHex(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeDoubleBE(value);
  return `0x${bytes.toString('hex')}`;
}

const selected = new Map(packet.cases.map(item => [item.name, item]));
const names = [
  'rrf-overlap-rank-accumulation-and-topk',
  'rrf-complete-key-tie-order',
  'rrf-equal-key-items-use-python-equality',
  'rrf-empty-legs',
  'rrf-oversized-positive-constant-dsl-admits-python-overflows',
];
let operationCount = 0;
const outcomes = [];
for (const name of names) {
  const item = selected.get(name);
  assert.ok(item, `missing frozen predecessor case ${name}`);
  const result = decoded(invoke(makeRequest(item)));
  operationCount++;
  if (name === names.at(-1)) {
    assert.deepEqual(result, {kind: 'error', code: 'RRF_CONSTANT_OVERFLOW', message: 'int too large to convert to float'});
  } else {
    assert.equal(result.kind, 'ok', `${name}: ${JSON.stringify(result)}`);
    const observed = result.value.ordered.map(entry => ({identity: entry.identity, scoreHex: floatHex(entry.score)}));
    const identities = makeRequest(item);
    const labelToIdentity = new Map();
    item.input.legs.forEach((leg, li) => leg.forEach((hit, hi) => {
      labelToIdentity.set(hit.itemLabel, identities.legs[li][hi]);
    }));
    const expected = item.result.items.map(entry => ({identity: labelToIdentity.get(entry.item), scoreHex: floatHex(entry.score.value)}));
    assert.deepEqual(observed, expected, name);
    outcomes.push({name, identities: observed});
    continue;
  }
  outcomes.push({name, error: result});
}

const controlBase = makeRequest(selected.get(names[0]));
for (const [name, req, args, raw] of [
  ['malformed-wire', '{not-json', [], true],
  ['wrong-profile', {...controlBase, profile: 'wrong'}, [], false],
  ['wrong-operation', {...controlBase, op: 'access.rrf.other'}, [], false],
  ['resource-refusal', controlBase, ['--max-work', '0'], false],
  ['deadline-refusal', controlBase, ['--timeout-ms', '0'], false],
  ['identity-bound-refusal', {...controlBase, keyCount: 10_001, keyOrder: Array(10_001).fill(0)}, [], false],
]) {
  const response = decoded(invoke(req, args, {raw}));
  assert.equal(response.kind, 'error', `${name}: ${JSON.stringify(response)}`);
  if (name === 'resource-refusal') assert.equal(response.code, 'RESOURCE_LIMIT');
  if (name === 'deadline-refusal') assert.equal(response.code, 'DEADLINE_EXCEEDED');
  outcomes.push({name, error: response});
}

// A three-cycle catches confusion between keyOrder-as-sequence and its inverse;
// each identity receives one contribution at each rank, so only tie order decides.
const permutation = decoded(invoke({
  profile: PROFILE, op: 'access.rrf.score', constant: '1', topK: 3,
  keyCount: 3, keyOrder: [1, 2, 0], legs: [[0, 1, 2], [1, 2, 0], [2, 0, 1]],
}));
operationCount++;
assert.equal(permutation.kind, 'ok');
assert.deepEqual(permutation.value.ordered.map(entry => entry.identity), [1, 2, 0]);
outcomes.push({name: 'three-identity-noninvolutive-key-order-control', identities: permutation.value.ordered.map(entry => entry.identity)});

console.log(JSON.stringify({
  status: 'pass', predecessorSha256: sha(packetBytes), cases: names,
  scoringOperations: operationCount, totalInvocations: invocationCount,
  controls: outcomes.slice(names.length), outcomes,
}));
