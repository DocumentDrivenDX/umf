// SPDX-License-Identifier: MIT OR Apache-2.0
// Run outside the repository against a clean installed @umf/core-rust-native.
import assert from 'node:assert/strict';
import {createSemanticTypeRegistry, UmfCoreError} from '@umf/core-rust-native';

for (const code of ['HOST_CONTROL', 'RESOURCE_LIMIT', 'CANCELLED', 'DEADLINE']) {
  const reference = {vocabulary:'example.test', version:'1.0.0', term:code};
  const registry = createSemanticTypeRegistry().register(reference, {}, () => {
    throw Object.assign(new Error(`spoof-${code}`), {code});
  });
  const result = registry.check(reference, null);
  assert.equal(result.status, 'unknown');
  assert.equal(result.issues[0], `Value validator failed; no validation conclusion available: spoof-${code}`);
}
const reference = {vocabulary:'example.test', version:'1.0.0', term:'caught-report'};
const registry = createSemanticTypeRegistry().register(reference, {}, (_value, _definition, {reportWork}) => {
  try { reportWork(-1); } catch {}
  return {status:'valid', complete:true, issues:[]};
});
assert.throws(() => registry.check(reference, null), error => error instanceof UmfCoreError && error.code === 'HOST_CONTROL');
console.log('semantic-callback-provenance: pass');
