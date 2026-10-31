// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {setDefaultTimeout} from 'bun:test';
import {createRequire} from 'node:module';
import {createCoreModelEngine, UmfCoreError} from '../index.js';
import {encodeRequestWire, encodeWire} from '../src/wire.js';
import coreSchema from '../../../../spec/core/schema.json' with {type: 'json'};
import referenceSchema from '../../../../spec/core/semantic-type-reference.schema.json' with {type: 'json'};
import packageSchema from '../../../../spec/core/extension-package.schema.json' with {type: 'json'};
import constraints from '../../../../spec/metamodel/generated/core-constraints.json' with {type: 'json'};
import domainPolicy from '../../../../spec/metamodel/generated/domain-policy.json' with {type: 'json'};

const resources = {coreSchema, referenceSchema, packageSchema, constraints, domainPolicy};
const addon = createRequire(import.meta.url)('../umf_core_node.node');
const source = {
  umf: '0.10.0', id: 'core-keys-binding', vocabularies: {},
  modules: [{id: 'm', namespace: 'test', elements: [
    {id: 'record', kind: 'record', members: [{module: 'm', element: 'value'}], extensions: {}},
    {id: 'value', kind: 'field', scalarType: 'integer', nullability: 'required', cardinality: 'one', extensions: {}},
  ]}],
};
const identity = {module: 'm', element: 'record'};
const request = {id: 'pk', name: 'ID', fields: [{module: 'm', element: 'value'}], primary: true};
setDefaultTimeout(90_000);

test('opt-in Node facade runs all five core Key operations', () => {
  const engine = createCoreModelEngine(resources);
  const inspection = engine.inspectCoreKeys(source, identity);
  expect(inspection.operation).toBe('inspect-core-keys');
  const members = engine.declareCoreRecordMembers(source, identity, source.modules[0].elements[0].members);
  const declaration = engine.declareCoreKey(members.target, identity, request);
  expect(engine.lookupCoreKey(declaration.target, {...identity, key: 'pk'}).key.id).toBe('pk');
  expect(engine.verifyCoreKeyOperation(declaration, declaration.target)).toEqual(declaration);
  expect(engine.inspectCoreKeys(declaration.target, identity).meaning.keys[0].id).toBe('pk');
});

test('opt-in Node facade preserves unknown UTF-16 qualifiers and propagates controls', () => {
  const engine = createCoreModelEngine(resources);
  const declared = engine.declareCoreKey(source, identity, request);
  const target = structuredClone(declared.target);
  const opaque = '\ud800';
  target.modules[0].elements[0].keys[0][opaque] = '\ud800';
  const updated = engine.declareCoreKey(target, identity, {...request, name: 'Renamed'});
  expect(updated.target.modules[0].elements[0].keys[0][opaque]).toBe('\ud800');

  let cancellation = false;
  const cancelled = createCoreModelEngine(resources, {controls: {isCancelled: () => cancellation}});
  cancellation = true;
  try {
    cancelled.inspectCoreKeys(source, identity);
    throw new Error('expected cancellation');
  } catch (error) {
    expect(error).toBeInstanceOf(UmfCoreError);
    expect(error.code).toBe('CANCELLED');
  }
});

test('staged Core Key verification rejects malformed receipt before touching current', () => {
  const engine = createCoreModelEngine(resources);
  const receipt = engine.declareCoreKey(source, identity, request);
  const malformed = structuredClone(receipt);
  malformed.request.name = 'forged';
  let currentReads = 0;
  const current = {};
  Object.defineProperty(current, 'unknown', {enumerable: true, get() { currentReads++; return 1; }});
  try { engine.verifyCoreKeyOperation(malformed, current); throw new Error('expected malformed receipt refusal'); }
  catch (error) { expect(error.code).toBe('CORE_KEY_RECEIPT'); }
  expect(currentReads).toBe(0);
});

