// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, setDefaultTimeout, test} from 'bun:test';
import {createRequire} from 'node:module';
import {coreElementSelectionHostInput, coreOpaqueReturnHostInput, kindRuntimeValidationHostInput} from '../src/host-json.js';
import {UmfCoreError} from '../index.js';
import {validateDocument as typescriptValidateDocument} from '../../../../dist/umf-node.js';
import {selectCoreElements as typescriptSelectCoreElements} from '../../../../dist/umf-node.js';
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

test('private kindRuntime stage matches caller delegation order, receivers, arguments, and result identity', () => {
  const source = Object.freeze({document: true});
  const registrations = Object.freeze([{name: 'owned'}]);
  const result = Object.freeze({valid: false, diagnostics: []});
  const trace = [];
  const runtime = Object.defineProperty({}, 'validateDocument', {
    get() {
      trace.push('runtime.validateDocument:get');
      return function(input, actualRegistrations) {
        trace.push('runtime.validateDocument:call');
        expect(this).toBe(runtime);
        expect(input).toBe(source);
        expect(actualRegistrations).toBe(registrations);
        return result;
      };
    },
  });
  const registry = Object.defineProperties({}, {
    kindRuntime: {get() { trace.push('registry.kindRuntime:get'); return runtime; }},
    registrations: {get() {
      trace.push('registry.registrations:get');
      return function() {
        trace.push('registry.registrations:call');
        expect(this).toBe(registry);
        return registrations;
      };
    }},
  });

  const referenceTrace = [];
  const referenceRuntime = Object.defineProperty({}, 'validateDocument', {
    get() {
      referenceTrace.push('runtime.validateDocument:get');
      return function(input, actualRegistrations) {
        referenceTrace.push('runtime.validateDocument:call');
        expect(this).toBe(referenceRuntime);
        expect(input).toBe(source);
        expect(actualRegistrations).toBe(registrations);
        return result;
      };
    },
  });
  const referenceRegistry = Object.defineProperties({}, {
    kindRuntime: {get() { referenceTrace.push('registry.kindRuntime:get'); return referenceRuntime; }},
    registrations: {get() {
      referenceTrace.push('registry.registrations:get');
      return function() {
        referenceTrace.push('registry.registrations:call');
        expect(this).toBe(referenceRegistry);
        return registrations;
      };
    }},
  });

  expect(typescriptValidateDocument(source, referenceRegistry)).toBe(result);
  expect(kindRuntimeValidationHostInput(addon, source, registry, UmfCoreError)).toBe(result);
  expect(trace).toEqual(referenceTrace);
  expect(trace).toEqual([
    'registry.kindRuntime:get', 'registry.kindRuntime:get',
    'runtime.validateDocument:get', 'registry.registrations:get',
    'registry.registrations:call', 'runtime.validateDocument:call',
  ]);
});

test('private kindRuntime stage preserves the exact thrown value from caller callbacks', () => {
  const source = {};
  const sentinel = Object.freeze({validationFailure: true});
  const runtime = {validateDocument() { throw sentinel; }};
  const registry = {kindRuntime: runtime, registrations() { return []; }};
  try {
    kindRuntimeValidationHostInput(addon, source, registry, UmfCoreError);
    throw new Error('expected validation callback to throw');
  } catch (error) {
    expect(error).toBe(sentinel);
  }
});

test('private kindRuntime stage refuses a falsy runtime instead of entering a default route', () => {
  expect(() => kindRuntimeValidationHostInput(addon, {}, {kindRuntime: null}, UmfCoreError))
    .toThrow('Caller Registry has no truthy kindRuntime for the private delegation route');
});

test('private kindRuntime stage returns primitive and identity-bearing results unchanged', () => {
  const values = [undefined, null, false, -0, NaN, Infinity, -Infinity, 'validation', Object.freeze({valid: true}),
    function validationResult() {}, Symbol('validation'), 17n];
  for (const value of values) {
    const source = {};
    const registrations = [];
    const trace = [];
    const referenceTrace = [];
    let activeTrace = referenceTrace;
    const runtime = {validateDocument(input, actualRegistrations) {
      activeTrace.push('validateDocument:call');
      expect(this).toBe(runtime);
      expect(input).toBe(source);
      expect(actualRegistrations).toBe(registrations);
      return value;
    }};
    let runtimeReads = 0;
    const registry = {
      get kindRuntime() { trace.push('kindRuntime:get'); runtimeReads++; return runtime; },
      registrations() { trace.push('registrations:call'); return registrations; },
    };
    const referenceRegistry = {
      get kindRuntime() { referenceTrace.push('kindRuntime:get'); return runtime; },
      registrations() { referenceTrace.push('registrations:call'); return registrations; },
    };
    expect(Object.is(typescriptValidateDocument(source, referenceRegistry), value)).toBe(true);
    activeTrace = trace;
    const actual = kindRuntimeValidationHostInput(addon, source, registry, UmfCoreError);
    expect(Object.is(actual, value)).toBe(true);
    expect(trace).toEqual(referenceTrace);
    expect(runtimeReads).toBe(2);
  }
});

