import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCoreKindNullabilityHostInputEngine} from '../../../../bindings/core/node/index.js';
import {CORE_MODEL_RESOURCES} from '../../../../src/access/core-model-resources.ts';
import {inspectCoreElementKind, declareCoreElementKind, verifyCoreKindDeclaration} from '../../../../src/model/field-kind.ts';
import {inspectCoreNullability, declareCoreNullability, verifyCoreNullabilityDeclaration} from '../../../../src/model/nullability.ts';

const source = JSON.parse(await readFile('scripts/rust-migration/r5/kind-nullability/input.json', 'utf8'));
const rust = createCoreKindNullabilityHostInputEngine(CORE_MODEL_RESOURCES);
const id = {module:'m', element:'known'};
const normalize = value => JSON.parse(JSON.stringify(value));
const result = run => {
  try { return {ok:true, value:normalize(run())}; }
  catch (error) { return {ok:false, name:error?.name ?? '', code:error?.code ?? '', message:error?.message ?? String(error), path:error?.path ?? ''}; }
};

const declaredKind = declareCoreElementKind(source, id, 'field');
const declaredNullability = declareCoreNullability(source, id, 'required');
const parity = {
  inspectKind: [() => inspectCoreElementKind(source, id), () => rust.inspectCoreElementKind(source, id)],
  declareKind: [() => declareCoreElementKind(source, {module:'m',element:'missing'}, 'field'), () => rust.declareCoreElementKind(source, {module:'m',element:'missing'}, 'field')],
  verifyKind: [() => verifyCoreKindDeclaration(declaredKind, source), () => rust.verifyCoreKindDeclaration(declaredKind, source)],
  inspectNullability: [() => inspectCoreNullability(source, id), () => rust.inspectCoreNullability(source, id)],
  declareNullability: [() => declareCoreNullability(source, id, 'absent-allowed'), () => rust.declareCoreNullability(source, id, 'absent-allowed')],
  verifyNullability: [() => verifyCoreNullabilityDeclaration(declaredNullability, source), () => rust.verifyCoreNullabilityDeclaration(declaredNullability, source)],
};
const outcomes = {};
for (const [name, [before, after]] of Object.entries(parity)) {
  outcomes[name] = [result(before), result(after)];
  assert.deepEqual(outcomes[name][1], outcomes[name][0], `${name} complete result envelope`);
}
assert.deepEqual(outcomes.inspectKind[1].value.source.modules[0].elements[0].extensions.future.opaque[1], {retain:true});

