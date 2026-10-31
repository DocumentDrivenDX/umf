import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {createSecurityProtectionParametersEngine, SECURITY_PROTECTION_PARAMETERS_PROFILE} from '../index.js';

const packet = JSON.parse(readFileSync(new URL('../../../../../../../../tests/rust-core/fixtures/r8-security-protection-parameters/predecessor.json', import.meta.url), 'utf8'));
const engine = createSecurityProtectionParametersEngine();
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const exclusions = new Set([
  'parameters.noncanonical-integer-token', // Nested oneOf diagnostic-array difference in the Rust schema engine.
  'parameters.pre-spent-budget-first-literal-fault', // Internal TypeScript helper budget is outside tagged JSON.
  'parameters.policy-accessor-not-invoked', // Raw accessor is covered by the host admission control below.
]);
const rows = packet.cases.filter(row => row.sources && !exclusions.has(row.id));

test('Node opt-in protection parameter engine replays the eight representable frozen cases', () => {
  assert.equal(SECURITY_PROTECTION_PARAMETERS_PROFILE, 'umf.security-parameters/1');
  assert.equal(rows.length, 8);
  for (const row of rows) {
    const actual = engine.validateProtectionParameters(row.sources.policy, row.sources.catalog, row.sources.closure);
    assert.equal(actual.complete, false, row.id);
    assert.equal(actual.authority, false, row.id);
    assert.equal(canonical(actual), canonical(row.outcome.value), row.id);
  }
});

test('Node parameter engine refuses accessors without invocation and rejects bad profile/request shape', async () => {
  let getterCalls = 0;
  const policy = Object.defineProperty({}, 'rules', {enumerable: true, get() { getterCalls++; return []; }});
  assert.throws(() => engine.validateProtectionParameters(policy, {}, {}), error => error.code === 'ACCESSOR_PROPERTY');
  assert.equal(getterCalls, 0);

  const {createRequire} = await import('node:module');
  const addon = createRequire(import.meta.url)('../umf_core_node.node');
  const {encodeWire} = await import('../src/wire.js');
  const wrongProfile = JSON.parse(addon.executeSecurityProtectionParametersWire(encodeWire({
    profile: 'wrong', op: 'validateProtectionParameters', policy: null, catalog: null, closure: null,
  })));
  assert.equal(wrongProfile.status, 'error');
  assert.equal(wrongProfile.code, 'REQUEST');
  const unknownMember = JSON.parse(addon.executeSecurityProtectionParametersWire(encodeWire({
    profile: SECURITY_PROTECTION_PARAMETERS_PROFILE, op: 'validateProtectionParameters',
    policy: null, catalog: null, closure: null, future: true,
  })));
  assert.equal(unknownMember.status, 'error');
  assert.equal(unknownMember.code, 'REQUEST');
});
