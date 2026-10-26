// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, setDefaultTimeout, test} from 'bun:test';
import {createRequire} from 'node:module';
import {coreElementSelectionHostInput, coreOpaqueReturnHostInput} from '../src/host-json.js';
import {UmfCoreError} from '../index.js';
import {encodeWire} from '../src/wire.js';
import {directTypescriptWarningSelection} from '../../../../scripts/rust-migration/r8/selection-private-host-direct.mjs';
import {readFileSync} from 'node:fs';
import coreSchema from '../../../../spec/core/schema.json' with {type: 'json'};
import referenceSchema from '../../../../spec/core/semantic-type-reference.schema.json' with {type: 'json'};
import packageSchema from '../../../../spec/core/extension-package.schema.json' with {type: 'json'};
import constraints from '../../../../spec/metamodel/generated/core-constraints.json' with {type: 'json'};
import domainPolicy from '../../../../spec/metamodel/generated/domain-policy.json' with {type: 'json'};

const require = createRequire(import.meta.url);
const addon = require(process.env.UMF_SELECTION_ADDON ?? '../umf_core_node.node');
const resources = {coreSchema, referenceSchema, packageSchema, constraints, domainPolicy};
const packet = JSON.parse(readFileSync(new URL('../../../../scripts/rust-migration/r5/selection/input.json', import.meta.url), 'utf8'));
const frozen = JSON.parse(readFileSync(new URL('../../../../scripts/rust-migration/r5/selection/frozen-typescript.json', import.meta.url), 'utf8'));
setDefaultTimeout(30_000);

test('private opaque return carrier preserves a host object result by identity', () => {
  const receiver = {};
  const argument = {};
  const result = Object.freeze({valid: false, diagnostics: []});
  function validateDocument(document) {
    expect(this).toBe(receiver);
    expect(document).toBe(argument);
    return result;
  }
  expect(coreOpaqueReturnHostInput(addon, validateDocument, receiver, argument, UmfCoreError)).toBe(result);
});

test('private opaque return carrier preserves thrown host values by identity', () => {
  const sentinel = Object.freeze({kind: 'host-validation-failure'});
  try {
    coreOpaqueReturnHostInput(addon, function() { throw sentinel; }, {}, {}, UmfCoreError);
    throw new Error('expected host invocation to throw');
  } catch (error) {
    expect(error).toBe(sentinel);
  }
});

test('private opaque return carrier rejects handles outside the live invocation', () => {
  const forged = {__umf_host_opaque_return_v1: true, handle: 999};
  const fakeAddon = {executeCoreOpaqueReturnHostJson() {
    return JSON.stringify({profile: 'umf.core-wire/1', status: 'ok', wire: encodeWire(forged)});
  }};
  expect(() => coreOpaqueReturnHostInput(fakeAddon, () => ({}), {}, {}, UmfCoreError))
    .toThrow('Malformed opaque host return carrier');
});


test('private host Selection route matches the complete frozen R5 result with an omitted Registry', () => {
  const output = coreElementSelectionHostInput(addon, resources, packet.source, packet.queries.all, undefined, UmfCoreError);
  expect(output).toEqual(frozen.cases.all);
  expect(Object.getPrototypeOf(output)).toBe(null);
  expect(Object.getPrototypeOf(output.source)).toBe(null);
  expect(Object.getPrototypeOf(output.source.modules[0])).toBe(null);
});

test('private host Selection returns TypeScript null-prototype objects and preserves __proto__ as own data', () => {
  const source = structuredClone(packet.source);
  Object.defineProperty(source.extensions.future.opaque, '__proto__', {
    value: {retained: true}, writable: true, enumerable: true, configurable: true,
  });
  const output = coreElementSelectionHostInput(addon, resources, source, packet.queries.all, undefined, UmfCoreError);
  const opaque = output.source.extensions.future.opaque;
  expect(Object.getPrototypeOf(output)).toBe(null);
  expect(Object.getPrototypeOf(output.source.extensions)).toBe(null);
  expect(Object.getPrototypeOf(opaque)).toBe(null);
  expect(Object.hasOwn(opaque, '__proto__')).toBe(true);
  expect(opaque.__proto__).toEqual({retained: true});
  expect(Object.getPrototypeOf(opaque.__proto__)).toBe(null);
  expect(Object.prototype.retained).toBeUndefined();
});

