// SPDX-License-Identifier: MIT OR Apache-2.0
import {test, expect} from 'bun:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {declareCoreBit128Field as typescriptDeclare} from '../../../../src/model/bit128-field.ts';
import {UmfError as TypescriptUmfError} from '../../../../src/model/types.ts';
import {uuidDocument, FIELD} from '../../../../tests/helpers/uuid-fixtures.ts';

const packagePath = process.env.UMF_R8_BIT128_FIELD_NODE_PACKAGE;
const binding = packagePath ? await import(packagePath) : await import('../index.js');
const rootPath = fileURLToPath(new URL('../../../../', import.meta.url));
const json = path => JSON.parse(readFileSync(`${rootPath}/${path}`, 'utf8'));
const resources = {
  coreSchema: json('spec/core/schema.json'),
  referenceSchema: json('spec/core/semantic-type-reference.schema.json'),
  packageSchema: json('spec/core/extension-package.schema.json'),
  constraints: json('spec/metamodel/generated/core-constraints.json'),
  domainPolicy: json('spec/metamodel/generated/domain-policy.json'),
};
const rust = binding.createCoreBit128FieldEngine(resources);

function completeOutcome(run) {
  try { return {status: 'ok', value: JSON.parse(JSON.stringify(run()))}; }
  catch (error) {
    const field = key => {
      for (let current = error; current; current = Object.getPrototypeOf(current)) {
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (descriptor) return Object.hasOwn(descriptor, 'value') ? descriptor.value : '<accessor>';
      }
      return undefined;
    };
    return {status: 'error', name: field('name'), prototypeName: Object.getPrototypeOf(error)?.constructor?.name, code: field('code'), path: field('path'), message: field('message')};
  }
}

