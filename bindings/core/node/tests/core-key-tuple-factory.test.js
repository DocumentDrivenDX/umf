// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, setDefaultTimeout, test} from 'bun:test';
import {createCoreKeyTupleEngine, createCoreModelEngine, createCoreModelRootEngine, createCoreModelRootKeyTupleEngine} from '../index.js';
import {createRequire} from 'node:module';
import coreSchema from '../../../../spec/core/schema.json' with {type: 'json'};
import referenceSchema from '../../../../spec/core/semantic-type-reference.schema.json' with {type: 'json'};
import packageSchema from '../../../../spec/core/extension-package.schema.json' with {type: 'json'};
import constraints from '../../../../spec/metamodel/generated/core-constraints.json' with {type: 'json'};
import domainPolicy from '../../../../spec/metamodel/generated/domain-policy.json' with {type: 'json'};
import frozen from '../../../../docs/helix/04-build/evidence/rust-migration/r5-core-key-tuple/frozen-typescript.json' with {type: 'json'};

const resources = {coreSchema, referenceSchema, packageSchema, constraints, domainPolicy};
const addon = createRequire(import.meta.url)('../umf_core_node.node');
const item = frozen.cases['empty-string-present'];
setDefaultTimeout(120_000);

test('Core Key tuple factory admits resources eagerly without invoking accessors', () => {
  let getterCalled = false;
  const accessorResources = {coreSchema, referenceSchema, packageSchema, domainPolicy};
  Object.defineProperty(accessorResources, 'constraints', {enumerable: true, get() { getterCalled = true; return constraints; }});
  expect(() => createCoreKeyTupleEngine(accessorResources)).toThrow('enumerable data property');
  expect(getterCalled).toBe(false);
  expect(() => createCoreKeyTupleEngine(resources, {resourceControls: {maxWork: 0}})).toThrow('Host work budget exceeded');
});

test('public model factory retains eager tuple admission while root-only factory omits tuple APIs and setup', () => {
  const OriginalRuntime = addon.CoreKeyTupleRuntime;
  let runtimeConstructions = 0;
  addon.CoreKeyTupleRuntime = class {
    constructor(...args) {
      runtimeConstructions++;
      return new OriginalRuntime(...args);
    }
  };
  try {
    let rootSetupWork = 0;
    const rootModel = createCoreModelRootEngine(resources, {
      resourceControls: {meter(amount) { rootSetupWork += amount; }},
    });
    expect(rootSetupWork).toBeGreaterThan(0);
    expect(runtimeConstructions).toBe(0);
    for (const name of ['encodeCoreKeyTuple', 'verifyCoreKeyTuple', 'readCoreKeyTupleBytes', 'prepareCoreKeyTuples']) {
      expect(Object.hasOwn(rootModel, name)).toBe(false);
    }

    expect(() => createCoreModelEngine(resources, {resourceControls: {maxWork: rootSetupWork}})).toThrow('Host work budget exceeded');
    expect(runtimeConstructions).toBe(1);
    const publicModel = createCoreModelEngine(resources);
    expect(runtimeConstructions).toBe(2);
    for (const name of ['encodeCoreKeyTuple', 'verifyCoreKeyTuple', 'readCoreKeyTupleBytes', 'prepareCoreKeyTuples']) {
      expect(Object.hasOwn(publicModel, name)).toBe(true);
    }
  } finally {
    addon.CoreKeyTupleRuntime = OriginalRuntime;
  }
});

test('default-root tuple slice exposes only Rust byte reads and prepared sources', () => {
  const engine = createCoreModelRootKeyTupleEngine(resources);
  expect(Object.hasOwn(engine, 'encodeCoreKeyTuple')).toBe(false);
  expect(Object.hasOwn(engine, 'verifyCoreKeyTuple')).toBe(false);
  expect(Object.hasOwn(engine, 'readCoreKeyTupleBytes')).toBe(true);
  expect(Object.hasOwn(engine, 'prepareCoreKeyTuples')).toBe(true);

  const receipt = frozen.outcomes['empty-string-present'].value;
  expect(engine.readCoreKeyTupleBytes(receipt, item.source)).toEqual(Uint8Array.from(Buffer.from(receipt.bytesHex, 'hex')));
  let currentReads = 0;
  const current = Object.defineProperty({}, 'umf', {enumerable: true, get() { currentReads++; throw new Error('must remain unread'); }});
  expect(() => engine.readCoreKeyTupleBytes({}, current)).toThrow();
  expect(currentReads).toBe(0);

  const source = structuredClone(item.source);
  const prepared = engine.prepareCoreKeyTuples(source);
  source.modules[0].elements[0].name = 'mutated after preparation';
  expect(Object.keys(prepared)).toEqual(['profile', 'source', 'encode', 'verify']);
  expect(Object.isFrozen(prepared)).toBe(true);
  expect(Object.isFrozen(prepared.source)).toBe(true);
  expect(prepared.source).toEqual(item.source);
  expect(prepared.encode(item.identity, item.values)).toEqual(receipt);
  expect(prepared.verify(receipt)).toEqual(receipt);

  const maximumReceipt = prepared.encode(item.identity, [{string: 'x'.repeat(3_999_989)}]);
  expect(engine.readCoreKeyTupleBytes(maximumReceipt, item.source)).toHaveLength(4_000_000);
  expect(() => prepared.encode(item.identity, [{string: 'x'.repeat(3_999_990)}])).toThrow();
});