test('private host Selection defers Registry.get until source admission and preserves lookup throw identity', () => {
  const malformedSource = structuredClone(packet.source);
  delete malformedSource.modules[0].elements[0].id;
  const sentinel = {registryTrap: true};
  let calls = 0;
  const registry = {get() { calls++; throw sentinel; }};
  expect(() => coreElementSelectionHostInput(addon, resources, malformedSource, packet.queries.all, registry, UmfCoreError))
    .toThrow(expect.objectContaining({code: 'CORE_SELECTION_SOURCE'}));
  expect(calls).toBe(0);

  const invalidQuery = {references: 'none', names: [17]};
  expect(() => coreElementSelectionHostInput(addon, resources, packet.source, invalidQuery, registry, UmfCoreError))
    .toThrow(expect.objectContaining({code: 'CORE_SELECTION_QUERY'}));
  expect(calls).toBe(0);

  const validRegistry = {get() { calls++; throw sentinel; }};
  try {
    coreElementSelectionHostInput(addon, resources, packet.source, packet.queries.all, validRegistry, UmfCoreError);
    throw new Error('expected Registry.get throw');
  } catch (error) {
    expect(error).toBe(sentinel);
  }
  expect(calls).toBe(1);
});

test('private host Selection checks scope before structure and preserves receiver/order', () => {
  const events = [];
  const scopes = {includes(scope) {
    events.push(`includes:${scope}:${this === scopes}`);
    return false;
  }};
  const manifest = {get scopes() { events.push('scopes'); return scopes; }};
  const registration = {
    get manifest() {
      events.push('manifest');
      return manifest;
    },
    get structure() {
      events.push('structure');
      throw new Error('out of scope must not inspect structure');
    },
  };
  const registry = {get() { events.push('get'); return registration; }};
  expect(() => coreElementSelectionHostInput(addon, resources, packet.source, packet.queries.all, registry, UmfCoreError))
    .toThrow(expect.objectContaining({code: 'CORE_SELECTION_SOURCE'}));
  expect(events).toEqual([
    'get', 'get', 'manifest', 'scopes', 'includes:document:true',
    'get', 'manifest', 'scopes', 'includes:element:true',
  ]);
});

