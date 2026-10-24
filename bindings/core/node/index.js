import {createRequire} from 'node:module';
import {encodeRequestWire, encodeWire, fromWire, resultError, toWire} from './src/wire.js';

const require = createRequire(import.meta.url);
const addon = require('./umf_core_node.node');

export class UmfCoreError extends Error {
  constructor(code, message, path = '') {
    super(message);
    this.name = 'UmfCoreError';
    this.code = code;
    this.path = path;
  }
}

export function copyJson(value, limits) {
  const wire = encodeWire(value, {
    maxDepth: limits?.maxDepth ?? 128,
    maxValues: limits?.maxValues ?? 100_000,
  });
  try {
    const result = JSON.parse(addon.copyJsonWire(wire));
    const failure = resultError(result);
    if (failure) throw new UmfCoreError(failure.code, failure.message, failure.path);
    return fromWire(JSON.parse(result.wire));
  } catch (error) {
    if (error instanceof UmfCoreError) throw error;
    const text = String(error?.message ?? error);
    const split = text.indexOf(': ');
    throw new UmfCoreError(split > 0 ? text.slice(0, split) : 'ENGINE', split > 0 ? text.slice(split + 2) : text);
  }
}

export const engineVersion = addon.engineVersion();

function dataProperty(value, name, required = true) {
  if (!value || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new TypeError('Engine descriptors must be plain objects');
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, name);
  if (!descriptor) {
    if (required) throw new TypeError(`Missing engine descriptor property ${name}`);
    return undefined;
  }
  if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
    throw new TypeError(`Engine descriptor property ${name} must be an enumerable data property`);
  }
  return descriptor.value;
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

