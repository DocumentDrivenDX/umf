import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {createSecurityFunctionsEngine, SECURITY_FUNCTIONS_PROFILE} from '../index.js';

const packet = JSON.parse(readFileSync(new URL('../../../../../../../../tests/rust-core/fixtures/r8-security-protection-functions/predecessor.json', import.meta.url), 'utf8'));
const engine = createSecurityFunctionsEngine();
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

test('Node opt-in security functions replay the 25 supported frozen predecessor cases', () => {
  assert.equal(SECURITY_FUNCTIONS_PROFILE, 'umf.security-functions/1');
  let count = 0;
  for (const row of packet.cases) {
    if (!row.sources || ['function.parameter-refusal-before-result', 'function.itemType-field-refused'].includes(row.id)) continue;
    const method = row.op === 'inspect' ? engine.inspectProtectionFunction : engine.evaluateProtectionValue;
    const actual = method(row.sources.policy, row.sources.catalog, row.sources.closure, row.sources.selection);
    assert.equal(actual.complete, false, row.id);
    assert.equal(actual.authority, false, row.id);
    assert.equal(canonical(actual), canonical(row.outcome.value), row.id);
    count++;
  }
  assert.equal(count, 25);
  for (const row of packet.cases.filter(row => ['function.parameter-refusal-before-result', 'function.itemType-field-refused'].includes(row.id))) {
    const actual = engine.inspectProtectionFunction(row.sources.policy, row.sources.catalog, row.sources.closure, row.sources.selection);
    assert.equal(actual.status, 'refused', row.id);
    assert.equal(actual.complete, false, row.id);
    assert.equal(actual.authority, false, row.id);
  }
});

test('host accessors are refused without invoking getters; malformed wire requests fail closed', async () => {
  let getterCalled = false;
  const policy = Object.defineProperty({}, 'rules', {enumerable:true, get() { getterCalled = true; return []; }});
  assert.throws(() => engine.inspectProtectionFunction(policy, {}, {}, {}), error => error.code === 'ACCESSOR_PROPERTY');
  assert.equal(getterCalled, false);
  let selectionGetterCalled = false;
  const selection = Object.defineProperty({}, 'ruleIndex', {enumerable:true, get() { selectionGetterCalled = true; return 0; }});
  assert.throws(() => engine.inspectProtectionFunction({}, {}, {}, selection), error => error.code === 'ACCESSOR_PROPERTY');
  assert.equal(selectionGetterCalled, false);

  const {createRequire} = await import('node:module');
  const addon = createRequire(import.meta.url)('../umf_core_node.node');
  const {encodeWire} = await import('../src/wire.js');
  const wrongProfile = JSON.parse(addon.executeSecurityFunctionsWire(encodeWire({profile:'wrong',op:'inspectProtectionFunction',policy:null,catalog:null,closure:null,selection:null})));
  assert.equal(wrongProfile.status, 'error');
  assert.equal(wrongProfile.code, 'REQUEST');
  assert.equal(String.fromCharCode(...wrongProfile.messageUnits), 'Security functions profile is required');
  const unknownMember = JSON.parse(addon.executeSecurityFunctionsWire(encodeWire({profile:SECURITY_FUNCTIONS_PROFILE,op:'inspectProtectionFunction',policy:null,catalog:null,closure:null,selection:null,future:true})));
  assert.equal(unknownMember.status, 'error');
  assert.equal(unknownMember.code, 'REQUEST');
  assert.equal(String.fromCharCode(...unknownMember.messageUnits), 'Closed security functions request required');
});
