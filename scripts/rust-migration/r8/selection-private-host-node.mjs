// SPDX-License-Identifier: MIT OR Apache-2.0
// Bounded Node runtime check for the private Selection host entrypoint.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const addonPath = process.env.UMF_SELECTION_ADDON;
if (!addonPath) throw new Error('UMF_SELECTION_ADDON must name a freshly built Node addon');
const require = createRequire(import.meta.url);
const addon = require(addonPath);
const {coreElementSelectionHostInput, kindRuntimeValidationHostInput} = await import(pathToFileURL(resolve(root, 'bindings/core/node/src/host-json.js')));
const {validateDocument: typescriptValidateDocument, selectCoreElements: typescriptSelectCoreElements} = await import(pathToFileURL(resolve(root, 'dist/umf-node.js')));
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const resources = {
  coreSchema: read('spec/core/schema.json'),
  referenceSchema: read('spec/core/semantic-type-reference.schema.json'),
  packageSchema: read('spec/core/extension-package.schema.json'),
  constraints: read('spec/metamodel/generated/core-constraints.json'),
  domainPolicy: read('spec/metamodel/generated/domain-policy.json'),
};
const packet = read('scripts/rust-migration/r5/selection/input.json');
const frozen = read('scripts/rust-migration/r5/selection/frozen-typescript.json');
const result = coreElementSelectionHostInput(addon, resources, packet.source, packet.queries.all, undefined, Error);
assert.equal(JSON.stringify(result), JSON.stringify(frozen.cases.all));
const outputPrototype = Object.getPrototypeOf(result) === null ? 'null' : 'other';
assert.equal(outputPrototype, 'null');
assert.equal(Object.getPrototypeOf(result.source), null);

const protoSource = structuredClone(packet.source);
Object.defineProperty(protoSource.extensions.future.opaque, '__proto__', {
  value: {retained: true}, writable: true, enumerable: true, configurable: true,
});
const protoResult = coreElementSelectionHostInput(addon, resources, protoSource, packet.queries.all, undefined, Error);
const opaque = protoResult.source.extensions.future.opaque;
assert.equal(Object.getPrototypeOf(opaque), null);
assert.equal(Object.hasOwn(opaque, '__proto__'), true);
assert.equal(opaque.__proto__.retained, true);
assert.equal(Object.getPrototypeOf(opaque.__proto__), null);
assert.equal(Object.prototype.retained, undefined);

const kindRuntimeResultValues = [undefined, null, false, -0, NaN, Infinity, -Infinity, 'validation',
  Object.freeze({valid: true}), function validationResult() {}, Symbol('validation'), 17n];
const kindRuntimeResultCases = kindRuntimeResultValues.map((value, index) => {
  const events = [];
  const referenceEvents = [];
  let activeEvents = referenceEvents;
  const source = Object.freeze({index});
  const registrations = Object.freeze([{index}]);
  const runtime = {validateDocument(input, actualRegistrations) {
    activeEvents.push('validateDocument:call');
    if (this !== runtime || input !== source || actualRegistrations !== registrations) throw new Error('result callback identity changed');
    return value;
  }};
  const makeRegistry = target => ({
    get kindRuntime() { target.push('kindRuntime:get'); return runtime; },
    registrations() { target.push('registrations:call'); return registrations; },
  });
  const expected = typescriptValidateDocument(source, makeRegistry(referenceEvents));
  activeEvents = events;
  const actual = kindRuntimeValidationHostInput(addon, source, makeRegistry(events), Error);
  return {index, sameValue: Object.is(expected, value) && Object.is(actual, value), sameIdentity: Object.is(actual, value),
    sameTrace: JSON.stringify(events) === JSON.stringify(referenceEvents), events};
});
assert.deepEqual(kindRuntimeResultCases.map(item => [item.sameValue, item.sameIdentity, item.sameTrace]),
  kindRuntimeResultCases.map(() => [true, true, true]));

const selectionKindRuntimeBranch = (() => {
  const referenceTrace = [];
  const actualTrace = [];
  const makeRegistry = trace => {
    const result = Object.defineProperty({}, 'valid', {
      get() { trace.push('validation.valid:get'); return true; },
    });
    const runtime = {validateDocument(source, registrations) {
      trace.push('kindRuntime.validateDocument:call');
      if (this !== runtime || JSON.stringify(source) !== JSON.stringify(packet.source) || registrations.length !== 0) {
        throw new Error('Selection kindRuntime receiver or arguments changed');
      }
      assert.equal(Object.getPrototypeOf(source), null);
      assert.equal(Object.getPrototypeOf(source.modules[0]), null);
      return result;
    }};
    return {
      get kindRuntime() { trace.push('registry.kindRuntime:get'); return runtime; },
      registrations() { trace.push('registry.registrations:call'); return []; },
    };
  };
  try { typescriptSelectCoreElements(packet.source, packet.queries.all, makeRegistry(referenceTrace)); }
  catch (error) { assert.equal(error.code, 'NON_JSON'); }
  try {
    coreElementSelectionHostInput(addon, resources, packet.source, packet.queries.all, makeRegistry(actualTrace), Error);
    assert.fail('expected the bounded consumer-stage stop');
  } catch (error) {
    assert.equal(error.message, 'HOST_JSON_UNSUPPORTED');
  }
  assert.equal(actualTrace.at(-1), 'validation.valid:get');
  assert.deepEqual(referenceTrace.slice(0, actualTrace.length), actualTrace);
  const sentinel = Object.freeze({validGetter: true});
  const thrownTrace = [];
  const throwingRegistry = {
    kindRuntime: {validateDocument() {
      return Object.defineProperty({}, 'valid', {get() { thrownTrace.push('valid:get'); throw sentinel; }});
    }},
    registrations() { thrownTrace.push('registrations:call'); return []; },
  };
  let thrown;
  try { coreElementSelectionHostInput(addon, resources, packet.source, packet.queries.all, throwingRegistry, Error); }
  catch (error) { thrown = error; }
  assert.equal(thrown, sentinel);
  return {prefixMatches: true, trace: actualTrace, unsupportedAfterValid: true,
    thrownGetterIdentity: thrown === sentinel, thrownTrace};
})();

const sentinel = {identity: true};
let calls = 0;
try {
  coreElementSelectionHostInput(addon, resources, packet.source, packet.queries.all, {get() { calls++; throw sentinel; }}, Error);
  assert.fail('expected Registry.get throw');
} catch (error) {
  assert.equal(error, sentinel);
}
assert.equal(calls, 1);
console.log(JSON.stringify({status: 'json-value-and-shape-pass', host: process.version, cases: 3, outputPrototype, ownProtoKey: true, kindRuntimeResultCases, selectionKindRuntimeBranch}));