test('private host Selection stringifies ordered structure diagnostics once before refusing', () => {
  const events = [];
  const structure = function(payload) {
    events.push(`structure:${this === registration}:${payload === packet.source.extensions.future.opaque}`);
    return false;
  };
  structure.errors = [
    {instancePath: '/bad', message: 'bad "first" ✨'},
    {instancePath: '/second', message: 'second'},
  ];
  const registration = {
    manifest: {scopes: {includes(scope) { events.push(`includes:${scope}:${this === registration.manifest.scopes}`); return true; }}, capabilities: {validation: 'semantic'}},
    structure,
    get semantics() { events.push('semantics'); throw new Error('must not inspect semantics after invalid structure'); },
  };
  const registry = {get() { events.push('get'); return registration; }};
  const originalStringify = JSON.stringify;
  let diagnosticStringifies = 0;
  JSON.stringify = function(value, ...args) {
    if (Array.isArray(value) && value.length === 6 && value[0]?.code === 'EXTENSION_STRUCTURE') {
      diagnosticStringifies++;
    }
    return Reflect.apply(originalStringify, this, [value, ...args]);
  };
  try {
    coreElementSelectionHostInput(addon, resources, packet.source, packet.queries.all, registry, UmfCoreError);
    throw new Error('expected structure diagnostic materialization boundary');
  } catch (error) {
    expect(error).toBeInstanceOf(UmfCoreError);
    expect(error.code).toBe('CORE_SELECTION_SOURCE');
    expect(error.message).toBe(Reflect.apply(originalStringify, JSON, [[
      {code: 'EXTENSION_STRUCTURE', path: '/extensions/future/bad', message: 'bad "first" ✨', severity: 'error'},
      {code: 'EXTENSION_STRUCTURE', path: '/extensions/future/second', message: 'second', severity: 'error'},
      {code: 'EXTENSION_STRUCTURE', path: '/modules/0/elements/0/extensions/future/bad', message: 'bad "first" ✨', severity: 'error'},
      {code: 'EXTENSION_STRUCTURE', path: '/modules/0/elements/0/extensions/future/second', message: 'second', severity: 'error'},
      {code: 'UNKNOWN_CORE_FIELD', path: '/modules/0/elements/0/references/0/future', message: 'Field retained without interpretation', severity: 'warning'},
      {code: 'UNKNOWN_SCALAR_TYPE', path: '/modules/1/elements/0/scalarType', message: 'Scalar family retained without interpretation', severity: 'warning'},
    ]]));
  } finally {
    JSON.stringify = originalStringify;
  }
  expect(diagnosticStringifies).toBe(1);
  expect(events).toEqual([
    'get', 'get', 'includes:document:true', 'structure:true:false',
    'get', 'includes:element:true', 'structure:true:false',
  ]);
});

test('private host Selection returns successful ordered host structure warnings matching TypeScript', async () => {
  const warningResources = structuredClone(resources);
  warningResources.domainPolicy.extensions.structure.severity = 'warning';
  const warningEvents = [];
  const structure = () => false;
  const errors = [
    {get instancePath() { warningEvents.push('instancePath'); return '/first'; }, get message() { warningEvents.push('message'); return 'first warning'; }},
    {get instancePath() { warningEvents.push('instancePath'); return '/second'; }, get message() { warningEvents.push('message'); return 'second warning'; }},
  ];
  Object.defineProperty(structure, 'errors', {get() { warningEvents.push('errors'); return errors; }});
  const registration = {
    manifest: {scopes: {includes() { return true; }}, capabilities: {validation: 'none'}},
    structure,
  };
  const originalStringify = JSON.stringify;
  let diagnosticStringifies = 0;
  JSON.stringify = function(value, ...args) {
    if (Array.isArray(value) && value[0]?.code === 'EXTENSION_STRUCTURE') diagnosticStringifies++;
    return Reflect.apply(originalStringify, this, [value, ...args]);
  };
  let output;
  try {
    output = coreElementSelectionHostInput(addon, warningResources, packet.source, packet.queries.all,
      {get() { return registration; }}, UmfCoreError);
  } finally {
    JSON.stringify = originalStringify;
  }
  expect(Object.getPrototypeOf(output)).toBe(null);
  expect(Object.getPrototypeOf(output.sourceValidation)).toBe(null);
  expect(diagnosticStringifies).toBe(0);
  const direct = await directTypescriptWarningSelection();
  expect(direct.sourceValidation).toEqual({
    valid: true,
    complete: false,
    diagnostics: [
      {code: 'EXTENSION_STRUCTURE', path: '/extensions/future/first', message: 'first warning', severity: 'warning'},
      {code: 'EXTENSION_STRUCTURE', path: '/extensions/future/second', message: 'second warning', severity: 'warning'},
      {code: 'EXTENSION_STRUCTURE', path: '/modules/0/elements/0/extensions/future/first', message: 'first warning', severity: 'warning'},
      {code: 'EXTENSION_STRUCTURE', path: '/modules/0/elements/0/extensions/future/second', message: 'second warning', severity: 'warning'},
      {code: 'UNKNOWN_CORE_FIELD', path: '/modules/0/elements/0/references/0/future', message: 'Field retained without interpretation', severity: 'warning'},
      {code: 'UNKNOWN_SCALAR_TYPE', path: '/modules/1/elements/0/scalarType', message: 'Scalar family retained without interpretation', severity: 'warning'},
    ],
  });
  expect(JSON.stringify(output.sourceValidation)).toBe(JSON.stringify(direct.sourceValidation));
  expect(direct.rootPrototype).toBe('null');
  expect(direct.validationPrototype).toBe('null');
  expect(warningEvents).toEqual(direct.events);
  expect(direct.diagnosticStringifies).toBe(0);
  expect(direct.registryThrownIdentity).toBe(true);
});

