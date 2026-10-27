import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSecurityProtectionSourceEngine, SECURITY_PROTECTION_SOURCE_PROFILE} from '../../../bindings/core/node/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const packetPath = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r8-security-protection-resolution/predecessor.json');
const packetBytes = await readFile(packetPath);
const packet = JSON.parse(packetBytes);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
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
const cases = packet.cases.filter(row => row.stage === 'source' && row.sources);
assert.equal(cases.length, 10);
assert.equal(SECURITY_PROTECTION_SOURCE_PROFILE, 'umf.security-protection-source/1');
const engine = createSecurityProtectionSourceEngine();
for (const row of cases) {
  const actual = engine.resolveSecurityProtectionSources(row.sources.policy, row.sources.catalog);
  assert.equal(actual.complete, false, row.id);
  assert.equal(actual.authority, false, row.id);
  assert.equal(canonical(summarize(actual, row.sources)), canonical(row.outcome.value), row.id);
}

const errorRecord = fn => {
  try { fn(); return {status: 'returned'}; }
  catch (error) { return {status: 'threw', name: error.name, code: error.code ?? null, path: error.path ?? null, message: error.message}; }
};
let policyGetterCalls = 0;
const hostilePolicy = Object.defineProperty({}, 'rules', {enumerable: true, get() { policyGetterCalls++; return []; }});
const accessor = errorRecord(() => engine.resolveSecurityProtectionSources(hostilePolicy, {}));
assert.equal(accessor.status, 'threw');
assert.equal(accessor.code, 'ACCESSOR_PROPERTY');
assert.equal(policyGetterCalls, 0);

const {createRequire} = await import('node:module');
const addon = createRequire(import.meta.url)(resolve(root, 'bindings/core/node/umf_core_node.node'));
const {encodeWire} = await import('../../../bindings/core/node/src/wire.js');
const wrongProfile = JSON.parse(addon.executeSecurityProtectionSourceWire(encodeWire({profile: 'wrong', op: 'resolveSecurityProtectionSources', policy: null, catalog: null})));
assert.equal(wrongProfile.status, 'error');
assert.equal(wrongProfile.code, 'REQUEST');
const unknownMember = JSON.parse(addon.executeSecurityProtectionSourceWire(encodeWire({profile: SECURITY_PROTECTION_SOURCE_PROFILE, op: 'resolveSecurityProtectionSources', policy: null, catalog: null, future: true})));
assert.equal(unknownMember.status, 'error');
assert.equal(unknownMember.code, 'REQUEST');

console.log(JSON.stringify({
  status: 'pass', runtime: globalThis.Bun?.version ? 'Bun' : 'Node',
  version: globalThis.Bun?.version ?? process.version, profile: SECURITY_PROTECTION_SOURCE_PROFILE,
  caseCount: cases.length, exactFrozenPredecessor: true,
  allCompleteFalse: true, allAuthorityFalse: true,
  hostControls: {policyAccessorRefused: true, getterCalls: policyGetterCalls, error: accessor},
  abiControls: {wrongProfileRefused: true, unknownRequestMemberRefused: true},
  artifacts: {predecessor: sha(packetBytes)},
}));
