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
  class HostError extends Error { constructor(readonly code: string, message: string, readonly path: string) { super(message); } }
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
      catch (error) { const item = error as HostError; return {events, errorCode: item.code, errorPath: item.path}; }
      return {events, errorCode: undefined, errorPath: undefined};
    };
    const expected = invoke(typescriptSelectCoreElements as (source: unknown, query: unknown, registry: unknown) => unknown);
    const actual = invoke((source, query, registry) => coreElementSelectionHostInput(addon,
      payload.resources, source, query, registry, HostError));
    return {sameTrace: JSON.stringify(expected.events) === JSON.stringify(actual.events),
      sameErrorCode: expected.errorCode === actual.errorCode, sameErrorPath: expected.errorPath === actual.errorPath,
      expectedErrorCode: expected.errorCode, actualErrorCode: actual.errorCode,
      expectedErrorPath: expected.errorPath, actualErrorPath: actual.errorPath, trace: actual.events};
  })();

  const selectionKindRuntimeOverride = (() => {
    const source = structuredClone(payload.source) as any;
    source.modules[0].elements[0].scalarType = 7;
    const validation = {valid: true, diagnostics: [], extension: {owner: 'caller'}};
    const invoke = (route: (source: unknown, query: unknown, registry: unknown) => unknown) => {
      const events: string[] = [];
      const runtime = {validateDocument(document: any, registrations: unknown[]) {
        events.push(`validateDocument:${this === runtime}:${document.modules[0].elements[0].scalarType}:${registrations.length}`);
        return validation;
      }};
      const registry = {kindRuntime: runtime, registrations() { events.push('registrations'); return []; }};
      const result = route(source, payload.queries.all, registry);
      return {events, resultJson: JSON.stringify(result)};
    };
    const expected = invoke(typescriptSelectCoreElements as (source: unknown, query: unknown, registry: unknown) => unknown);
    const actual = invoke((document, query, registry) => coreElementSelectionHostInput(addon,
      payload.resources, document, query, registry, Error));
    return {sameTrace: JSON.stringify(expected.events) === JSON.stringify(actual.events),
      sameResult: expected.resultJson === actual.resultJson, events: actual.events,
      sourceValidation: JSON.parse(actual.resultJson).sourceValidation};
  })();
  const registrationInterleaving = (() => {
    const interleavedSource = structuredClone(payload.source) as Record<string, any>;
    interleavedSource.vocabularies = {
      future: {version: '1.0.0'}, alpha: {version: '2.0.0'}, beta: {version: '3.0.0'},
    };
    interleavedSource.extensions = {alpha: {at: 'document-alpha'}, future: {at: 'document-future'}};
    interleavedSource.modules[0].elements[0].extensions = {
      beta: {at: 'element-beta'}, future: {at: 'element-future'},
    };
    const run = (select: (source: unknown, query: unknown, registry: unknown) => unknown) => {
      const events: string[] = [];
      let entry: Record<string, unknown>;
      entry = {
        get structure() {
          events.push('entry.structure');
          return function(this: unknown, value: {at: string}) {
            events.push(`structure:${value.at}:receiver=${this === entry}`);
            return true;
          };
        },
        get semantics() {
          events.push('entry.semantics');
          return function(this: unknown, value: {at: string}, context: {path: string; scope: string}) {
            events.push(`semantics:${value.at}:${context.scope}:receiver=${this === entry}`);
            return [{code: `CALLBACK_${value.at.toUpperCase().replaceAll('-', '_')}`,
              path: context.path, message: `observed ${value.at}`, severity: 'warning',
              origin: {scope: context.scope, retained: true}}];
          };
        },
      };
      Object.defineProperty(entry, 'manifest', {get() {
        events.push('entry.manifest');
        const scopes = {includes(scope: string) {
          events.push(`scopes.includes:${scope}:receiver=${this === scopes}`);
          return true;
        }};
        return {
          get scopes() { events.push('manifest.scopes'); return scopes; },
          get capabilities() { events.push('manifest.capabilities'); return {validation: 'semantic'}; },
        };
      }});
      let registry: object;
      registry = new Proxy({}, {get(_target, key) {
        if (key === 'get') return function(this: unknown, id: string, version: string) {
          events.push(`get:${id}@${version}:receiver=${this === registry}`);
          return entry;
        };
        return undefined;
      }});
      const result = select(interleavedSource, {references: 'none'}, registry);
      return {events, resultJson: JSON.stringify(result)};
    };
    const reference = run(typescriptSelectCoreElements as (source: unknown, query: unknown, registry: unknown) => unknown);
    const rust = run((source, query, registry) => coreElementSelectionHostInput(
      addon, payload.resources, source, query, registry, Error));
    const expected = [
      'get:future@1.0.0:receiver=true', 'get:alpha@2.0.0:receiver=true', 'get:beta@3.0.0:receiver=true',
    ];
    for (const [id, version, scope, value] of [
      ['alpha', '2.0.0', 'document', 'document-alpha'],
      ['future', '1.0.0', 'document', 'document-future'],
      ['beta', '3.0.0', 'element', 'element-beta'],
      ['future', '1.0.0', 'element', 'element-future'],
    ]) expected.push(`get:${id}@${version}:receiver=true`, 'entry.manifest', 'manifest.scopes',
      `scopes.includes:${scope}:receiver=true`, 'entry.structure', `structure:${value}:receiver=true`,
      'entry.manifest', 'manifest.capabilities', 'entry.semantics', 'entry.semantics',
      `semantics:${value}:${scope}:receiver=true`);
    return {sameTrace: JSON.stringify(reference.events) === JSON.stringify(rust.events)
        && JSON.stringify(rust.events) === JSON.stringify(expected),
      sameResult: reference.resultJson === rust.resultJson, expectedEvents: expected,
      rustEvents: rust.events, resultJson: rust.resultJson};
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
    selectionKindRuntimeBranch, selectionKindRuntimeOverride, registrationInterleaving};
}