const mutableResources = structuredClone(CORE_MODEL_RESOURCES);
const pinned = createCoreKindNullabilityHostInputEngine(mutableResources);
mutableResources.coreSchema = false;
assert.deepEqual(normalize(pinned.inspectCoreElementKind(source, id)), normalize(inspectCoreElementKind(source, id)), 'resource source is snapshotted at factory creation');
let setupWork = 0, operationWork = 0, meterCalls = 0;
const metered = createCoreKindNullabilityHostInputEngine(CORE_MODEL_RESOURCES, {
  resourceControls:{meter:amount => { setupWork += amount; }},
  controls:{meter:amount => { meterCalls++; operationWork += amount; }},
});
metered.inspectCoreElementKind(source, id);
assert.ok(setupWork > 0 && meterCalls > 0 && operationWork > 0, 'factory snapshot/transport/catalog and per-call host/semantic/output work are reported');
let repeatedSetupWork = 0;
createCoreKindNullabilityHostInputEngine(CORE_MODEL_RESOURCES, {resourceControls:{meter:amount => { repeatedSetupWork += amount; }}});
assert.equal(repeatedSetupWork, setupWork, 'a prior factory does not change the next factory setup charge');
assert.throws(() => createCoreKindNullabilityHostInputEngine(CORE_MODEL_RESOURCES, {resourceControls:{maxWork:setupWork - 1}}), error => error?.code === 'RESOURCE_LIMIT', 'a prior factory does not change setup refusal');
assert.throws(() => createCoreKindNullabilityHostInputEngine(CORE_MODEL_RESOURCES, {resourceControls:{maxWork:setupWork - 1}}), error => error?.code === 'RESOURCE_LIMIT', 'factory resource setup budget fails closed');
let setupGetterTouched = false;
const hostileResources = Object.create(null);
Object.defineProperty(hostileResources, 'coreSchema', {enumerable:true,get(){setupGetterTouched=true;throw new Error('must not run');}});
assert.throws(() => createCoreKindNullabilityHostInputEngine(hostileResources, {resourceControls:{maxWork:0}}), error => error?.code === 'RESOURCE_LIMIT');
assert.equal(setupGetterTouched, false, 'zero-work factory setup refuses before reflecting resources');
const boundedCall = createCoreKindNullabilityHostInputEngine(CORE_MODEL_RESOURCES, {resourceControls:{maxWork:setupWork}, controls:{maxWork:operationWork - 1}});
assert.throws(() => boundedCall.inspectCoreElementKind(source, id), error => error?.code === 'RESOURCE_LIMIT', 'per-call budget covers all staged operation phases');
let resetWork = 0;
const perCall = createCoreKindNullabilityHostInputEngine(CORE_MODEL_RESOURCES, {
  resourceControls:{maxWork:setupWork},
  controls:{meter:amount => { resetWork += amount; }},
});
perCall.inspectCoreElementKind(source, id);
perCall.inspectCoreElementKind(source, id);
assert.ok(resetWork > 0, 'per-call meters report operation work independently from factory admission');
const cancelled = createCoreKindNullabilityHostInputEngine(CORE_MODEL_RESOURCES, {resourceControls:{maxWork:setupWork}, controls:{isCancelled:() => true}});
assert.throws(() => cancelled.inspectCoreElementKind(source, id), error => error?.code === 'CANCELLED', 'per-call cancellation is checked during staged admission');

const accessor = (target, key, trace, label = key) => Object.defineProperty(target, key, {
  enumerable:true,
  get() { trace?.push(label); throw new Error(`${label} getter invoked`); },
});
const frozenControls = {};
for (const [name, runPair, code, path, traceExpected] of [
  ['kindInspectSource', [inspectCoreElementKind, rust.inspectCoreElementKind.bind(rust)], 'NON_JSON', '/poison', []],
  ['nullabilityInspectSource', [inspectCoreNullability, rust.inspectCoreNullability.bind(rust)], 'NON_JSON', '/poison', []],
]) {
  const expectedTrace = [];
  const actualTrace = [];
  const expectedSource = accessor(structuredClone(source), 'poison', expectedTrace);
  const actualSource = accessor(structuredClone(source), 'poison', actualTrace);
  const expected = result(() => runPair[0](expectedSource, id));
  const actual = result(() => runPair[1](actualSource, id));
  assert.deepEqual(actual, expected, name);
  assert.equal(actual.code, code);
  assert.equal(actual.path, path);
  assert.deepEqual(actualTrace, expectedTrace, `${name} host event trace`);
  frozenControls[name] = {expected, actual, expectedTrace, actualTrace};
}

for (const [name, ts, rs, valueName, code, identity] of [
  ['kindDeclareInvalidRequest', declareCoreElementKind, rust.declareCoreElementKind.bind(rust), 'kind', 'CORE_KIND_VALUE', {module:'m',element:'missing'}],
  ['nullabilityDeclareInvalidRequest', declareCoreNullability, rust.declareCoreNullability.bind(rust), 'nullability', 'CORE_NULLABILITY_VALUE', id],
]) {
  const expectedTrace = [];
  const actualTrace = [];
  const request1 = accessor({}, 'poison', expectedTrace, 'request.poison');
  const request2 = accessor({}, 'poison', actualTrace, 'request.poison');
  const expected = result(() => ts(structuredClone(source), identity, request1));
  const actual = result(() => rs(structuredClone(source), identity, request2));
  assert.deepEqual(actual, expected, name);
  assert.equal(actual.code, code);
  assert.deepEqual(actualTrace, expectedTrace, `${name} must classify without traversing the object`);
  frozenControls[name] = {expected, actual, expectedTrace, actualTrace};
}