test('retained Core Key runtime snapshots resources and gives each call a fresh work ledger', () => {
  let callWork = 0;
  const calibration = createCoreKeyTupleEngine(resources, {
    controls: {meter(amount) { callWork += amount; }},
    resourceControls: {},
  });
  calibration.encodeCoreKeyTuple(item.source, item.identity, item.values);
  expect(callWork).toBeGreaterThan(0);

  const engine = createCoreKeyTupleEngine(resources, {
    controls: {maxWork: callWork},
    resourceControls: {},
  });
  expect(Object.keys(engine)).toEqual(['encodeCoreKeyTuple', 'verifyCoreKeyTuple', 'readCoreKeyTupleBytes', 'prepareCoreKeyTuples']);
  const expected = frozen.outcomes['empty-string-present'].value;
  expect(engine.encodeCoreKeyTuple(item.source, item.identity, item.values)).toEqual(expected);
  expect(engine.encodeCoreKeyTuple(item.source, item.identity, item.values)).toEqual(expected);

  resources.coreSchema = {};
  expect(engine.encodeCoreKeyTuple(item.source, item.identity, item.values)).toEqual(expected);
});

test('raw byte allocation is charged before the host copy and preserves late budget refusal', () => {
  const localResources = {coreSchema, referenceSchema, packageSchema, constraints, domainPolicy};
  const receipt = frozen.outcomes['empty-string-present'].value;
  let measured = 0;
  const calibration = createCoreKeyTupleEngine(localResources, {
    controls: {meter(amount) { measured += amount; }},
    resourceControls: {},
  });
  const bytes = calibration.readCoreKeyTupleBytes(receipt, item.source);
  expect(bytes).toBeInstanceOf(Uint8Array);
  expect(measured).toBeGreaterThan(bytes.byteLength);

  const beforeCopy = measured - bytes.byteLength;
  const limited = createCoreKeyTupleEngine(localResources, {
    controls: {maxWork: measured - 1},
    resourceControls: {},
  });
  expect(() => limited.readCoreKeyTupleBytes(receipt, item.source)).toThrow('Host work budget exceeded');

  const copyBoundary = createCoreKeyTupleEngine(localResources, {
    controls: {maxWork: beforeCopy},
    resourceControls: {},
  });
  expect(() => copyBoundary.readCoreKeyTupleBytes(receipt, item.source)).toThrow('Host work budget exceeded');
});

test('opt-in public encode, verify and byte-read select retained direct Rust methods', () => {
  const engine = createCoreKeyTupleEngine({coreSchema, referenceSchema, packageSchema, constraints, domainPolicy});
  let encoded = 0;
  for (const [id, item] of Object.entries(frozen.cases)) {
    if (id === 'integer-host-number') continue;
    const options = item.profile === undefined ? undefined : {profile: item.profile};
    let actual;
    try { actual = {ok: true, value: engine.encodeCoreKeyTuple(item.source, item.identity, item.values, options)}; }
    catch (error) { actual = {ok: false, error: {code: error.code, message: error.message, path: error.path}}; }
    expect(actual).toEqual(frozen.outcomes[id]);
    encoded++;
  }
  expect(encoded).toBe(87);

  const prepared = engine.prepareCoreKeyTuples(item.source);
  expect(Object.keys(prepared)).toEqual(['profile', 'source', 'encode', 'verify']);
  expect(Object.isFrozen(prepared)).toBe(true);
  const preparedReceipt = frozen.outcomes['empty-string-present'].value;
  expect(prepared.encode(item.identity, item.values)).toEqual(preparedReceipt);
  expect(prepared.verify(preparedReceipt)).toEqual(preparedReceipt);

  let verified = 0;
  for (const [id, item] of Object.entries(frozen.verificationCases)) {
    try {
      engine.verifyCoreKeyTuple(item.receipt, item.current);
      throw new Error(`Expected frozen refusal ${id}`);
    } catch (error) {
      expect({code: error.code, message: error.message, path: error.path}).toEqual(frozen.verificationOutcomes[id].error);
      verified++;
    }
  }
  expect(verified).toBe(5);

  const receipt = frozen.outcomes['empty-string-present'].value;
  expect(engine.readCoreKeyTupleBytes(receipt, item.source)).toEqual(Uint8Array.from(Buffer.from(receipt.bytesHex, 'hex')));

  let currentReads = 0;
  const current = Object.defineProperty({}, 'umf', {enumerable: true, get() { currentReads++; throw new Error('must remain unread'); }});
  expect(() => engine.verifyCoreKeyTuple({}, current)).toThrow();
  expect(currentReads).toBe(0);
});