function traced(value, label, trace) {
  return new Proxy(value, {
    getPrototypeOf(target) { trace.push(`${label}:prototype`); return Reflect.getPrototypeOf(target); },
    ownKeys(target) { trace.push(`${label}:keys`); return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(target, key) { trace.push(`${label}:descriptor:${String(key)}`); return Reflect.getOwnPropertyDescriptor(target, key); },
  });
}

test('current core Bit128 Field host outcomes match TypeScript and preserve unknown extensions', () => {
  const source = uuidDocument('binary');
  source.modules[0].extensions = {'future.extension': {opaque: [1, {keep: true}]}};
  source.modules[0].elements[1].extensions['future.extension'] = {opaque: {x: 2}};
  source.vocabularies['future.extension'] = {version: '1.0.0'};
  const before = JSON.stringify(source);
  const expected = completeOutcome(() => typescriptDeclare(source, FIELD, 'uuid'));
  const actual = completeOutcome(() => rust.declareCoreBit128Field(source, FIELD, 'uuid'));
  expect(actual).toEqual(expected);
  expect(JSON.stringify(source)).toBe(before);
  expect(actual.value.vocabularies['future.extension']).toEqual({version: '1.0.0'});
  expect(actual.value.modules[0].elements[1].extensions['future.extension']).toEqual({opaque: {x: 2}});
});

test('source copy and identity copy retain predecessor proxy trap ordering', () => {
  const baseSource = uuidDocument('binary');
  baseSource.vocabularies['future.extension'] = {version: '1.0.0'};
  const tsTrace = [];
  const rustTrace = [];
  const tsSource = traced(baseSource, 'source', tsTrace);
  const tsIdentity = traced({...FIELD}, 'identity', tsTrace);
  const rustSource = traced(baseSource, 'source', rustTrace);
  const rustIdentity = traced({...FIELD}, 'identity', rustTrace);
  const expected = completeOutcome(() => typescriptDeclare(tsSource, tsIdentity, 'uuid'));
  const actual = completeOutcome(() => rust.declareCoreBit128Field(rustSource, rustIdentity, 'uuid'));
  expect(actual).toEqual(expected);
  expect(rustTrace).toEqual(tsTrace);
  expect(tsTrace.indexOf('identity:prototype')).toBeGreaterThan(tsTrace.lastIndexOf('source:descriptor:modules'));
});

test('raw wrong identity and scalar values keep complete refusal outcomes', () => {
  let scalarObjectReads = 0;
  const scalarObject = new Proxy({}, {getPrototypeOf() { scalarObjectReads++; throw new Error('must not be touched'); }});
  for (const [identity, scalarType] of [[null, 'uuid'], [FIELD, 7], [FIELD, scalarObject]]) {
    const source = uuidDocument('binary');
    const expected = completeOutcome(() => typescriptDeclare(source, identity, scalarType));
    const actual = completeOutcome(() => rust.declareCoreBit128Field(source, identity, scalarType));
    expect(actual.code).toBe(expected.code);
    expect(actual.name).toBe(expected.name);
    expect(actual.prototypeName).toBe(expected.prototypeName);
    expect(actual.message).toBe(expected.message);
    expect(actual.path).toBe(expected.path);
  }
  let tsError, bindingError;
  try { typescriptDeclare(uuidDocument('binary'), FIELD, 'string'); } catch (error) { tsError = error; }
  try { rust.declareCoreBit128Field(uuidDocument('binary'), FIELD, 'string'); } catch (error) { bindingError = error; }
  expect(tsError).toBeInstanceOf(TypescriptUmfError);
  expect(bindingError).toBeInstanceOf(binding.UmfError);
  // Separate modules have distinct constructors; the public envelope matches,
  // while cross-module instanceof identity remains an explicit limitation.
  expect(bindingError).not.toBeInstanceOf(TypescriptUmfError);
  expect(scalarObjectReads).toBe(0);

  const warned = uuidDocument('binary');
  warned.modules[0].elements[1].facets = {futureRule: true};
  const invalidDomainExpected = completeOutcome(() => typescriptDeclare(warned, FIELD, 'string'));
  const invalidDomainActual = completeOutcome(() => rust.declareCoreBit128Field(warned, FIELD, 'string'));
  expect(invalidDomainActual.code).toBe(invalidDomainExpected.code);
  expect(invalidDomainActual.message).toBe(invalidDomainExpected.message);
  expect(invalidDomainExpected.message).toBe('Explicit128-bit domain required');
}, 60_000);

test('accessors refuse without invocation and proxy exceptions preserve identity', () => {
  const source = uuidDocument('binary');
  let getterCalls = 0;
  Object.defineProperty(source, 'hostile', {enumerable: true, get() { getterCalls++; return true; }});
  const identityEvents = [];
  const observedIdentity = new Proxy(FIELD, {ownKeys(target) { identityEvents.push('identity:keys'); return Reflect.ownKeys(target); }});
  const expected = completeOutcome(() => typescriptDeclare(source, observedIdentity, 'uuid'));
  const actual = completeOutcome(() => rust.declareCoreBit128Field(source, observedIdentity, 'uuid'));
  expect(actual.code).toBe(expected.code);
  expect(actual.name).toBe(expected.name);
  expect(actual.prototypeName).toBe(expected.prototypeName);
  expect(actual.message).toBe(expected.message);
  expect(actual.path).toBe(expected.path);
  expect(getterCalls).toBe(0);
  expect(identityEvents).toEqual([]);

  for (const run of [typescriptDeclare, rust.declareCoreBit128Field.bind(rust)]) {
    const sentinel = Object.freeze({sentinel: true});
    const proxy = new Proxy(uuidDocument('binary'), {ownKeys() { throw sentinel; }});
    const identityEvents = [];
    const identity = new Proxy(FIELD, {ownKeys(target) { identityEvents.push('read'); return Reflect.ownKeys(target); }});
    let thrown;
    try { run(proxy, identity, 'uuid'); } catch (error) { thrown = error; }
    assert.equal(thrown, sentinel);
    expect(identityEvents).toEqual([]);
  }
});
