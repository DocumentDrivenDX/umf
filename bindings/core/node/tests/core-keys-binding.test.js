// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {setDefaultTimeout} from 'bun:test';
import {createCoreModelEngine, UmfCoreError} from '../index.js';
import coreSchema from '../../../../spec/core/schema.json' with {type: 'json'};
import referenceSchema from '../../../../spec/core/semantic-type-reference.schema.json' with {type: 'json'};
import packageSchema from '../../../../spec/core/extension-package.schema.json' with {type: 'json'};
import constraints from '../../../../spec/metamodel/generated/core-constraints.json' with {type: 'json'};
import domainPolicy from '../../../../spec/metamodel/generated/domain-policy.json' with {type: 'json'};

const resources = {coreSchema, referenceSchema, packageSchema, constraints, domainPolicy};
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