test('private kindRuntime stage uses the second dynamic runtime read and preserves its failure', () => {
  for (const secondRuntime of [null, Object.defineProperty({}, 'validateDocument', {get() {
    throw new Error('second runtime getter');
  }})]) {
    const firstRuntime = {};
    const trace = [];
    const referenceTrace = [];
    let reads = 0;
    const registry = {
      get kindRuntime() { trace.push('kindRuntime:get'); return ++reads === 1 ? firstRuntime : secondRuntime; },
      registrations() { trace.push('registrations:call'); return []; },
    };
    let referenceReads = 0;
    const referenceRegistry = {
      get kindRuntime() { referenceTrace.push('kindRuntime:get'); return ++referenceReads === 1 ? firstRuntime : secondRuntime; },
      registrations() { referenceTrace.push('registrations:call'); return []; },
    };
    let expected;
    let actual;
    try { typescriptValidateDocument({}, referenceRegistry); } catch (error) { expected = error; }
    try { kindRuntimeValidationHostInput(addon, {}, registry, UmfCoreError); } catch (error) { actual = error; }
    expect(actual).toBeInstanceOf(expected.constructor);
    expect(actual.constructor).toBe(expected.constructor);
    expect(trace).toEqual(referenceTrace);
  }
});


test('private host Selection route matches the complete frozen R5 result with an omitted Registry', () => {
  const output = coreElementSelectionHostInput(addon, resources, packet.source, packet.queries.all, undefined, UmfCoreError);
  expect(output).toEqual(frozen.cases.all);
  expect(Object.getPrototypeOf(output)).toBe(null);
  expect(Object.getPrototypeOf(output.source)).toBe(null);
  expect(Object.getPrototypeOf(output.source.modules[0])).toBe(null);
});

test('private Selection kindRuntime reads result.valid at the consumer branch before refusing the continuation', () => {
  const referenceTrace = [];
  const actualTrace = [];
  const makeRegistry = trace => {
    const result = Object.defineProperty({}, 'valid', {
      get() { trace.push('validation.valid:get'); return true; },
    });
    const runtime = {validateDocument(source, registrations) {
      trace.push('kindRuntime.validateDocument:call');
      expect(this).toBe(runtime);
      expect(source).toEqual(packet.source);
      expect(Object.getPrototypeOf(source)).toBe(null);
      expect(Object.getPrototypeOf(source.modules[0])).toBe(null);
      expect(registrations).toEqual([]);
      return result;
    }};
    return {
      get kindRuntime() { trace.push('registry.kindRuntime:get'); return runtime; },
      registrations() { trace.push('registry.registrations:call'); return []; },
    };
  };

  const referenceRegistry = makeRegistry(referenceTrace);
  try {
    typescriptSelectCoreElements(packet.source, packet.queries.all, referenceRegistry);
  } catch (error) {
    // The final sourceValidation copy rejects this non-enumerable accessor
    // after `.valid` was read; this stage compares the observable prefix only.
    expect(error.code).toBe('NON_JSON');
  }
  const actualRegistry = makeRegistry(actualTrace);
  expect(() => coreElementSelectionHostInput(
    addon, resources, packet.source, packet.queries.all, actualRegistry, UmfCoreError,
  )).toThrow(expect.objectContaining({
    code: 'HOST_JSON_UNSUPPORTED',
    message: 'Caller kindRuntime Selection success stops before sourceValidation materialization',
  }));
  expect(actualTrace.at(-1)).toBe('validation.valid:get');
  expect(referenceTrace.slice(0, actualTrace.length)).toEqual(actualTrace);
});