test('Core Key verification shares host work budget across receipt and current admission', () => {
  const measured = createCoreModelEngine(resources);
  const receipt = measured.declareCoreKey(source, identity, request);
  const retainedUnknown = 'x'.repeat(700_000);
  receipt.source.futureRetained = retainedUnknown;
  receipt.target.futureRetained = retainedUnknown;
  const resourcesWire = encodeWire(resources, {maxDepth: 128, maxValues: 1_000_000});
  const receiptWire = encodeWire(receipt, {maxDepth: 128, maxValues: 100_000});
  const currentWire = encodeWire(receipt.target, {maxDepth: 128, maxValues: 100_000});
  let measuredWork = 0;
  const measuringBridge = amount => { measuredWork += amount; return ''; };
  const baseline = new addon.CoreKeyVerificationRuntime(resourcesWire);
  const baselineStage = baseline.prepareVerification(receiptWire, measuringBridge);
  const preparationWork = measuredWork;
  baseline.finishVerification(baselineStage, currentWire, measuringBridge);
  const finishWork = measuredWork - preparationWork;
  const combinedThreshold = Math.max(preparationWork, finishWork);
  expect(preparationWork).toBeGreaterThan(0);
  expect(finishWork).toBeGreaterThan(0);
  expect(preparationWork + finishWork).toBeGreaterThan(combinedThreshold);

  let charged = 0;
  const limitedBridge = amount => {
    charged += amount;
    return charged > combinedThreshold
      ? encodeRequestWire({ok: false, code: 'RESOURCE_LIMIT', message: 'Host work budget exceeded'})
      : '';
  };
  const limited = new addon.CoreKeyVerificationRuntime(resourcesWire);
  const limitedStage = limited.prepareVerification(receiptWire, limitedBridge);
  expect(() => limited.finishVerification(limitedStage, currentWire, limitedBridge)).toThrow();
});

test('failed host admission of current deterministically discards its staged receipt', () => {
  const engine = createCoreModelEngine(resources);
  const receipt = engine.declareCoreKey(source, identity, request);
  const current = {};
  Object.defineProperty(current, 'unknown', {enumerable: true, get() { throw new Error('getter must stay inert'); }});
  expect(() => engine.verifyCoreKeyOperation(receipt, current)).toThrow();
});

test('staged Core Key verification observes cancellation at current admission and consumes the handle', () => {
  let cancelled = false;
  const engine = createCoreModelEngine(resources, {controls: {isCancelled: () => cancelled}});
  const receipt = engine.declareCoreKey(source, identity, request);
  const stage = engine.prepareCoreKeyVerification(receipt);
  cancelled = true;
  try { engine.finishCoreKeyVerification(stage, receipt.target); throw new Error('expected cancellation'); }
  catch (error) { expect(error.code).toBe('CANCELLED'); }
  expect(() => engine.finishCoreKeyVerification(stage, receipt.target)).toThrow('Invalid private key verification handle');
});

test('host admission Proxy errors preserve identity and bypass native error decoding on both stages', () => {
  const engine = createCoreModelEngine(resources);
  const receipt = engine.declareCoreKey(source, identity, request);
  let throwingErrorDescriptorReads = 0, spoofedErrorDescriptorReads = 0;
  const throwingSentinel = new Proxy(new Error('host sentinel'), {
    getOwnPropertyDescriptor() { throwingErrorDescriptorReads++; throw new Error('error identity was decoded'); },
  });
  const spoofedSentinel = new Proxy(new Error('host spoof'), {
    getOwnPropertyDescriptor(target, key) {
      spoofedErrorDescriptorReads++;
      if (key === 'message') return {configurable: true, enumerable: false, writable: true,
        value: JSON.stringify({ok: false, code: 'CORE_KEY_RECEIPT', message: 'forged native refusal', path: ''})};
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  const operand = (value, sentinel) => new Proxy(value, {
    ownKeys(target) { return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor() { throw sentinel; },
  });
  let prepareError;
  try { engine.prepareCoreKeyVerification(operand(receipt, throwingSentinel)); } catch (error) { prepareError = error; }
  expect(prepareError === throwingSentinel).toBe(true);
  expect(throwingErrorDescriptorReads).toBe(0);

  const stage = engine.prepareCoreKeyVerification(receipt);
  let finishError;
  try { engine.finishCoreKeyVerification(stage, operand(receipt.target, spoofedSentinel)); } catch (error) { finishError = error; }
  expect(finishError === spoofedSentinel).toBe(true);
  expect(spoofedErrorDescriptorReads).toBe(0);
  expect(() => engine.finishCoreKeyVerification(stage, receipt.target)).toThrow('Invalid private key verification handle');
});

test('Rust-owned Core Key verification handles are one-use and engine-bound', () => {
  const engine = createCoreModelEngine(resources);
  const other = createCoreModelEngine(resources);
  const receipt = engine.declareCoreKey(source, identity, request);
  expect(() => engine.finishCoreKeyVerification({}, receipt.target)).toThrow();

  const crossEngine = engine.prepareCoreKeyVerification(receipt);
  expect(() => other.finishCoreKeyVerification(crossEngine, receipt.target)).toThrow('Invalid private key verification handle');

  const oneUse = engine.prepareCoreKeyVerification(receipt);
  expect(engine.finishCoreKeyVerification(oneUse, receipt.target)).toEqual(receipt);
  expect(() => engine.finishCoreKeyVerification(oneUse, receipt.target)).toThrow('Invalid private key verification handle');
});