function runRequest(request, callbacks, profile, controls, accountHost = false) {
  if (profile === 'hard-isolated') throw new UmfCoreError('RESOURCE_PROFILE_UNAVAILABLE', 'HardIsolated resource profile is unavailable');
  const callbackBridge = (token, requestWire) => {
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
  const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
  const hostWork = accountHost ? admissionWork(controlBridge) : undefined;
  const responseText = addon.executeRequestWire(encodeRequestWire(request, hostWork), profile, callbackBridge, controlBridge);
  hostWork?.(responseText.length);
  const response = JSON.parse(responseText);
  const failure = resultError(response);
  if (failure) throw new UmfCoreError(failure.code, failure.message, failure.path);
  hostWork?.(response.wire.length);
  return fromWire(JSON.parse(response.wire), hostWork);
}

function runRawValue(nativeFunction, input, format, controls) {
  const bridge = hasControls(controls) ? createControlBridge(controls) : undefined;
  const response = JSON.parse(nativeFunction(encodeWire(input), format, bridge));
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

/** Create a synchronous Rust engine over an explicit immutable resource set. */
export function createEngine(resources, options = {}) {
  const {profile, controls} = codegenOptions(options);
  // Each catalog payload is bounded independently by Rust admission. The
  // transport envelope may combine all of them and must not add an aggregate
  // value ceiling of its own.
  const snapshot = fromWire(toWire(resources, {maxDepth: 256, maxValues: Number.MAX_SAFE_INTEGER}));
  for (const name of ['coreSchema', 'referenceSchema', 'packageSchema', 'constraints', 'domainPolicy']) {
    if (!Object.hasOwn(snapshot, name)) throw new TypeError(`Missing explicit engine resource ${name}`);
  }
  const fixedResources = {
    coreSchema: snapshot.coreSchema,
    referenceSchema: snapshot.referenceSchema,
    packageSchema: snapshot.packageSchema,
    constraints: snapshot.constraints,
    domainPolicy: snapshot.domainPolicy,
  };
  function invoke(op, args = {}, extensions = []) {
    const callbackMap = new Map();
    const registry = dataArray(extensions, 'extensions').map((extension, index) => {
      const manifest = dataProperty(extension, 'manifest', false);
      if (manifest !== undefined) {
        const semantics = dataProperty(extension, 'semantics', false);
        if (semantics !== undefined && typeof semantics !== 'function') throw new TypeError('Extension semantics must be a host callback function');
        if (semantics) callbackMap.set(index + 1, semantics);
        if (Reflect.ownKeys(extension).some(key => !['manifest','semantics','kinds'].includes(key))) throw new TypeError('Full manifest and legacy registration fields cannot be mixed');
        const kindOption = dataProperty(extension, 'kinds', false);
        const kinds = kindOption === undefined ? false : kindOption;
        if (typeof kinds !== 'boolean') throw new TypeError('kinds must be a boolean');
        return {manifest, kinds, semantic: Boolean(semantics)};
      }
      const id = dataProperty(extension, 'id');
      const version = dataProperty(extension, 'version');
      const scopes = dataProperty(extension, 'scopes');
      const schema = dataProperty(extension, 'schema', false) ?? true;
      const semantics = dataProperty(extension, 'semantics', false);
      if (semantics !== undefined && typeof semantics !== 'function') throw new TypeError('Extension semantics must be a host callback function');
      if (semantics) callbackMap.set(index + 1, semantics);
      return {id, version, scopes, schema, semantic: Boolean(semantics)};
    });
    const request = {op, resources: fixedResources, registry, ...args};
    return runRequest(request, callbackMap, profile, controls);
  }
  return Object.freeze({
    engineVersion,
    listKinds(registry = []) { return invoke('list-kinds', {}, registry); },
    getKind(reference, registry = []) { return invoke('get-kind', {reference}, registry) ?? undefined; },
    inspectExtensionKinds(document, registry = []) { return invoke('inspect-kinds', {document}, registry); },
    validateDocument(document, registry = []) { return invoke('validate', {document}, registry); },
    readDocument(source, format = 'json', registry = []) { return invoke('read', {source, format}, registry).document; },
    writeDocument(document, format = 'json', registry = []) { return invoke('write', {document, format}, registry).source; },
    readValue(source, format = 'json') { return runRawValue(addon.readValueWire, source, format, controls); },
    writeValue(value, format = 'json') { return runRawValue(addon.writeValueWire, value, format, controls); },
    readJsonValue(source) { return runRawValue(addon.readValueWire, source, 'json', controls); },
    writeJsonValue(value) { return runRawValue(addon.writeValueWire, value, 'json', controls); },
  });
}

function codegenOptions(options) {
  const profile = dataProperty(options, 'profile', false) ?? 'cooperative';
  const rawControls = dataProperty(options, 'controls', false) ?? Object.create(null);
  const controls = {
    maxWork: dataProperty(rawControls, 'maxWork', false),
    meter: dataProperty(rawControls, 'meter', false),
    isCancelled: dataProperty(rawControls, 'isCancelled', false),
    now: dataProperty(rawControls, 'now', false),
    deadlineMs: dataProperty(rawControls, 'deadlineMs', false),
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
export function createCodegenEngine(resources, options = {}) {
  const {profile, controls} = codegenOptions(options);
  const work = admissionWork(hasControls(controls) ? createControlBridge(controls) : undefined);
  const names = ['coreSchema', 'referenceSchema', 'packageSchema', 'constraints', 'domainPolicy', 'tablesPackage', 'actionsPackage', 'bindingPackage', 'stableBindingPackage'];
  work?.(1);
  for (const key of Reflect.ownKeys(resources)) {
    if (typeof key !== 'string' || !names.includes(key)) throw new TypeError('Unknown explicit codegen resource');
  }
  const fixedResources = Object.create(null);
  for (const name of names) {
    const resource = dataProperty(resources, name);
    // Catalog resources have independent one-million-value budgets. The
    // nine-resource wrapper is not one semantic resource tree.
    fixedResources[name] = fromWire(toWire(resource, {maxDepth: 128, maxValues: 1_000_000, work}), work);
  }
  function call(operation, request) {
    if (typeof operation !== 'string') throw new TypeError('Codegen operation must be a string');
    return runRequest({op: `codegen/${operation}`, resources: fixedResources, request}, new Map(), profile, controls, true);
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
