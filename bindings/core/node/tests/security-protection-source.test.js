import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {createSecurityProtectionSourceEngine, SECURITY_PROTECTION_SOURCE_PROFILE} from '../index.js';

const packet = JSON.parse(readFileSync(new URL('../../../../docs/helix/04-build/evidence/rust-migration/r8-security-protection-resolution/predecessor.json', import.meta.url), 'utf8'));
const engine = createSecurityProtectionSourceEngine();
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const summarize = (actual, sources) => ({
  status: actual.status,
  complete: actual.complete,
  authority: actual.authority,
  references: actual.references,
  diagnostics: actual.diagnostics,
  retainsPolicy: canonical(actual.policy) === canonical(sources.policy),
  retainsCatalog: canonical(actual.catalog) === canonical(sources.catalog),
});
const sourceCases = packet.cases.filter(row => row.stage === 'source' && row.sources);

test('Node opt-in protection source engine replays the ten frozen source cases', () => {
  assert.equal(SECURITY_PROTECTION_SOURCE_PROFILE, 'umf.security-protection-source/1');
  assert.equal(sourceCases.length, 10);
  for (const row of sourceCases) {
    const actual = engine.resolveSecurityProtectionSources(row.sources.policy, row.sources.catalog);
    assert.equal(actual.complete, false, row.id);
    assert.equal(actual.authority, false, row.id);
    assert.equal(canonical(summarize(actual, row.sources)), canonical(row.outcome.value), row.id);
  }
});

test('Node source engine refuses accessors without invoking getters and fails closed on ABI errors', async () => {
  let getterCalls = 0;
  const policy = Object.defineProperty({}, 'rules', {enumerable: true, get() { getterCalls++; return []; }});
  assert.throws(() => engine.resolveSecurityProtectionSources(policy, {}), error => error.code === 'ACCESSOR_PROPERTY');
  assert.equal(getterCalls, 0);

  const {createRequire} = await import('node:module');
  const addon = createRequire(import.meta.url)('../umf_core_node.node');
  const {encodeWire} = await import('../src/wire.js');
  const wrongProfile = JSON.parse(addon.executeSecurityProtectionSourceWire(encodeWire({
    profile: 'wrong', op: 'resolveSecurityProtectionSources', policy: null, catalog: null,
  })));
  assert.equal(wrongProfile.status, 'error');
  assert.equal(wrongProfile.code, 'REQUEST');
  assert.equal(String.fromCharCode(...wrongProfile.messageUnits), 'Security protection source profile is required');
  const unknownMember = JSON.parse(addon.executeSecurityProtectionSourceWire(encodeWire({
    profile: SECURITY_PROTECTION_SOURCE_PROFILE, op: 'resolveSecurityProtectionSources', policy: null, catalog: null, future: true,
  })));
  assert.equal(unknownMember.status, 'error');
  assert.equal(unknownMember.code, 'REQUEST');
  assert.equal(String.fromCharCode(...unknownMember.messageUnits), 'Closed security protection source request required');
});
