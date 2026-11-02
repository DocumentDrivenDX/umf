// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {createCoreModelRootKindNullabilityEngine} from '../index.js';
import coreSchema from '../../../../spec/core/schema.json' with {type: 'json'};
import referenceSchema from '../../../../spec/core/semantic-type-reference.schema.json' with {type: 'json'};
import packageSchema from '../../../../spec/core/extension-package.schema.json' with {type: 'json'};
import constraints from '../../../../spec/metamodel/generated/core-constraints.json' with {type: 'json'};
import domainPolicy from '../../../../spec/metamodel/generated/domain-policy.json' with {type: 'json'};
import kindSource from '../../../../tests/rust-core/fixtures/r5/kind-nullability/input.json' with {type: 'json'};
import kindFrozen from '../../../../tests/rust-core/fixtures/r5/kind-nullability/frozen-typescript.json' with {type: 'json'};

const resources = {coreSchema, referenceSchema, packageSchema, constraints, domainPolicy};
// This runtime contains immutable schemas and no per-operation document state.
// Build it once; each assertion still executes the production native host route.
const engine = createCoreModelRootKindNullabilityEngine(resources);
const extension = 'umf.semantic-types';
const annotation = {types: [{vocabulary: 'example.contact', version: '1.0.0', term: 'email', future: {kept: true}}], future: {opaque: true}};

function document() {
  return {
    umf: '0.10.0',
    id: 'semantic-types-host-boundary',
    vocabularies: {[extension]: {version: '0.1.0'}, future: {version: '9.0.0'}},
    modules: [{
      id: 'm',
      namespace: 'example',
      elements: [{
        id: 'e',
        scalarType: 'string',
        extensions: {
          [extension]: structuredClone(annotation),
          future: {domain_type: 'email', recipe: {type: 'native'}},
        },
      }],
    }],
  };
}

test('retained accessors use the shared Rust host-input runtime and preserve copied extension data', () => {
  const source = document();
  const result = engine.getSemanticTypes(source, 'm', 'e');
  expect(result).toEqual(annotation);
  result.types[0].term = 'mutated';
  expect(source.modules[0].elements[0].extensions[extension].types[0].term).toBe('email');

  const replacement = {types: [{vocabulary: 'example.contact', version: '1.0.0', term: 'phone'}], future: {kept: 2}};
  const updated = engine.setSemanticTypes(source, 'm', 'e', replacement);
  expect(updated).not.toBe(source);
  expect(updated.modules[0].elements[0].extensions.future).toEqual({domain_type: 'email', recipe: {type: 'native'}});
  expect(updated.modules[0].elements[0].extensions[extension]).toEqual(replacement);
  expect(source.modules[0].elements[0].extensions[extension]).toEqual(annotation);
});

test('the shared runtime keeps all six existing kind/nullability operations callable', () => {
  const kindReceipt = engine.declareCoreElementKind(kindSource, {module: 'm', element: 'missing'}, 'field');
  const nullabilityReceipt = engine.declareCoreNullability(kindSource, {module: 'm', element: 'missing'}, 'absent-allowed');
  expect(engine.inspectCoreElementKind(kindSource, {module: 'm', element: 'known'})).toEqual(kindFrozen.kind_inspect_known);
  expect(kindReceipt).toEqual(kindFrozen.kind_declare);
  expect(engine.verifyCoreKindDeclaration(kindReceipt, kindReceipt.target)).toEqual(kindFrozen.kind_verify);
  expect(engine.inspectCoreNullability(kindSource, {module: 'm', element: 'missing'})).toEqual(kindFrozen.nullability_inspect_missing);
  expect(nullabilityReceipt).toEqual(kindFrozen.nullability_declare);
  expect(engine.verifyCoreNullabilityDeclaration(nullabilityReceipt, nullabilityReceipt.target)).toEqual(kindFrozen.nullability_verify);
});

test('identity operands retain strict equality and target lookup precedes annotation admission', () => {
  const source = document();
  const identityProxy = new Proxy({}, {get() { throw new Error('identity must not be coerced or inspected'); }});
  expect(() => engine.getSemanticTypes(source, identityProxy, 'e')).toThrow(/Missing semantic type annotation/);
  expect(() => engine.getSemanticTypes(source, 'missing', identityProxy)).toThrow(/Missing semantic type annotation/);

  const annotationError = new TypeError('annotation must remain unread for missing target');
  const annotationProxy = new Proxy({}, {ownKeys() { throw annotationError; }});
  try {
    engine.setSemanticTypes(source, 'm', 'missing', annotationProxy);
    throw new Error('expected missing target failure');
  } catch (error) {
    expect(error).not.toBe(annotationError);
    expect(error).toMatchObject({code: 'SEMANTIC_TYPE_PROFILE'});
  }
});

test('setter structural TypeErrors occur at the predecessor profile and target checkpoints', () => {
  for (const malformed of [
    {},
    {vocabularies: null, modules: []},
    {vocabularies: {[extension]: {version: '0.1.0'}}, modules: null},
  ]) {
    expect(() => engine.setSemanticTypes(malformed, 'm', 'e', annotation)).toThrow(TypeError);
  }
});

test('source-copy host exceptions preserve their original identity before identity lookup', () => {
  const sourceError = new TypeError('source proxy failed during JSON admission');
  const source = new Proxy(document(), {ownKeys() { throw sourceError; }});
  try {
    engine.getSemanticTypes(source, 'm', 'e');
    throw new Error('expected source proxy failure');
  } catch (error) {
    expect(error).toBe(sourceError);
  }
});