test('private host Selection meters successful host warning string materialization', () => {
  const warningResources = structuredClone(resources);
  warningResources.domainPolicy.extensions.structure.severity = 'warning';
  const structure = () => false;
  structure.errors = [{instancePath: '/large', message: 'x'.repeat(4_000_001)}];
  const registration = {
    manifest: {scopes: {includes() { return true; }}, capabilities: {validation: 'none'}},
    structure,
  };
  expect(() => coreElementSelectionHostInput(addon, warningResources, packet.source, packet.queries.all,
    {get() { return registration; }}, UmfCoreError))
    .toThrow(expect.objectContaining({code: 'LIMIT'}));
});

test('private host Selection catches abrupt spread iterator completion and String(error) in predecessor order', () => {
  const run = select => {
    const events = [];
    const thrown = {toString() { events.push('error:toString'); return 'iterator exploded'; }};
    const registration = {
      manifest: {scopes: {includes(scope) { events.push(`scope:${scope}`); return true; }}, capabilities: {validation: 'semantic'}},
      structure: () => true,
      semantics(payload, context) {
        events.push(`callback:${context.scope}:${context.path}`);
        return {get [Symbol.iterator]() { events.push('iterator:get'); throw thrown; }};
      },
    };
    try {
      select(registration);
      throw new Error('expected semantic iterator failure');
    } catch (error) {
      return {code: error.code, message: error.message, events};
    }
  };
  const rust = run(registration => coreElementSelectionHostInput(addon, resources, packet.source,
    packet.queries.all, {get() { return registration; }}, UmfCoreError));
  // The same-host TypeScript oracle is compared in selection-callback-suite.mjs.
  expect(rust.code).toBe('CORE_SELECTION_SOURCE');
  expect(rust.events).toEqual([
    'scope:document', 'callback:document:/extensions/future', 'iterator:get', 'error:toString',
    'scope:element', 'callback:element:/modules/0/elements/0/extensions/future', 'iterator:get', 'error:toString',
  ]);
  expect(rust.message).toContain('iterator exploded');
});

test('private host Selection preserves structure getter throws by identity', () => {
  const sentinel = {structureGetter: true};
  const registration = {
    manifest: {scopes: {includes() { return true; }}, capabilities: {validation: 'none'}},
    get structure() { throw sentinel; },
  };
  try {
    coreElementSelectionHostInput(addon, resources, packet.source, packet.queries.all, {get() { return registration; }}, UmfCoreError);
    throw new Error('expected structure getter throw');
  } catch (error) {
    expect(error).toBe(sentinel);
  }
});

test('private host Selection retains lone-surrogate native refusal messages', () => {
  const structure = () => false;
  structure.errors = [{instancePath: '/bad', message: 'bad'}];
  const registration = {
    manifest: {scopes: {includes() { return true; }}, capabilities: {validation: 'none'}},
    structure,
  };
  const originalStringify = JSON.stringify;
  let aggregateCalls = 0;
  JSON.stringify = function(value, ...args) {
    if (Array.isArray(value) && value[0]?.code === 'EXTENSION_STRUCTURE') {
      aggregateCalls++;
      return '\ud800';
    }
    return Reflect.apply(originalStringify, this, [value, ...args]);
  };
  try {
    coreElementSelectionHostInput(addon, resources, packet.source, packet.queries.all,
      {get() { return registration; }}, UmfCoreError);
    throw new Error('expected invalid source refusal');
  } catch (error) {
    expect(error).toBeInstanceOf(UmfCoreError);
    expect(error.code).toBe('CORE_SELECTION_SOURCE');
    expect(error.message).toBe('\ud800');
  } finally {
    JSON.stringify = originalStringify;
  }
  expect(aggregateCalls).toBe(1);
});

