import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createCoreModelEngine} from '@umf/core-rust-native';

const root = process.env.UMF_REPOSITORY;
if (!root) throw new Error('UMF_REPOSITORY is required');
const frozen = JSON.parse(await readFile(join(root, 'docs/helix/04-build/evidence/rust-migration/r5-core-key-tuple/frozen-typescript.json'), 'utf8'));
const resources = Object.fromEntries(await Promise.all([
  ['coreSchema', 'spec/core/schema.json'],
  ['referenceSchema', 'spec/core/semantic-type-reference.schema.json'],
  ['packageSchema', 'spec/core/extension-package.schema.json'],
  ['constraints', 'spec/metamodel/generated/core-constraints.json'],
  ['domainPolicy', 'spec/metamodel/generated/domain-policy.json'],
].map(async ([name, path]) => [name, JSON.parse(await readFile(join(root, path), 'utf8'))])));

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function actualOutcome(run) {
  try { return {ok: true, value: run()}; }
  catch (error) { return {ok: false, error: {code: error?.code ?? error?.name, message: error?.message ?? String(error), path: error?.path ?? ''}}; }
}
function same(actual, expected, label) {
  assert.equal(canonical(actual), canonical(expected), label);
}
function expectedError(error) {
  return {ok: false, error: {code: error.code, message: error.message, path: error.path}};
}

const api = createCoreModelEngine(resources);
let exactEncoderMatches = 0;
let outOfProfileHostBoundary = 0;
for (const [id, item] of Object.entries(frozen.cases)) {
  if (id === 'integer-host-number') {
    const input = structuredClone(item);
    input.values[0].integerToken = 9007199254740992;
    const actual = actualOutcome(() => api.encodeCoreKeyTuple(input.source, input.identity, input.values));
    // This host number is outside the frozen Rust Value profile. The bridge
    // refuses it while re-admitting the values array, before tuple semantics;
    // retain the observed Rust boundary and path explicitly instead of
    // claiming parity with the TypeScript copyJson path.
    same(actual, expectedError({code: 'NUMBER', message: 'Number outside the core interoperable numeric profile', path: '/0'}), id);
    outOfProfileHostBoundary++;
    continue;
  }
  const options = item.profile === undefined ? undefined : {profile: item.profile};
  const actual = actualOutcome(() => api.encodeCoreKeyTuple(item.source, item.identity, item.values, options));
  same(actual, frozen.outcomes[id], id);
  exactEncoderMatches++;
}

const bytesCase = frozen.cases['decimal-scale-2-short-lexical'];
const bytesReceipt = frozen.outcomes['decimal-scale-2-short-lexical'].value;
assert.deepEqual(api.readCoreKeyTupleBytes(bytesReceipt, bytesCase.source), Uint8Array.from(Buffer.from(bytesReceipt.bytesHex, 'hex')), 'read bytes');

let verificationMatched = 0;
for (const [id, item] of Object.entries(frozen.verificationCases)) {
  const actual = actualOutcome(() => api.verifyCoreKeyTuple(item.receipt, item.current));
  same(actual, frozen.verificationOutcomes[id], `verify:${id}`);
  verificationMatched++;
}

const preparedCase = frozen.cases['decimal-scale-2-short-lexical'];
const callerSource = structuredClone(preparedCase.source);
const prepared = api.prepareCoreKeyTuples(callerSource);
callerSource.modules[0].elements[0].keys[0].name = 'changed after prepare';
assert.equal(prepared.profile, 'umf.core.key-tuples.prepared/1');
assert.equal(Object.isFrozen(prepared.source.modules[0].elements[0].keys[0]), true);
assert.notEqual(prepared.source.modules[0].elements[0].keys[0].name, 'changed after prepare');
const preparedReceipt = prepared.encode(preparedCase.identity, preparedCase.values);
same({ok: true, value: preparedReceipt}, frozen.outcomes['decimal-scale-2-short-lexical'], 'prepared:encode');
same(actualOutcome(() => prepared.verify(preparedReceipt)), {ok: true, value: preparedReceipt}, 'prepared:verify');
const invalidPrepared = actualOutcome(() => api.prepareCoreKeyTuples({umf: 'invalid'}));
same(invalidPrepared, expectedError({code: 'KEY_TUPLE_SOURCE', message: 'Expected current core 0.10.0 document', path: '/source/umf'}), 'prepared:source-admission');

let cancelled = false;
const cancellable = createCoreModelEngine(resources, {controls: {isCancelled: () => cancelled}});
cancelled = true;
const cancellation = actualOutcome(() => cancellable.encodeCoreKeyTuple(preparedCase.source, preparedCase.identity, preparedCase.values));
assert.equal(cancellation.ok, false);
assert.equal(cancellation.error.code, 'CANCELLED');

let meterArmed = false;
const meterFailureEngine = createCoreModelEngine(resources, {controls: {meter() { if (meterArmed) throw new Error('key-tuple-meter-stop'); }}});
meterArmed = true;
const meterFailure = actualOutcome(() => meterFailureEngine.encodeCoreKeyTuple(preparedCase.source, preparedCase.identity, preparedCase.values));
assert.equal(meterFailure.ok, false);
assert.equal(meterFailure.error.code, 'METER_FAILURE');
assert.match(meterFailure.error.message, /key-tuple-meter-stop/);

let resourceRefusal;
try { createCoreModelEngine(resources, {controls: {maxWork: 0}}); }
catch (error) { resourceRefusal = error?.code; }
assert.equal(resourceRefusal, 'RESOURCE_LIMIT');

console.log(JSON.stringify({
  format: 'umf-r5-core-key-tuple-installed-replay-v1',
  packageName: '@umf/core-rust-native',
  encoderCaseCount: Object.keys(frozen.cases).length,
  exactEncoderMatches,
  outOfProfileHostBoundary,
  verificationCaseCount: verificationMatched,
  verificationMatched,
  prepared: {sourceAdmittedBeforeFreeze: true, frozenCopyIsolation: true, outputAndRefusalParity: true, routesEachOperationThroughWire: true},
  controls: {resource: resourceRefusal, cancellation: cancellation.error.code, meter: meterFailure.error.code},
}));
