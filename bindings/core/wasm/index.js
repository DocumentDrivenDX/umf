import {encodeRequestWire, encodeWire, fromWire, resultError, toWire} from '../node/src/wire.js';

function hasBrowserRuntime(host) {
  return !!host && typeof host.WebAssembly === 'object' && typeof host.WebAssembly.instantiate === 'function';
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

function descriptor(value, key, required = true) {
  if (!value || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new TypeError('Engine descriptors must be plain objects');
  const item = Object.getOwnPropertyDescriptor(value, key);
  if (!item) {
    if (required) throw new TypeError(`Missing engine descriptor property ${key}`);
    return undefined;
  }
  if (!Object.hasOwn(item, 'value') || !item.enumerable) throw new TypeError(`Engine descriptor property ${key} must be an enumerable data property`);
  return item.value;
}

function dataArray(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  if (Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError(`${name} must be a plain array`);
  const keys = Reflect.ownKeys(value);
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
  if (!Number.isSafeInteger(length) || keys.length !== length + 1) {
    throw new TypeError(`${name} must be a dense array without extra properties`);
  }
  const items = [];
  for (let index = 0; index < length; index++) {
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

function invoke(module, request, callbacks, profile, controls) {
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
  const response = JSON.parse(module.executeRequestWire(encodeRequestWire(request), profile, dispatcher, hasControls(controls) ? createControlBridge(controls) : undefined));
  const failure = resultError(response);
  if (failure) throw new UmfCoreError(failure.code, failure.message, failure.path);
  return fromWire(JSON.parse(response.wire));
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
  if (typeof module.copyJsonWire !== 'function' || typeof module.executeRequestWire !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  if (profile !== 'cooperative' && profile !== 'hard-isolated') throw new TypeError('Unknown resource profile');
  if (profile === 'hard-isolated') throw new UmfCoreError('RESOURCE_PROFILE_UNAVAILABLE', 'HardIsolated resource profile is unavailable');
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
  // Resource trees are bounded independently in Rust; this wrapper object is
  // only a transport bundle and cannot impose an aggregate value ceiling.
  const snapshot = fromWire(toWire(resources, {maxDepth: 256, maxValues: Number.MAX_SAFE_INTEGER}));
  for (const key of ['coreSchema', 'referenceSchema', 'packageSchema', 'constraints', 'domainPolicy']) {
    if (!Object.hasOwn(snapshot, key)) throw new TypeError(`Missing explicit engine resource ${key}`);
  }
  const fixedResources = Object.fromEntries(['coreSchema', 'referenceSchema', 'packageSchema', 'constraints', 'domainPolicy'].map((key) => [key, snapshot[key]]));
  function call(op, args = {}, extensions = []) {
    const callbacks = new Map();
    const registry = dataArray(extensions, 'extensions').map((extension, index) => {
      const id = descriptor(extension, 'id');
      const version = descriptor(extension, 'version');
      const scopes = descriptor(extension, 'scopes');
      const schema = descriptor(extension, 'schema', false) ?? true;
      const semantics = descriptor(extension, 'semantics', false);
      if (semantics !== undefined && typeof semantics !== 'function') throw new TypeError('Extension semantics must be a host callback function');
      if (semantics) callbacks.set(index + 1, semantics);
      return {id, version, scopes, schema, semantic: Boolean(semantics)};
    });
    return invoke(module, {op, resources: fixedResources, registry, ...args}, callbacks, profile, controls);
  }
  return Object.freeze({...base,
    validateDocument(document, registry = []) { return call('validate', {document}, registry); },
    readDocument(source, format = 'json', registry = []) { return call('read', {source, format}, registry).document; },
    writeDocument(document, format = 'json', registry = []) { return call('write', {document, format}, registry).source; },
  });
}