test('private host Selection preserves proxy errors getter throws by identity', () => {
  const sentinel = {errorsProxy: true};
  const structure = new Proxy(function() { return false; }, {
    get(target, key, receiver) {
      if (key === 'errors') throw sentinel;
      return Reflect.get(target, key, receiver);
    },
  });
  const registration = {
    manifest: {scopes: {includes() { return true; }}, capabilities: {validation: 'none'}},
    structure,
  };
  try {
    coreElementSelectionHostInput(addon, resources, packet.source, packet.queries.all,
      {get() { return registration; }}, UmfCoreError);
    throw new Error('expected proxy errors getter throw');
  } catch (error) {
    expect(error).toBe(sentinel);
  }
});

test('private host Selection refuses nonstring structure messages before later registrations', () => {
  let registryCalls = 0;
  const structure = () => false;
  structure.errors = [{instancePath: '/bad', message: 17}];
  const registration = {
    manifest: {scopes: {includes() { return true; }}, capabilities: {validation: 'none'}},
    structure,
  };
  try {
    coreElementSelectionHostInput(addon, resources, packet.source, packet.queries.all, {
      get() { registryCalls++; return registration; },
    }, UmfCoreError);
    throw new Error('expected malformed structure diagnostic refusal');
  } catch (error) {
    expect(error).toBeInstanceOf(UmfCoreError);
    expect(error.code).toBe('CONSTRAINT_DIAGNOSTIC');
    expect(error.message).toBe('Malformed diagnostic');
  }
  expect(registryCalls).toBe(2);
});

test('private host Selection invokes a bounded semantic callback and preserves an empty diagnostic result', () => {
  let calls = 0;
  const registration = {
    manifest: {scopes: {includes() { return true; }}, capabilities: {validation: 'semantic'}},
    structure() { return true; },
    semantics() { calls++; return []; },
  };
  const result = coreElementSelectionHostInput(addon, resources, packet.source, packet.queries.all,
    {get() { return registration; }}, UmfCoreError);
  expect(calls).toBe(2);
  expect(result.sourceValidation.valid).toBe(true);
  expect(result.sourceValidation.diagnostics).toHaveLength(2);
  expect(result.sourceValidation.diagnostics.map(item => item.code)).toEqual(['UNKNOWN_CORE_FIELD', 'UNKNOWN_SCALAR_TYPE']);
});

test('private host Selection preserves structure iterator throws by identity and order', () => {
  const events = [];
  const sentinel = {structureIterator: true};
  const errors = {
    [Symbol.iterator]() {
      events.push('iterator');
      return {next() { events.push('next'); throw sentinel; }};
    },
  };
  const structure = function() { events.push(`structure:${this === registration}`); return false; };
  Object.defineProperty(structure, 'errors', {get() { events.push('errors'); return errors; }});
  const registration = {
    manifest: {scopes: {includes() { events.push(`includes:${this === registration.manifest.scopes}`); return true; }}},
    get structure() { events.push('structure-property'); return structure; },
  };
  try {
    coreElementSelectionHostInput(addon, resources, packet.source, packet.queries.all,
      {get() { events.push('get'); return registration; }}, UmfCoreError);
    throw new Error('expected structure iterator throw');
  } catch (error) {
    expect(error).toBe(sentinel);
  }
  expect(events).toEqual([
    'get', 'get', 'includes:true', 'structure-property', 'structure:true',
    'structure-property', 'errors', 'iterator', 'next',
  ]);
});
