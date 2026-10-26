// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {createCoreCardinalityHostInputEngine, UmfCoreError} from '../index.js';
import coreSchema from '../../../../spec/core/schema.json' with {type: 'json'};
import referenceSchema from '../../../../spec/core/semantic-type-reference.schema.json' with {type: 'json'};
import packageSchema from '../../../../spec/core/extension-package.schema.json' with {type: 'json'};
import constraints from '../../../../spec/metamodel/generated/core-constraints.json' with {type: 'json'};
import domainPolicy from '../../../../spec/metamodel/generated/domain-policy.json' with {type: 'json'};

const packet = JSON.parse(readFileSync(new URL('../../../../docs/helix/04-build/evidence/rust-migration/r5-model-bindings/frozen-cardinality-typescript.json', import.meta.url), 'utf8'));
const api = createCoreCardinalityHostInputEngine({coreSchema, referenceSchema, packageSchema, constraints, domainPolicy});

test('private host Cardinality route matches the frozen semantic envelopes', () => {
  expect(api.inspectCoreCardinality(packet.document, packet.identity)).toEqual(packet.inspections.missing.value);
  expect(api.inspectCoreCardinality(packet.known, packet.identity)).toEqual(packet.inspections.known.value);
  expect(api.inspectCoreCardinality(packet.unknown, packet.identity)).toEqual(packet.inspections.unknown.value);
  expect(api.inspectCoreCardinality(packet.inapplicable, packet.identity)).toEqual(packet.inspections.inapplicable.value);
  expect(api.declareCoreCardinality(packet.document, packet.identity, packet.request)).toEqual(packet.declaration);
  expect(api.declareCoreCardinality(packet.surrogateItemDocument, packet.identity, packet.surrogateItemRequest)).toEqual(packet.surrogateItemDeclaration.value);
  expect(api.verifyCoreCardinalityDeclaration(packet.verified.value, packet.verified.value.target)).toEqual(packet.verified.value);
});
test('private host Cardinality route preserves source/identity and request/source reflection order', () => {
  const events = [];
  const source = new Proxy(packet.document, {ownKeys(target) { events.push('source'); return Reflect.ownKeys(target); }});
  const identity = new Proxy(packet.identity, {ownKeys(target) { events.push('identity'); return Reflect.ownKeys(target); }});
  api.inspectCoreCardinality(source, identity);
  expect(events.indexOf('source')).toBeGreaterThanOrEqual(0);
  expect(events.indexOf('identity')).toBeGreaterThan(events.indexOf('source'));

  events.length = 0;
  const invalidRequest = new Proxy({cardinality: 'future'}, {ownKeys(target) { events.push('request'); return Reflect.ownKeys(target); }});
  const sourceProbe = new Proxy(packet.document, {ownKeys(target) { events.push('source'); return Reflect.ownKeys(target); }});
  expect(() => api.declareCoreCardinality(sourceProbe, packet.identity, invalidRequest)).toThrow(
    expect.objectContaining({code: 'CORE_CARDINALITY_REQUEST'}),
  );
  expect(events).toContain('request');
  expect(events).not.toContain('source');

  events.length = 0;
  const sourceBeforeBadIdentity = new Proxy(packet.document, {ownKeys(target) { events.push('source'); return Reflect.ownKeys(target); }});
  const badIdentity = new Proxy({module: '', element: 'e'}, {ownKeys(target) { events.push('identity'); return Reflect.ownKeys(target); }});
  expect(() => api.inspectCoreCardinality(sourceBeforeBadIdentity, badIdentity)).toThrow(
    expect.objectContaining({code: 'CORE_CARDINALITY_IDENTITY'}),
  );
  expect(events.indexOf('source')).toBeGreaterThanOrEqual(0);
  expect(events.indexOf('identity')).toBeGreaterThan(events.indexOf('source'));
});

test('private host Cardinality verifies the receipt before touching current and rethrows host failures unchanged', () => {
  let currentReads = 0;
  const current = new Proxy(packet.document, {ownKeys(target) { currentReads++; return Reflect.ownKeys(target); }});
  expect(() => api.verifyCoreCardinalityDeclaration(packet.malformedSourceReceipt, current)).toThrow();
  expect(currentReads).toBe(0);

  const sentinel = {hostFailure: true};
  const throwingSource = new Proxy(packet.document, {ownKeys() { throw sentinel; }});
  try {
    api.inspectCoreCardinality(throwingSource, packet.identity);
    throw new Error('expected caller host failure');
  } catch (error) {
    expect(error).toBe(sentinel);
  }
});

test('private host Cardinality returns native UMF admission envelopes for hidden, accessor, cycle and number controls', () => {
  const source = structuredClone(packet.document);
  Object.defineProperty(source, 'hidden', {value: true, enumerable: false});
  expect(() => api.inspectCoreCardinality(source, packet.identity)).toThrow(expect.objectContaining({code: 'NON_JSON', path: '/hidden'}));

  const accessor = structuredClone(packet.document);
  Object.defineProperty(accessor, 'future', {get() { throw new Error('getter must not run'); }, enumerable: true});
  expect(() => api.inspectCoreCardinality(accessor, packet.identity)).toThrow(expect.objectContaining({code: 'NON_JSON', path: '/future'}));

  const cyclic = structuredClone(packet.document);
  cyclic.loop = cyclic;
  expect(() => api.inspectCoreCardinality(cyclic, packet.identity)).toThrow(expect.objectContaining({code: 'CYCLE', path: '/loop'}));

  const invalidNumber = structuredClone(packet.document);
  invalidNumber.bad = Number.NaN;
  expect(() => api.inspectCoreCardinality(invalidNumber, packet.identity)).toThrow(expect.objectContaining({code: 'NUMBER', path: '/bad'}));
});

test('private host Cardinality rejects operation and resource controls before resource snapshotting', () => {
  const resourcesTrap = new Proxy({}, {ownKeys() { throw new Error('resource snapshot must not run'); }});
  expect(() => createCoreCardinalityHostInputEngine(resourcesTrap, {controls: {maxWork: 1}})).toThrow(
    expect.objectContaining({code: 'HOST_JSON_CONTROLS_UNSUPPORTED'}),
  );
  expect(() => createCoreCardinalityHostInputEngine(resourcesTrap, {resourceControls: {isCancelled: () => true}})).toThrow(
    expect.objectContaining({code: 'HOST_JSON_CONTROLS_UNSUPPORTED'}),
  );
});
