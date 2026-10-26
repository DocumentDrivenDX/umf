// SPDX-License-Identifier: MIT OR Apache-2.0
// Native Node replay of the retained R5 Kind/Nullability success and refusal packets.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const binding = await import(process.env.UMF_R8_NODE_BINDING ?? '../../../../bindings/core/node/index.js');
const {createCoreKindNullabilityHostInputEngine, createCoreModelRootKindNullabilityEngine} = binding;

const read = async path => JSON.parse(await readFile(path, 'utf8'));
const normalize = value => JSON.parse(JSON.stringify(value));
const capture = run => {
  try { return {ok: true, value: run()}; }
  catch (error) {
    return {ok: false, error: {code: error?.code ?? '', message: error?.message ?? String(error), path: error?.path ?? ''}};
  }
};
const [source, surrogate, successOracle, refusalOracle, coreSchema, referenceSchema, packageSchema, constraints, domainPolicy, keyPacket] = await Promise.all([
  read('scripts/rust-migration/r5/kind-nullability/input.json'),
  read('scripts/rust-migration/r5/kind-nullability/surrogate-input.json'),
  read('scripts/rust-migration/r5/kind-nullability/frozen-typescript.json'),
  read('scripts/rust-migration/r5/kind-nullability/frozen-refusals.json'),
  read('spec/core/schema.json'),
  read('spec/core/semantic-type-reference.schema.json'),
  read('spec/core/extension-package.schema.json'),
  read('spec/metamodel/generated/core-constraints.json'),
  read('spec/metamodel/generated/domain-policy.json'),
  read('docs/helix/04-build/evidence/rust-migration/r5-core-keys/frozen-typescript.json'),
]);
const makeMeter = () => ({calls:0, work:0, hash:2166136261, first:null, last:null});
const resourceMeter = makeMeter();
const stagedMeter = makeMeter();
const combinedSetupMeter = {calls:10_980_797, work:432_197_359, hash:1_335_351_220, first:1, last:7};
const countMeter = meter => amount => {
  meter.calls++;
  meter.work += amount;
  meter.hash = Math.imul(meter.hash ^ (amount >>> 0), 16777619) >>> 0;
  if (meter.first === null) meter.first = amount;
  meter.last = amount;
};
const trackedResources = () => {
  const counts = {prototype:0, ownKeys:0, descriptors:0};
  const events = [];
  const proxy = new Proxy({coreSchema, referenceSchema, packageSchema, constraints, domainPolicy}, {
    getPrototypeOf(target) { counts.prototype++; events.push('prototype'); return Reflect.getPrototypeOf(target); },
    ownKeys(target) { counts.ownKeys++; events.push('ownKeys'); return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(target, key) { counts.descriptors++; events.push(`descriptor:${String(key)}`); return Reflect.getOwnPropertyDescriptor(target, key); },
  });
  return {proxy, counts, events};
};
const stagedResources = trackedResources();
const combinedResources = trackedResources();
const engine = createCoreKindNullabilityHostInputEngine(stagedResources.proxy, {resourceControls:{meter:countMeter(stagedMeter)}});
const shared = createCoreModelRootKindNullabilityEngine(combinedResources.proxy, {resourceControls:{meter:countMeter(resourceMeter)}});
const setupReflection = [...combinedResources.events];
assert.deepEqual(combinedResources.counts, {prototype:6, ownKeys:1, descriptors:5});
assert.deepEqual(combinedResources.events, stagedResources.events, 'combined factory matches staged resource reflection order');
// One prototype trap validates the root; each of the five data-property
// checks also confirms that its source remains a plain object.
assert.deepEqual(resourceMeter, combinedSetupMeter, 'combined setup meter fixture drifted; recapture exact shared-runtime setup accounting before changing this expected trace');
const cutoffOrder = [];
assert.throws(() => createCoreModelRootKindNullabilityEngine({coreSchema, referenceSchema, packageSchema, constraints, domainPolicy}, {
  resourceControls:{meter(){cutoffOrder.push('meter');throw new Error('setup cutoff')}, isCancelled(){cutoffOrder.push('cancel');return false}, now(){cutoffOrder.push('clock');return 1}, deadlineMs:0},
}), error => error?.code === 'METER_FAILURE');
assert.deepEqual(cutoffOrder, ['meter'], 'setup cutoff preserves meter-before-cancellation/clock order');
const sharedStagedResult = shared.inspectCoreElementKind(source, {module:'m',element:'known'});
assert.deepEqual(combinedResources.events, setupReflection, 'staged operation does not re-reflect caller resources');
const independentStagedResult = engine.inspectCoreElementKind(source, {module:'m',element:'known'});
assert.deepEqual(combinedResources.events, setupReflection, 'independent staged operation does not re-reflect caller resources');
assert.deepEqual(normalize(sharedStagedResult), normalize(independentStagedResult), 'shared retained runtime staged route');
const sharedModelResult = shared.inspectCoreKind(source, 'm', 'known');
assert.deepEqual(combinedResources.events, setupReflection, 'model operation does not re-reflect caller resources');
assert.deepEqual(normalize(sharedModelResult), normalize(shared.inspectCoreElementKind(source, {module:'m',element:'known'})), 'shared retained runtime model route');
assert.deepEqual(combinedResources.events, setupReflection, 'subsequent staged operation does not re-reflect caller resources');

const keyCase = keyPacket.cases.declare_key_explicit_primary;
const combinedKeyReceipt = shared.declareCoreKey(keyCase.source, keyCase.identity, keyCase.request);
assert.deepEqual(normalize(shared.verifyCoreKeyOperation(combinedKeyReceipt, combinedKeyReceipt.target)), normalize(combinedKeyReceipt), 'combined factory Core Key verifier shares retained runtime');
let currentReadsBeforeMalformedReceipt = 0;
const currentGuard = new Proxy({}, new Proxy({}, {get(_target, trap) { return () => { currentReadsBeforeMalformedReceipt++; throw new Error(`current observed before receipt via ${String(trap)}`); }; }}));
assert.throws(() => shared.verifyCoreKeyOperation({operation:'declare-core-key', version:'2.0.0'}, currentGuard));
assert.equal(currentReadsBeforeMalformedReceipt, 0, 'malformed receipt refuses before current admission');
let guardSelfCheck = 0;
const activeGuard = new Proxy({}, new Proxy({}, {get() { return () => { guardSelfCheck++; throw new Error('current guard activated'); }; }}));
assert.throws(() => Object.getPrototypeOf(activeGuard), /current guard activated/);
assert.equal(guardSelfCheck, 1, 'current guard traps prototype reflection');
const pending = shared.prepareCoreKeyVerification(combinedKeyReceipt);
const otherShared = createCoreModelRootKindNullabilityEngine({coreSchema, referenceSchema, packageSchema, constraints, domainPolicy});
assert.throws(() => otherShared.finishCoreKeyVerification(pending, combinedKeyReceipt.target), TypeError, 'facade handles are engine-bound');
shared.discardCoreKeyVerification(pending);
assert.throws(() => shared.finishCoreKeyVerification(pending, combinedKeyReceipt.target), TypeError, 'discarded handles cannot be reused');

let getterCalls = 0;
const accessorResources = {referenceSchema, packageSchema, constraints, domainPolicy};
Object.defineProperty(accessorResources, 'coreSchema', {enumerable:true, get() { getterCalls++; return coreSchema; }});
assert.throws(() => createCoreModelRootKindNullabilityEngine(accessorResources), TypeError);
assert.equal(getterCalls, 0, 'resource getter is rejected without invocation');

const kindReceipt = engine.declareCoreElementKind(source, {module: 'm', element: 'missing'}, 'field');
const nullReceipt = engine.declareCoreNullability(source, {module: 'm', element: 'missing'}, 'absent-allowed');
const successes = {
  kind_inspect_known: capture(() => engine.inspectCoreElementKind(source, {module: 'm', element: 'known'})),
  kind_inspect_unspecified: capture(() => engine.inspectCoreElementKind(source, {module: 'm', element: 'kindless'})),
  kind_declare: capture(() => kindReceipt),
  kind_verify: capture(() => engine.verifyCoreKindDeclaration(kindReceipt, kindReceipt.target)),
  nullability_inspect_missing: capture(() => engine.inspectCoreNullability(source, {module: 'm', element: 'missing'})),
  nullability_inspect_known: capture(() => engine.inspectCoreNullability(source, {module: 'm', element: 'known'})),
  nullability_inspect_inapplicable: capture(() => engine.inspectCoreNullability(source, {module: 'm', element: 'record'})),
  nullability_declare: capture(() => nullReceipt),
  nullability_verify: capture(() => engine.verifyCoreNullabilityDeclaration(nullReceipt, nullReceipt.target)),
  kind_surrogate_identity_inspect: capture(() => engine.inspectCoreElementKind(surrogate, {module: '\ud800', element: '\ud800'})),
  nullability_surrogate_identity_inspect: capture(() => engine.inspectCoreNullability(surrogate, {module: '\ud800', element: '\ud800'})),
};
assert.deepEqual(Object.fromEntries(Object.entries(successes).map(([name, result]) => [name, result.ok ? normalize(result.value) : result])), successOracle, 'all frozen success envelopes');

const invalid = structuredClone(source);
invalid.modules[0].elements[0].id = '';
invalid.modules.push(structuredClone(invalid.modules[0]));
const conflict = structuredClone(source);
conflict.modules[0].elements[0].scalarType = 'integer';
const forgedKind = structuredClone(kindReceipt); delete forgedKind.identity;
const forgedNullability = structuredClone(nullReceipt); delete forgedNullability.identity;
const invalidKindSource = structuredClone(kindReceipt); invalidKindSource.source = {};
const invalidKindTarget = structuredClone(kindReceipt); invalidKindTarget.target = {};
const invalidNullabilitySource = structuredClone(nullReceipt); invalidNullabilitySource.source = {};
const invalidNullabilityTarget = structuredClone(nullReceipt); invalidNullabilityTarget.target = {};
const staleKind = structuredClone(kindReceipt); staleKind.target.id = 'stale';
const staleNullability = structuredClone(nullReceipt); staleNullability.target.id = 'stale';
const refusals = {
  sourceInvalidKind: capture(() => engine.inspectCoreElementKind(invalid, {module: 'm', element: 'known'})),
  sourceInvalidNullability: capture(() => engine.inspectCoreNullability(invalid, {module: 'm', element: 'known'})),
  kindConflict: capture(() => engine.declareCoreElementKind(conflict, {module: 'm', element: 'known'}, 'record')),
  malformedKindReceipt: capture(() => engine.verifyCoreKindDeclaration(forgedKind, kindReceipt.target)),
  malformedNullabilityReceipt: capture(() => engine.verifyCoreNullabilityDeclaration(forgedNullability, nullReceipt.target)),
  invalidKindReceiptSource: capture(() => engine.verifyCoreKindDeclaration(invalidKindSource, kindReceipt.target)),
  invalidKindReceiptTarget: capture(() => engine.verifyCoreKindDeclaration(invalidKindTarget, kindReceipt.target)),
  invalidNullabilityReceiptSource: capture(() => engine.verifyCoreNullabilityDeclaration(invalidNullabilitySource, nullReceipt.target)),
  invalidNullabilityReceiptTarget: capture(() => engine.verifyCoreNullabilityDeclaration(invalidNullabilityTarget, nullReceipt.target)),
  staleKindReceipt: capture(() => engine.verifyCoreKindDeclaration(kindReceipt, staleKind.target)),
  staleNullabilityReceipt: capture(() => engine.verifyCoreNullabilityDeclaration(nullReceipt, staleNullability.target)),
  nullabilityRole: capture(() => engine.declareCoreNullability(source, {module: 'm', element: 'record'}, 'required')),
  missingIdentity: capture(() => engine.inspectCoreElementKind(source, {module: 'absent', element: 'absent'})),
};
assert.deepEqual(normalize(refusals), refusalOracle, 'all frozen refusal envelopes');
console.log(JSON.stringify({status: 'node-frozen-parity-passed', successes: Object.keys(successes).length, refusals: Object.keys(refusals).length, runtime: process.version, platform: process.platform, arch: process.arch}));
