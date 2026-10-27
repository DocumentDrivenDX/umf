import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {createSecurityQueryPropertiesEngine, SECURITY_QUERY_PROPERTIES_PROFILE} from '../index.js';
import {createSecurityQueryPropertiesEngine as createWithWire} from '../src/security-query-properties.js';
import {encodeWire} from '../src/wire.js';

const packet = JSON.parse(readFileSync(new URL('../../../../docs/helix/04-build/evidence/rust-migration/r8-security-protection-query-properties/predecessor.json', import.meta.url), 'utf8'));
const exclusions = new Set(['query.range-identity-canonical-numeric', 'query.range-identity-distinct-field', 'query.range-unknown-field-refused']);
const operations = packet.cases.flatMap(row => row.operations.map(operation => ({id: row.id, ...operation})));
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const engine = createSecurityQueryPropertiesEngine();

test('Node opt-in query-properties engine replays exactly the 19 supported predecessor operations', () => {
  assert.equal(SECURITY_QUERY_PROPERTIES_PROFILE, 'umf.security-queries/1');
  assert.equal(operations.length, 22);
  let replayed = 0;
  for (const row of operations) {
    const {sources, input, outcome} = row;
    const actual = engine.inspectProtectionQueryProperties(sources.policy, sources.catalog, sources.closure, input);
    assert.equal(actual.complete, false, row.id);
    assert.equal(actual.authority, false, row.id);
    if (exclusions.has(row.id)) {
      assert.equal(actual.status, 'refused', row.id);
      assert.ok(actual.diagnostics.some(d => d.code === 'PROTECTION_QUERY_UNIMPLEMENTED'), row.id);
    } else {
      assert.equal(canonical(actual), canonical(outcome.value), row.id);
      replayed++;
    }
  }
  assert.equal(replayed, 19);
});

test('Node query-properties refuses accessors without invoking them and fails closed on ABI controls', async () => {
  const row = operations.find(item => item.id === 'query.valid-deterministic-join');
  let getterCalls = 0;
  const use = {...row.input};
  Object.defineProperty(use, 'future', {enumerable: true, get() { getterCalls++; return true; }});
  assert.throws(() => engine.inspectProtectionQueryProperties(row.sources.policy, row.sources.catalog, row.sources.closure, use), error => error.code === 'ACCESSOR_PROPERTY');
  assert.equal(getterCalls, 0);

  const {createRequire} = await import('node:module');
  const addon = createRequire(import.meta.url)('../umf_core_node.node');
  const {SECURITY_QUERY_PROPERTIES_PROFILE: profile} = await import('../src/security-query-properties.js');
  const wrongProfile = JSON.parse(addon.executeSecurityQueryPropertiesWire(encodeWire({profile: 'wrong', op: 'inspectProtectionQueryProperties', policy: null, catalog: null, closure: null, use: null})));
  assert.equal(wrongProfile.status, 'error');
  assert.equal(wrongProfile.code, 'REQUEST');
  const unknownMember = JSON.parse(addon.executeSecurityQueryPropertiesWire(encodeWire({profile, op: 'inspectProtectionQueryProperties', policy: null, catalog: null, closure: null, use: null, future: true})));
  assert.equal(unknownMember.status, 'error');
  assert.equal(unknownMember.code, 'REQUEST');
  assert.throws(() => createWithWire(null), /RUST_BINDING_MISSING/);
});
