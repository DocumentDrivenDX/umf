// SPDX-License-Identifier: MIT OR Apache-2.0
// Focused opt-in Node replay for the frozen raw-host admission packet.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const bindingSpecifier = process.env.UMF_RECORD_VALUES_BINDING ?? '../../../bindings/core/node/index.js';
const {createCoreRecordValuesHostInputEngine} = await import(bindingSpecifier);

const root = resolve(process.env.UMF_RECORD_VALUES_REPO_ROOT ?? resolve(import.meta.dirname, '../../..'));
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const packet = await readJson('docs/helix/04-build/evidence/rust-migration/r5-record-values/host-admission.json');
const resources = {
  coreSchema: await readJson('spec/core/schema.json'),
  referenceSchema: await readJson('spec/core/semantic-type-reference.schema.json'),
  packageSchema: await readJson('spec/core/extension-package.schema.json'),
  constraints: await readJson('spec/metamodel/generated/core-constraints.json'),
  domainPolicy: await readJson('spec/metamodel/generated/domain-policy.json'),
};
const api = createCoreRecordValuesHostInputEngine(resources);
const {source, identity, values} = packet.fixture;
const capture = (run) => {
  try { return {ok: true, value: run()}; }
  catch (error) { return {ok: false, error: {name: error?.name ?? 'Error', code: error?.code ?? '', message: error?.message ?? String(error), path: error?.path ?? ''}}; }
};
let count = 0;
function compare(name, actual, expected) {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected, name);
  count++;
}
const out = packet.outcomes;
const base = capture(() => api.validateCoreRecordValues(source, identity, values));
compare('base', base, out.base);
const mapDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'map');
let mapGetterCalls = 0, primordialOutcome;
Object.defineProperty(Array.prototype, 'map', {configurable:true,get(){mapGetterCalls++;throw new Error('host admission read mutable Array.prototype.map');}});
try { primordialOutcome = capture(() => api.validateCoreRecordValues(source, identity, values)); }
finally { Object.defineProperty(Array.prototype, 'map', mapDescriptor); }
assert.deepStrictEqual(JSON.parse(JSON.stringify(primordialOutcome)), out.base);
assert.equal(mapGetterCalls, 0, 'host admission must not consult mutable Array.prototype.map');
compare('basePrototypeOrder', outcomeShape(base.value), out.prototypeOrder);
console.log('record-host base');
let sourceGetterCalls = 0, identityGetterCalls = 0, valuesGetterCalls = 0;
const sourceAccessor = {...source}; Object.defineProperty(sourceAccessor, 'future', {enumerable:true, get() {sourceGetterCalls++; return true;}});
const identityAccessor = {get module() {identityGetterCalls++; return 'fixture';}, element:'item'};
const valuesAccessor = [{field:{module:'fixture',element:'label'},state:'present',get value() {valuesGetterCalls++; return {string:'x'};}}];
compare('sourceAccessor', capture(() => api.validateCoreRecordValues(sourceAccessor, identityAccessor, valuesAccessor)), out.rawCases.sourceAccessor);
const sourceFirstCalls = {sourceGetterCalls, identityGetterCalls, valuesGetterCalls};
sourceGetterCalls = identityGetterCalls = valuesGetterCalls = 0;
compare('identityAccessor', capture(() => api.validateCoreRecordValues(source, identityAccessor, valuesAccessor)), out.rawCases.identityAccessor);
const identityFirstCalls = {sourceGetterCalls, identityGetterCalls, valuesGetterCalls};
sourceGetterCalls = identityGetterCalls = valuesGetterCalls = 0;
compare('valuesAccessorBeforeSourceVersion', capture(() => api.validateCoreRecordValues({...source, umf:'0.7.0'}, identity, valuesAccessor)), out.rawCases.valuesAccessorBeforeSourceVersion);
const valuesBeforeSemanticCalls = {sourceGetterCalls, identityGetterCalls, valuesGetterCalls};
compare('getterCallOrder', {sourceFirst:sourceFirstCalls,identityFirst:identityFirstCalls,valuesBeforeSemantic:valuesBeforeSemanticCalls}, out.rawCases.sourceThenIdentityThenValuesGetterCounts);
console.log('record-host copy-order');
compare('hiddenSource', capture(() => {
  const v = {...source}; Object.defineProperty(v, 'hidden', {value: true, enumerable: false});
  return api.validateCoreRecordValues(v, identity, values);
}), out.rawCases.hiddenSource);
compare('symbolSource', capture(() => api.validateCoreRecordValues({...source, [Symbol('future')]: true}, identity, values)), out.rawCases.symbolSource);
compare('customPrototypeSource', capture(() => api.validateCoreRecordValues(Object.assign(Object.create({future: true}), source), identity, values)), out.rawCases.customPrototypeSource);
compare('sparseValues', capture(() => api.validateCoreRecordValues(source, identity, new Array(1))), out.rawCases.sparseValues);
compare('cyclicSource', capture(() => { const v = {...source}; v.cycle = v; return api.validateCoreRecordValues(v, identity, values); }), out.rawCases.cyclicSource);
const invalidNumbers = [NaN, Infinity, -Infinity, -0, Number.MAX_SAFE_INTEGER + 1];
compare('invalidNumbers', invalidNumbers.map((number, index) => ({id: ['nan','positiveInfinity','negativeInfinity','negativeZero','unsafeInteger'][index], outcome: capture(() => api.validateCoreRecordValues(source, identity, [{field: {module:'fixture',element:'label'}, state:'present', value:{number}}]))})), out.rawCases.invalidNumbers);
compare('nonJsonValues', capture(() => api.validateCoreRecordValues(source, identity, [undefined])), out.rawCases.nonJsonValues);
const hiddenIdentity = {module:'fixture'}; Object.defineProperty(hiddenIdentity, 'element', {value:'item', enumerable:false});
compare('hiddenIdentity', capture(() => api.validateCoreRecordValues(source, hiddenIdentity, values)), out.rawCases.hiddenIdentity);
compare('symbolIdentity', capture(() => api.validateCoreRecordValues(source, {...identity, [Symbol('future')]:true}, values)), out.rawCases.symbolIdentity);
compare('customPrototypeIdentity', capture(() => api.validateCoreRecordValues(source, Object.assign(Object.create({future:true}), identity), values)), out.rawCases.customPrototypeIdentity);
compare('crossedInvalidSemanticSource', capture(() => api.validateCoreRecordValues({...source, umf:'0.7.0'}, {module:''}, [null])), out.rawCases.crossedInvalidSemanticSource);
const largeSource = structuredClone(source); largeSource['x-future-assertion'] = {opaque:'x'.repeat(out.large.units)};
compare('largeRetainedUnknown', capture(() => {const result=api.validateCoreRecordValues(largeSource, identity, values);return {length:result.source['x-future-assertion'].opaque.length,prototypeOrder:outcomeShape(result)};}), out.large.outcome);
console.log('record-host large');
function outcomeShape(value) {
  if (Array.isArray(value)) return {kind:'array',items:value.map(outcomeShape)};
  if (value && typeof value === 'object') {const prototype=Object.getPrototypeOf(value); return {kind:prototype===null?'null-object':prototype===Object.prototype?'plain-object':'other-object',keys:Object.keys(value),fields:Object.fromEntries(Object.keys(value).map((key)=>[key,outcomeShape(value[key])]))};}
  return typeof value;
}
let metered = 0;
const meteredApi = createCoreRecordValuesHostInputEngine(resources, {controls:{meter(amount){metered += amount;}}});
compare('meteredValid', capture(() => meteredApi.validateCoreRecordValues(source, identity, values)), out.base);
assert.ok(metered > 0, 'Rust host admission and semantic work must reach the shared host meter');
const zeroWorkApi = createCoreRecordValuesHostInputEngine(resources, {controls:{maxWork:0}});
const zeroWork = capture(() => zeroWorkApi.validateCoreRecordValues(source, identity, values));
assert.equal(zeroWork.ok, false);
assert.equal(zeroWork.error.code, 'RESOURCE_LIMIT');
assert.equal(count, 19);
console.log(JSON.stringify({status:'passed',profile:packet.profile,cases:count,additionalHostPrimordialControl:'passed',mapGetterCalls,addon:process.version,meteredWork:metered,countLimitProbe:'Node/Bun release probes recorded separately; Chromium countLimit not run'}));