test('public receipt-first verify keeps one cumulative maxWork ledger across both Rust stages', () => {
  const receipt = frozen.outcomes['empty-string-present'].value;
  const current = frozen.cases['empty-string-present'].source;
  const stages = {receipt: 0, current: 0};
  let phase = 'receipt';
  const stagedCurrent = new Proxy(current, {
    getPrototypeOf(target) { phase = 'current'; return Reflect.getPrototypeOf(target); },
  });
  const measured = createCoreKeyTupleEngine({coreSchema, referenceSchema, packageSchema, constraints, domainPolicy}, {
    controls: {meter(amount) { stages[phase] += amount; }}, resourceControls: {},
  });
  expect(measured.verifyCoreKeyTuple(receipt, stagedCurrent)).toEqual(receipt);
  expect(stages.receipt).toBeGreaterThan(0);
  expect(stages.current).toBeGreaterThan(0);
  const independentMaximum = Math.max(stages.receipt, stages.current);
  expect(stages.receipt + stages.current).toBeGreaterThan(independentMaximum);

  const limited = createCoreKeyTupleEngine({coreSchema, referenceSchema, packageSchema, constraints, domainPolicy}, {
    controls: {maxWork: independentMaximum}, resourceControls: {},
  });
  phase = 'receipt';
  expect(() => limited.verifyCoreKeyTuple(receipt, stagedCurrent)).toThrow('Host work budget exceeded');
});

test('direct encode retains per-argument admission and source/identity/values/options access order', () => {
  const engine = createCoreKeyTupleEngine({coreSchema, referenceSchema, packageSchema, constraints, domainPolicy});
  const order = [];
  const trace = (name, target) => new Proxy(target, {
    ownKeys() { order.push(name); return Reflect.ownKeys(target); },
  });
  try { engine.encodeCoreKeyTuple(trace('source', item.source), trace('identity', item.identity), trace('values', item.values), trace('options', {profile: 'umf-key-tuple-v1'})); } catch {}
  expect(order).toEqual(['source', 'source', 'identity', 'identity', 'values', 'options', 'options']);

  const valuesBelowLocalLimit = Array.from({length: 49_999}, () => ({string: 'x'}));
  let combined;
  try { engine.encodeCoreKeyTuple(item.source, item.identity, valuesBelowLocalLimit); }
  catch (error) { combined = error; }
  expect(combined?.message).not.toBe('JSON value count exceeds the admission limit');
  const expected = frozen.outcomes['empty-string-present'].value;
  expect(engine.encodeCoreKeyTuple(item.source, item.identity, item.values)).toEqual(expected);
  expect(engine.encodeCoreKeyTuple(item.source, item.identity, item.values, undefined)).toEqual(expected);

  let optionsObserved = false;
  const options = new Proxy({}, {ownKeys() { optionsObserved = true; return []; }});
  let identityFailure;
  try { engine.encodeCoreKeyTuple(item.source, {}, item.values, options); }
  catch (error) { identityFailure = {code: error.code, message: error.message, path: error.path}; }
  expect(identityFailure).toEqual({code: 'KEY_TUPLE_IDENTITY', message: 'Explicit Record and stable Key identities are required', path: '/identity'});
  expect(optionsObserved).toBe(false);

  let sourceOptionsObserved = false;
  const sourceOptions = new Proxy({}, {ownKeys() { sourceOptionsObserved = true; return []; }});
  let sourceFailure;
  try { engine.encodeCoreKeyTuple({umf: '0.9.0'}, item.identity, item.values, sourceOptions); }
  catch (error) { sourceFailure = {code: error.code, message: error.message, path: error.path}; }
  expect(sourceFailure).toEqual({code: 'KEY_TUPLE_SOURCE', message: 'Expected current core 0.10.0 document', path: '/source/umf'});
  expect(sourceOptionsObserved).toBe(false);
});