for (const [name, ts, rs, invalid, code] of [
  ['kindDeclareUnpairedSurrogate', declareCoreElementKind, rust.declareCoreElementKind.bind(rust), '\uD800', 'CORE_KIND_VALUE'],
  ['nullabilityDeclareUnpairedSurrogate', declareCoreNullability, rust.declareCoreNullability.bind(rust), '\uD800', 'CORE_NULLABILITY_VALUE'],
]) {
  const expected = result(() => ts(structuredClone(source), id, invalid));
  const actual = result(() => rs(structuredClone(source), id, invalid));
  assert.deepEqual(actual, expected, name);
  assert.equal(actual.code, code);
  frozenControls[name] = {expected, actual};
}

for (const [name, ts, rs] of [
  ['kindVerifyReceiptFirst', verifyCoreKindDeclaration, rust.verifyCoreKindDeclaration.bind(rust)],
  ['nullabilityVerifyReceiptFirst', verifyCoreNullabilityDeclaration, rust.verifyCoreNullabilityDeclaration.bind(rust)],
]) {
  const expectedTrace = [];
  const actualTrace = [];
  const current1 = accessor({}, 'poison', expectedTrace, 'current.poison');
  const current2 = accessor({}, 'poison', actualTrace, 'current.poison');
  const expected = result(() => ts({}, current1));
  const actual = result(() => rs({}, current2));
  assert.deepEqual(actual, expected, name);
  assert.deepEqual(actualTrace, expectedTrace, `${name} must reject receipt before current admission`);
  frozenControls[name] = {expected, actual, expectedTrace, actualTrace};
}

const currentTrace = [];
const currentWithAccessor = accessor(structuredClone(source), 'poison', currentTrace);
const expectedCurrent = result(() => verifyCoreKindDeclaration(declaredKind, currentWithAccessor));
const actualCurrent = result(() => rust.verifyCoreKindDeclaration(declaredKind, currentWithAccessor));
assert.deepEqual(actualCurrent, expectedCurrent, 'valid receipt admits current after receipt verification');
assert.equal(actualCurrent.code, 'NON_JSON');
assert.deepEqual(currentTrace, [], 'descriptor admission must reject an accessor without invoking it');

for (const [name, ts, rs] of [
  ['kindSourceBeforeIdentity', inspectCoreElementKind, rust.inspectCoreElementKind.bind(rust)],
  ['nullabilitySourceBeforeIdentity', inspectCoreNullability, rust.inspectCoreNullability.bind(rust)],
]) {
  const identityTrace = [];
  const identityWithAccessors = {
    get module() { identityTrace.push('module'); return 'm'; },
    get element() { identityTrace.push('element'); return 'known'; },
  };
  const sourceWithAccessor = accessor(structuredClone(source), 'poison', identityTrace, 'source.poison');
  const expectedIdentity = result(() => ts(sourceWithAccessor, identityWithAccessors));
  const actualIdentity = result(() => rs(sourceWithAccessor, identityWithAccessors));
  assert.deepEqual(actualIdentity, expectedIdentity, name);
  assert.deepEqual(identityTrace, [], 'descriptor admission must reject accessor without invoking it');
  frozenControls[name] = {expected:expectedIdentity, actual:actualIdentity, trace:identityTrace};
}

const sentinel = Object.freeze({sentinel:'proxy trap'});
const badProxy = new Proxy({}, {getPrototypeOf() { throw sentinel; }});
let expectedThrown;
try { inspectCoreElementKind(source, badProxy); } catch (error) { expectedThrown = error; }
let actualThrown;
try { rust.inspectCoreElementKind(source, badProxy); } catch (error) { actualThrown = error; }
assert.equal(actualThrown, expectedThrown, 'host callback must rethrow the original thrown value');

console.log(JSON.stringify({status:'node-host-json-parity-passed', semanticCases:Object.keys(parity).length, negativeControls:Object.keys(frozenControls).length, thrownValueIdentity:true, setupWork, repeatedSetupWork, operationWork, meterCalls, resetWork}));