test('private Selection kindRuntime preserves a thrown result.valid getter value and stops at that read', () => {
  const sentinel = Object.freeze({validGetter: 'thrown'});
  const trace = [];
  const registry = {
    kindRuntime: {validateDocument() {
      return Object.defineProperty({}, 'valid', {get() { trace.push('valid:get'); throw sentinel; }});
    }},
    registrations() { trace.push('registrations:call'); return []; },
  };
  try {
    coreElementSelectionHostInput(addon, resources, packet.source, packet.queries.all, registry, UmfCoreError);
    throw new Error('expected result.valid getter failure');
  } catch (error) {
    expect(error).toBe(sentinel);
  }
  expect(trace).toEqual(['registrations:call', 'valid:get']);
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

test('private host Selection admits the complete source before reflecting the query', () => {
  const sourceEvents = [];
  const queryEvents = [];
  const trace = [];
  const traced = (value, label, events) => new Proxy(value, {
    getPrototypeOf(target) { events.push(`${label}:prototype`); return Reflect.getPrototypeOf(target); },
    ownKeys(target) { events.push(`${label}:keys`); return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(target, key) {
      events.push(`${label}:descriptor:${String(key)}`);
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  const source = traced(packet.source, 'source', sourceEvents);
  const query = traced(packet.queries.all, 'query', queryEvents);
  const expected = typescriptSelectCoreElements(source, query);
  trace.push(...sourceEvents, ...queryEvents);

  sourceEvents.length = 0;
  queryEvents.length = 0;
  let actual;
  let rawResponse;
  const observedAddon = new Proxy(addon, {
    get(target, key) {
      const member = Reflect.get(target, key, target);
      if (key !== 'executeCoreElementSelectionHostJson' || typeof member !== 'function') return member;
      return function(...args) {
        const response = Reflect.apply(member, target, args);
        rawResponse = typeof response === 'string' ? JSON.parse(response) : response;
        return response;
      };
    },
  });
  actual = coreElementSelectionHostInput(observedAddon, resources, source, query, undefined, UmfCoreError);
  expect([...sourceEvents, ...queryEvents]).toEqual(trace);
  expect(sourceEvents.length).toBeGreaterThan(0);
  expect(queryEvents.length).toBeGreaterThan(0);
  const rawWire = typeof rawResponse?.wire === 'string' ? JSON.parse(rawResponse.wire) : undefined;
  expect(rawResponse?.status).toBe('ok');
  expect(rawResponse?.code).toBeUndefined();
  expect(rawWire?.kind).toBe('object');
  expect(actual).toEqual(expected);
});

test('private host Selection source first-fault admission never reflects the query', () => {
  const sentinel = Object.freeze({sourceAdmission: 'first fault'});
  let queryReflections = 0;
  const source = new Proxy(packet.source, {
    getPrototypeOf() { throw sentinel; },
  });
  const query = new Proxy(packet.queries.all, {
    getPrototypeOf(target) { queryReflections++; return Reflect.getPrototypeOf(target); },
    ownKeys(target) { queryReflections++; return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(target, key) { queryReflections++; return Reflect.getOwnPropertyDescriptor(target, key); },
  });
  try {
    coreElementSelectionHostInput(addon, resources, source, query, undefined, UmfCoreError);
    throw new Error('expected source reflection failure');
  } catch (error) {
    expect(error).toBe(sentinel);
  }
  expect(queryReflections).toBe(0);
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

test('private host Selection matches the registered and per-payload callback demand schedule', () => {
  const source = structuredClone(packet.source);
  source.vocabularies = {
    future: {version: '1.0.0'}, alpha: {version: '2.0.0'}, beta: {version: '3.0.0'},
  };
  source.extensions = {alpha: {at: 'document-alpha'}, future: {at: 'document-future'}};
  source.modules[0].elements[0].extensions = {
    beta: {at: 'element-beta'}, future: {at: 'element-future'},
  };

  const run = select => {
    const events = [];
    let entry;
    entry = {
      get structure() {
        events.push('entry.structure');
        return function(payload) {
          events.push(`structure:${payload.at}:receiver=${this === entry}`);
          return true;
        };
      },
      get semantics() {
        events.push('entry.semantics');
        return function(payload, context) {
          events.push(`semantics:${payload.at}:${context.scope}:receiver=${this === entry}`);
          expect(Object.getPrototypeOf(payload)).toBe(null);
          expect(Object.getPrototypeOf(context)).not.toBe(null);
          expect(Object.getPrototypeOf(context.document)).toBe(null);
          expect(context.path).toBe(payload.at.startsWith('document-')
            ? `/extensions/${payload.at.slice('document-'.length)}`
            : `/modules/0/elements/0/extensions/${payload.at.slice('element-'.length)}`);
          return [{
            code: `CALLBACK_${payload.at.toUpperCase().replaceAll('-', '_')}`,
            path: context.path,
            message: `observed ${payload.at}`,
            severity: 'warning',
            origin: {scope: context.scope, retained: true},
          }];
        };
      },
    };
    Object.defineProperty(entry, 'manifest', {get() {
      events.push('entry.manifest');
      const scopes = {includes(scope) {
        events.push(`scopes.includes:${scope}:receiver=${this === scopes}`);
        return true;
      }};
      return {
        get scopes() { events.push('manifest.scopes'); return scopes; },
        get capabilities() {
          events.push('manifest.capabilities');
          return {validation: 'semantic'};
        },
      };
    }});
    let registry;
    registry = new Proxy({}, {get(_target, key) {
      if (key === 'get') return function(id, version) {
        events.push(`get:${id}@${version}:receiver=${this === registry}`);
        return entry;
      };
      return undefined;
    }});
    const result = select(source, {references: 'none'}, registry);
    return {events, result};
  };

  const reference = run((sourceValue, query, registry) =>
    typescriptSelectCoreElements(sourceValue, query, registry));
  const actual = run((sourceValue, query, registry) =>
    coreElementSelectionHostInput(addon, resources, sourceValue, query, registry, UmfCoreError));
  const expected = [
    'get:future@1.0.0:receiver=true', 'get:alpha@2.0.0:receiver=true', 'get:beta@3.0.0:receiver=true',
  ];
  for (const [id, version, scope, payload] of [
    ['alpha', '2.0.0', 'document', 'document-alpha'],
    ['future', '1.0.0', 'document', 'document-future'],
    ['beta', '3.0.0', 'element', 'element-beta'],
    ['future', '1.0.0', 'element', 'element-future'],
  ]) {
    expected.push(`get:${id}@${version}:receiver=true`, 'entry.manifest', 'manifest.scopes',
      `scopes.includes:${scope}:receiver=true`, 'entry.structure', `structure:${payload}:receiver=true`,
      'entry.manifest', 'manifest.capabilities', 'entry.semantics', 'entry.semantics',
      `semantics:${payload}:${scope}:receiver=true`);
  }
  expect(reference.events).toEqual(expected);
  expect(actual.events).toEqual(expected);
  expect(JSON.stringify(actual.result)).toBe(JSON.stringify(reference.result));
  expect(actual.result.sourceValidation.diagnostics.slice(0, 4)).toEqual([
    {code: 'CALLBACK_DOCUMENT_ALPHA', path: '/extensions/alpha', message: 'observed document-alpha', severity: 'warning', origin: {scope: 'document', retained: true}},
    {code: 'CALLBACK_DOCUMENT_FUTURE', path: '/extensions/future', message: 'observed document-future', severity: 'warning', origin: {scope: 'document', retained: true}},
    {code: 'CALLBACK_ELEMENT_BETA', path: '/modules/0/elements/0/extensions/beta', message: 'observed element-beta', severity: 'warning', origin: {scope: 'element', retained: true}},
    {code: 'CALLBACK_ELEMENT_FUTURE', path: '/modules/0/elements/0/extensions/future', message: 'observed element-future', severity: 'warning', origin: {scope: 'element', retained: true}},
  ]);
});

test('private host Selection converts semantic throws and preserves a throwing String conversion by identity', () => {
  const makeRegistry = semantics => ({get() {
    return {
      manifest: {scopes: {includes() { return true; }}, capabilities: {validation: 'semantic'}},
      structure() { return true; },
      semantics,
    };
  }});
  const callbackFailure = new Error('semantic callback failed');
  const referenceFailure = (() => {
    try {
      typescriptSelectCoreElements(packet.source, packet.queries.all, makeRegistry(() => { throw callbackFailure; }));
      return undefined;
    } catch (error) { return error; }
  })();
  const rustFailure = (() => {
    try {
      coreElementSelectionHostInput(addon, resources, packet.source, packet.queries.all,
        makeRegistry(() => { throw callbackFailure; }), UmfCoreError);
      return undefined;
    } catch (error) { return error; }
  })();
  expect(rustFailure).toBeInstanceOf(UmfCoreError);
  expect(rustFailure.code).toBe(referenceFailure.code);
  expect(rustFailure.message).toBe(referenceFailure.message);
  expect(rustFailure.code).toBe('CORE_SELECTION_SOURCE');
  expect(rustFailure.message).toContain('VALIDATOR_FAILURE');

  const referenceSentinel = {toString() { throw referenceSentinel; }};
  const rustSentinel = {toString() { throw rustSentinel; }};
  const captureThrow = (select, sentinel) => {
    try {
      select(() => { throw sentinel; });
      return undefined;
    } catch (error) { return error; }
  };
  const referenceConversionThrow = captureThrow(semantics =>
    typescriptSelectCoreElements(packet.source, packet.queries.all, makeRegistry(semantics)), referenceSentinel);
  const rustConversionThrow = captureThrow(semantics =>
    coreElementSelectionHostInput(addon, resources, packet.source, packet.queries.all,
      makeRegistry(semantics), UmfCoreError), rustSentinel);
  expect(referenceConversionThrow).toBe(referenceSentinel);
  expect(rustConversionThrow).toBe(rustSentinel);
});
