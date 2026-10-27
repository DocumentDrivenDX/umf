import {createHostReadResponseFrames, encodeRequestWire, encodeWire, fromWire, resultError, toWire} from './src/wire.js';
import {createJavascriptNumericEngine as createNumericEngine, JAVASCRIPT_NUMERIC_PROFILE} from './src/javascript-numeric.js';
import {createSecurityLogicEngine as createSecurityLogicEngineWithWire, SECURITY_LOGIC_PROFILE} from './src/security-logic.js';
import {createSecurityFunctionsEngine as createSecurityFunctionsEngineWithWire, SECURITY_FUNCTIONS_PROFILE} from './src/security-functions.js';
import {createSecurityProtectionSourceEngine as createSecurityProtectionSourceEngineWithWire, SECURITY_PROTECTION_SOURCE_PROFILE} from './src/security-protection-source.js';
import {createSecurityQueryPropertiesEngine as createSecurityQueryPropertiesEngineWithWire, SECURITY_QUERY_PROPERTIES_PROFILE} from './src/security-query-properties.js';
import {createSecurityProtectionParametersEngine as createSecurityProtectionParametersEngineWithWire, SECURITY_PROTECTION_PARAMETERS_PROFILE} from './src/security-protection-parameters.js';
import {createCoreModelOperations} from './src/core-model.js';
import {createCoreKeyTupleOperations} from './src/core-key-tuple.js';
import {createCoreKeysOperations} from './src/core-keys.js';
import {createCompactDatasetValueOperations} from './src/dataset-values-compact.js';
import {createDatasetValueOperations} from './src/dataset-values.js';
import {createCoreRelationshipOperations} from './src/core-relationships.js';
import {createCoreEvolutionOperations} from './src/core-evolution.js';
import {createCsvBooleanLexicalOperations} from './src/csv-boolean-lexical.js';
import {createBit128Engine as createBit128EngineWithWire, isBit128EngineError, BIT128_PROFILE} from './src/bit128.js';
import {createJsonNumberEngine as createJsonNumberEngineWithWire, JSON_NUMBER_PROFILE} from './src/json-number.js';
import {createJsonSchemaOperations, JSON_SCHEMA_PROFILE, UmfError as JsonSchemaUmfError, jsonSchemaFailureError} from './src/json-schema.js';
import {createDocumentComparisonOperations, DOCUMENT_COMPARISON_PROFILE} from './src/document-comparison.js';
import {schemaPropertiesHostInput, cardinalityHostInput, validateCoreRecordValuesHostInput, coreKindNullabilityHostInput, coreDatasetValuesHostInput, coreProtobufSourceHostInput, coreProtobufSourceHost, coreProtobufSourceHostResponse} from './src/host-json.js';
import {createSemanticTypeRegistry as createSemanticTypeRegistryWithWire} from './src/semantic-value.js';
const CORE_KIND_NULLABILITY_RUNTIME = Symbol('core-kind-nullability-runtime');
const CORE_KIND_NULLABILITY_PREPARED = Symbol('core-kind-nullability-prepared');
export {isWireAdmissionError} from './src/wire.js';
export {isBit128EngineError};
export {isHostJsonResponseError} from './src/host-json.js';

