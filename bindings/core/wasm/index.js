import {encodeRequestWire, encodeWire, fromWire, resultError, toWire} from './src/wire.js';
import {createJavascriptNumericEngine as createNumericEngine, JAVASCRIPT_NUMERIC_PROFILE} from './src/javascript-numeric.js';
import {createCoreModelOperations} from './src/core-model.js';
import {createBit128Engine as createBit128EngineWithWire, BIT128_PROFILE} from './src/bit128.js';
export {JAVASCRIPT_NUMERIC_PROFILE};
export {BIT128_PROFILE};
export const GREGORIAN_DATE_PROFILE = 'umf-gregorian-date/1.0.0';
export const RFC3339_EXACT_INSTANT_PROFILE = 'umf-rfc3339-exact-instant/1.0.0';
export const RFC3339_EXACT_INSTANT_MAXIMUM_BYTES = 1_048_576;

function hasBrowserRuntime(host) {
  return !!host && typeof host.WebAssembly === 'object' && typeof host.WebAssembly.instantiate === 'function';
}

/** Create the opt-in, resource-free temporal adapter engine over a loaded WASM module. */
export function createTemporalEngine(module) {
  for (const name of ['temporalParseGregorianDateWire', 'temporalTruncateGregorianDateWire', 'temporalParseRfc3339ExactInstantWire', 'temporalSameRfc3339ExactInstantWire']) {
    if (typeof module?.[name] !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  }
  const decoded = (wire) => {
    if (wire === 'TypeError') throw new TypeError('Temporal token requires text');
    if (wire === 'RangeError') throw new RangeError('Temporal token is outside the selected profile');
    return wire.split('|');
  };
  const parseGregorianDate = (token) => {
    const [, year, month, day] = decoded(module.temporalParseGregorianDateWire(token));
    return Object.freeze({profile: GREGORIAN_DATE_PROFILE, originalText: token, year: Number(year), month: Number(month), day: Number(day)});
  };
  const parseRfc3339ExactInstant = (token) => {
    const [, utcSeconds, fractionalDigits, originalOffset, localOffsetKnown] = decoded(module.temporalParseRfc3339ExactInstantWire(token));
    return Object.freeze({profile: RFC3339_EXACT_INSTANT_PROFILE, originalText: token, utcSeconds, fractionalDigits, originalOffset, localOffsetKnown: localOffsetKnown === 'true'});
  };
  return Object.freeze({parseGregorianDate,
    truncateGregorianDate(token, unit) { return decoded(module.temporalTruncateGregorianDateWire(token, unit))[1]; },
    parseRfc3339ExactInstant,
    sameRfc3339ExactInstant(left, right) { return decoded(module.temporalSameRfc3339ExactInstantWire(left, right))[1] === 'true'; },
  });
}

/** Initialize the standalone temporal adapters without requiring engine resources. */
export async function initializeTemporalWasm(loader = () => import('./pkg/umf_core_wasm.js'), host = globalThis) {
  if (!hasBrowserRuntime(host)) throw new Error('WASM_RUNTIME_UNAVAILABLE');
  const module = await loader();
  if (typeof module.default === 'function') await module.default();
  return createTemporalEngine(module);
}

/** Create the opt-in `umf-128/1` codec over a loaded Rust/WASM module. */
export function createBit128Engine(module, options = {}) {
  if (typeof module?.executeBit128Wire !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  return createBit128EngineWithWire((wire, control) => module.executeBit128Wire(wire, control), options);
}

/** Initialize the standalone `umf-128/1` Rust/WASM codec. */
export async function initializeBit128Wasm(loader = () => import('./pkg/umf_core_wasm.js'), host = globalThis, options = {}) {
  if (!hasBrowserRuntime(host)) throw new Error('WASM_RUNTIME_UNAVAILABLE');
  const module = await loader();
  if (typeof module.default === 'function') await module.default();
  return createBit128Engine(module, options);
}

/** Initialize the distributed Rust/WASM module asynchronously; returned operations are synchronous. */
export async function initializeWasm(loader = () => import('./pkg/umf_core_wasm.js'), host = globalThis, resources, options) {
  if (descriptor(options ?? Object.create(null), 'profile', false) === 'hard-isolated') throw new UmfCoreError('RESOURCE_PROFILE_UNAVAILABLE', 'HardIsolated resource profile is unavailable');
  if (!hasBrowserRuntime(host)) throw new Error('WASM_RUNTIME_UNAVAILABLE');
  const module = await loader();
  if (typeof module.default === 'function') await module.default();
  if (typeof module.copyJsonWire !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  return createEngine(module, resources, options);
}

/** Initialize WASM and expose the additive core-model operation surface. */
export async function initializeCoreModelWasm(resources, loader = () => import('./pkg/umf_core_wasm.js'), host = globalThis, options) {
  if (!hasBrowserRuntime(host)) throw new Error('WASM_RUNTIME_UNAVAILABLE');
  const module = await loader();
  if (typeof module.default === 'function') await module.default();
  if (typeof module.copyJsonWire !== 'function' || typeof module.executeRequestWire !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  return createCoreModelEngine(module, resources, options);
}

export class UmfCoreError extends Error {
  constructor(code, message, path = '') {
    super(message);
    this.name = 'UmfCoreError';
    this.code = code;
    this.path = path;
  }
}

function runRawValue(module, nativeFunction, input, format, controls) {
  const bridge = hasControls(controls) ? createControlBridge(controls) : undefined;
  const response = JSON.parse(nativeFunction(encodeWire(input), format, bridge));
  const failure = resultError(response);
  if (failure) throw new UmfCoreError(failure.code, failure.message, failure.path);
  return fromWire(JSON.parse(response.wire));
}

function descriptor(value, key, required = true, work = undefined) {
  work?.(1);
  if (!value || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new TypeError('Engine descriptors must be plain objects');
  const item = Object.getOwnPropertyDescriptor(value, key);
  if (!item) {
    if (required) throw new TypeError(`Missing engine descriptor property ${key}`);
    return undefined;
  }
  if (!Object.hasOwn(item, 'value') || !item.enumerable) throw new TypeError(`Engine descriptor property ${key} must be an enumerable data property`);
  return item.value;
}

function dataArray(value, name, work = undefined) {
  work?.(1);
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  if (Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError(`${name} must be a plain array`);
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
  work?.(length + 1);
  const keys = Reflect.ownKeys(value);
  if (!Number.isSafeInteger(length) || keys.length !== length + 1) {
    throw new TypeError(`${name} must be a dense array without extra properties`);
  }
  work?.(1);
  const items = [];
  for (let index = 0; index < length; index++) {
    work?.(1);
    const item = Object.getOwnPropertyDescriptor(value, String(index));
    if (!item || !Object.hasOwn(item, 'value') || !item.enumerable) {
      throw new TypeError(`${name}[${index}] must be an enumerable data property`);
    }
    items.push(item.value);
  }
  return items;
}

function callbackFailureText(error) {
  if (typeof error === 'string' || typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint' || error == null) {
    return String(error);
  }
  // Walk data descriptors only: preserve inherited built-in Error names
  // without invoking message/name accessors or hostile proxy traps.
  try {
    const message = Object.getOwnPropertyDescriptor(error, 'message');
    if (message && Object.hasOwn(message, 'value') && typeof message.value === 'string') {
      let current = error;
      for (let depth = 0; current && depth < 32; depth++) {
        const name = Object.getOwnPropertyDescriptor(current, 'name');
        if (name) {
          if (!Object.hasOwn(name, 'value') || typeof name.value !== 'string') return 'Host callback failed';
          return name.value ? `${name.value}: ${message.value}` : message.value;
        }
        current = Object.getPrototypeOf(current);
      }
    }
  } catch { /* hostile proxy */ }
  return 'Host callback failed';
}

function invoke(module, request, callbacks, profile, controls, accountHost = false, sharedControlBridge = undefined, sharedHostWork = undefined) {
  if (profile === 'hard-isolated') throw new UmfCoreError('RESOURCE_PROFILE_UNAVAILABLE', 'HardIsolated resource profile is unavailable');
  const dispatcher = (token, requestWire) => {
    const callback = callbacks.get(token);
    if (typeof callback !== 'function') return encodeRequestWire({ok: false, message: 'No host callback is registered for this token'});
    try {
      const context = fromWire(JSON.parse(requestWire));
      const diagnostics = callback(context.payload, {document: context.document, scope: context.scope, path: context.path});
      if (!Array.isArray(diagnostics)) throw new TypeError('Extension callback must return a diagnostic array');
      return encodeRequestWire({ok: true, diagnostics});
    } catch (error) {
      return encodeRequestWire({ok: false, message: callbackFailureText(error)});
    }
  };
  const controlBridge = sharedControlBridge ?? (hasControls(controls) ? createControlBridge(controls) : undefined);
  const hostWork = accountHost ? (sharedHostWork ?? admissionWork(controlBridge)) : undefined;
  const responseText = module.executeRequestWire(encodeRequestWire(request, hostWork), profile, dispatcher, controlBridge);
  hostWork?.(responseText.length);
  const response = JSON.parse(responseText);
  const failure = resultError(response);
  if (failure) throw new UmfCoreError(failure.code, failure.message, failure.path);
  hostWork?.(response.wire.length);
  return fromWire(JSON.parse(response.wire), hostWork);
}

function hasControls(controls) {
  return controls.maxWork !== undefined || controls.meter !== undefined || controls.isCancelled !== undefined || controls.now !== undefined || controls.deadlineMs !== undefined;
}

function createControlBridge(controls) {
  let charged = 0;
  return (amount) => {
    charged += amount;
    const reject = (code, message) => encodeRequestWire({ok: false, code, message});
    if (controls.maxWork !== undefined && charged > controls.maxWork) return reject('RESOURCE_LIMIT', 'Host work budget exceeded');
    if (amount > 0) {
      try { controls.meter?.(amount); }
      catch (error) { return reject('METER_FAILURE', callbackFailureText(error)); }
    }
    try {
      if (controls.isCancelled?.()) return reject('CANCELLED', 'Operation cancelled by host');
    } catch (error) { return reject('CANCELLATION_CHECK_FAILURE', callbackFailureText(error)); }
    if (controls.deadlineMs !== undefined) {
      try {
        const now = controls.now?.();
        if (typeof now !== 'number' || !Number.isFinite(now)) return reject('CLOCK_CAPABILITY_REQUIRED', 'Host clock did not return a finite millisecond value');
        if (now > controls.deadlineMs) return reject('DEADLINE', 'Deadline elapsed');
      } catch (error) { return reject('CLOCK_CAPABILITY_REQUIRED', callbackFailureText(error)); }
    }
    return '';
  };
}

export function createEngine(module, resources, options = {}) {
  return createEngineInternal(module, resources, options, false);
}

/** Create the opt-in cardinality/kind/nullability ideal API over WASM. */
export function createCoreModelEngine(module, resources, options = {}) {
  return createEngineInternal(module, resources, options, true);
}

function createEngineInternal(module, resources, options, withModel) {
  const {profile, controls} = codegenOptions(options);
  if (typeof module.copyJsonWire !== 'function' || typeof module.executeRequestWire !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  const base = {
    engineVersion: typeof module.engineVersion === 'function' ? module.engineVersion() : module.engineVersion,
    copyJson(value, limits) {
      const wire = encodeWire(value, {
        maxDepth: limits?.maxDepth ?? 128,
        maxValues: limits?.maxValues ?? 100_000,
      });
      const result = JSON.parse(module.copyJsonWire(wire));
      const failure = resultError(result);
      if (failure) throw new UmfCoreError(failure.code, failure.message, failure.path);
      return fromWire(JSON.parse(result.wire));
    },
    readValue(source, format = 'json') { return runRawValue(module, module.readValueWire, source, format, controls); },
    writeValue(value, format = 'json') { return runRawValue(module, module.writeValueWire, value, format, controls); },
    readJsonValue(source) { return runRawValue(module, module.readValueWire, source, 'json', controls); },
    writeJsonValue(value) { return runRawValue(module, module.writeValueWire, value, 'json', controls); },
  };
  if (resources === undefined) return Object.freeze(base);
  const names = ['coreSchema', 'referenceSchema', 'packageSchema', 'constraints', 'domainPolicy'];
  const hostWork = withModel ? admissionWork(hasControls(controls) ? createControlBridge(controls) : undefined) : undefined;
  let fixedResources;
  if (withModel) {
    hostWork?.(1);
    const prototype = Object.getPrototypeOf(resources);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError('Engine resources must be a plain object');
    const keys = Reflect.ownKeys(resources);
    hostWork?.(keys.length);
    for (const key of keys) {
      if (typeof key !== 'string' || !names.includes(key)) throw new TypeError('Unknown explicit engine resource');
      hostWork?.(key.length + 1);
    }
    fixedResources = Object.create(null);
    for (const name of names) {
      const resource = descriptor(resources, name);
      fixedResources[name] = fromWire(toWire(resource, {maxDepth: 128, maxValues: 1_000_000, work: hostWork}), hostWork);
    }
  } else {
    // The transport bundle is not one semantic resource tree.
    const snapshot = fromWire(toWire(resources, {maxDepth: 256, maxValues: Number.MAX_SAFE_INTEGER}));
    for (const key of names) if (!Object.hasOwn(snapshot, key)) throw new TypeError(`Missing explicit engine resource ${key}`);
    fixedResources = Object.fromEntries(names.map((key) => [key, snapshot[key]]));
  }
  function call(op, args = {}, extensions = []) {
    const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const hostWork = withModel ? admissionWork(controlBridge) : undefined;
    hostWork?.(1);
    const callbacks = new Map();
    const extensionValues = withModel ? dataArray(extensions, 'extensions', hostWork) : dataArray(extensions, 'extensions');
    hostWork?.(extensionValues.length + 1);
    const registry = [];
    for (let index = 0; index < extensionValues.length; index++) {
      hostWork?.(1);
      const extension = extensionValues[index];
      const id = descriptor(extension, 'id', true, hostWork);
      const version = descriptor(extension, 'version', true, hostWork);
      const scopes = descriptor(extension, 'scopes', true, hostWork);
      const schema = descriptor(extension, 'schema', false, hostWork) ?? true;
      const semantics = descriptor(extension, 'semantics', false, hostWork);
      if (semantics !== undefined && typeof semantics !== 'function') throw new TypeError('Extension semantics must be a host callback function');
      if (semantics) { hostWork?.(1); callbacks.set(index + 1, semantics); }
      hostWork?.(5);
      registry.push({id, version, scopes, schema, semantic: Boolean(semantics)});
    }
    hostWork?.(1);
    return invoke(module, {op, resources: fixedResources, registry, ...args}, callbacks, profile, controls, withModel, controlBridge, hostWork);
  }
  const api = {...base,
    validateDocument(document, registry = []) { return call('validate', {document}, registry); },
    readDocument(source, format = 'json', registry = []) { return call('read', {source, format}, registry).document; },
    writeDocument(document, format = 'json', registry = []) { return call('write', {document, format}, registry).source; },
  };
  if (withModel) Object.assign(api, createCoreModelOperations((op, args, extensions) => call(op, args, extensions)));
  return Object.freeze(api);
}

/** Create the opt-in Rust-backed CONTRACT-049 numeric adapter. */
export function createJavascriptNumericEngine(module, resources, options = {}) {
  if (typeof module?.executeJavascriptNumericWire !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  return createNumericEngine(module.executeJavascriptNumericWire.bind(module), resources, options.controls);
}

function codegenOptions(options) {
  const profile = descriptor(options, 'profile', false) ?? 'cooperative';
  const rawControls = descriptor(options, 'controls', false) ?? Object.create(null);
  const controls = {
    maxWork: descriptor(rawControls, 'maxWork', false),
    meter: descriptor(rawControls, 'meter', false),
    isCancelled: descriptor(rawControls, 'isCancelled', false),
    now: descriptor(rawControls, 'now', false),
    deadlineMs: descriptor(rawControls, 'deadlineMs', false),
  };
  if (controls.maxWork !== undefined && (!Number.isSafeInteger(controls.maxWork) || controls.maxWork < 0)) throw new TypeError('controls.maxWork must be a non-negative safe integer');
  if (controls.deadlineMs !== undefined && (typeof controls.deadlineMs !== 'number' || !Number.isFinite(controls.deadlineMs))) throw new TypeError('controls.deadlineMs must be a finite millisecond value');
  for (const name of ['meter', 'isCancelled', 'now']) if (controls[name] !== undefined && typeof controls[name] !== 'function') throw new TypeError(`controls.${name} must be a function`);
  if (controls.deadlineMs !== undefined && controls.now === undefined) throw new TypeError('controls.now is required with controls.deadlineMs');
  if (profile !== 'cooperative' && profile !== 'hard-isolated') throw new TypeError('Unknown resource profile');
  if (profile === 'hard-isolated') throw new UmfCoreError('RESOURCE_PROFILE_UNAVAILABLE', 'HardIsolated resource profile is unavailable');
  return {profile, controls};
}

/** Additive R3 compiler API over caller-supplied immutable resources. */
export function createCodegenEngine(module, resources, options = {}) {
  const {profile, controls} = codegenOptions(options);
  if (typeof module.copyJsonWire !== 'function' || typeof module.executeRequestWire !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  const work = admissionWork(hasControls(controls) ? createControlBridge(controls) : undefined);
  const names = ['coreSchema', 'referenceSchema', 'packageSchema', 'constraints', 'domainPolicy', 'tablesPackage', 'actionsPackage', 'bindingPackage', 'stableBindingPackage'];
  work?.(1);
  for (const key of Reflect.ownKeys(resources)) {
    if (typeof key !== 'string' || !names.includes(key)) throw new TypeError('Unknown explicit codegen resource');
  }
  const fixedResources = Object.create(null);
  for (const name of names) {
    const resource = descriptor(resources, name);
    // Catalog resources have independent one-million-value budgets. The
    // nine-resource wrapper is not one semantic resource tree.
    fixedResources[name] = fromWire(toWire(resource, {maxDepth: 128, maxValues: 1_000_000, work}), work);
  }
  function call(operation, request) {
    if (typeof operation !== 'string') throw new TypeError('Codegen operation must be a string');
    return invoke(module, {op: `codegen/${operation}`, resources: fixedResources, request}, new Map(), profile, controls, true);
  }
  function result(operation, request) {
    const response = call(operation, request);
    if (!response.ok) {
      const failure = response.error;
      const error = new Error(failure.message);
      error.name = 'UmfCodegenError';
      error.code = failure.code;
      for (const key of ['path', 'pointer']) if (Object.hasOwn(failure, key)) error[key] = failure[key];
      throw error;
    }
    return response.result;
  }
  return Object.freeze({
    call,
    generatePythonClient(request) { return result('generatePythonClient', request); },
    compileTableDeployment(request) { return result('compileTableDeployment', request); },
    verifyTableDeployment(bundle) { return result('verifyTableDeployment', {bundle}); },
    compileTableMigration(request) { return result('compileTableMigration', request); },
    verifyTableMigration(plan) { return result('verifyTableMigration', {plan}); },
    discoverTableMigrationChanges(previous, next) { return result('discoverTableMigrationChanges', {previous, next}).changes; },
    normalizeRowScope(input, context) { return result('normalizeRowScope', {input, context}); },
    generateAccessPackage(request, profile) { return result('generateAccessPackage', {request, profile}); },
    diffAccessPackages(before, after) { return result('diffAccessPackages', {before, after}); },
  });
}

export async function initializeCodegenWasm(loader = () => import('./pkg/umf_core_wasm.js'), host = globalThis, resources, options = {}) {
  codegenOptions(options);
  if (!hasBrowserRuntime(host)) throw new Error('WASM_RUNTIME_UNAVAILABLE');
  const module = await loader();
  if (typeof module.default === 'function') await module.default();
  return createCodegenEngine(module, resources, options);
}

function admissionWork(bridge) {
  if (!bridge) return undefined;
  return (amount) => {
    const response = bridge(amount);
    if (response) {
      const failure = fromWire(JSON.parse(response));
      throw new UmfCoreError(failure.code, failure.message);
    }
  };
}
