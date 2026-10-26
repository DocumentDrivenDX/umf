// SPDX-License-Identifier: MIT OR Apache-2.0
// @ts-expect-error The private JavaScript host bridge has no declaration file.
import {coreElementSelectionHostInput, kindRuntimeValidationHostInput} from '../../../bindings/core/wasm/src/host-json.js';
// @ts-expect-error The checked-in browser bundle is the same-host TS predecessor.
import {validateDocument as typescriptValidateDocument, selectCoreElements as typescriptSelectCoreElements} from '../../../dist/umf.js';

type Payload = {
  resources: Record<string, unknown>;
  source: unknown;
  queries: Record<string, unknown>;
  frozen: Record<string, unknown>;
  directWarningSourceValidation: unknown;
};

export function runSelectionBrowserCases(payload: Payload) {
  const addon = (globalThis as typeof globalThis & {selectionWasmModule: Record<string, unknown>}).selectionWasmModule;
  const outcomes: Record<string, unknown> = {};
  for (const name of Object.keys(payload.queries)) {
    const result = coreElementSelectionHostInput(addon, payload.resources,
      payload.source, payload.queries[name], undefined, Error);
    const actual = JSON.stringify(result);
    const expected = JSON.stringify(payload.frozen[name]);
    outcomes[name] = {
      equal: actual === expected,
      prototype: Object.getPrototypeOf(result) === null ? 'null' : 'other',
      resultJson: actual,
    };
  }
  const collectPrototypes = (value: unknown, path: string, found: Array<{path: string; prototype: string}>) => {
    if (value === null || typeof value !== 'object') return;
    const isArray = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    found.push({path, prototype: isArray
      ? (prototype === Array.prototype ? 'array' : 'other')
      : (prototype === null ? 'null' : 'other')});
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && 'value' in descriptor) collectPrototypes(descriptor.value, `${path}/${key}`, found);
    }
  };
  const allPrototypes: Array<{path: string; prototype: string}> = [];
  collectPrototypes(coreElementSelectionHostInput(addon, payload.resources,
    payload.source, payload.queries.all, undefined, Error), '$', allPrototypes);
  const protoSource = structuredClone(payload.source) as Record<string, any>;
  Object.defineProperty(protoSource.extensions.future.opaque, '__proto__', {
    value: {retained: true}, writable: true, enumerable: true, configurable: true,
  });
  const protoResult = coreElementSelectionHostInput(addon, payload.resources,
    protoSource, payload.queries.all, undefined, Error);
  const opaque = protoResult.source.extensions.future.opaque;
  const ownProto = Object.getOwnPropertyDescriptor(opaque, '__proto__')?.value as {retained?: unknown} | undefined;
  const protoKeyPreserved = Object.getPrototypeOf(protoResult) === null
    && Object.getPrototypeOf(protoResult.source) === null
    && Object.getPrototypeOf(opaque) === null
    && Object.hasOwn(opaque, '__proto__')
    && ownProto?.retained === true
    && Object.getPrototypeOf(ownProto) === null
    && Object.getOwnPropertyDescriptor(Object.prototype, 'retained') === undefined;
  const warningResources = structuredClone(payload.resources) as any;
  warningResources.domainPolicy.extensions.structure.severity = 'warning';
  const structure = () => false;
  (structure as any).errors = [
    {instancePath: '/first', message: 'first warning'},
    {instancePath: '/second', message: 'second warning'},
  ];
  const warningResult = coreElementSelectionHostInput(addon, warningResources,
    payload.source, payload.queries.all,
    {get() { return {manifest: {scopes: {includes() { return true; }}, capabilities: {validation: 'none'}}, structure}; }}, Error);
  const sentinel = {selectionRegistryThrown: true};
  let calls = 0;
  let thrownIdentity = false;
  try {
    coreElementSelectionHostInput(addon, payload.resources,
      payload.source, payload.queries.all,
      {get() { calls++; throw sentinel; }}, Error);
  } catch (error) {
    thrownIdentity = error === sentinel;
  }
  const delegationTrace = (invoke: (source: unknown, registry: unknown) => unknown) => {
    const events: string[] = [];
    const sourceValue = Object.freeze({browserKindRuntimeSource: true});
    const registrationsValue = Object.freeze([{id: 'caller-owned'}]);
    const resultValue = Object.freeze({valid: true, diagnostics: []});
    const runtime = Object.defineProperty({}, 'validateDocument', {get() {
      events.push('runtime.validateDocument:get');
      return function(this: unknown, input: unknown, registrations: unknown) {
        events.push('runtime.validateDocument:call');
        if (this !== runtime || input !== sourceValue || registrations !== registrationsValue) {
          throw new Error('kindRuntime delegation identity changed');
        }
        return resultValue;
      };
    }});
    const registry = Object.defineProperties({}, {
      kindRuntime: {get() { events.push('registry.kindRuntime:get'); return runtime; }},
      registrations: {get() {
        events.push('registry.registrations:get');
        return function(this: unknown) {
          events.push('registry.registrations:call');
          if (this !== registry) throw new Error('registrations receiver changed');
          return registrationsValue;
        };
      }},
    });
    const result = invoke(sourceValue, registry);
    return {events, resultIdentity: result === resultValue};
  };
  const typescriptDelegation = delegationTrace(typescriptValidateDocument as (source: unknown, registry: unknown) => unknown);
  const rustDelegation = delegationTrace((sourceValue, registryValue) =>
    kindRuntimeValidationHostInput(addon, sourceValue, registryValue, Error));
  const resultKinds = [
    ['undefined', undefined], ['null', null], ['boolean', false], ['negative-zero', -0],
    ['nan', NaN], ['positive-infinity', Infinity], ['negative-infinity', -Infinity],
    ['string', 'validation'], ['object', Object.freeze({valid: true})],
    ['function', function validationResult() {}], ['symbol', Symbol('validation')], ['bigint', 17n],
  ] as const;
  const kindRuntimeResultCases = resultKinds.map(([name, returned]) => {
    const invoke = (route: (source: unknown, registry: unknown) => unknown) => {
      const events: string[] = [];
      const sourceValue = Object.freeze({resultCase: name});
      const registrationsValue = Object.freeze([{id: name}]);
      let runtime: object;
      runtime = Object.defineProperty({}, 'validateDocument', {get() {
        events.push('validateDocument:get');
        return function(this: unknown, source: unknown, registrations: unknown) {
          events.push('validateDocument:call');
          if (this !== runtime || source !== sourceValue || registrations !== registrationsValue) throw new Error('result case identity changed');
          return returned;
        };
      }});
      const registry = Object.defineProperties({}, {
        kindRuntime: {get() { events.push('kindRuntime:get'); return runtime; }},
        registrations: {get() { events.push('registrations:get'); return function(this: unknown) {
          events.push('registrations:call');
          if (this !== registry) throw new Error('registrations receiver changed');
          return registrationsValue;
        }; }},
      });
      return {events, value: route(sourceValue, registry)};
    };
    const expected = invoke(typescriptValidateDocument as (source: unknown, registry: unknown) => unknown);
    const actual = invoke((sourceValue, registryValue) => kindRuntimeValidationHostInput(addon, sourceValue, registryValue, Error));
    return {name, sameValue: Object.is(actual.value, returned), sameIdentity: Object.is(actual.value, returned),
      sameTrace: JSON.stringify(expected.events) === JSON.stringify(actual.events), trace: actual.events};
  });
  const kindRuntimeDynamicReadCases = [null, Object.defineProperty({}, 'validateDocument', {get() {
    throw new Error('second runtime method getter');
  }})].map((secondRuntime, index) => {
    const run = (route: (source: unknown, registry: unknown) => unknown) => {
      const events: string[] = [];
      let reads = 0;
      const firstRuntime = {};
      const registry = {
        get kindRuntime() { events.push('kindRuntime:get'); return ++reads === 1 ? firstRuntime : secondRuntime; },
        registrations() { events.push('registrations:call'); return []; },
      };
      try { route({}, registry); return {events, thrown: undefined}; }
      catch (thrown) { return {events, thrown}; }
    };
    const route = typescriptValidateDocument as (source: unknown, registry: unknown) => unknown;
    const expected = run(route);
    const actual = run((sourceValue, registryValue) => kindRuntimeValidationHostInput(addon, sourceValue, registryValue, Error));
    return {name: index === 0 ? 'second-read-null' : 'second-runtime-method-getter-throws',
      sameType: actual.thrown instanceof (expected.thrown as Error).constructor,
      sameText: String(actual.thrown) === String(expected.thrown),
      sameTrace: JSON.stringify(actual.events) === JSON.stringify(expected.events), trace: actual.events};
  });
  const selectionKindRuntimeBranch = (() => {
    const invoke = (route: (source: unknown, query: unknown, registry: unknown) => unknown) => {
      const events: string[] = [];
      const result = Object.defineProperty({}, 'valid', {get() {
        events.push('validation.valid:get');
        return true;
      }});
      const runtime = {validateDocument(source: unknown, registrations: unknown) {
        events.push('kindRuntime.validateDocument:call');
        if (JSON.stringify(source) !== JSON.stringify(payload.source) || !Array.isArray(registrations) || registrations.length !== 0) {
          throw new Error('Selection kindRuntime arguments changed');
        }
        if (Object.getPrototypeOf(source) !== null
          || Object.getPrototypeOf((source as any).modules[0]) !== null) {
          throw new Error('Selection kindRuntime source copy prototypes changed');
        }
        return result;
      }};
      const registry = {
        get kindRuntime() { events.push('registry.kindRuntime:get'); return runtime; },
        registrations() { events.push('registry.registrations:call'); return []; },
      };
      try { route(payload.source, payload.queries.all, registry); }
      catch (error) { return {events, error: String(error)}; }
      return {events, error: undefined};
    };
    const expected = invoke(typescriptSelectCoreElements as (source: unknown, query: unknown, registry: unknown) => unknown);
    const actual = invoke((source, query, registry) => coreElementSelectionHostInput(addon,
      payload.resources, source, query, registry, Error));
    return {prefixMatches: JSON.stringify(expected.events.slice(0, actual.events.length)) === JSON.stringify(actual.events),
      expectedError: expected.error, actualError: actual.error, trace: actual.events};
  })();
  const throwSentinel = Object.freeze({kindRuntimeThrow: true});
  let kindRuntimeThrowIdentity = false;
  try {
    kindRuntimeValidationHostInput(addon, {}, {kindRuntime: {validateDocument() { throw throwSentinel; }}, registrations() { return []; }}, Error);
  } catch (error) { kindRuntimeThrowIdentity = error === throwSentinel; }
  let falsyRuntimeRefused = false;
  let falsyRuntimeError = '';
  try { kindRuntimeValidationHostInput(addon, {}, {kindRuntime: null}, Error); }
  catch (error) { falsyRuntimeError = String(error); falsyRuntimeRefused = falsyRuntimeError.includes('HOST_JSON_UNSUPPORTED'); }
  return {outcomes, allPrototypes, protoKeyPreserved,
    successfulWarnings: {sourceValidation: warningResult.sourceValidation,
      crossHostDirectSourceBaselineEqual: JSON.stringify(warningResult.sourceValidation) === JSON.stringify(payload.directWarningSourceValidation),
      nullPrototype: Object.getPrototypeOf(warningResult.sourceValidation) === null},
    registryThrow: {calls, thrownIdentity},
    kindRuntimeDelegation: {typescript: typescriptDelegation, rust: rustDelegation,
      equalTrace: JSON.stringify(typescriptDelegation.events) === JSON.stringify(rustDelegation.events),
      resultIdentity: rustDelegation.resultIdentity, thrownIdentity: kindRuntimeThrowIdentity,
      falsyRuntimeRefused, falsyRuntimeError}, kindRuntimeResultCases, kindRuntimeDynamicReadCases,
    selectionKindRuntimeBranch};
}
