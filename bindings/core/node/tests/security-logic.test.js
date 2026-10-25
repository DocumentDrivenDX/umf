import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {createSecurityLogicEngine, SECURITY_LOGIC_PROFILE} from '../index.js';

const engine = createSecurityLogicEngine();
const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const hash = path => createHash('sha256').update(read(path)).digest('hex');
const plain = value => JSON.parse(JSON.stringify(value));

test('public Node factory replays frozen truth tables and refusal vectors', () => {
  assert.equal(SECURITY_LOGIC_PROFILE, 'umf.security-logic/1.0.0');
  const packetPath = 'docs/helix/04-build/evidence/rust-migration/r8-security-truth-logic/frozen-typescript.json';
  const packet = JSON.parse(read(packetPath));
  for (const [path, expected] of [[packet.predecessor.source, packet.predecessor.sourceSha256],
    [packet.predecessor.testSource, packet.predecessor.testSourceSha256],
    [packet.predecessor.contract, packet.predecessor.contractSha256]]) assert.equal(hash(path), expected, `source changed: ${path}`);
  assert.deepEqual(packet.truths.map(value => engine.securityNot(value)), packet.not);
  assert.deepEqual(packet.truths.map(a => packet.truths.map(b => engine.securityAnd([a,b]))), packet.and);
  assert.deepEqual(packet.truths.map(a => packet.truths.map(b => engine.securityOr([a,b]))), packet.or);
  for (const row of packet.refusals) {
    const values = row.values ?? Array(row.operandCount).fill('T');
    assert.throws(() => (row.operation === 'securityAnd' ? engine.securityAnd : engine.securityOr)(values), error =>
      error.code === row.code && error.message === row.message && error.path === row.path, row.name);
  }
  for (const row of packet.notRefusals) assert.throws(() => engine.securityNot(row.value), error =>
    error.code === row.code && error.message === row.message && error.path === row.path, row.name);
});

test('public Node factory replays frozen composition outcomes and refusals', () => {
  const packetPath = 'docs/helix/04-build/evidence/rust-migration/r8-security-truth-logic/compose-cases.json';
  const packet = JSON.parse(read(packetPath));
  for (const [path, expected] of [[packet.predecessor.source, packet.predecessor.sourceSha256],
    [packet.predecessor.testSource, packet.predecessor.testSourceSha256],
    [packet.predecessor.contract, packet.predecessor.contractSha256]]) assert.equal(hash(path), expected, `source changed: ${path}`);
  for (const row of packet.cases) {
    const rules = row.input.manyRules
      ? [...row.input.rules, ...Array(row.input.manyRules - row.input.rules.length).fill({effect:'permit',truth:'T'})]
      : row.input.rules;
    if (row.error) {
      assert.throws(() => engine.composeSecurityRules(rules, row.input.protectedFields), error =>
        error.code === row.error.code && error.message === row.error.message && error.path === row.error.path, row.name);
    } else {
      assert.deepEqual(plain(engine.composeSecurityRules(rules, row.input.protectedFields)), row.oracle, row.name);
    }
  }
});

test('host preflight rejects accessors without invoking them and does not hide proxy traps', () => {
  let getterCalled = false;
  const rule = {effect:'permit', get truth() { getterCalled = true; return 'T'; }};
  assert.throws(() => engine.composeSecurityRules([rule]), error => error.code === 'ACCESSOR_PROPERTY');
  assert.equal(getterCalled, false);

  let trapCalled = false;
  const proxy = new Proxy([], {ownKeys() { trapCalled = true; throw new Error('proxy trap'); }});
  assert.throws(() => engine.securityAnd(proxy), /proxy trap/);
  assert.equal(trapCalled, true);
});

test('host work limits, cancellation, and unknown rule members fail closed', () => {
  assert.throws(() => createSecurityLogicEngine({controls:{maxWork:0}}).securityAnd(['T']), error => error.code === 'RESOURCE_LIMIT');
  assert.throws(() => createSecurityLogicEngine({controls:{isCancelled:()=>true}}).securityAnd(['T']), error => error.code === 'CANCELLED');
  let measured = 0;
  assert.equal(createSecurityLogicEngine({controls:{meter:amount => { measured += amount; }}}).securityNot('T'), 'F');
  assert.ok(measured > 0);
  assert.throws(() => engine.composeSecurityRules([{effect:'permit',truth:'T',future:true}]), error => error.code === 'SECURITY_UNKNOWN');
  assert.throws(() => createSecurityLogicEngine({future:true}), /Unknown security logic option/);
});
