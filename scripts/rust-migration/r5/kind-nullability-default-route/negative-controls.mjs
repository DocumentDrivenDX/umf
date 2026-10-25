// SPDX-License-Identifier: MIT OR Apache-2.0
// Prove the tagged host boundary does not preserve predecessor admission order/errors.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {inspectCoreElementKind, declareCoreElementKind} from '../../../../src/model/field-kind.ts';
import {inspectCoreNullability, declareCoreNullability} from '../../../../src/model/nullability.ts';
import {verifyCoreKindDeclaration} from '../../../../src/model/field-kind.ts';
import {verifyCoreNullabilityDeclaration} from '../../../../src/model/nullability.ts';
import {createCoreModelOperations} from '../../../../bindings/core/node/src/core-model.js';
import {toWire} from '../../../../bindings/core/node/src/wire.js';

const document = JSON.parse(await readFile('scripts/rust-migration/r5/kind-nullability/input.json', 'utf8'));
const capture = (run) => {
  try { run(); return {ok:true}; }
  catch (error) { return {ok:false,name:error?.name ?? '',code:error?.code ?? '',message:error?.message ?? String(error),path:error?.path ?? ''}; }
};
const accessor = (object, key = 'poison', trace = undefined) => Object.defineProperty(object, key, {
  enumerable:true,
  get() { trace?.push(key); throw new Error(`${key} getter invoked`); },
});
const expected = {};
const actual = {};
for (const [name, predecessor] of [
  ['kindInspect', inspectCoreElementKind],
  ['nullabilityInspect', inspectCoreNullability],
]) {
  const source = accessor(structuredClone(document));
  const identity = {module:'m',element:'known'};
  expected[name] = capture(() => predecessor(source, identity));
  actual[name] = capture(() => toWire({source,identity}));
}
for (const [name, predecessor, member, refusal] of [
  ['kindDeclare', declareCoreElementKind, 'kind', 'CORE_KIND_VALUE'],
  ['nullabilityDeclare', declareCoreNullability, 'nullability', 'CORE_NULLABILITY_VALUE'],
]) {
  const invalidRequest = accessor({});
  expected[name] = capture(() => predecessor(structuredClone(document), {module:'m',element:'missing'}, invalidRequest));
  actual[name] = capture(() => toWire({source:structuredClone(document),identity:{module:'m',element:'missing'},[member]:invalidRequest}));
  assert.equal(expected[name].code, refusal);
}

// The current engine surface receives positional identity strings, so a public
// binder must read identity.module/element before entering its invocation path.
for (const [name, predecessor, method] of [
  ['kindIdentityOrder', inspectCoreElementKind, 'inspectCoreKind'],
  ['nullabilityIdentityOrder', inspectCoreNullability, 'inspectCoreNullability'],
]) {
  const trace = [];
  const source = accessor(structuredClone(document), 'poison', trace);
  const identity = {
    get module() { trace.push('identity.module'); return 'm'; },
    get element() { trace.push('identity.element'); return 'known'; },
  };
  expected[name] = capture(() => predecessor(source, identity));
  const api = createCoreModelOperations((_op, args) => toWire(args));
  actual[name] = capture(() => api[method](source, identity.module, identity.element));
  actual[name].trace = trace;
}

assert.equal(expected.kindInspect.code, 'NON_JSON');
assert.equal(expected.nullabilityInspect.code, 'NON_JSON');
for (const name of ['kindInspect','nullabilityInspect','kindDeclare','nullabilityDeclare']) {
  assert.equal(actual[name].name, 'AdmissionError');
  assert.equal(actual[name].code, 'ACCESSOR_PROPERTY');
}
for (const name of ['kindIdentityOrder','nullabilityIdentityOrder']) {
  assert.equal(expected[name].code, 'NON_JSON');
  assert.equal(actual[name].name, 'AdmissionError');
  assert.equal(actual[name].code, 'ACCESSOR_PROPERTY');
  assert.deepEqual(actual[name].trace.slice(0,2), ['identity.module','identity.element']);
}

// Verification must reject a malformed receipt before the predecessor copies
// current. The one-shot generic wire admits both fields before Rust can decide.
for (const [name, predecessor] of [
  ['kindVerifyOrder', verifyCoreKindDeclaration],
  ['nullabilityVerifyOrder', verifyCoreNullabilityDeclaration],
]) {
  const current = accessor({});
  expected[name] = capture(() => predecessor({}, current));
  actual[name] = capture(() => toWire({receipt:{},current}));
}
assert.equal(expected.kindVerifyOrder.code, 'CORE_KIND_RECEIPT');
assert.equal(expected.nullabilityVerifyOrder.code, 'CORE_NULLABILITY_RECEIPT');
for (const name of ['kindVerifyOrder','nullabilityVerifyOrder']) {
  assert.equal(actual[name].name, 'AdmissionError');
  assert.equal(actual[name].code, 'ACCESSOR_PROPERTY');
  assert.equal(actual[name].path, '/current');
}

const receipt = {status:'negative',note:'Predecessor and tagged-host candidate outcomes differ before Rust semantic admission.',controls:{expected,actual}};
await writeFile('docs/helix/04-build/evidence/rust-migration/r5-kind-nullability-default-route/negative-controls.json', `${JSON.stringify(receipt,null,2)}\n`);
console.log(JSON.stringify({status:'negative-control-reproduced',controls:Object.keys(expected).length,output:'docs/helix/04-build/evidence/rust-migration/r5-kind-nullability-default-route/negative-controls.json'}));