/** Invoke the opt-in Rust reference pass over tagged wire. The caller must have structurally validated pack first. */
export function executeArtifactReferencesBindingWire(module, wireJson, controlDispatcher) {
  if (typeof module?.executeArtifactReferencesWire !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  return module.executeArtifactReferencesWire(wireJson, controlDispatcher);
}
const nativeUmfCoreErrors = new WeakSet();
const weakSetHas = Function.call.bind(WeakSet.prototype.has);
const weakSetAdd = Function.call.bind(WeakSet.prototype.add);
export function isNativeUmfCoreError(error) { return error !== null && (typeof error === 'object' || typeof error === 'function') && weakSetHas(nativeUmfCoreErrors, error); }
function nativeCoreError(failure) { const error = new UmfCoreError(failure.code, failure.message, failure.path); weakSetAdd(nativeUmfCoreErrors, error); return error; }
export {JAVASCRIPT_NUMERIC_PROFILE};
export {SECURITY_LOGIC_PROFILE};
export {SECURITY_FUNCTIONS_PROFILE};
export {SECURITY_PROTECTION_SOURCE_PROFILE};
export {SECURITY_QUERY_PROPERTIES_PROFILE};
export {SECURITY_PROTECTION_PARAMETERS_PROFILE};
export {BIT128_PROFILE};
export {JSON_NUMBER_PROFILE};
export const GREGORIAN_DATE_PROFILE = 'umf-gregorian-date/1.0.0';
export const RFC3339_EXACT_INSTANT_PROFILE = 'umf-rfc3339-exact-instant/1.0.0';
export const RFC3339_EXACT_INSTANT_MAXIMUM_BYTES = 1_048_576;
export const ICEBERG_SCHEMA_PROFILE = 'umf-r5-iceberg-schema/0.1.0';
export const ARROW_SCHEMA_PROFILE = 'umf-r8-arrow-schema/0.1.0';
export const PROTOBUF_INSPECT_PROFILE = 'umf-r5-protobuf-inspect/0.1.0';
export const PROTOBUF_DOCUMENT_PROFILE = 'umf-r8-protobuf-descriptor-document/0.1.0';
export const PROTOBUF_SOURCE_IMPORT_PROFILE = 'umf-r8-protobuf-source-import/0.1.0';
export const AVRO_FIELDS_PROFILE = 'umf-r5-avro-fields/0.1.0';
export const RECORD_TYPE_BINDING_PROFILE = 'umf.record-type-binding/1.0.0';
export {JSON_SCHEMA_PROFILE};
export {DOCUMENT_COMPARISON_PROFILE};
/** Execute the explicitly selected Record Type tagged wire profile over WASM. */
export function executeRecordTypeBindingWire(module, wireJson, controlDispatcher) {
  if (typeof module?.executeRecordTypeWire !== 'function' || typeof module?.recordTypeBindingProfileVersion !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  if (module.recordTypeBindingProfileVersion() !== RECORD_TYPE_BINDING_PROFILE) throw new Error('RUST_WASM_BINDING_PROFILE_MISMATCH');
  return module.executeRecordTypeWire(wireJson, controlDispatcher);
}
export {JsonSchemaUmfError as UmfError};

/** Create the opt-in protection source identity and transform-reference resolver. */
export function createSecurityProtectionSourceEngine(module) {
  if (typeof module?.executeSecurityProtectionSourceWire !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  return createSecurityProtectionSourceEngineWithWire(wire => module.executeSecurityProtectionSourceWire(wire), UmfCoreError);
}

/** Create the opt-in Rust engine for bounded protection-query property inspection. */
export function createSecurityQueryPropertiesEngine(module) {
  if (typeof module?.executeSecurityQueryPropertiesWire !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  return createSecurityQueryPropertiesEngineWithWire(wire => module.executeSecurityQueryPropertiesWire(wire), UmfCoreError);
}

/** Create the opt-in Rust engine for bounded typed protection-parameter literal admission. */
export function createSecurityProtectionParametersEngine(module) {
  if (typeof module?.executeSecurityProtectionParametersWire !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  return createSecurityProtectionParametersEngineWithWire(wire => module.executeSecurityProtectionParametersWire(wire), UmfCoreError);
}

function hasBrowserRuntime(host) {
  return !!host && typeof host.WebAssembly === 'object' && typeof host.WebAssembly.instantiate === 'function';
}

/** Create the opt-in synchronous trusted semantic validator registry over WASM. */
function createSemanticTypeRegistryAdmitted(module, controls, callbackProfile = 'report-work') {
  if (typeof module?.executeSemanticValueWire !== 'function') throw new Error('WASM_BINDING_MISSING');
  return createSemanticTypeRegistryWithWire(module, {getControlBridge: () => hasControls(controls) ? createControlBridge(controls) : undefined, ErrorType: UmfCoreError,callbackProfile});
}

export function createSemanticTypeRegistry(module, options = {}) {
  const {controls} = codegenOptions(options);
  return createSemanticTypeRegistryAdmitted(module, controls);
}

/** Create the default-root registry adapter with the exact TypeScript callback contract. */
export function createDefaultSemanticTypeRegistry(module, options = {}) {
  const {controls} = codegenOptions(options);
  return createSemanticTypeRegistryAdmitted(module, controls, 'typescript');
}

/** Initialize the opt-in browser semantic value registry over the Rust/WASM module. */
export async function initializeSemanticValueWasm(loader = () => import('./pkg/umf_core_wasm.js'), host = globalThis, options = {}) {
  const {controls} = codegenOptions(options);
  if (!hasBrowserRuntime(host)) throw new Error('WASM_RUNTIME_UNAVAILABLE');
  const module = await loader();
  if (typeof module.default === 'function') await module.default();
  return createSemanticTypeRegistryAdmitted(module, controls);
}

/** Initialize the default-root semantic registry with the TypeScript callback contract. */
export async function initializeDefaultSemanticValueWasm(loader = () => import('./pkg/umf_core_wasm.js'), host = globalThis, options = {}) {
  const {controls} = codegenOptions(options);
  if (!hasBrowserRuntime(host)) throw new Error('WASM_RUNTIME_UNAVAILABLE');
  const module = await loader();
  if (typeof module.default === 'function') await module.default();
  return createSemanticTypeRegistryAdmitted(module, controls, 'typescript');
}

export function createTemporalEngine(module) {
  for (const name of ['temporalParseGregorianDateWire', 'temporalTruncateGregorianDateWire', 'temporalParseRfc3339ExactInstantWire', 'temporalSameRfc3339ExactInstantWire']) {
    if (typeof module?.[name] !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  }
  const decoded = (wire) => {
    if (typeof wire === 'string' && wire.startsWith('ERR|')) {
      const [, name, ...parts] = wire.split('|');
      const ErrorType = name === 'TypeError' ? TypeError : RangeError;
      throw new ErrorType(parts.join('|'));
    }
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
/** Create the opt-in `umf-json-number/0.1` exact number check over WASM. */
export function createJsonNumberEngine(module, options = {}) {
  if (typeof module?.executeJsonNumberWire !== 'function' || typeof module?.jsonNumberProfileVersion !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  if (module.jsonNumberProfileVersion() !== JSON_NUMBER_PROFILE) throw new Error('RUST_WASM_BINDING_PROFILE_MISMATCH');
  return createJsonNumberEngineWithWire((wire, control) => module.executeJsonNumberWire(wire, control), options);
}
/** Initialize the opt-in exact JSON number operation in a browser. */
export async function initializeJsonNumberWasm(loader = () => import('./pkg/umf_core_wasm.js'), host = globalThis, options = {}) {
  if (!hasBrowserRuntime(host)) throw new Error('WASM_RUNTIME_UNAVAILABLE');
  const module = await loader();
  if (typeof module.default === 'function') await module.default();
  return createJsonNumberEngine(module, options);
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

/** @internal Initialize the default-root model facade without tuple admission while tuple exports remain TypeScript. */
export async function initializeCoreModelRootWasm(resources, loader = () => import('./pkg/umf_core_wasm.js'), host = globalThis, options) {
  if (!hasBrowserRuntime(host)) throw new Error('WASM_RUNTIME_UNAVAILABLE');
  const module = await loader();
  if (typeof module.default === 'function') await module.default();
  if (typeof module.copyJsonWire !== 'function' || typeof module.executeRequestWire !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  return createCoreModelRootEngine(module, resources, options);
}

/** Initialize the opt-in Rust-owned umf.host-json/1 record-values input route. */
export async function initializeCoreRecordValuesHostInputWasm(resources, loader = () => import('./pkg/umf_core_wasm.js'), host = globalThis, options = {}) {
  if (!hasBrowserRuntime(host)) throw new Error('WASM_RUNTIME_UNAVAILABLE');
  const module = await loader();
  if (typeof module.default === 'function') await module.default();
  if (typeof module.executeValidateCoreRecordValuesHostJson !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  const {controls} = codegenOptions(options);
  return Object.freeze({
    validateCoreRecordValues(source, identity, values) {
      const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
      const hostWork = admissionWork(controlBridge);
      hostWork?.(1);
      return validateCoreRecordValuesHostInput(module, resources, source, identity, values, JsonSchemaUmfError, controlBridge);
    },
  });
}

/** Initialize Rust-owned staged host admission for the core kind/nullability operations. */
export async function initializeCoreKindNullabilityHostInputWasm(resources, loader = () => import('./pkg/umf_core_wasm.js'), host = globalThis, options = {}) {
  if (!hasBrowserRuntime(host)) throw new Error('WASM_RUNTIME_UNAVAILABLE');
  const module = await loader();
  if (typeof module.default === 'function') await module.default();
  if (typeof module.CoreKindNullabilityRuntime !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  const {profile, controls} = codegenOptions(options);
  const rawResourceControls = descriptor(options, 'resourceControls', false);
  const resourceControls = rawResourceControls === undefined ? controls : codegenOptions({controls:rawResourceControls}).controls;
  const names = ['coreSchema', 'referenceSchema', 'packageSchema', 'constraints', 'domainPolicy'];
  // Resource setup is a factory operation with its own fresh control ledger;
  // operation calls below receive separate fresh ledgers.
  const initializeBridge = hasControls(resourceControls) ? createControlBridge(resourceControls) : undefined;
  const initializeWork = admissionWork(initializeBridge);
  initializeWork?.(1);
  if (!resources || (Object.getPrototypeOf(resources) !== Object.prototype && Object.getPrototypeOf(resources) !== null)) throw new TypeError('Engine resources must be a plain object');
  const resourceKeys = Reflect.ownKeys(resources);
  initializeWork?.(resourceKeys.length);
  for (const key of resourceKeys) {
    if (typeof key !== 'string' || !names.includes(key)) throw new TypeError('Unknown explicit engine resource');
    initializeWork?.(key.length + 1);
  }
  const fixedResources = Object.create(null);
  for (const name of names) {
    const resource = descriptor(resources, name, true, initializeWork);
    fixedResources[name] = fromWire(toWire(resource, {maxDepth:128, maxValues:1_000_000, work:initializeWork}), initializeWork);
  }
  const resourcesWire = encodeWire(fixedResources, {maxDepth:128, maxValues:1_000_000, work:initializeWork});
  initializeWork?.(resourcesWire.length);
  let runtime;
  try { runtime = new module.CoreKindNullabilityRuntime(resourcesWire, initializeBridge); }
  catch (error) { nativeKeyTupleFailure(error); }
  const call = (operation, inputs) => {
    const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const hostWork = admissionWork(controlBridge);
    hostWork?.(1);
    return coreKindNullabilityHostInput(runtime, operation, inputs, JsonSchemaUmfError, controlBridge);
  };
  return Object.freeze({
    [CORE_KIND_NULLABILITY_RUNTIME]: runtime,
    [CORE_KIND_NULLABILITY_PREPARED]: {fixedResources, resourcesWire, resourceBridge: initializeBridge, hostWork: initializeWork, profile, controls},
    inspectCoreElementKind(source, identity) { return call('inspectCoreKind', [source, identity, undefined]); },
    declareCoreElementKind(source, identity, kind) { return call('declareCoreKind', [source, identity, kind]); },
    verifyCoreKindDeclaration(receipt, current) { return call('verifyCoreKindDeclaration', [receipt, current, undefined]); },
    inspectCoreNullability(source, identity) { return call('inspectCoreNullability', [source, identity, undefined]); },
    declareCoreNullability(source, identity, nullability) { return call('declareCoreNullability', [source, identity, nullability]); },
    verifyCoreNullabilityDeclaration(receipt, current) { return call('verifyCoreNullabilityDeclaration', [receipt, current, undefined]); },
  });
}

/** Initialize the opt-in Rust-owned source/input/receipt admission route for full Dataset values. */
export async function initializeCoreDatasetValuesHostInputWasm(resources, loader = () => import('./pkg/umf_core_wasm.js'), host = globalThis, options = {}) {
  if (!hasBrowserRuntime(host)) throw new Error('WASM_RUNTIME_UNAVAILABLE');
  const module = await loader();
  if (typeof module.default === 'function') await module.default();
  if (typeof module.CoreDatasetValuesRuntime !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  const {controls} = codegenOptions(options);
  const names = ['coreSchema', 'referenceSchema', 'packageSchema', 'constraints', 'domainPolicy'];
  const initializeBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
  const initializeWork = admissionWork(initializeBridge);
  initializeWork?.(1);
  if (!resources || (Object.getPrototypeOf(resources) !== Object.prototype && Object.getPrototypeOf(resources) !== null)) throw new TypeError('Engine resources must be a plain object');
  const resourceKeys = Reflect.ownKeys(resources);
  initializeWork?.(resourceKeys.length);
  for (const key of resourceKeys) {
    if (typeof key !== 'string' || !names.includes(key)) throw new TypeError('Unknown explicit engine resource');
    initializeWork?.(key.length + 1);
  }
  const fixedResources = Object.create(null);
  for (const name of names) {
    const resource = descriptor(resources, name, true, initializeWork);
    fixedResources[name] = fromWire(toWire(resource, {maxDepth:128, maxValues:1_000_000, work:initializeWork}), initializeWork);
  }
  const resourcesWire = encodeWire(fixedResources, {maxDepth:128, maxValues:1_000_000, work:initializeWork});
  initializeWork?.(resourcesWire.length);
  let runtime;
  try { runtime = new module.CoreDatasetValuesRuntime(resourcesWire, initializeBridge); }
  catch (error) { nativeKeyTupleFailure(error); }
  const call = (operation, inputs) => {
    const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const hostWork = admissionWork(controlBridge);
    hostWork?.(1);
    return coreDatasetValuesHostInput(runtime, operation, inputs, JsonSchemaUmfError, controlBridge);
  };
  return Object.freeze({
    validateCoreDatasetValues(source, input) { return call('validateCoreDatasetValues', [source, input, undefined]); },
    verifyCoreDatasetValues(receipt, current, expectedInput) { return call('verifyCoreDatasetValues', [receipt, current, expectedInput]); },
  });
}

/** Initialize the standalone Iceberg schema JSON engine using pinned WASM resources. */
export async function initializeIcebergSchemaWasm(loader = () => import('./pkg/umf_core_wasm.js'), host = globalThis, options = {}) {
  if (!hasBrowserRuntime(host)) throw new Error('WASM_RUNTIME_UNAVAILABLE');
  const module = await loader();
  if (typeof module.default === 'function') await module.default();
  return createIcebergSchemaEngine(module, options);
}

/** Initialize the opt-in CONTRACT-002 adapter in a browser-compatible WASM host. */
export async function initializeJsonSchemaWasm(loader = () => import('./pkg/umf_core_wasm.js'), host = globalThis, options = {}) {
  codegenOptions(options);
  if (!hasBrowserRuntime(host)) throw new Error('WASM_RUNTIME_UNAVAILABLE');
  const module = await loader();
  if (typeof module.default === 'function') await module.default();
  return createJsonSchemaEngine(module, options);
}

/** Initialize the opt-in Protobuf descriptor inspector in a browser. */
export async function initializeProtobufInspectWasm(loader = () => import('./pkg/umf_core_wasm.js'), host = globalThis, options = {}) {
  if (!hasBrowserRuntime(host)) throw new Error('WASM_RUNTIME_UNAVAILABLE');
  const module = await loader();
  if (typeof module.default === 'function') await module.default();
  return createProtobufInspector(module, options);
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
  if (failure) throw nativeCoreError(failure);
  return fromWire(JSON.parse(response.wire));
}

function runRawJsonValue(module, nativeFunction, input, format, controls, encodeOptions) {
  const bridge = hasControls(controls) ? createControlBridge(controls) : undefined;
  const hostWork = admissionWork(bridge);
  const admitted = copyTypescriptJsonHostValue(input, hostWork);
  const wire = encodeWire(admitted, {...encodeOptions, work: hostWork});
  const response = JSON.parse(nativeFunction(wire, format, bridge));
  const failure = resultError(response);
  if (failure) {
    if (['RESOURCE_LIMIT', 'CANCELLED', 'METER_FAILURE', 'CANCELLATION_CHECK_FAILURE', 'CLOCK_CAPABILITY_REQUIRED', 'DEADLINE'].includes(failure.code)) {
      throw new UmfCoreError(failure.code, failure.message, failure.path);
    }
    throw new JsonSchemaUmfError(failure.code, failure.message, failure.path);
  }
  return fromWire(JSON.parse(response.wire));
}

// Match src/model/json.ts copyJson admission before converting host values to wire.
function copyTypescriptJsonHostValue(input, work) {
  const active = new Set();
  let values = 0;
  function visit(value, path, depth) {
    work?.(1);
    if (++values > 100_000 || depth > 128) throw new JsonSchemaUmfError('LIMIT', 'JSON structural limit exceeded', path);
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
      if (typeof value === 'string') work?.(value.length);
      return value;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || Object.is(value, -0) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
        throw new JsonSchemaUmfError('NUMBER', 'Number outside the core interoperable numeric profile', path);
      }
      return value;
    }
    if (typeof value !== 'object') throw new JsonSchemaUmfError('NON_JSON', 'Value is not JSON-compatible', path);
    if (active.has(value)) throw new JsonSchemaUmfError('CYCLE', 'Cyclic value', path);
    const array = Array.isArray(value);
    const proto = Object.getPrototypeOf(value);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) {
      throw new JsonSchemaUmfError('NON_JSON', 'Custom object prototype', path);
    }
    if (Object.getOwnPropertySymbols(value).length) throw new JsonSchemaUmfError('NON_JSON', 'Symbol keys are not JSON-compatible', path);
    active.add(value);
    const descriptors = Object.create(null);
    const ownKeys = Reflect.ownKeys(value);
    work?.(ownKeys.length);
    for (const key of ownKeys) {
      const property = Object.getOwnPropertyDescriptor(value, key);
      if (property) Object.defineProperty(descriptors, key, {value: property, enumerable: true, writable: true, configurable: true});
    }
    const result = array ? [] : Object.create(null);
    const keys = Object.keys(descriptors);
    for (const key of keys) {
      const property = descriptors[key];
      if (array && key === 'length') continue;
      if (!property.enumerable || !Object.hasOwn(property, 'value')) {
        throw new JsonSchemaUmfError('NON_JSON', 'Hidden fields and accessors cannot be serialized faithfully', `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`);
      }
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= 0xffff_ffff || Number(key) >= value.length)) {
        throw new JsonSchemaUmfError('NON_JSON', 'Non-index array property', path);
      }
      work?.(key.length + 1);
      const childPath = `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
      Object.defineProperty(result, key, {value: visit(property.value, childPath, depth + 1), enumerable: true, writable: true, configurable: true});
    }
    if (array && Object.keys(value).length !== value.length) throw new JsonSchemaUmfError('NON_JSON', 'Sparse arrays are not JSON values', path);
    active.delete(value);
    return result;
  }
  return visit(input, '', 0);
}

function nativeKeyTupleFailure(error) {
  const messageDescriptor = error !== null && (typeof error === 'object' || typeof error === 'function')
    ? Object.getOwnPropertyDescriptor(error, 'message') : undefined;
  const message = typeof messageDescriptor?.value === 'string' ? messageDescriptor.value : undefined;
  if (message !== undefined) {
    try {
      const failure = resultError(JSON.parse(message));
      if (failure) throw nativeCoreError(failure);
    } catch (decoded) {
      if (isNativeUmfCoreError(decoded)) throw decoded;
    }
  }
  throw error;
}

function nativeKeyTupleResult(responseText, hostWork) {
  hostWork?.(responseText.length);
  const envelope = JSON.parse(responseText);
  const failure = resultError(envelope);
  if (failure) throw nativeCoreError(failure);
  hostWork?.(envelope.wire?.length ?? 1);
  return fromWire(JSON.parse(envelope.wire), hostWork);
}

const typedArrayByteLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength').get;

function createNativeKeyTupleOperations(module, resources, controls, setup = {}) {
  const createHandle = (source, hostWork, controlBridge) => {
    let handle;
    try {
      hostWork?.(1);
      const sourceWire = encodeWire(source, {maxDepth: 128, maxValues: 100_000, work: hostWork});
      const resourcesWire = encodeWire(resources, {maxDepth: 128, maxValues: 1_000_000, work: hostWork});
      handle = new module.PreparedCoreKeyTupleHandle(sourceWire, resourcesWire, controlBridge);
    } catch (error) { nativeKeyTupleFailure(error); }
    let retained;
    try {
      const sourceWire = handle.sourceWire(controlBridge);
      retained = fromWire(JSON.parse(sourceWire), hostWork);
    } catch (error) { nativeKeyTupleFailure(error); }
    const freeze = value => {
      if (value !== null && typeof value === 'object') {
        for (const key of Object.keys(value)) freeze(value[key]);
        Object.freeze(value);
      }
      return value;
    };
    return {handle, source: freeze(retained)};
  };
  const invoke = (handle, method, args) => {
    const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const hostWork = admissionWork(controlBridge);
    hostWork?.(1);
    try {
      const wireArgs = args.map(value => encodeWire(value, {maxDepth: 128, maxValues: 100_000, work: hostWork}));
      return nativeKeyTupleResult(handle[method](...wireArgs, controlBridge), hostWork);
    } catch (error) { nativeKeyTupleFailure(error); }
  };
  let runtime;
  if (typeof module.CoreKeyTupleRuntime === 'function') {
    try {
      const resourcesWire = encodeWire(resources, {maxDepth: 128, maxValues: 1_000_000, work: setup.work});
      setup.work?.(resourcesWire.length);
      runtime = new module.CoreKeyTupleRuntime(resourcesWire, setup.bridge);
    } catch (error) { nativeKeyTupleFailure(error); }
  }
  return {
    encode(source, identity, values, options) {
      const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
      const hostWork = admissionWork(controlBridge);
      hostWork?.(1);
      try {
        const limits = {maxDepth: 128, maxValues: 100_000, work: hostWork};
        const sourceWire = encodeWire(source, limits);
        const identityWire = encodeWire(identity, limits);
        const valuesWire = encodeWire(values, limits);
        const staged = runtime.prepareEncoding(sourceWire, identityWire, valuesWire, controlBridge);
        const optionsWire = options === undefined ? undefined : encodeWire(options, limits);
        return nativeKeyTupleResult(staged.encodeWithOptions(optionsWire, controlBridge), hostWork);
      } catch (error) { nativeKeyTupleFailure(error); }
    },
    verify(receipt, current) {
      const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
      const hostWork = admissionWork(controlBridge);
      hostWork?.(1);
      let staged;
      try {
        const receiptWire = encodeWire(receipt, {maxDepth: 128, maxValues: 100_000, work: hostWork});
        if (!runtime?.prepareVerification) throw new UmfCoreError('RUST_WASM_BINDING_MISSING', 'WASM binding does not expose receipt-first Core Key tuple verification');
        staged = runtime.prepareVerification(receiptWire, controlBridge);
        const currentWire = encodeWire(current, {maxDepth: 128, maxValues: 100_000, work: hostWork});
        return nativeKeyTupleResult(staged.verifyCurrent(currentWire, controlBridge), hostWork);
      } catch (error) { nativeKeyTupleFailure(error); }
    },
    prepare(source) {
      const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
      const hostWork = admissionWork(controlBridge);
      let prepared;
      if (runtime?.prepare) {
        try {
          hostWork?.(1);
          const sourceWire = encodeWire(source, {maxDepth: 128, maxValues: 100_000, work: hostWork});
          prepared = {handle: runtime.prepare(sourceWire, controlBridge)};
        } catch (error) { nativeKeyTupleFailure(error); }
      } else {
        prepared = createHandle(source, hostWork, controlBridge);
      }
      let retained = prepared.source;
      if (prepared.source === undefined) {
        try {
          const sourceWire = prepared.handle.sourceWire(controlBridge);
          retained = fromWire(JSON.parse(sourceWire), hostWork);
        } catch (error) { nativeKeyTupleFailure(error); }
      }
      const freeze = value => {
        if (value !== null && typeof value === 'object') {
          for (const key of Object.keys(value)) freeze(value[key]);
          Object.freeze(value);
        }
        return value;
      };
      return {source: freeze(retained),
        encode(identity, values) { return invoke(prepared.handle, 'encode', [identity, values]); },
        verify(receipt) { return invoke(prepared.handle, 'verify', [receipt]); }};
    },
    prepareRead(receipt) {
      const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
      const hostWork = admissionWork(controlBridge);
      hostWork?.(1);
      let staged;
      try {
        const receiptWire = encodeWire(receipt, {maxDepth: 128, maxValues: 100_000, work: hostWork});
        if (!runtime?.prepareVerification) throw new UmfCoreError('RUST_WASM_BINDING_MISSING', 'WASM binding does not expose receipt-first Core Key tuple verification');
        staged = runtime.prepareVerification(receiptWire, controlBridge);
      } catch (error) { nativeKeyTupleFailure(error); }
      return {readBytes(current) {
        try {
          const currentWire = encodeWire(current, {maxDepth: 128, maxValues: 100_000, work: hostWork});
          const nativeBytes = staged.readBytes(currentWire, controlBridge);
          hostWork?.(typedArrayByteLength.call(nativeBytes));
          return new Uint8Array(nativeBytes);
        } catch (error) { nativeKeyTupleFailure(error); }
      }};
    },
  };
}

function createNativeCoreKeyVerificationOperations(module, resources, controls, setup = {}) {
  const sharedRuntime = setup.runtime;
  if (sharedRuntime
      ? typeof sharedRuntime.prepareVerification !== 'function' || typeof sharedRuntime.finishVerification !== 'function' || typeof sharedRuntime.discardVerification !== 'function'
      : typeof module.CoreKeyVerificationRuntime !== 'function' ||
        typeof module.CoreKeyVerificationRuntime.prototype?.prepareVerification !== 'function' ||
        typeof module.CoreKeyVerificationRuntime.prototype?.finishVerification !== 'function' ||
        typeof module.CoreKeyVerificationRuntime.prototype?.discardVerification !== 'function') {
    const missing = () => { throw new Error('RUST_BINDING_MISSING'); };
    return {prepare: missing, finish: missing, discard: missing};
  }
  let runtime;
  try {
    const resourcesWire = setup.resourcesWire ?? encodeWire(resources, {maxDepth: 128, maxValues: 1_000_000, work: setup.work});
    if (setup.resourcesWire === undefined) setup.work?.(resourcesWire.length);
    runtime = sharedRuntime ?? new module.CoreKeyVerificationRuntime(resourcesWire, setup.bridge);
  } catch (error) { nativeKeyTupleFailure(error); }
  return {
    prepare(receipt) {
      const bridge = hasControls(controls) ? createControlBridge(controls) : undefined;
      const work = admissionWork(bridge);
      work?.(1);
      let wire;
      try {
        wire = encodeWire(receipt, {maxDepth: 128, maxValues: 100_000, work});
      } catch (error) { throw error; }
      try { return {handle: runtime.prepareVerification(wire, bridge), bridge, work}; }
      catch (error) { nativeKeyTupleFailure(error); }
    },
    finish(stage, current) {
      let wire;
      try {
        stage.work?.(1);
        wire = encodeWire(current, {maxDepth: 128, maxValues: 100_000, work: stage.work});
      } catch (error) { throw error; }
      try { return nativeKeyTupleResult(runtime.finishVerification(stage.handle, wire, stage.bridge), stage.work); }
      catch (error) { nativeKeyTupleFailure(error); }
    },
    discard(stage) {
      try { runtime.discardVerification(stage.handle); }
      catch (error) { nativeKeyTupleFailure(error); }
    },
  };
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

function invoke(module, request, callbacks, profile, controls, accountHost = false, sharedControlBridge = undefined, sharedHostWork = undefined, retainedRuntime = undefined) {
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
  const requestWire = encodeRequestWire(request, hostWork);
  const responseText = retainedRuntime
    ? retainedRuntime.executeModelRequestWire(requestWire, profile, dispatcher, controlBridge)
    : module.executeRequestWire(requestWire, profile, dispatcher, controlBridge);
  hostWork?.(responseText.length);
  const response = JSON.parse(responseText);
  const failure = resultError(response);
  if (failure) throw nativeCoreError(failure);
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

/** @internal Create the default-root model facade without tuple admission while tuple exports remain TypeScript. */
export function createCoreModelRootEngine(module, resources, options = {}) {
  return createEngineInternal(module, resources, options, true, false, true);
}

/** Private opt-in retained model and Kind/Nullability dispatcher. */
export async function initializeCoreModelRootKindNullabilityWasm(resources, loader = () => import('./pkg/umf_core_wasm.js'), host = globalThis, options = {}) {
  if (!hasBrowserRuntime(host)) throw new Error('WASM_RUNTIME_UNAVAILABLE');
  const module = await loader();
  if (typeof module.default === 'function') await module.default();
  const staged = await initializeCoreKindNullabilityHostInputWasm(resources, async () => module, host, options);
  const model = createEngineInternal(module, resources, options, true, false, false, false, staged[CORE_KIND_NULLABILITY_RUNTIME], staged[CORE_KIND_NULLABILITY_PREPARED], staged[CORE_KIND_NULLABILITY_RUNTIME]);
  const api = {...model};
  for (const name of ['inspectCoreElementKind','declareCoreElementKind','verifyCoreKindDeclaration','inspectCoreNullability','declareCoreNullability','verifyCoreNullabilityDeclaration']) api[name] = staged[name];
  return Object.freeze(api);
}

/** Create the private opt-in Rust-owned host-admission engine for Core Cardinality. */
export function createCoreCardinalityHostInputEngine(module, resources, options = {}) {
  const {controls} = codegenOptions(options);
  const rawResourceControls = descriptor(options ?? Object.create(null), 'resourceControls', false);
  const resourceControls = rawResourceControls === undefined ? controls : codegenOptions({controls: rawResourceControls}).controls;
  if (hasControls(controls) || hasControls(resourceControls)) throw new UmfCoreError('HOST_JSON_CONTROLS_UNSUPPORTED', 'Host-input Core Cardinality operations do not accept operation or resource control callbacks');
  return createEngineInternal(module, resources, options, false, false, false, true);
}

/** Create the opt-in retained WASM Record Type declaration/verification engine. */
export function createCoreRecordTypeEngine(module, resources, options = {}) {
  const Runtime = module?.CoreRecordTypeVerificationRuntime;
  if (typeof Runtime !== 'function' || typeof Runtime.prototype?.prepareVerification !== 'function' ||
      typeof Runtime.prototype?.finishVerification !== 'function' || typeof module.executeRequestWire !== 'function') {
    throw new UmfCoreError('RUST_WASM_BINDING_MISSING', 'WASM binding does not expose retained Core Record Type verification');
  }
  const {profile, controls} = codegenOptions(options);
  const rawSetup = descriptor(options, 'setupControls', false);
  const setupControls = codegenOptions({controls: rawSetup ?? Object.create(null)}).controls;
  const names = ['coreSchema', 'referenceSchema', 'packageSchema', 'constraints', 'domainPolicy'];
  const setupBridge = hasControls(setupControls) ? createControlBridge(setupControls) : undefined;
  const setupWork = admissionWork(setupBridge);
  setupWork?.(1);
  for (const key of Reflect.ownKeys(resources)) {
    if (typeof key !== 'string' || !names.includes(key)) throw new TypeError('Unknown explicit engine resource');
  }
  const fixedResources = Object.create(null);
  for (const name of names) {
    const resource = descriptor(resources, name, true, setupWork);
    fixedResources[name] = fromWire(toWire(resource, {maxDepth: 128, maxValues: 1_000_000, work: setupWork}), setupWork);
  }
  let disposed = false;
  const maxOutstandingStages = 64;
  const nativeFailure = error => nativeKeyTupleFailure(error);
  let runtime;
  try {
    const wire = encodeWire(fixedResources, {maxDepth: 128, maxValues: 1_000_000, work: setupWork});
    setupWork?.(wire.length);
    runtime = new Runtime(wire, setupBridge);
  } catch (error) { nativeFailure(error); }
  const stages = new Set();
  function assertLive() { if (disposed) throw new UmfCoreError('CORE_RECORD_TYPE_DISPOSED', 'Core Record Type engine has been disposed'); }
  function invoke(operation, fields, bridge, work) {
    assertLive();
    work?.(1);
    const request = {op: `model/${operation}`, resources: fixedResources, registry: [], ...fields};
    let responseText;
    try { responseText = module.executeRequestWire(encodeRequestWire(request, work), profile, undefined, bridge); }
    catch (error) { nativeFailure(error); }
    work?.(responseText.length);
    const envelope = JSON.parse(responseText);
    const failure = resultError(envelope);
    if (failure) throw new UmfCoreError(failure.code, failure.message, failure.path);
    work?.(envelope.wire.length);
    return fromWire(JSON.parse(envelope.wire), work);
  }
  function prepare(receipt, bridge, work) {
    assertLive(); work?.(1);
    if (stages.size >= maxOutstandingStages) throw new UmfCoreError('CORE_RECORD_TYPE_STAGE_LIMIT', 'Outstanding Core Record Type verification stage limit exceeded');
    try {
      const wire = encodeWire(receipt, {maxDepth: 128, maxValues: 100_000, work});
      const native = runtime.prepareVerification(wire, bridge);
      const handle = Object.freeze(Object.create(null));
      stages.add(handle); prepared.set(handle, {native, bridge, work});
      return handle;
    } catch (error) { nativeFailure(error); }
  }
  const prepared = new WeakMap();
  function finish(handle, current) {
    assertLive();
    if (!handle || typeof handle !== 'object' || !stages.has(handle)) throw new TypeError('Invalid private Record Type verification handle');
    stages.delete(handle);
    const stage = prepared.get(handle); prepared.delete(handle);
    try {
      const currentWire = encodeWire(current, {maxDepth: 128, maxValues: 100_000, work: stage.work});
      return nativeKeyTupleResult(runtime.finishVerification(stage.native, currentWire, stage.bridge), stage.work);
    } catch (error) { nativeFailure(error); }
    finally { stage.native?.free?.(); }
  }
  const api = {
    declareCoreRecordType(fieldAuthor, recordAuthor) {
      assertLive();
      const bridge = hasControls(controls) ? createControlBridge(controls) : undefined;
      const work = admissionWork(bridge);
      return invoke('declareCoreRecordType', {fieldAuthor, recordAuthor}, bridge, work);
    },
    verifyCoreRecordTypeDeclaration(receipt, current) {
      const bridge = hasControls(controls) ? createControlBridge(controls) : undefined;
      const work = admissionWork(bridge);
      return finish(prepare(receipt, bridge, work), current);
    },
    prepareCoreRecordTypeVerification(receipt) {
      const bridge = hasControls(controls) ? createControlBridge(controls) : undefined;
      return prepare(receipt, bridge, admissionWork(bridge));
    },
    finishCoreRecordTypeVerification: finish,
    discardCoreRecordTypeVerification(handle) {
      assertLive();
      if (!handle || typeof handle !== 'object' || !stages.has(handle)) throw new TypeError('Invalid private Record Type verification handle');
      stages.delete(handle);
      const stage = prepared.get(handle); prepared.delete(handle);
      stage?.native?.free?.();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const handle of stages) {
        const stage = prepared.get(handle); stage?.native?.free?.(); prepared.delete(handle);
      }
      stages.clear(); runtime?.free?.();
    },
  };
  return Object.freeze(api);
}

/** Create the opt-in retained WASM Core Record Members inspector. */
export function createCoreRecordMembersEngine(module, resources, options = {}) {
  const Runtime = module?.CoreRecordMembersInspectionRuntime;
  if (typeof Runtime !== 'function' || typeof Runtime.prototype?.inspect !== 'function') {
    throw new UmfCoreError('RUST_WASM_BINDING_MISSING', 'WASM binding does not expose retained Core Record Members inspection');
  }
  const {profile, controls} = codegenOptions(options);
  const rawSetup = descriptor(options, 'setupControls', false);
  const setupControls = codegenOptions({controls: rawSetup ?? Object.create(null)}).controls;
  const names = ['coreSchema', 'referenceSchema', 'packageSchema', 'constraints', 'domainPolicy'];
  const setupBridge = hasControls(setupControls) ? createControlBridge(setupControls) : undefined;
  const setupWork = admissionWork(setupBridge);
  setupWork?.(1);
  const resourcePrototype = Object.getPrototypeOf(resources);
  if (resourcePrototype !== Object.prototype && resourcePrototype !== null) throw new TypeError('Engine resources must be a plain object');
  for (const key of Reflect.ownKeys(resources)) {
    if (typeof key !== 'string' || !names.includes(key)) throw new TypeError('Unknown explicit engine resource');
  }
  const fixedResources = Object.create(null);
  for (const name of names) {
    const resource = descriptor(resources, name, true, setupWork);
    fixedResources[name] = fromWire(toWire(resource, {maxDepth: 128, maxValues: 1_000_000, work: setupWork}), setupWork);
  }
  let runtime;
  let disposed = false;
  try {
    const wire = encodeWire(fixedResources, {maxDepth: 128, maxValues: 1_000_000, work: setupWork});
    setupWork?.(wire.length);
    runtime = new Runtime(wire, setupBridge);
  } catch (error) { nativeKeyTupleFailure(error); }
  const inspect = (source, identity) => {
    if (disposed) throw new UmfCoreError('CORE_RECORD_MEMBERS_DISPOSED', 'Core Record Members engine has been disposed');
    const bridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const work = admissionWork(bridge);
    work?.(1);
    try {
      // Keep predecessor argument admission order: serialize source before identity.
      const sourceWire = encodeWire(source, {maxDepth: 128, maxValues: 100_000, work});
      const identityWire = encodeWire(identity, {maxDepth: 128, maxValues: 100_000, work});
      return nativeKeyTupleResult(runtime.inspect(sourceWire, identityWire, bridge), work);
    } catch (error) { nativeKeyTupleFailure(error); }
  };
  return Object.freeze({
    inspectCoreRecordMembers: inspect,
    dispose() {
      if (disposed) return;
      disposed = true;
      runtime?.free?.();
    },
  });
}

/** Create the opt-in retained Rust Core Key tuple engine over an initialized WASM module. */
export function createCoreKeyTupleEngine(module, resources, options = {}) {
  const runtimePrototype = module?.CoreKeyTupleRuntime?.prototype;
  if (typeof module?.CoreKeyTupleRuntime !== 'function' || typeof runtimePrototype?.prepare !== 'function' || typeof runtimePrototype?.prepareVerification !== 'function' || typeof runtimePrototype?.prepareEncoding !== 'function' || typeof module.PreparedCoreKeyTupleEncodeHandle?.prototype?.encodeWithOptions !== 'function') {
    throw new UmfCoreError('RUST_WASM_BINDING_MISSING', 'WASM binding does not expose retained Core Key tuple resources');
  }
  const engine = createEngineInternal(module, resources, options, true);
  return Object.freeze({
    encodeCoreKeyTuple: engine.encodeCoreKeyTuple,
    verifyCoreKeyTuple: engine.verifyCoreKeyTuple,
    readCoreKeyTupleBytes: engine.readCoreKeyTupleBytes,
    prepareCoreKeyTuples: engine.prepareCoreKeyTuples,
  });
}

/** Initialize WASM and create the opt-in retained Rust Core Key tuple engine. */
export async function initializeCoreKeyTupleWasm(resources, loader = () => import('./pkg/umf_core_wasm.js'), host = globalThis, options = {}) {
  if (!hasBrowserRuntime(host)) throw new Error('WASM_RUNTIME_UNAVAILABLE');
  const module = await loader();
  if (typeof module.default === 'function') await module.default();
  if (typeof module.copyJsonWire !== 'function' || typeof module.CoreKeyTupleRuntime !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  return createCoreKeyTupleEngine(module, resources, options);
}

/** Create the opt-in standalone Iceberg schema JSON engine over pinned Rust resources. */
export function createIcebergSchemaEngine(module, options = {}) {
  if (typeof module?.executeIcebergWire !== 'function' || typeof module?.icebergSchemaProfileVersion !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  if (module.icebergSchemaProfileVersion() !== ICEBERG_SCHEMA_PROFILE) throw new Error('RUST_WASM_BINDING_PROFILE_MISMATCH');
  const {controls} = codegenOptions(options);
  const call = (operation, fields) => {
    const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const hostWork = admissionWork(controlBridge);
    hostWork?.(1);
    const request = {op: `iceberg.schema.${operation}`, ...fields};
    const responseText = module.executeIcebergWire(encodeRequestWire(request, hostWork), controlBridge);
    hostWork?.(responseText.length);
    const envelope = JSON.parse(responseText);
    const failure = resultError(envelope);
    if (failure) throw new UmfCoreError(failure.code, failure.message, failure.path);
    hostWork?.(envelope.wire.length);
    return fromWire(JSON.parse(envelope.wire), hostWork);
  };
  return Object.freeze({
    importSchema(source, id) { return call('import', {source, id}); },
    exportSchema(document) { return call('export', {document}); },
    inspect(document) { return call('inspect', {document}); },
    getNode(document, pointer) { return call('getNode', {document, pointer}); },
    proposeNodeEdit(document, pointer, replacement) { return call('proposeNodeEdit', {document, pointer, replacement}); },
  });
}

/** Create the opt-in Arrow integration-schema JSON preservation engine. */
export function createArrowSchemaEngine(module, options = {}) {
  if (typeof module?.ArrowSchemaResourcesRuntime !== 'function' || typeof module?.arrowSchemaProfileVersion !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  if (module.arrowSchemaProfileVersion() !== ARROW_SCHEMA_PROFILE) throw new Error('RUST_WASM_BINDING_PROFILE_MISMATCH');
  const {profile} = codegenOptions(options);
  const setupControls = descriptor(options, 'setupControls', false);
  const invocationControls = descriptor(options, 'controls', false);
  const {controls: normalizedSetupControls} = codegenOptions({profile, controls: setupControls});
  const {controls} = codegenOptions({profile, controls: invocationControls});
  const setupBridge = hasControls(normalizedSetupControls) ? createControlBridge(normalizedSetupControls) : undefined;
  const setupWork = admissionWork(setupBridge);
  setupWork?.(1);
  const Runtime = module.ArrowSchemaResourcesRuntime;
  let runtime;
  try {
    runtime = new Runtime(encodeRequestWire({op: 'arrow.schema.createResources'}, setupWork), setupBridge);
  } catch (error) {
    let failure;
    try { failure = resultError(JSON.parse(error?.message)); } catch {}
    if (failure) throw new UmfCoreError(failure.code, failure.message, failure.path);
    throw error;
  }
  let disposed = false;
  function assertActive() {
    if (disposed) throw new UmfCoreError('RUST_ARROW_SCHEMA_HANDLE_DISPOSED', 'Arrow schema resources have been disposed');
  }
  const call = (operation, fields) => {
    assertActive();
    const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const hostWork = admissionWork(controlBridge);
    hostWork?.(1);
    const request = {op: `arrow.schema.${operation}`, ...fields};
    const responseText = runtime.executeWire(encodeRequestWire(request, hostWork), controlBridge);
    hostWork?.(responseText.length);
    const envelope = JSON.parse(responseText);
    const failure = resultError(envelope);
    if (failure) throw new UmfCoreError(failure.code, failure.message, failure.path);
    hostWork?.(envelope.wire.length);
    return fromWire(JSON.parse(envelope.wire), hostWork);
  };
  return Object.freeze({
    dispose() { if (!disposed) { disposed = true; runtime.dispose(); runtime.free(); } },
    importSchema(source, id) { return call('import', {source, id}); },
    exportSchema(document) { return call('export', {document}); },
    inspect(document) { return call('inspect', {document}); },
    getNode(document, pointer) { return call('getNode', {document, pointer}); },
    proposeNodeEdit(document, pointer, replacementJson) { return call('proposeNodeEdit', {document, pointer, replacement: replacementJson}); },
  });
}

/** Create the opt-in bounded Rust Protobuf descriptor inspector. */
export function createProtobufInspector(module, options = {}) {
  if (typeof module?.executeProtobufInspectWire !== 'function' || typeof module?.protobufInspectProfileVersion !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  if (module.protobufInspectProfileVersion() !== PROTOBUF_INSPECT_PROFILE) throw new Error('RUST_WASM_BINDING_PROFILE_MISMATCH');
  const {controls} = codegenOptions(options);
  return Object.freeze({
    inspect(document) {
      const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
      const hostWork = admissionWork(controlBridge);
      hostWork?.(1);
      const request = {op: 'protobuf.descriptor.inspect', document};
      const responseText = module.executeProtobufInspectWire(encodeRequestWire(request, hostWork), controlBridge);
      hostWork?.(responseText.length);
      const envelope = JSON.parse(responseText);
      const failure = resultError(envelope);
      if (failure) throw new UmfCoreError(failure.code, failure.message, failure.path);
      hostWork?.(envelope.wire.length);
      return fromWire(JSON.parse(envelope.wire), hostWork);
    },
  });
}

/** Create the opt-in descriptor/document packet; source compiler callbacks remain separate. */
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayTag = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag).get;
const typedArrayLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length').get;
const typedArrayBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get;
const typedArrayByteOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset').get;
function snapshotDescriptorByteLength(input) {
  let tag;
  try { tag = Reflect.apply(typedArrayTag, input, []); } catch { tag = undefined; }
  if (tag !== 'Uint8Array') throw new TypeError('Protobuf descriptor bytes must be a Uint8Array');
  return Reflect.apply(typedArrayLength, input, []);
}
function snapshotDescriptorBytes(input) {
  const length = snapshotDescriptorByteLength(input);
  if (length > 4_000_000) throw new UmfCoreError('LIMIT', 'Descriptor input exceeds limit');
  const buffer = Reflect.apply(typedArrayBuffer, input, []);
  const byteOffset = Reflect.apply(typedArrayByteOffset, input, []);
  const view = new Uint8Array(buffer, byteOffset, length);
  const snapshot = new Uint8Array(length);
  Uint8Array.prototype.set.call(snapshot, view);
  return snapshot;
}
export function createProtobufDescriptorDocumentEngine(module, options = {}) {
  if (typeof module?.executeProtobufDocumentWire !== 'function' || typeof module?.protobufDocumentProfileVersion !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  if (module.protobufDocumentProfileVersion() !== PROTOBUF_DOCUMENT_PROFILE) throw new Error('RUST_WASM_BINDING_PROFILE_MISMATCH');
  const {controls} = codegenOptions(options);
  function invoke(op, fields = {}, inputBinary = new Uint8Array()) {
    const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const hostWork = admissionWork(controlBridge);
    hostWork?.(1);
    const admittedFields = typeof fields === 'function' ? fields() : fields;
    const requestWire = encodeRequestWire({op, ...admittedFields}, hostWork);
    const inputLength = snapshotDescriptorByteLength(inputBinary);
    hostWork?.(inputLength);
    const ownedBinary = snapshotDescriptorBytes(inputBinary);
    const response = module.executeProtobufDocumentWire(requestWire, ownedBinary, controlBridge);
    hostWork?.(response.wireEnvelope.length + response.binary.length);
    const envelope = JSON.parse(response.wireEnvelope);
    const failure = resultError(envelope);
    if (failure) throw new UmfCoreError(failure.code, failure.message, failure.path);
    hostWork?.(envelope.wire.length);
    const value = fromWire(JSON.parse(envelope.wire), hostWork);
    return {value, binary: response.binary};
  }
  return Object.freeze({
    readDescriptorSet(binary) { return invoke('protobuf.descriptor.read', {}, binary).value; },
    writeDescriptorSet(descriptorSet) { return invoke('protobuf.descriptor.write', {descriptorSet}).binary; },
    importProtobufDescriptorSet(binary, options) {
      return invoke('protobuf.document.import', () => ({id: descriptor(options, 'id', true)}), binary).value;
    },
    getProtobufDescriptorSet(document) { return invoke('protobuf.document.get', {document}).value; },
    exportProtobufDescriptorSet(document) { return invoke('protobuf.document.export', {document}).binary; },
    exportProtobufBundle(document) {
      const result = invoke('protobuf.document.bundle', {document});
      return {...result.value, descriptorSet: result.binary};
    },
    inspectProtobuf(document) { return invoke('protobuf.document.inspect', {document}).value; },
  });
}

/** Initialize the opt-in descriptor/document packet. */
export async function initializeProtobufDescriptorDocumentWasm(loader = () => import('./pkg/umf_core_wasm.js'), host = globalThis, options = {}) {
  codegenOptions(options);
  if (!hasBrowserRuntime(host)) throw new Error('WASM_RUNTIME_UNAVAILABLE');
  const module = await loader();
  if (typeof module.default === 'function') await module.default();
  return createProtobufDescriptorDocumentEngine(module, options);
}

/** Explicit caller-supplied source compiler import; export reflection remains held. */
export function createProtobufSourceImportEngine(module, options = {}) {
  if (typeof module?.ProtobufSourceSession !== 'function' || module.protobufSourceProfileVersion?.() !== 'umf-r8-protobuf-source/0.1.0') throw new Error('RUST_WASM_BINDING_MISSING');
  const {controls} = codegenOptions(options);
  return Object.freeze({
    callbackControl: 'boundary-only',
    async importProtobufSources(input, compiler, sourceOptions) {
      const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
      const hostWork = admissionWork(controlBridge);
      hostWork?.(1);
      const session = new module.ProtobufSourceSession();
      const request = coreProtobufSourceHostInput(session, input, UmfCoreError, controlBridge);
      hostWork?.(0);
      const compiled = await compiler.compile(request);
      hostWork?.(0);
      if (!compiled.compiler) throw new UmfCoreError('PROTOBUF_SOURCE', 'Compiler identity is required');
      const descriptorSet = compiled.descriptorSet;
      const id = sourceOptions.id;
      const descriptorLength = snapshotDescriptorByteLength(descriptorSet);
      hostWork?.(descriptorLength);
      const bytes = snapshotDescriptorBytes(descriptorSet);
      const admitted = session.beginImportDescriptor(bytes, id, controlBridge);
      throwSourceResponseError(admitted);
      const archiveCompiler = compiled.compiler;
      const finished = session.finishImportArchive(archiveCompiler, controlBridge);
      return sourceResponseValue(finished, hostWork);
    },
  });
}

/** Explicit caller-supplied source emitter. Export remains opt-in. */
export function createProtobufSourceExportEngine(module, options = {}) {
  if (typeof module?.ProtobufSourceSession !== 'function' || module.protobufSourceProfileVersion?.() !== 'umf-r8-protobuf-source/0.1.0') throw new Error('RUST_WASM_BINDING_MISSING');
  const {controls} = codegenOptions(options);
  return Object.freeze({
    callbackControl: 'boundary-only',
    async exportProtobufSources(document, emitter) {
      const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
      const hostWork = admissionWork(controlBridge);
      hostWork?.(1);
      const session = new module.ProtobufSourceSession();
      const prepared = coreProtobufSourceHostResponse(session, 'prepareExportHost', document, UmfCoreError, controlBridge);
      const descriptorBytes = snapshotDescriptorBytes(prepared.binary);
      hostWork?.(descriptorBytes.byteLength);
      const result = await emitter.emit(descriptorBytes);
      // A rejected callback propagates by identity; the boundary checkpoint is
      // reached only after successful fulfillment.
      hostWork?.(0);
      try {
        coreProtobufSourceHostResponse(session, 'admitEmitterResultHost', result, UmfCoreError, controlBridge);
      } catch (error) {
        // Rust has already copied the null result. Reproduce the predecessor's
        // ordinary result.files access so null remains a native TypeError.
        if (result === null && error?.code === 'PROTOBUF_EMIT') result.files;
        throw error;
      }
      const finished = coreProtobufSourceHostResponse(session, 'finishExportHost', document, UmfCoreError, controlBridge);
      hostWork?.(finished.value && JSON.stringify(finished.value).length || 1);
      return finished.value;
    },
  });
}

export async function initializeProtobufSourceImportWasm(loader = () => import('./pkg/umf_core_wasm.js'), host = globalThis, options = {}) {
  codegenOptions(options);
  if (!hasBrowserRuntime(host)) throw new Error('WASM_RUNTIME_UNAVAILABLE');
  const module = await loader();
  if (typeof module.default === 'function') await module.default();
  return createProtobufSourceImportEngine(module, options);
}

export async function initializeProtobufSourceExportWasm(loader = () => import('./pkg/umf_core_wasm.js'), host = globalThis, options = {}) {
  codegenOptions(options);
  if (!hasBrowserRuntime(host)) throw new Error('WASM_RUNTIME_UNAVAILABLE');
  const module = await loader();
  if (typeof module.default === 'function') await module.default();
  return createProtobufSourceExportEngine(module, options);
}

function throwSourceResponseError(response) {
  const envelope = JSON.parse(response.wireEnvelope);
  const failure = resultError(envelope);
  if (failure) throw new UmfCoreError(failure.code, failure.message, failure.path);
  return envelope;
}

function sourceResponseValue(response, hostWork) {
  const envelope = throwSourceResponseError(response);
  hostWork?.(envelope.wire.length);
  return fromWire(JSON.parse(envelope.wire), hostWork);
}

/** Create the opt-in CONTRACT-002 Rust adapter and tree-operation surface over WASM. */
export function createJsonSchemaEngine(module, options = {}) {
  if (typeof module?.executeJsonSchemaWire !== 'function' || typeof module?.jsonSchemaProfileVersion !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  if (module.jsonSchemaProfileVersion() !== JSON_SCHEMA_PROFILE) throw new Error('RUST_WASM_BINDING_PROFILE_MISMATCH');
  const {controls} = codegenOptions(options);
  const preflight = () => {
    const bridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const work = admissionWork(bridge);
    work?.(1);
    return {bridge, work};
  };
  const call = (op, fields, {bridge, work}) => {
    const response = JSON.parse(module.executeJsonSchemaWire(encodeRequestWire({profile: JSON_SCHEMA_PROFILE, op, ...fields}, work), bridge));
    work?.(response.wire?.length ?? 1);
    const failure = resultError(response);
    if (failure) throw jsonSchemaFailureError(failure, UmfCoreError);
    return fromWire(JSON.parse(response.wire), work);
  };
  return createJsonSchemaOperations(call, preflight);
}

/** Private staged import profile; callers opt in and inputs are string-only. */
import {finishJsonSchemaSourceObservation, stageJsonSchemaSource} from './src/json-schema-import-source.js';
export const JSON_SCHEMA_STAGED_IMPORT_PROFILE = 'umf-r8-json-schema-staged-wasm-private/0.1.0';

function stagedImportUri(uri) {
  try {
    const url = new URL(uri);
    if (url.hash || uri.includes('#')) throw new Error();
  } catch {
    throw new JsonSchemaUmfError('JSON_SCHEMA_URI', 'Retrieval URI must be absolute and fragment-free');
  }
}

/** Create a private staged import facade. This does not change the default route. */
export function createJsonSchemaStagedImportEngine(module) {
  if (typeof module?.JsonSchemaImportSessionHandle !== 'function' ||
      module.jsonSchemaImportSessionProfileVersion?.() !== JSON_SCHEMA_STAGED_IMPORT_PROFILE) {
    throw new Error('RUST_WASM_BINDING_MISSING');
  }
  return Object.freeze({
    importJsonSchema(source, options) {
      return runStagedJsonSchemaImport(module, source, options, false);
    },
    /** Private opt-in ToString-compatible source profile; default import stays string-only. */
    importJsonSchemaHostCoercion(source, options) {
      return runStagedJsonSchemaImport(module, source, options, true);
    },
  });
}

function runStagedJsonSchemaImport(module, source, options, hostCoercion) {
      const session = new module.JsonSchemaImportSessionHandle();
      const dispatch = (stage, fields = {}) => {
        const response = JSON.parse(session.executeStage(encodeWire({stage, ...fields})));
        const failure = resultError(response);
        if (failure) throw jsonSchemaFailureError(failure, JsonSchemaUmfError);
        return fromWire(JSON.parse(response.wire));
      };

      const firstBaseUri = options.baseUri;
      stagedImportUri(firstBaseUri);
      if (typeof firstBaseUri !== 'string') throw new TypeError('Staged JSON Schema import accepts string URI inputs only');
      dispatch('begin', {firstBaseUri});

      const entries = Object.entries(options.resources || {});
      for (const [uri, resourceSource] of entries) {
        stagedImportUri(uri);
        if (!hostCoercion && typeof resourceSource !== 'string') throw new TypeError('Staged JSON Schema import accepts string resource sources only');
        const stagedResource = hostCoercion ? stageJsonSchemaSource(resourceSource) : {text: resourceSource, nonString: false};
        dispatch('resource', {uri, source: stagedResource.text});
        finishJsonSchemaSourceObservation(stagedResource);
      }

      const payloadBaseUri = options.baseUri;
      if (typeof payloadBaseUri !== 'string') throw new TypeError('Staged JSON Schema import accepts a string baseUri');
      dispatch('payloadBaseUri', {baseUri: payloadBaseUri});

      if (!hostCoercion && typeof source !== 'string') throw new TypeError('Staged JSON Schema import accepts a string root source');
      const stagedRoot = hostCoercion ? stageJsonSchemaSource(source) : {text: source, nonString: false};
      dispatch('root', {source: stagedRoot.text});
      finishJsonSchemaSourceObservation(stagedRoot);

      const id = options.id;
      if (typeof id !== 'string') throw new TypeError('Staged JSON Schema import accepts a string id');
      dispatch('id', {id});

      const namespace = options.baseUri;
      if (typeof namespace !== 'string') throw new TypeError('Staged JSON Schema import accepts a string namespace');
      dispatch('namespace', {baseUri: namespace});
      return dispatch('finish');
}

/** Create the prepared opt-in JSON Schema adapter with a retained immutable Rust resource runtime. */
export function createPreparedJsonSchemaEngine(module, options = {}) {
  if (typeof module?.PreparedJsonSchemaRuntimeHandle !== 'function' || typeof module?.jsonSchemaProfileVersion !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  if (module.jsonSchemaProfileVersion() !== JSON_SCHEMA_PROFILE) throw new Error('RUST_WASM_BINDING_PROFILE_MISMATCH');
  const {controls} = codegenOptions(options);
  const {controls: resourceControls} = codegenOptions({controls: descriptor(options, 'resourceControls', false)});
  const resourceBridge = hasControls(resourceControls) ? createControlBridge(resourceControls) : undefined;
  let runtime;
  try {
    runtime = new module.PreparedJsonSchemaRuntimeHandle(resourceBridge);
  } catch (error) {
    let envelope;
    try { envelope = JSON.parse(error?.message); } catch { throw error; }
    let failure;
    try { failure = resultError(envelope); } catch { throw error; }
    if (failure) throw jsonSchemaFailureError(failure, UmfCoreError);
    throw error;
  }
  const preflight = () => {
    const bridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const work = admissionWork(bridge);
    work?.(1);
    return {bridge, work};
  };
  const call = (op, fields, {bridge, work}) => {
    const response = JSON.parse(runtime.execute(encodeRequestWire({profile: JSON_SCHEMA_PROFILE, op, ...fields}, work), bridge));
    work?.(response.wire?.length ?? 1);
    const failure = resultError(response);
    if (failure) throw jsonSchemaFailureError(failure, UmfCoreError);
    return fromWire(JSON.parse(response.wire), work);
  };
  return createJsonSchemaOperations(call, preflight);
}

/** Create the opt-in structural document comparison adapter. */
export function createDocumentComparisonEngine(module, options = {}) {
  if (typeof module?.executeDocumentComparisonWire !== 'function' || typeof module?.documentComparisonProfile !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  if (module.documentComparisonProfile() !== DOCUMENT_COMPARISON_PROFILE) throw new Error('RUST_WASM_BINDING_PROFILE_MISMATCH');
  const snapshot = descriptor(options, 'snapshot');
  if (typeof snapshot !== 'function') throw new TypeError('A predecessor-compatible snapshot function is required');
  const {controls} = codegenOptions(options);
  return createDocumentComparisonOperations((wire, control) => module.executeDocumentComparisonWire(wire, control), {
    snapshot, controls, ErrorType: UmfCoreError,
  });
}

/** Create the opt-in bounded Avro field-metadata projection over WASM. */
export function createAvroFieldsEngine(module, options = {}) {
  if (typeof module?.executeAvroFieldsWire !== 'function' || typeof module?.avroFieldsProfileVersion !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  if (module.avroFieldsProfileVersion() !== AVRO_FIELDS_PROFILE) throw new Error('RUST_WASM_BINDING_PROFILE_MISMATCH');
  const {controls} = codegenOptions(options);
  return Object.freeze({deriveAvroFields(root, dependencies = []) {
    const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const hostWork = admissionWork(controlBridge);
    hostWork?.(1);
    const request = {op: 'avro.fields.derive', root, dependencies};
    const responseText = module.executeAvroFieldsWire(encodeRequestWire(request, hostWork), controlBridge);
    hostWork?.(responseText.length);
    const envelope = JSON.parse(responseText);
    const failure = resultError(envelope);
    if (failure) throw new UmfCoreError(failure.code, failure.message, failure.path);
    hostWork?.(envelope.wire.length);
    return fromWire(JSON.parse(envelope.wire), hostWork);
  }});
}

/** Initialize the opt-in Avro field-metadata projection in a browser. */
export async function initializeAvroFieldsWasm(loader = () => import('./pkg/umf_core_wasm.js'), host = globalThis, options = {}) {
  if (!hasBrowserRuntime(host)) throw new Error('WASM_RUNTIME_UNAVAILABLE');
  const module = await loader();
  if (typeof module.default === 'function') await module.default();
  return createAvroFieldsEngine(module, options);
}

function createEngineInternal(module, resources, options, withModel, includeKeyTuple = withModel, withSchemaPropertiesHostInput = false, withCardinalityHostInput = false, retainedRuntime = undefined, preparedResources = undefined, coreKeyRuntime = undefined) {
  const {profile, controls} = preparedResources ?? codegenOptions(options);
  const rawResourceControls = preparedResources ? undefined : descriptor(options ?? Object.create(null), 'resourceControls', false);
  const resourceControls = preparedResources ? undefined : rawResourceControls === undefined ? controls : codegenOptions({controls: rawResourceControls}).controls;
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
    readJsonValue(source, format = 'yaml') {
      if (typeof module?.readTypescriptJsonValueWire !== 'function') throw new UmfCoreError('RUST_BINDING_MISSING', 'The TypeScript JSON-value profile binding is unavailable');
      return runRawJsonValue(module, module.readTypescriptJsonValueWire, source, format === 'json' ? 'json' : 'yaml', controls);
    },
    writeJsonValue(value, format = 'yaml') {
      if (typeof module?.writeTypescriptJsonValueWire !== 'function') throw new UmfCoreError('RUST_BINDING_MISSING', 'The TypeScript JSON-value profile binding is unavailable');
      return runRawJsonValue(module, module.writeTypescriptJsonValueWire, value, format === 'json' ? 'json' : 'yaml', controls, {detectCycles: true});
    },
  };
  if (resources === undefined) return Object.freeze(base);
  const names = ['coreSchema', 'referenceSchema', 'packageSchema', 'constraints', 'domainPolicy'];
  const resourceBridge = preparedResources ? preparedResources.resourceBridge : withModel && hasControls(resourceControls) ? createControlBridge(resourceControls) : undefined;
  const hostWork = preparedResources ? preparedResources.hostWork : withModel ? admissionWork(resourceBridge) : undefined;
  let fixedResources;
  if (preparedResources) {
    fixedResources = preparedResources.fixedResources;
  } else if (withModel) {
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
      const resource = descriptor(resources, name, true, hostWork);
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
      const manifest = descriptor(extension, 'manifest', false, hostWork);
      if (manifest !== undefined) {
        const semantics = descriptor(extension, 'semantics', false, hostWork);
        if (semantics !== undefined && typeof semantics !== 'function') throw new TypeError('Extension semantics must be a host callback function');
        if (semantics) { hostWork?.(1); callbacks.set(index + 1, semantics); }
        if (Reflect.ownKeys(extension).some(key => !['manifest','semantics','kinds'].includes(key))) throw new TypeError('Full manifest and legacy registration fields cannot be mixed');
        const kindOption = descriptor(extension, 'kinds', false, hostWork);
        const kinds = kindOption === undefined ? false : kindOption;
        if (typeof kinds !== 'boolean') throw new TypeError('kinds must be a boolean');
        hostWork?.(3);
        registry.push({manifest, kinds, semantic: Boolean(semantics)});
        continue;
      }
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
    const requiresResourceWitness = ['model/inspectCoreRecordMembers', 'model/declareCoreRecordType', 'model/verifyCoreRecordTypeDeclaration'].includes(op);
    const request = retainedRuntime && !requiresResourceWitness ? {op, registry, ...args} : {op, resources: fixedResources, registry, ...args};
    return invoke(module, request, callbacks, profile, controls, withModel, controlBridge, hostWork, retainedRuntime);
  }
  const api = {...base,
    listKinds(registry = []) { return call('list-kinds', {}, registry); },
    getKind(reference, registry = []) { return call('get-kind', {reference}, registry) ?? undefined; },
    inspectExtensionKinds(document, registry = []) { return call('inspect-kinds', {document}, registry); },
    validateDocument(document, registry = []) { return call('validate', {document}, registry); },
    readDocument(source, format = 'json', registry = []) { return call('read', {source, format}, registry).document; },
    writeDocument(document, format = 'json', registry = []) { return call('write', {document, format}, registry).source; },
  };
  if (withModel) {
    const invoke = (op, args, extensions) => call(op, args, extensions);
    Object.assign(api, createCoreModelOperations(invoke, {ErrorType: JsonSchemaUmfError}));
    if (includeKeyTuple) Object.assign(api, createCoreKeyTupleOperations(invoke, createNativeKeyTupleOperations(module, fixedResources, controls, {bridge: resourceBridge, work: hostWork})));
    Object.assign(api, createCoreKeysOperations(invoke, createNativeCoreKeyVerificationOperations(module, fixedResources, controls, {bridge: resourceBridge, work: hostWork, resourcesWire: preparedResources?.resourcesWire, runtime: coreKeyRuntime})));
    Object.assign(api, createCompactDatasetValueOperations(invoke));
    Object.assign(api, createDatasetValueOperations(invoke, {ErrorType: JsonSchemaUmfError}));
    Object.assign(api, createCoreRelationshipOperations(invoke));
    Object.assign(api, createCoreEvolutionOperations(invoke));
    Object.assign(api, createCsvBooleanLexicalOperations(invoke));
  }
  if (withSchemaPropertiesHostInput) {
    if (typeof module.executeCoreSchemaPropertiesHostJson !== 'function') throw new UmfCoreError('RUST_WASM_BINDING_MISSING', 'WASM binding does not expose umf.host-json/1 Schema Properties');
    const hostCall = (operation, inputs) => {
      if (hasControls(controls)) throw new UmfCoreError('HOST_JSON_CONTROLS_UNSUPPORTED', 'Host-input Schema Properties operations do not accept host control callbacks');
      return schemaPropertiesHostInput(module, fixedResources, operation, inputs, JsonSchemaUmfError);
    };
    api.inspectCoreSchemaProperties = (source, identity) => hostCall('inspectCoreSchemaProperties', [source, identity, undefined]);
    api.declareCoreSchemaProperties = (source, identity, patch) => hostCall('declareCoreSchemaProperties', [source, identity, patch]);
    api.validateCoreFieldValue = (source, identity, value) => hostCall('validateCoreFieldValue', [source, identity, value]);
    api.resolveCoreDefault = (source, identity, state) => hostCall('resolveCoreDefault', [source, identity, state]);
  }
  if (withCardinalityHostInput) {
    if (typeof module.executeCoreCardinalityHostJson !== 'function') throw new UmfCoreError('RUST_WASM_BINDING_MISSING', 'WASM binding does not expose umf.host-json/1 Core Cardinality');
    const hostCall = (operation, inputs) => {
      if (hasControls(controls)) throw new UmfCoreError('HOST_JSON_CONTROLS_UNSUPPORTED', 'Host-input Core Cardinality operations do not accept host control callbacks');
      return cardinalityHostInput(module, fixedResources, operation, inputs, JsonSchemaUmfError);
    };
    api.inspectCoreCardinality = (source, identity) => hostCall('inspectCoreCardinality', [source, identity, undefined]);
    api.declareCoreCardinality = (source, identity, request) => hostCall('declareCoreCardinality', [source, identity, request]);
    api.verifyCoreCardinalityDeclaration = (receipt, current) => hostCall('verifyCoreCardinalityDeclaration', [receipt, current, undefined]);
  }
  return Object.freeze(api);
}

/** Create the opt-in Rust-backed CONTRACT-049 numeric adapter. */
export function createJavascriptNumericEngine(module, resources, options = {}) {
  if (typeof module?.executeJavascriptNumericWire !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  if (resources !== undefined && typeof module.JavascriptNumericRuntime !== 'function') throw new Error('RUST_NUMERIC_PREPARED_RUNTIME_MISSING');
  return createNumericEngine(module, resources, options);
}

/** Create the opt-in Rust engine for bounded CONTRACT-062 truth/composition operations. */
export function createSecurityLogicEngine(module, options = {}) {
  if (typeof module?.executeSecurityLogicWire !== 'function' || typeof module?.securityNotScalar !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  return createSecurityLogicEngineWithWire((wire, control) => module.executeSecurityLogicWire(wire, control), options, UmfCoreError, (value, control) => module.securityNotScalar(value, control));
}

/** Create the opt-in pure protection-function reference engine. */
export function createSecurityFunctionsEngine(module) {
  if (typeof module?.executeSecurityFunctionsWire !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  return createSecurityFunctionsEngineWithWire(wire => module.executeSecurityFunctionsWire(wire), UmfCoreError);
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
  function resultWithHostReads(readHost, hostReadProfile) {
    if (typeof readHost !== 'function') throw new TypeError('Host-read dispatcher must be a function');
    if (typeof module.executeCodegenHostReadV3Wire !== 'function') throw new UmfCoreError('RUST_CODEGEN_HOST_READ_UNAVAILABLE', 'WASM binding does not expose the V3 host-read operation');
    const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const hostWork = admissionWork(controlBridge);
    const hostFrames = createHostReadResponseFrames(readHost);
    if (hostReadProfile !== undefined && hostReadProfile !== 'umf.python-client-host-read/4') throw new TypeError('Unknown host-read profile');
    const wireRequest = {op: 'codegen/generatePythonClientHostV3', resources: fixedResources, ...(hostReadProfile ? {hostReadProfile} : {})};
    let responseText;
    try {
      responseText = module.executeCodegenHostReadV3Wire(encodeRequestWire(wireRequest, hostWork), profile, hostFrames.dispatcher, controlBridge);
    } finally {
      hostFrames.dispose();
    }
    hostWork?.(responseText.length);
    const response = JSON.parse(responseText);
    const failure = resultError(response);
    if (failure) throw new UmfCoreError(failure.code, failure.message, failure.path);
    hostWork?.(response.wire.length);
    const outcome = fromWire(JSON.parse(response.wire), hostWork);
    if (!outcome?.ok) {
      const error = outcome?.error ?? {};
      throw new UmfCoreError(error.code, error.message, error.path);
    }
    return outcome.result;
  }
  return Object.freeze({
    call,
    generatePythonClient(request) { return result('generatePythonClient', request); },
    generatePythonClientWithHost(readHost, hostReadProfile) { return resultWithHostReads(readHost, hostReadProfile); },
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

/** Create an opt-in WASM engine that compiles explicit resources once per handle. */
export function createRetainedCodegenEngine(module, resources, options = {}) {
  const Runtime = module?.RetainedCodegenResourcesRuntime;
  if (typeof Runtime !== 'function') throw new UmfCoreError('RUST_CODEGEN_HANDLE_UNAVAILABLE', 'WASM binding does not expose retained codegen resources');
  const profile = descriptor(options, 'profile', false) ?? 'cooperative';
  const setupControls = descriptor(options, 'setupControls', false);
  const invocationControls = descriptor(options, 'controls', false);
  const {controls: normalizedSetupControls} = codegenOptions({profile, controls: setupControls});
  const {controls} = codegenOptions({profile, controls: invocationControls});
  const names = ['coreSchema', 'referenceSchema', 'packageSchema', 'constraints', 'domainPolicy', 'tablesPackage', 'actionsPackage', 'bindingPackage', 'stableBindingPackage'];
  const setupBridge = hasControls(normalizedSetupControls) ? createControlBridge(normalizedSetupControls) : undefined;
  const setupWork = admissionWork(setupBridge);
  setupWork?.(1);
  for (const key of Reflect.ownKeys(resources)) {
    if (typeof key !== 'string' || !names.includes(key)) throw new TypeError('Unknown explicit codegen resource');
  }
  const fixedResources = Object.create(null);
  for (const name of names) {
    const resource = descriptor(resources, name);
    fixedResources[name] = fromWire(toWire(resource, {maxDepth: 128, maxValues: 1_000_000, work: setupWork}), setupWork);
  }
  const runtime = new Runtime(encodeRequestWire({op: 'codegen/createResources', resources: fixedResources}, setupWork), setupBridge);
  let disposed = false;
  function assertActive() {
    if (disposed) throw new UmfCoreError('RUST_CODEGEN_HANDLE_DISPOSED', 'Retained codegen resources have been disposed');
  }
  function call(operation, request) {
    assertActive();
    const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const hostWork = admissionWork(controlBridge);
    const responseText = runtime.executeWire(encodeRequestWire({op: `codegen/${operation}`, request}, hostWork), controlBridge);
    hostWork?.(responseText.length);
    const response = JSON.parse(responseText);
    const failure = resultError(response);
    if (failure) throw new UmfCoreError(failure.code, failure.message, failure.path);
    hostWork?.(response.wire.length);
    return fromWire(JSON.parse(response.wire), hostWork);
  }
  function result(operation, request) {
    const outcome = call(operation, request);
    if (!outcome?.ok) throw new UmfCoreError(outcome?.error?.code ?? 'RUST_CODEGEN_FAILED', outcome?.error?.message ?? 'Rust codegen failed', outcome?.error?.path ?? '');
    return outcome.result;
  }
  function hostRead(readHost, hostReadProfile) {
    assertActive();
    if (typeof readHost !== 'function') throw new TypeError('Host-read dispatcher must be a function');
    if (hostReadProfile !== undefined && hostReadProfile !== 'umf.python-client-host-read/4') throw new TypeError('Unknown host-read profile');
    const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const hostWork = admissionWork(controlBridge);
    const frames = createHostReadResponseFrames(readHost);
    try {
      const request = {op: 'codegen/generatePythonClientHostV3', ...(hostReadProfile ? {hostReadProfile} : {})};
      const responseText = runtime.executeHostReadV3Wire(encodeRequestWire(request, hostWork), frames.dispatcher, controlBridge);
      hostWork?.(responseText.length);
      const response = JSON.parse(responseText);
      const failure = resultError(response);
      if (failure) throw new UmfCoreError(failure.code, failure.message, failure.path);
      hostWork?.(response.wire.length);
      const outcome = fromWire(JSON.parse(response.wire), hostWork);
      if (!outcome?.ok) throw new UmfCoreError(outcome?.error?.code ?? 'RUST_CODEGEN_FAILED', outcome?.error?.message ?? 'Rust codegen failed', outcome?.error?.path ?? '');
      return outcome.result;
    } finally { frames.dispose(); }
  }
  return Object.freeze({
    dispose() { if (!disposed) { disposed = true; runtime.free(); } },
    call,
    generatePythonClient(request) { return result('generatePythonClient', request); },
    generatePythonClientWithHost(readHost, hostReadProfile) { return hostRead(readHost, hostReadProfile); },
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
