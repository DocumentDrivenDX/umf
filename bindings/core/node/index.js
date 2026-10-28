import {createRequire} from 'node:module';
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
import {createCoreRecordTypeOperations} from './src/core-record-type.js';
import {createCoreRecordMembersInspectionOperations} from './src/record-members-inspection.js';
import {createCompactDatasetValueOperations} from './src/dataset-values-compact.js';
import {createDatasetValueOperations} from './src/dataset-values.js';
import {createCoreRelationshipOperations} from './src/core-relationships.js';
import {createCoreEvolutionOperations} from './src/core-evolution.js';
import {createCsvBooleanLexicalOperations} from './src/csv-boolean-lexical.js';
import {createBit128Engine as createBit128EngineWithWire, isBit128EngineError, BIT128_PROFILE} from './src/bit128.js';
import {createJsonNumberEngine as createJsonNumberEngineWithWire, JSON_NUMBER_PROFILE} from './src/json-number.js';
import {createJsonSchemaOperations, JSON_SCHEMA_PROFILE, UmfError as JsonSchemaUmfError, jsonSchemaFailureError} from './src/json-schema.js';
import {createDocumentComparisonOperations, DOCUMENT_COMPARISON_PROFILE} from './src/document-comparison.js';
import {declareCoreSchemaPropertiesHostInput, schemaPropertiesHostInput, cardinalityHostInput, validateCoreRecordValuesHostInput, coreKindNullabilityHostInput, coreDatasetValuesHostInput, coreProtobufSourceHostInput, coreProtobufSourceHost, coreProtobufSourceHostResponse} from './src/host-json.js';
import {createSemanticTypeRegistry as createSemanticTypeRegistryEngine} from './src/semantic-value.js';
import {createArrowIpcOperations, ARROW_IPC_PROFILE} from './src/arrow-ipc.js';
import {createAccessRrfOperations, ACCESS_RRF_PROFILE} from './src/access-rrf.js';
import {createAccessTemporalOperations, ACCESS_TEMPORAL_PROFILE} from './src/access-temporal.js';
import {requireSchemaGraphProviders} from './src/schema-graph.js';
import {copyCoreJsonInput, createCoreBit128FieldOperation} from './src/core-bit128-field.js';

export {isWireAdmissionError} from './src/wire.js';
export {isBit128EngineError};
export {isHostJsonResponseError} from './src/host-json.js';
export function inspectDomainPackLoaderWire(inputJson) {
  if (typeof inputJson !== 'string') throw new TypeError('Loader inspection input must be JSON text');
  return addon.inspectDomainPackLoaderWire(inputJson);
}
export function inspectDomainPackProfileWire(inputJson) {
  if (typeof inputJson !== 'string') throw new TypeError('Domain-pack profile input must be JSON text');
  return addon.inspectDomainPackProfileWire(inputJson);
}
export function projectSecSubmissionsUtf16Wire(input, sourceId) {
  return addon.projectSecSubmissionsUtf16Wire(input, sourceId);
}
export function projectSecCompanyFactsUtf16Wire(input, sourceId) {
  return addon.projectSecCompanyFactsUtf16Wire(input, sourceId);
}
const nativeUmfCoreErrors = new WeakSet();
const weakSetHas = Function.call.bind(WeakSet.prototype.has);
const weakSetAdd = Function.call.bind(WeakSet.prototype.add);
export function isNativeUmfCoreError(error) { return error !== null && (typeof error === 'object' || typeof error === 'function') && weakSetHas(nativeUmfCoreErrors, error); }
function nativeCoreError(failure) { const error = new UmfCoreError(failure.code, failure.message, failure.path); weakSetAdd(nativeUmfCoreErrors, error); return error; }

const require = createRequire(import.meta.url);
const addon = require('./umf_core_node.node');
const schemaGraphProviders = requireSchemaGraphProviders(addon);
const CORE_KIND_NULLABILITY_RUNTIME = Symbol('core-kind-nullability-runtime');
const CORE_KIND_NULLABILITY_PREPARED = Symbol('core-kind-nullability-prepared');

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

/** Rust-computed CONTRACT-052 schema graph for the Node V4 default route. */
export function domainPackSchemaGraphJson() {
  return schemaGraphProviders.domainPackSchemaGraphJson();
}

export function datasetSourceSchemaGraphJson() {
  return schemaGraphProviders.datasetSourceSchemaGraphJson();
}

export function artifactCollectionSchemaGraphJson() {
  return schemaGraphProviders.artifactCollectionSchemaGraphJson();
}

export function domainPackLoaderSchemaGraphJson() {
  return schemaGraphProviders.domainPackLoaderSchemaGraphJson();
}

export function loaderInventorySchemaGraphJson() {
  return schemaGraphProviders.loaderInventorySchemaGraphJson();
}

/** Invoke the opt-in Rust reference pass over tagged wire. The caller must have structurally validated pack first. */
export function executeArtifactReferencesBindingWire(wireJson, controlDispatcher) {
  return addon.executeArtifactReferencesWire(wireJson, controlDispatcher);
}

export {JAVASCRIPT_NUMERIC_PROFILE};
export {SECURITY_LOGIC_PROFILE};
export {SECURITY_FUNCTIONS_PROFILE};
export {SECURITY_PROTECTION_SOURCE_PROFILE};
export {SECURITY_QUERY_PROPERTIES_PROFILE};
export {SECURITY_PROTECTION_PARAMETERS_PROFILE};
export {BIT128_PROFILE};
export {JSON_NUMBER_PROFILE};
export function createBit128Engine(options = {}) {
  if (typeof addon.executeBit128Wire !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  return createBit128EngineWithWire((wire, control) => addon.executeBit128Wire(wire, control), options);
}
/** Create the opt-in `umf-json-number/0.1` exact number check. */
export function createJsonNumberEngine(options = {}) {
  if (typeof addon.executeJsonNumberWire !== 'function' || typeof addon.jsonNumberProfileVersion !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  if (addon.jsonNumberProfileVersion() !== JSON_NUMBER_PROFILE) throw new Error('RUST_NODE_BINDING_PROFILE_MISMATCH');
  return createJsonNumberEngineWithWire((wire, control) => addon.executeJsonNumberWire(wire, control), options);
}
/** Create the opt-in Rust-backed CONTRACT-049 numeric adapter. */
export function createJavascriptNumericEngine(resources, options = {}) {
  if (typeof addon.executeJavascriptNumericWire !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  if (resources !== undefined && typeof addon.JavascriptNumericRuntime !== 'function') throw new Error('RUST_NUMERIC_PREPARED_RUNTIME_MISSING');
  return createNumericEngine(addon, resources, options);
}

/** Create the opt-in Rust engine for bounded CONTRACT-062 truth/composition operations. */
export function createSecurityLogicEngine(options = {}) {
  if (typeof addon.executeSecurityLogicWire !== 'function' || typeof addon.securityNotScalar !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  return createSecurityLogicEngineWithWire((wire, control) => addon.executeSecurityLogicWire(wire, control), options, UmfCoreError, (value, control) => addon.securityNotScalar(value, control));
}

/** Create the opt-in pure protection-function reference engine. */
export function createSecurityFunctionsEngine() {
  if (typeof addon.executeSecurityFunctionsWire !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  return createSecurityFunctionsEngineWithWire(wire => addon.executeSecurityFunctionsWire(wire), UmfCoreError);
}

/** Create the opt-in protection source identity and transform-reference resolver. */
export function createSecurityProtectionSourceEngine() {
  if (typeof addon.executeSecurityProtectionSourceWire !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  return createSecurityProtectionSourceEngineWithWire(wire => addon.executeSecurityProtectionSourceWire(wire), UmfCoreError);
}

/** Create the opt-in Rust engine for bounded protection-query property inspection. */
export function createSecurityQueryPropertiesEngine() {
  if (typeof addon.executeSecurityQueryPropertiesWire !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  return createSecurityQueryPropertiesEngineWithWire(wire => addon.executeSecurityQueryPropertiesWire(wire), UmfCoreError);
}

/** Create the opt-in Rust engine for bounded typed protection-parameter literal admission. */
export function createSecurityProtectionParametersEngine() {
  if (typeof addon.executeSecurityProtectionParametersWire !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  return createSecurityProtectionParametersEngineWithWire(wire => addon.executeSecurityProtectionParametersWire(wire), UmfCoreError);
}

export const GREGORIAN_DATE_PROFILE = 'umf-gregorian-date/1.0.0';
export const RFC3339_EXACT_INSTANT_PROFILE = 'umf-rfc3339-exact-instant/1.0.0';
export const RFC3339_EXACT_INSTANT_MAXIMUM_BYTES = 1_048_576;
export const ICEBERG_SCHEMA_PROFILE = 'umf-r5-iceberg-schema/0.1.0';
export const ARROW_SCHEMA_PROFILE = 'umf-r8-arrow-schema/0.1.0';
export {ARROW_IPC_PROFILE};
export {ACCESS_RRF_PROFILE};
export {ACCESS_TEMPORAL_PROFILE};
export const PROTOBUF_INSPECT_PROFILE = 'umf-r5-protobuf-inspect/0.1.0';
export const PROTOBUF_DOCUMENT_PROFILE = 'umf-r8-protobuf-descriptor-document/0.1.0';
export const PROTOBUF_SOURCE_IMPORT_PROFILE = 'umf-r8-protobuf-source-import/0.1.0';
export const AVRO_FIELDS_PROFILE = 'umf-r5-avro-fields/0.1.0';
export const AVRO_INSPECT_PROFILE = 'umf-r5-avro-inspect/0.1.0';
export const AVRO_CANDIDATE_PROFILE = 'umf-r5-avro-candidate/0.1.0';
export const RECORD_TYPE_BINDING_PROFILE = 'umf.record-type-binding/1.0.0';
export {JSON_SCHEMA_PROFILE};
export {DOCUMENT_COMPARISON_PROFILE};
/** Execute the explicitly selected Record Type tagged wire profile. */
export function executeRecordTypeBindingWire(wireJson, controlDispatcher) {
  if (typeof addon.executeRecordTypeWire !== 'function' || typeof addon.recordTypeBindingProfileVersion !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  if (addon.recordTypeBindingProfileVersion() !== RECORD_TYPE_BINDING_PROFILE) throw new Error('RUST_NODE_BINDING_PROFILE_MISMATCH');
  return addon.executeRecordTypeWire(wireJson, controlDispatcher);
}
/** Create the opt-in invocation-scoped trusted semantic validator registry. */
export function createSemanticTypeRegistry(options = {}) {
  if (typeof addon.executeSemanticValueWire !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  const {controls} = codegenOptions(options);
  return createSemanticTypeRegistryEngine(addon, {getControlBridge:()=>hasControls(controls)?createControlBridge(controls):undefined,ErrorType:UmfCoreError});
}

/** Create the default-root registry adapter with the exact TypeScript callback contract. */
export function createDefaultSemanticTypeRegistry(options = {}) {
  if (typeof addon.executeSemanticValueWire !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  const {controls} = codegenOptions(options);
  return createSemanticTypeRegistryEngine(addon, {getControlBridge:()=>hasControls(controls)?createControlBridge(controls):undefined,ErrorType:UmfCoreError,callbackProfile:'typescript'});
}
export {JsonSchemaUmfError as UmfError};
const coreBit128FieldErrors = new WeakSet();
const coreBit128WeakSetHas = Function.call.bind(WeakSet.prototype.has);
const coreBit128WeakSetAdd = Function.call.bind(WeakSet.prototype.add);
function CoreBit128FieldBindingError(code, message, path = '') {
  const error = new JsonSchemaUmfError(code, message, path);
  coreBit128WeakSetAdd(coreBit128FieldErrors, error);
  return error;
}
export function isCoreBit128FieldBindingError(error) {
  return error !== null && (typeof error === 'object' || typeof error === 'function') && coreBit128WeakSetHas(coreBit128FieldErrors, error);
}
function temporalResult(wire) {
  if (typeof wire === 'string' && wire.startsWith('ERR|')) {
    const [, name, ...parts] = wire.split('|');
    const ErrorType = name === 'TypeError' ? TypeError : RangeError;
    throw new ErrorType(parts.join('|'));
  }
  if (wire === 'TypeError') throw new TypeError('Temporal token requires text');
  if (wire === 'RangeError') throw new RangeError('Temporal token is outside the selected profile');
  return wire.split('|');
}
/** Create the opt-in Gregorian and RFC3339 temporal adapter engine. */
export function createTemporalEngine() {
  const parseGregorianDate = (token) => {
    const [, year, month, day] = temporalResult(addon.temporalParseGregorianDateWire(token));
    return Object.freeze({profile: GREGORIAN_DATE_PROFILE, originalText: token, year: Number(year), month: Number(month), day: Number(day)});
  };
  const parseRfc3339ExactInstant = (token) => {
    const [, utcSeconds, fractionalDigits, originalOffset, localOffsetKnown] = temporalResult(addon.temporalParseRfc3339ExactInstantWire(token));
    return Object.freeze({profile: RFC3339_EXACT_INSTANT_PROFILE, originalText: token, utcSeconds, fractionalDigits, originalOffset, localOffsetKnown: localOffsetKnown === 'true'});
  };
  return Object.freeze({parseGregorianDate,
    truncateGregorianDate(token, unit) { return temporalResult(addon.temporalTruncateGregorianDateWire(token, unit))[1]; },
    parseRfc3339ExactInstant,
    sameRfc3339ExactInstant(left, right) { return temporalResult(addon.temporalSameRfc3339ExactInstantWire(left, right))[1] === 'true'; },
  });
}

function dataProperty(value, name, required = true, work = undefined) {
  work?.(1);
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

function runRequest(request, callbacks, profile, controls, accountHost = false, sharedControlBridge = undefined, sharedHostWork = undefined, retainedRuntime = undefined) {
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
  const controlBridge = sharedControlBridge ?? (hasControls(controls) ? createControlBridge(controls) : undefined);
  const hostWork = accountHost ? (sharedHostWork ?? admissionWork(controlBridge)) : undefined;
  const requestWire = encodeRequestWire(request, hostWork);
  const responseText = retainedRuntime
    ? retainedRuntime.executeModelRequestWire(requestWire, profile, callbackBridge, controlBridge)
    : addon.executeRequestWire(requestWire, profile, callbackBridge, controlBridge);
  hostWork?.(responseText.length);
  const response = JSON.parse(responseText);
  const failure = resultError(response);
  if (failure) throw nativeCoreError(failure);
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

function runRawJsonValue(nativeFunction, input, format, controls, encodeOptions) {
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

function createNativeKeyTupleOperations(addon, resources, controls, setup = {}) {
  const createHandle = (source, hostWork, controlBridge) => {
    let handle;
    try {
      hostWork?.(1);
      const sourceWire = encodeWire(source, {maxDepth: 128, maxValues: 100_000, work: hostWork});
      const resourcesWire = encodeWire(resources, {maxDepth: 128, maxValues: 1_000_000, work: hostWork});
      handle = new addon.PreparedCoreKeyTupleHandle(sourceWire, resourcesWire, controlBridge);
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
  if (typeof addon.CoreKeyTupleRuntime === 'function') {
    try {
      const resourcesWire = encodeWire(resources, {maxDepth: 128, maxValues: 1_000_000, work: setup.work});
      setup.work?.(resourcesWire.length);
      runtime = new addon.CoreKeyTupleRuntime(resourcesWire, setup.bridge);
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
        if (!runtime?.prepareVerification) throw new UmfCoreError('RUST_NODE_BINDING_MISSING', 'Node binding does not expose receipt-first Core Key tuple verification');
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
        if (!runtime?.prepareVerification) throw new UmfCoreError('RUST_NODE_BINDING_MISSING', 'Node binding does not expose receipt-first Core Key tuple verification');
        staged = runtime.prepareVerification(receiptWire, controlBridge);
      } catch (error) { nativeKeyTupleFailure(error); }
      return {readBytes(current) {
        try {
          const currentWire = encodeWire(current, {maxDepth: 128, maxValues: 100_000, work: hostWork});
          const nativeBytes = staged.readBytes(currentWire, controlBridge);
          hostWork?.(typedArrayByteLength.call(nativeBytes));
          return Uint8Array.from(nativeBytes);
        } catch (error) { nativeKeyTupleFailure(error); }
      }};
    },
  };
}

function createNativeCoreKeyVerificationOperations(addon, resources, controls, setup = {}) {
  const sharedRuntime = setup.runtime;
  if (sharedRuntime
      ? typeof sharedRuntime.prepareVerification !== 'function' || typeof sharedRuntime.finishVerification !== 'function' || typeof sharedRuntime.discardVerification !== 'function'
      : typeof addon.CoreKeyVerificationRuntime !== 'function' ||
        typeof addon.CoreKeyVerificationRuntime.prototype?.prepareVerification !== 'function' ||
        typeof addon.CoreKeyVerificationRuntime.prototype?.finishVerification !== 'function' ||
        typeof addon.CoreKeyVerificationRuntime.prototype?.discardVerification !== 'function') {
    const missing = () => { throw new Error('RUST_BINDING_MISSING'); };
    return {prepare: missing, finish: missing, discard: missing};
  }
  let runtime;
  try {
    const resourcesWire = setup.resourcesWire ?? encodeWire(resources, {maxDepth: 128, maxValues: 1_000_000, work: setup.work});
    if (setup.resourcesWire === undefined) setup.work?.(resourcesWire.length);
    runtime = sharedRuntime ?? new addon.CoreKeyVerificationRuntime(resourcesWire, setup.bridge);
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

function createNativeCoreRecordTypeVerificationOperations(addon, resources, controls, setup = {}) {
  if (typeof addon.CoreRecordTypeVerificationRuntime !== 'function' ||
      typeof addon.CoreRecordTypeVerificationRuntime.prototype?.prepareVerification !== 'function' ||
      typeof addon.CoreRecordTypeVerificationRuntime.prototype?.finishVerification !== 'function') {
    throw new UmfCoreError('RUST_NODE_BINDING_MISSING', 'Node binding does not expose retained Core Record Type resources');
  }
  let runtime;
  try {
    const resourcesWire = encodeWire(resources, {maxDepth:128, maxValues:1_000_000, work:setup.work});
    setup.work?.(resourcesWire.length);
    runtime = new addon.CoreRecordTypeVerificationRuntime(resourcesWire, setup.bridge);
  } catch (error) { nativeKeyTupleFailure(error); }
  return {
    prepare(receipt) {
      const bridge = hasControls(controls) ? createControlBridge(controls) : undefined;
      const work = admissionWork(bridge);
      work?.(1);
      try {
        const receiptWire = encodeWire(receipt, {maxDepth:128, maxValues:100_000, work});
        const handle = runtime.prepareVerification(receiptWire, bridge);
        return {handle, bridge, work};
      } catch (error) { nativeKeyTupleFailure(error); }
    },
    finish(stage, current) {
      try {
        stage.work?.(1);
        const currentWire = encodeWire(current, {maxDepth:128, maxValues:100_000, work:stage.work});
        return nativeKeyTupleResult(runtime.finishVerification(stage.handle, currentWire, stage.bridge), stage.work);
      } catch (error) { nativeKeyTupleFailure(error); }
    },
    dispose() { runtime = undefined; },
  };
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
  return createEngineInternal(resources, options, false);
}

/** Create the opt-in cardinality/kind/nullability ideal API. */
export function createCoreModelEngine(resources, options = {}) {
  return createEngineInternal(resources, options, true);
}

/** Create the opt-in retained Rust Core Record Type v6 engine. */
export function createCoreRecordTypeEngine(resources, options = {}) {
  const {profile, controls} = codegenOptions(options);
  const setupControls = dataProperty(options, 'setupControls', false) ?? Object.create(null);
  const normalizedOptions = {profile, controls, resourceControls: setupControls};
  const engine = createEngineInternal(resources, normalizedOptions, true, false, false, true, true);
  return Object.freeze({
    declareCoreRecordType: engine.declareCoreRecordType,
    verifyCoreRecordTypeDeclaration: engine.verifyCoreRecordTypeDeclaration,
    prepareCoreRecordTypeVerification: engine.prepareCoreRecordTypeVerification,
    finishCoreRecordTypeVerification: engine.finishCoreRecordTypeVerification,
    discardCoreRecordTypeVerification: engine.discardCoreRecordTypeVerification,
    dispose: engine.dispose,
  });
}

/** Create the opt-in retained Rust Core Record Members inspector. */
export function createCoreRecordMembersEngine(resources, options = {}) {
  const {profile, controls} = codegenOptions(options);
  const setupControls = dataProperty(options, 'setupControls', false) ?? Object.create(null);
  const setup = codegenOptions({profile, controls: setupControls}).controls;
  const setupBridge = hasControls(setup) ? createControlBridge(setup) : undefined;
  const setupWork = admissionWork(setupBridge);
  const runtimePrototype = addon.CoreRecordMembersInspectionRuntime?.prototype;
  if (typeof addon.CoreRecordMembersInspectionRuntime !== 'function' ||
      typeof runtimePrototype?.inspect !== 'function') {
    throw new UmfCoreError('RUST_NODE_BINDING_MISSING', 'Node binding does not expose retained Core Record Members resources');
  }
  const names = ['coreSchema', 'referenceSchema', 'packageSchema', 'constraints', 'domainPolicy'];
  setupWork?.(1);
  const prototype = Object.getPrototypeOf(resources);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('Engine resources must be a plain object');
  const resourceKeys = Reflect.ownKeys(resources);
  setupWork?.(resourceKeys.length);
  for (const key of resourceKeys) {
    if (typeof key !== 'string' || !names.includes(key)) throw new TypeError('Unknown explicit engine resource');
    setupWork?.(key.length + 1);
  }
  const fixedResources = Object.create(null);
  for (const name of names) {
    const resource = dataProperty(resources, name, true, setupWork);
    fixedResources[name] = fromWire(toWire(resource, {maxDepth:128, maxValues:1_000_000, work:setupWork}), setupWork);
  }
  const resourcesWire = encodeWire(fixedResources, {maxDepth:128, maxValues:1_000_000, work:setupWork});
  setupWork?.(resourcesWire.length);
  let runtime;
  try { runtime = new addon.CoreRecordMembersInspectionRuntime(resourcesWire, setupBridge); }
  catch (error) { nativeKeyTupleFailure(error); }
  const native = {
    inspect(source, identity) {
      if (!runtime) {
        const error = new UmfCoreError('CORE_RECORD_MEMBERS_DISPOSED', 'Core Record Members engine has been disposed');
        throw error;
      }
      const bridge = hasControls(controls) ? createControlBridge(controls) : undefined;
      const hostWork = admissionWork(bridge);
      hostWork?.(1);
      try {
        const limits = {maxDepth:128, maxValues:100_000, work:hostWork};
        const sourceWire = encodeWire(source, limits);
        const identityWire = encodeWire(identity, limits);
        return nativeKeyTupleResult(runtime.inspect(sourceWire, identityWire, bridge), hostWork);
      } catch (error) { nativeKeyTupleFailure(error); }
    },
    dispose() { runtime = undefined; },
  };
  return createCoreRecordMembersInspectionOperations(native, {ErrorType: UmfCoreError});
}

/** @internal Create the default-root model facade without tuple admission while tuple exports remain TypeScript. */
export function createCoreModelRootEngine(resources, options = {}) {
  return createEngineInternal(resources, options, true, true, false);
}

/** @internal Create the default-root model facade with retained Rust key-tuple operations. */
export function createCoreModelRootKeyTupleEngine(resources, options = {}) {
  const {encodeCoreKeyTuple, verifyCoreKeyTuple, ...model} = createEngineInternal(resources, options, true, true, true);
  return Object.freeze(model);
}

/** Private opt-in retained model and Kind/Nullability dispatcher. */
export function createCoreModelRootKindNullabilityEngine(resources, options = {}) {
  const staged = createCoreKindNullabilityHostInputEngine(resources, options);
  const model = createEngineInternal(resources, options, true, true, false, false, false, false, staged[CORE_KIND_NULLABILITY_RUNTIME], staged[CORE_KIND_NULLABILITY_PREPARED], staged[CORE_KIND_NULLABILITY_RUNTIME]);
  const api = {...model};
  for (const name of ['inspectCoreElementKind','declareCoreElementKind','verifyCoreKindDeclaration','inspectCoreNullability','declareCoreNullability','verifyCoreNullabilityDeclaration']) api[name] = staged[name];
  return Object.freeze(api);
}

/** Create the opt-in retained Rust Core Key tuple engine. */
export function createCoreKeyTupleEngine(resources, options = {}) {
  const runtimePrototype = addon.CoreKeyTupleRuntime?.prototype;
  if (typeof addon.CoreKeyTupleRuntime !== 'function' || typeof runtimePrototype?.prepare !== 'function' || typeof runtimePrototype?.prepareVerification !== 'function' || typeof runtimePrototype?.prepareEncoding !== 'function' || typeof addon.PreparedCoreKeyTupleEncodeHandle?.prototype?.encodeWithOptions !== 'function') {
    throw new UmfCoreError('RUST_NODE_BINDING_MISSING', 'Node binding does not expose retained Core Key tuple resources');
  }
  const engine = createEngineInternal(resources, options, true);
  return Object.freeze({
    encodeCoreKeyTuple: engine.encodeCoreKeyTuple,
    verifyCoreKeyTuple: engine.verifyCoreKeyTuple,
    readCoreKeyTupleBytes: engine.readCoreKeyTupleBytes,
    prepareCoreKeyTuples: engine.prepareCoreKeyTuples,
  });
}

/** Create the opt-in private Rust-owned host-input route for schema properties. */
export function createCoreSchemaPropertiesHostInputEngine(resources, options = {}) {
  if (typeof addon.executeDeclareCoreSchemaPropertiesHostJson !== 'function') throw new UmfCoreError('RUST_NODE_BINDING_MISSING', 'Node binding does not expose umf.host-json/1');
  return createEngineInternal(resources, options, true, true);
}

/** Create the private Rust-owned host-admission engine for Core Cardinality. */
export function createCoreCardinalityHostInputEngine(resources, options = {}) {
  if (typeof addon.executeCoreCardinalityHostJson !== 'function') throw new UmfCoreError('RUST_NODE_BINDING_MISSING', 'Node binding does not expose umf.host-json/1 Core Cardinality');
  const {controls} = codegenOptions(options);
  const rawResourceControls = dataProperty(options, 'resourceControls', false);
  const resourceControls = rawResourceControls === undefined ? controls : codegenOptions({controls: rawResourceControls}).controls;
  if (hasControls(controls) || hasControls(resourceControls)) throw new UmfCoreError('HOST_JSON_CONTROLS_UNSUPPORTED', 'Host-input Core Cardinality operations do not accept operation or resource control callbacks');
  return createEngineInternal(resources, options, false, false, false, false, false, true);
}

/** Create the opt-in current-core 0.10.0 Bit128/UUID Field authoring route. */
export function createCoreBit128FieldEngine(resources, options = {}) {
  if (typeof addon.executeCoreBit128FieldRequestWire !== 'function') throw new UmfCoreError('RUST_NODE_BINDING_MISSING', 'Node binding does not expose the closed Core Bit128 Field route');
  const {profile, controls} = codegenOptions(options);
  const setup = copyCoreJsonInput(resources, JsonSchemaUmfError);
  const resourceNames = ['coreSchema', 'referenceSchema', 'packageSchema', 'constraints', 'domainPolicy'];
  if (!setup || typeof setup !== 'object' || Array.isArray(setup) ||
      Reflect.ownKeys(setup).length !== resourceNames.length ||
      resourceNames.some(name => !Object.hasOwn(setup, name))) {
    throw new UmfCoreError('REQUEST', 'Exact five-resource set required');
  }
  const fixedResources = Object.create(null);
  for (const name of resourceNames) Object.defineProperty(fixedResources, name, {
    value: setup[name], enumerable: true, writable: true, configurable: true,
  });
  const operation = createCoreBit128FieldOperation((source, identity, scalarType) => {
    const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const hostWork = admissionWork(controlBridge);
    hostWork?.(1);
    // Match the TypeScript predecessor's observable copy order. scalarType is
    // a strict primitive choice; wrong objects are never traversed or coerced.
    const sourceCopy = copyCoreJsonInput(source, CoreBit128FieldBindingError);
    const identityCopy = copyCoreJsonInput(identity, CoreBit128FieldBindingError);
    const selectedType = scalarType === 'bits128' || scalarType === 'uuid' ? scalarType : null;
    const requestWire = encodeRequestWire({
      op: 'model/declareCoreBit128Field', resources: fixedResources, registry: [],
      source: sourceCopy, identity: identityCopy, scalarType: selectedType,
    }, hostWork);
    const dispatcher = () => encodeRequestWire({ok: false, message: 'Unexpected host capability request'});
    const responseText = addon.executeCoreBit128FieldRequestWire(requestWire, profile, dispatcher, controlBridge);
    hostWork?.(responseText.length);
    const response = JSON.parse(responseText);
    const failure = resultError(response);
    if (failure) throw new CoreBit128FieldBindingError(failure.code, failure.message, failure.path);
    hostWork?.(response.wire.length);
    return fromWire(JSON.parse(response.wire), hostWork);
  });
  return operation;
}

/** Create the opt-in Rust-owned host-input route for logical Record values. */
export function createCoreRecordValuesHostInputEngine(resources, options = {}) {
  if (typeof addon.executeValidateCoreRecordValuesHostJson !== 'function') throw new UmfCoreError('RUST_NODE_BINDING_MISSING', 'Node binding does not expose umf.host-json/1 record values');
  const {controls} = codegenOptions(options);
  return Object.freeze({
    validateCoreRecordValues(source, identity, values) {
      const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
      const hostWork = admissionWork(controlBridge);
      hostWork?.(1);
      return validateCoreRecordValuesHostInput(addon, resources, source, identity, values, JsonSchemaUmfError, controlBridge);
    },
  });
}

/** Create a Rust-owned host-input route for the six core kind/nullability operations. */
export function createCoreKindNullabilityHostInputEngine(resources, options = {}) {
  if (typeof addon.CoreKindNullabilityRuntime !== 'function') throw new UmfCoreError('RUST_NODE_BINDING_MISSING', 'Node binding does not expose retained core kind/nullability resources');
  const {profile, controls} = codegenOptions(options);
  const rawResourceControls = dataProperty(options, 'resourceControls', false);
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
    const resource = dataProperty(resources, name, true, initializeWork);
    fixedResources[name] = fromWire(toWire(resource, {maxDepth:128, maxValues:1_000_000, work:initializeWork}), initializeWork);
  }
  const resourcesWire = encodeWire(fixedResources, {maxDepth:128, maxValues:1_000_000, work:initializeWork});
  initializeWork?.(resourcesWire.length);
  let runtime;
  try { runtime = new addon.CoreKindNullabilityRuntime(resourcesWire, initializeBridge); }
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

/** Create the opt-in Rust-owned source/input/receipt admission route for full Dataset values. */
export function createCoreDatasetValuesHostInputEngine(resources, options = {}) {
  if (typeof addon.CoreDatasetValuesRuntime !== 'function') throw new UmfCoreError('RUST_NODE_BINDING_MISSING', 'Node binding does not expose retained Dataset values resources');
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
    const resource = dataProperty(resources, name, true, initializeWork);
    fixedResources[name] = fromWire(toWire(resource, {maxDepth:128, maxValues:1_000_000, work:initializeWork}), initializeWork);
  }
  const resourcesWire = encodeWire(fixedResources, {maxDepth:128, maxValues:1_000_000, work:initializeWork});
  initializeWork?.(resourcesWire.length);
  let runtime;
  try { runtime = new addon.CoreDatasetValuesRuntime(resourcesWire, initializeBridge); }
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

/** Create the opt-in standalone Iceberg schema JSON engine over pinned Rust resources. */
export function createIcebergSchemaEngine(options = {}) {
  if (typeof addon.executeIcebergWire !== 'function' || typeof addon.icebergSchemaProfileVersion !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  if (addon.icebergSchemaProfileVersion() !== ICEBERG_SCHEMA_PROFILE) throw new Error('RUST_NODE_BINDING_PROFILE_MISMATCH');
  const {controls} = codegenOptions(options);
  const call = (operation, fields) => {
    const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const hostWork = admissionWork(controlBridge);
    hostWork?.(1);
    const request = {op: `iceberg.schema.${operation}`, ...fields};
    const responseText = addon.executeIcebergWire(encodeRequestWire(request, hostWork), controlBridge);
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
export function createArrowSchemaEngine(options = {}) {
  if (typeof addon.ArrowSchemaResourcesRuntime !== 'function' || typeof addon.arrowSchemaProfileVersion !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  if (addon.arrowSchemaProfileVersion() !== ARROW_SCHEMA_PROFILE) throw new Error('RUST_NODE_BINDING_PROFILE_MISMATCH');
  const {profile} = codegenOptions(options);
  const setupControls = dataProperty(options, 'setupControls', false);
  const invocationControls = dataProperty(options, 'controls', false);
  const {controls: normalizedSetupControls} = codegenOptions({profile, controls: setupControls});
  const {controls} = codegenOptions({profile, controls: invocationControls});
  const setupBridge = hasControls(normalizedSetupControls) ? createControlBridge(normalizedSetupControls) : undefined;
  const setupWork = admissionWork(setupBridge);
  setupWork?.(1);
  let runtime;
  try {
    runtime = new addon.ArrowSchemaResourcesRuntime(encodeRequestWire({op: 'arrow.schema.createResources'}, setupWork), setupBridge);
  } catch (error) {
    let failure;
    try { failure = resultError(JSON.parse(error?.message)); } catch {}
    if (failure) throw nativeCoreError(failure);
    throw error;
  }
  let disposed = false;
  function assertActive() {
    if (disposed) throw nativeCoreError({code:'RUST_ARROW_SCHEMA_HANDLE_DISPOSED',message:'Arrow schema resources have been disposed',path:''});
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
    if (failure) throw nativeCoreError(failure);
    hostWork?.(envelope.wire.length);
    return fromWire(JSON.parse(envelope.wire), hostWork);
  };
  return Object.freeze({
    dispose() { if (!disposed) { disposed = true; runtime.dispose(); } },
    importSchema(source, id) { return call('import', {source, id}); },
    exportSchema(document) { return call('export', {document}); },
    inspect(document) { return call('inspect', {document}); },
    getNode(document, pointer) { return call('getNode', {document, pointer}); },
    proposeNodeEdit(document, pointer, replacementJson) { return call('proposeNodeEdit', {document, pointer, replacement: replacementJson}); },
  });
}

/** Create the opt-in exact-source Arrow IPC capture engine. */
export function createArrowIpcEngine(options = {}) {
  if (typeof addon.executeArrowIpcWire !== 'function' || typeof addon.arrowIpcProfileVersion !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  if (addon.arrowIpcProfileVersion() !== ARROW_IPC_PROFILE) throw new Error('RUST_NODE_BINDING_PROFILE_MISMATCH');
  const {controls} = codegenOptions(options);
  return createArrowIpcOperations((operation, fields) => {
    const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const hostWork = admissionWork(controlBridge);
    hostWork?.(1);
    const responseText = addon.executeArrowIpcWire(encodeRequestWire({op: `arrow.ipc.${operation}`, ...fields}, hostWork), controlBridge);
    hostWork?.(responseText.length);
    const envelope = JSON.parse(responseText);
    const failure = resultError(envelope);
    if (failure) throw nativeCoreError(failure);
    hostWork?.(envelope.wire.length);
    return fromWire(JSON.parse(envelope.wire), hostWork);
  });
}

/** Create the opt-in pure reciprocal-rank fusion scorer. */
export function createAccessRrfEngine(options = {}) {
  if (typeof addon.executeAccessRrfWire !== 'function' || typeof addon.accessRrfProfileVersion !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  if (addon.accessRrfProfileVersion() !== ACCESS_RRF_PROFILE) throw new Error('RUST_NODE_BINDING_PROFILE_MISMATCH');
  const {controls} = codegenOptions(options);
  return createAccessRrfOperations((request, context) => {
    const {controlBridge, hostWork} = context;
    const responseText = addon.executeAccessRrfWire(encodeRequestWire(request, hostWork), controlBridge);
    hostWork?.(responseText.length);
    const envelope = JSON.parse(responseText);
    const failure = resultError(envelope);
    if (failure) throw nativeCoreError(failure);
    hostWork?.(envelope.wire.length);
    return fromWire(JSON.parse(envelope.wire), hostWork);
  }, () => {
    const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const hostWork = admissionWork(controlBridge);
    hostWork?.(1);
    return {controlBridge, hostWork, charge: units => hostWork?.(units)};
  });
}

/** Create the opt-in CONTRACT-075 temporal parser backed by the shared Rust core. */
export function createAccessTemporalEngine() {
  if (typeof addon.executeAccessTemporalWire !== 'function' || typeof addon.accessTemporalProfileVersion !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  if (addon.accessTemporalProfileVersion() !== ACCESS_TEMPORAL_PROFILE) throw new Error('RUST_NODE_BINDING_PROFILE_MISMATCH');
  return createAccessTemporalOperations(request => {
    const responseText = addon.executeAccessTemporalWire(encodeRequestWire(request));
    const envelope = JSON.parse(responseText);
    const failure = resultError(envelope);
    if (failure) {
      if (failure.code === 'TYPE_ERROR') throw new TypeError(failure.message);
      if (failure.code === 'RANGE_ERROR') throw new RangeError(failure.message);
      throw nativeCoreError(failure);
    }
    return fromWire(JSON.parse(envelope.wire));
  });
}

/** Create the opt-in bounded Rust Protobuf descriptor inspector. */
export function createProtobufInspector(options = {}) {
  if (typeof addon.executeProtobufInspectWire !== 'function' || typeof addon.protobufInspectProfileVersion !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  if (addon.protobufInspectProfileVersion() !== PROTOBUF_INSPECT_PROFILE) throw new Error('RUST_NODE_BINDING_PROFILE_MISMATCH');
  const {controls} = codegenOptions(options);
  return Object.freeze({
    inspect(document) {
      const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
      const hostWork = admissionWork(controlBridge);
      hostWork?.(1);
      const request = {op: 'protobuf.descriptor.inspect', document};
      const responseText = addon.executeProtobufInspectWire(encodeRequestWire(request, hostWork), controlBridge);
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
function snapshotDescriptorBytes(input, ErrorType = JsonSchemaUmfError) {
  const admittedLength = snapshotDescriptorByteLength(input, ErrorType);
  let tag;
  try { tag = Reflect.apply(typedArrayTag, input, []); } catch { tag = undefined; }
  if (tag !== 'Uint8Array') return new Uint8Array(admittedLength);
  const length = Reflect.apply(typedArrayLength, input, []);
  if (length > 4_000_000) throw new ErrorType('LIMIT', 'Descriptor input exceeds limit');
  const buffer = Reflect.apply(typedArrayBuffer, input, []);
  const byteOffset = Reflect.apply(typedArrayByteOffset, input, []);
  const view = new Uint8Array(buffer, byteOffset, length);
  const snapshot = new Uint8Array(length);
  Uint8Array.prototype.set.call(snapshot, view);
  return snapshot;
}
function snapshotDescriptorByteLength(input, ErrorType = JsonSchemaUmfError) {
  // The TypeScript predecessor reads `.length` before entering its parser
  // catch (and, for import, after evaluating options.id). Preserve that host
  // boundary while retaining intrinsic byte copying for Uint8Array inputs.
  const hostLength = input.length;
  if (hostLength > 4_000_000) throw new ErrorType('LIMIT', 'Descriptor input exceeds limit');
  let tag;
  try { tag = Reflect.apply(typedArrayTag, input, []); } catch { tag = undefined; }
  if (tag === 'Uint8Array') return Reflect.apply(typedArrayLength, input, []);
  if (ArrayBuffer.isView(input) && Object.prototype.toString.call(input) === '[object DataView]') {
    if (input.byteLength === 0) return 0;
    throw new ErrorType('PROTOBUF_BINARY', 'Error: illegal tag: field no 0 wire type 0');
  }
  if (ArrayBuffer.isView(input) && ['Uint16Array', 'Int16Array', 'Float32Array'].includes(tag) && typeof hostLength === 'number') {
    if (hostLength === 0) return 0;
    throw new ErrorType('PROTOBUF_BINARY', Number(input[0]) === 10 ? 'RangeError: premature EOF' : 'Error: illegal tag: field no 0 wire type 0');
  }
  throw new ErrorType('PROTOBUF_BINARY', 'TypeError: Expected ArrayBuffer for the first argument.');
}
export function createProtobufDescriptorDocumentEngine(options = {}) {
  if (typeof addon.executeProtobufDocumentWire !== 'function' || typeof addon.protobufDocumentProfileVersion !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  if (addon.protobufDocumentProfileVersion() !== PROTOBUF_DOCUMENT_PROFILE) throw new Error('RUST_NODE_BINDING_PROFILE_MISMATCH');
  const {controls} = codegenOptions(options);
  const ErrorType = typeof options.ErrorType === 'function' ? options.ErrorType : JsonSchemaUmfError;
  function invoke(op, fields = {}, inputBinary = new Uint8Array()) {
    const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const hostWork = admissionWork(controlBridge);
    hostWork?.(1);
    const admittedFields = typeof fields === 'function' ? fields() : fields;
    const requestWire = encodeRequestWire({op, ...admittedFields}, hostWork);
    const inputLength = snapshotDescriptorByteLength(inputBinary, ErrorType);
    hostWork?.(inputLength);
    const ownedBinary = snapshotDescriptorBytes(inputBinary, ErrorType);
    const response = addon.executeProtobufDocumentWire(requestWire, Buffer.from(ownedBinary), controlBridge);
    hostWork?.(response.wireEnvelope.length + response.binary.length);
    const envelope = JSON.parse(response.wireEnvelope);
    const failure = resultError(envelope);
    if (failure) {
      // CONTRACT-003's TypeScript operations expose the package's public
      // UmfError. Keep host-control failures distinct, as the Rust binding
      // controls are an opt-in binding capability rather than adapter errors.
      if (['RESOURCE_LIMIT', 'CANCELLED', 'METER_FAILURE', 'CANCELLATION_CHECK_FAILURE', 'CLOCK_CAPABILITY_REQUIRED', 'DEADLINE'].includes(failure.code)) throw nativeCoreError(failure);
      throw new ErrorType(failure.code, failure.message, failure.path);
    }
    hostWork?.(envelope.wire.length);
    const value = fromWire(JSON.parse(envelope.wire), hostWork);
    return {value, binary: response.binary};
  }
  return Object.freeze({
    readDescriptorSet(binary) { return invoke('protobuf.descriptor.read', {}, binary).value; },
    writeDescriptorSet(descriptorSet) { return invoke('protobuf.descriptor.write', {descriptorSet}).binary; },
    importProtobufDescriptorSet(binary, options) {
      // Match the predecessor's object-literal evaluation order: id is read
      // before readDescriptorSet admits/checks the binary input.
      return invoke('protobuf.document.import', () => ({id: options.id}), binary).value;
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

/** Explicit callback-only source import. Export host-document reflection remains held. */
export function createProtobufSourceImportEngine(options = {}) {
  if (typeof addon.ProtobufSourceSession !== 'function' || addon.protobufSourceProfileVersion?.() !== 'umf-r8-protobuf-source/0.1.0') throw new Error('RUST_NODE_BINDING_MISSING');
  const {controls} = codegenOptions(options);
  return Object.freeze({
    callbackControl: 'boundary-only',
    async importProtobufSources(input, compiler, sourceOptions) {
      const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
      const hostWork = admissionWork(controlBridge);
      hostWork?.(1);
      const session = new addon.ProtobufSourceSession();
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
      const admitted = session.beginImportDescriptor(Buffer.from(bytes), id, controlBridge);
      throwSourceResponseError(admitted);
      const archiveCompiler = compiled.compiler;
      const finished = session.finishImportArchive(archiveCompiler, controlBridge);
      return sourceResponseValue(finished, hostWork);
    },
  });
}

/** Explicit caller-supplied source emitter. Export remains opt-in. */
export function createProtobufSourceExportEngine(options = {}) {
  if (typeof addon.ProtobufSourceSession !== 'function' || addon.protobufSourceProfileVersion?.() !== 'umf-r8-protobuf-source/0.1.0') throw new Error('RUST_NODE_BINDING_MISSING');
  const {controls} = codegenOptions(options);
  return Object.freeze({
    callbackControl: 'boundary-only',
    async exportProtobufSources(document, emitter) {
      const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
      const hostWork = admissionWork(controlBridge);
      hostWork?.(1);
      const session = new addon.ProtobufSourceSession();
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

/** Create the opt-in Avro structural inspector; complete is always false. */
export function createAvroInspector(options = {}) {
  if (typeof addon.executeAvroInspectWire !== 'function' || typeof addon.avroInspectProfileVersion !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  if (addon.avroInspectProfileVersion() !== AVRO_INSPECT_PROFILE) throw new Error('RUST_NODE_BINDING_PROFILE_MISMATCH');
  const {controls} = codegenOptions(options);
  return Object.freeze({
    inspect(root, dependencies = []) {
      const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
      const hostWork = admissionWork(controlBridge);
      hostWork?.(1);
      if (!Array.isArray(dependencies)) throw new TypeError('Avro dependencies must be an array');
      if (dependencies.length > 100_000) throw new RangeError('Too many Avro dependencies');
      hostWork?.(dependencies.length + 1);
      const request = {op: 'avro.schema.inspect', root, dependencies};
      const responseText = addon.executeAvroInspectWire(encodeRequestWire(request, hostWork), controlBridge);
      hostWork?.(responseText.length);
      const envelope = JSON.parse(responseText);
      const failure = resultError(envelope);
      if (failure) throw new UmfCoreError(failure.code, failure.message, failure.path);
      hostWork?.(envelope.wire.length);
      return fromWire(JSON.parse(envelope.wire), hostWork);
    },
  });
}

/** Create the opt-in Avro document candidate editor; this does not activate the default adapter. */
export function createAvroCandidateEditor(options = {}) {
  if (typeof addon.executeAvroCandidateWire !== 'function' || typeof addon.avroCandidateProfileVersion !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  if (addon.avroCandidateProfileVersion() !== AVRO_CANDIDATE_PROFILE) throw new Error('RUST_NODE_BINDING_PROFILE_MISMATCH');
  const {controls} = codegenOptions(options);
  return Object.freeze({proposeNodeEdit(document, path, replacementJson, dependencyId) {
    if (typeof path !== 'string') throw new TypeError('Avro candidate path must be a string');
    if (typeof replacementJson !== 'string') throw new TypeError('Avro replacement JSON must be a string');
    if (dependencyId !== undefined && typeof dependencyId !== 'string') throw new TypeError('Avro dependency ID must be a string');
    const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const hostWork = admissionWork(controlBridge);
    hostWork?.(1);
    const request = {op: 'avro.schema.proposeNodeEdit', document, path, replacementJson,
      ...(dependencyId === undefined ? {} : {dependencyId})};
    const responseText = addon.executeAvroCandidateWire(encodeRequestWire(request, hostWork), controlBridge);
    hostWork?.(responseText.length);
    const envelope = JSON.parse(responseText);
    const failure = resultError(envelope);
    if (failure) throw new UmfCoreError(failure.code, failure.message, failure.path);
    hostWork?.(envelope.wire?.length ?? 1);
    const report = fromWire(JSON.parse(envelope.wire), hostWork);
    if (!report || report.profile !== AVRO_CANDIDATE_PROFILE || report.status !== 'candidate') {
      throw new UmfCoreError('WIRE_FORMAT', 'Malformed Avro candidate report');
    }
    return report;
  }});
}

/** Create the opt-in CONTRACT-002 Rust adapter and tree-operation surface. */
export function createJsonSchemaEngine(options = {}) {
  if (typeof addon.executeJsonSchemaWire !== 'function' || typeof addon.jsonSchemaProfileVersion !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  if (addon.jsonSchemaProfileVersion() !== JSON_SCHEMA_PROFILE) throw new Error('RUST_NODE_BINDING_PROFILE_MISMATCH');
  const {controls} = codegenOptions(options);
  const preflight = () => {
    const bridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const work = admissionWork(bridge);
    work?.(1);
    return {bridge, work};
  };
  const call = (op, fields, {bridge, work}) => {
    const request = {profile: JSON_SCHEMA_PROFILE, op, ...fields};
    const response = JSON.parse(addon.executeJsonSchemaWire(encodeRequestWire(request, work), bridge));
    work?.(response.wire?.length ?? 1);
    const failure = resultError(response);
    if (failure) throw jsonSchemaFailureError(failure, UmfCoreError);
    return fromWire(JSON.parse(response.wire), work);
  };
  return createJsonSchemaOperations(call, preflight);
}

/** Create the prepared opt-in JSON Schema adapter with a retained immutable Rust resource runtime. */
export function createPreparedJsonSchemaEngine(options = {}) {
  if (typeof addon.PreparedJsonSchemaRuntimeHandle !== 'function' || typeof addon.jsonSchemaProfileVersion !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  if (addon.jsonSchemaProfileVersion() !== JSON_SCHEMA_PROFILE) throw new Error('RUST_NODE_BINDING_PROFILE_MISMATCH');
  const {controls} = codegenOptions(options);
  const {controls: resourceControls} = codegenOptions({controls: dataProperty(options, 'resourceControls', false)});
  const resourceBridge = hasControls(resourceControls) ? createControlBridge(resourceControls) : undefined;
  let runtime;
  try {
    runtime = new addon.PreparedJsonSchemaRuntimeHandle(resourceBridge);
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
    const request = {profile: JSON_SCHEMA_PROFILE, op, ...fields};
    const response = JSON.parse(runtime.execute(encodeRequestWire(request, work), bridge));
    work?.(response.wire?.length ?? 1);
    const failure = resultError(response);
    if (failure) throw jsonSchemaFailureError(failure, UmfCoreError);
    return fromWire(JSON.parse(response.wire), work);
  };
  return createJsonSchemaOperations(call, preflight);
}

/** Create the opt-in structural document comparison adapter. */
export function createDocumentComparisonEngine(options = {}) {
  if (typeof addon.executeDocumentComparisonWire !== 'function' || typeof addon.documentComparisonProfile !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  if (addon.documentComparisonProfile() !== DOCUMENT_COMPARISON_PROFILE) throw new Error('RUST_NODE_BINDING_PROFILE_MISMATCH');
  const snapshot = dataProperty(options, 'snapshot');
  const {controls} = codegenOptions(options);
  if (typeof snapshot !== 'function') throw new TypeError('A predecessor-compatible snapshot function is required');
  return createDocumentComparisonOperations((wire, control) => addon.executeDocumentComparisonWire(wire, control), {
    snapshot, controls, ErrorType: UmfCoreError,
  });
}

/** Create the opt-in bounded Avro field-metadata projection. */
export function createAvroFieldsEngine(options = {}) {
  if (typeof addon.executeAvroFieldsWire !== 'function' || typeof addon.avroFieldsProfileVersion !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  if (addon.avroFieldsProfileVersion() !== AVRO_FIELDS_PROFILE) throw new Error('RUST_NODE_BINDING_PROFILE_MISMATCH');
  const {controls} = codegenOptions(options);
  return Object.freeze({deriveAvroFields(root, dependencies = []) {
    const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const hostWork = admissionWork(controlBridge);
    hostWork?.(1);
    const request = {op: 'avro.fields.derive', root, dependencies};
    const responseText = addon.executeAvroFieldsWire(encodeRequestWire(request, hostWork), controlBridge);
    hostWork?.(responseText.length);
    const envelope = JSON.parse(responseText);
    const failure = resultError(envelope);
    if (failure) throw new UmfCoreError(failure.code, failure.message, failure.path);
    hostWork?.(envelope.wire.length);
    return fromWire(JSON.parse(envelope.wire), hostWork);
  }});
}

function createEngineInternal(resources, options, withModel, withSchemaPropertiesHostInput = false, includeKeyTuple = withModel, includeRecordType = false, recordTypeOnly = false, withCardinalityHostInput = false, retainedRuntime = undefined, preparedResources = undefined, coreKeyRuntime = undefined) {
  const {profile, controls} = preparedResources ?? codegenOptions(options);
  const rawResourceControls = preparedResources ? undefined : dataProperty(options, 'resourceControls', false);
  const resourceControls = preparedResources ? undefined : rawResourceControls === undefined ? controls : codegenOptions({controls: rawResourceControls}).controls;
  const names = ['coreSchema', 'referenceSchema', 'packageSchema', 'constraints', 'domainPolicy'];
  const resourceBridge = preparedResources ? preparedResources.resourceBridge : withModel && hasControls(resourceControls) ? createControlBridge(resourceControls) : undefined;
  const hostWork = preparedResources ? preparedResources.hostWork : withModel ? admissionWork(resourceBridge) : undefined;
  // Model factories meter their host-side resource snapshot, with one catalog
  // budget per resource. Legacy engine snapshot semantics remain unchanged.
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
      const resource = dataProperty(resources, name, true, hostWork);
      fixedResources[name] = fromWire(toWire(resource, {maxDepth: 128, maxValues: 1_000_000, work: hostWork}), hostWork);
    }
  } else {
    const snapshot = fromWire(toWire(resources, {maxDepth: 256, maxValues: Number.MAX_SAFE_INTEGER}));
    for (const name of names) if (!Object.hasOwn(snapshot, name)) throw new TypeError(`Missing explicit engine resource ${name}`);
    fixedResources = Object.fromEntries(names.map((name) => [name, snapshot[name]]));
  }
  function invoke(op, args = {}, extensions = []) {
    const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const hostWork = withModel ? admissionWork(controlBridge) : undefined;
    hostWork?.(1);
    const callbackMap = new Map();
    const extensionValues = withModel ? dataArray(extensions, 'extensions', hostWork) : dataArray(extensions, 'extensions');
    hostWork?.(extensionValues.length + 1);
    const registry = [];
    for (let index = 0; index < extensionValues.length; index++) {
      hostWork?.(1);
      const extension = extensionValues[index];
      const manifest = dataProperty(extension, 'manifest', false, hostWork);
      if (manifest !== undefined) {
        const semantics = dataProperty(extension, 'semantics', false, hostWork);
        if (semantics !== undefined && typeof semantics !== 'function') throw new TypeError('Extension semantics must be a host callback function');
        if (semantics) { hostWork?.(1); callbackMap.set(index + 1, semantics); }
        if (Reflect.ownKeys(extension).some(key => !['manifest','semantics','kinds'].includes(key))) throw new TypeError('Full manifest and legacy registration fields cannot be mixed');
        const kindOption = dataProperty(extension, 'kinds', false, hostWork);
        const kinds = kindOption === undefined ? false : kindOption;
        if (typeof kinds !== 'boolean') throw new TypeError('kinds must be a boolean');
        hostWork?.(3);
        registry.push({manifest, kinds, semantic: Boolean(semantics)});
        continue;
      }
      const id = dataProperty(extension, 'id', true, hostWork);
      const version = dataProperty(extension, 'version', true, hostWork);
      const scopes = dataProperty(extension, 'scopes', true, hostWork);
      const schema = dataProperty(extension, 'schema', false, hostWork) ?? true;
      const semantics = dataProperty(extension, 'semantics', false, hostWork);
      if (semantics !== undefined && typeof semantics !== 'function') throw new TypeError('Extension semantics must be a host callback function');
      if (semantics) { hostWork?.(1); callbackMap.set(index + 1, semantics); }
      hostWork?.(5);
      registry.push({id, version, scopes, schema, semantic: Boolean(semantics)});
    }
    hostWork?.(1);
    const requiresResourceWitness = ['model/inspectCoreRecordMembers', 'model/declareCoreRecordType', 'model/verifyCoreRecordTypeDeclaration'].includes(op);
    const request = retainedRuntime && !requiresResourceWitness ? {op, registry, ...args} : {op, resources: fixedResources, registry, ...args};
    return runRequest(request, callbackMap, profile, controls, withModel, controlBridge, hostWork, retainedRuntime);
  }
  const api = {
    engineVersion,
    listKinds(registry = []) { return invoke('list-kinds', {}, registry); },
    getKind(reference, registry = []) { return invoke('get-kind', {reference}, registry) ?? undefined; },
    inspectExtensionKinds(document, registry = []) { return invoke('inspect-kinds', {document}, registry); },
    validateDocument(document, registry = []) { return invoke('validate', {document}, registry); },
    readDocument(source, format = 'json', registry = []) { return invoke('read', {source, format}, registry).document; },
    writeDocument(document, format = 'json', registry = []) { return invoke('write', {document, format}, registry).source; },
    readValue(source, format = 'json') { return runRawValue(addon.readValueWire, source, format, controls); },
    writeValue(value, format = 'json') { return runRawValue(addon.writeValueWire, value, format, controls); },
    readJsonValue(source, format = 'yaml') {
      if (typeof addon.readTypescriptJsonValueWire !== 'function') throw new UmfCoreError('RUST_BINDING_MISSING', 'The TypeScript JSON-value profile binding is unavailable');
      return runRawJsonValue(addon.readTypescriptJsonValueWire, source, format === 'json' ? 'json' : 'yaml', controls);
    },
    writeJsonValue(value, format = 'yaml') {
      if (typeof addon.writeTypescriptJsonValueWire !== 'function') throw new UmfCoreError('RUST_BINDING_MISSING', 'The TypeScript JSON-value profile binding is unavailable');
      return runRawJsonValue(addon.writeTypescriptJsonValueWire, value, format === 'json' ? 'json' : 'yaml', controls, {detectCycles: true});
    },
  };
  if (withModel) {
    const call = (op, args, extensions) => invoke(op, args, extensions);
    if (recordTypeOnly) {
      Object.assign(api, createCoreRecordTypeOperations(call, createNativeCoreRecordTypeVerificationOperations(addon, fixedResources, controls, {bridge: resourceBridge, work: hostWork}), {ErrorType:UmfCoreError}));
    } else {
      Object.assign(api, createCoreModelOperations(call, {ErrorType: JsonSchemaUmfError}));
      if (includeKeyTuple) Object.assign(api, createCoreKeyTupleOperations(call, createNativeKeyTupleOperations(addon, fixedResources, controls, {bridge: resourceBridge, work: hostWork})));
      Object.assign(api, createCoreKeysOperations(call, createNativeCoreKeyVerificationOperations(addon, fixedResources, controls, {bridge: resourceBridge, work: hostWork, resourcesWire: preparedResources?.resourcesWire, runtime: coreKeyRuntime})));
      if (includeRecordType) Object.assign(api, createCoreRecordTypeOperations(call, createNativeCoreRecordTypeVerificationOperations(addon, fixedResources, controls, {bridge: resourceBridge, work: hostWork}), {ErrorType:UmfCoreError}));
      Object.assign(api, createCompactDatasetValueOperations(call));
      Object.assign(api, createDatasetValueOperations(call, {ErrorType: JsonSchemaUmfError}));
      Object.assign(api, createCoreRelationshipOperations(call));
      Object.assign(api, createCoreEvolutionOperations(call));
      Object.assign(api, createCsvBooleanLexicalOperations(call));
    }
  }
  if (withSchemaPropertiesHostInput) {
    const call = (operation, inputs) => {
      if (hasControls(controls)) throw new UmfCoreError('HOST_JSON_CONTROLS_UNSUPPORTED', 'Host-input declaration does not yet accept host control callbacks');
      return schemaPropertiesHostInput(addon, fixedResources, operation, inputs, JsonSchemaUmfError);
    };
    api.inspectCoreSchemaProperties = (source, identity) => call('inspectCoreSchemaProperties', [source, identity, undefined]);
    api.declareCoreSchemaProperties = (source, identity, patch) => call('declareCoreSchemaProperties', [source, identity, patch]);
    api.validateCoreFieldValue = (source, identity, value) => call('validateCoreFieldValue', [source, identity, value]);
    api.resolveCoreDefault = (source, identity, state) => call('resolveCoreDefault', [source, identity, state]);
  }
  if (withCardinalityHostInput) {
    const call = (operation, inputs) => {
      if (hasControls(controls)) throw new UmfCoreError('HOST_JSON_CONTROLS_UNSUPPORTED', 'Host-input Core Cardinality operations do not accept host control callbacks');
      return cardinalityHostInput(addon, fixedResources, operation, inputs, JsonSchemaUmfError);
    };
    api.inspectCoreCardinality = (source, identity) => call('inspectCoreCardinality', [source, identity, undefined]);
    api.declareCoreCardinality = (source, identity, request) => call('declareCoreCardinality', [source, identity, request]);
    api.verifyCoreCardinalityDeclaration = (receipt, current) => call('verifyCoreCardinalityDeclaration', [receipt, current, undefined]);
  }
  return Object.freeze(api);
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
  function resultWithHostReads(readHost, hostReadProfile) {
    if (typeof readHost !== 'function') throw new TypeError('Host-read dispatcher must be a function');
    if (typeof addon.executeCodegenHostReadV3Wire !== 'function') throw new UmfCoreError('RUST_CODEGEN_HOST_READ_UNAVAILABLE', 'Node binding does not expose the V3 host-read operation');
    const controlBridge = hasControls(controls) ? createControlBridge(controls) : undefined;
    const hostWork = admissionWork(controlBridge);
    const hostFrames = createHostReadResponseFrames(readHost);
    if (hostReadProfile !== undefined && hostReadProfile !== 'umf.python-client-host-read/4') throw new TypeError('Unknown host-read profile');
    const wireRequest = {op: 'codegen/generatePythonClientHostV3', resources: fixedResources, ...(hostReadProfile ? {hostReadProfile} : {})};
    let responseText;
    try {
      responseText = addon.executeCodegenHostReadV3Wire(encodeRequestWire(wireRequest, hostWork), profile, hostFrames.dispatcher, controlBridge);
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

/** Create an opt-in engine that compiles explicit resources once per handle. */
export function createRetainedCodegenEngine(resources, options = {}) {
  if (typeof addon.RetainedCodegenResourcesRuntime !== 'function') throw new UmfCoreError('RUST_CODEGEN_HANDLE_UNAVAILABLE', 'Node binding does not expose retained codegen resources');
  const profile = dataProperty(options, 'profile', false) ?? 'cooperative';
  const setupControls = dataProperty(options, 'setupControls', false);
  const invocationControls = dataProperty(options, 'controls', false);
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
    const resource = dataProperty(resources, name);
    fixedResources[name] = fromWire(toWire(resource, {maxDepth: 128, maxValues: 1_000_000, work: setupWork}), setupWork);
  }
  const setupWire = encodeRequestWire({op: 'codegen/createResources', resources: fixedResources}, setupWork);
  const runtime = new addon.RetainedCodegenResourcesRuntime(setupWire, setupBridge);
  let disposed = false;
  function assertActive() {
    if (disposed) throw new UmfCoreError('RUST_CODEGEN_HANDLE_DISPOSED', 'Retained codegen resources have been disposed');
  }
  function run(operation, request) {
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
    const outcome = run(operation, request);
    if (!outcome?.ok) {
      const error = new Error(outcome?.error?.message ?? 'Rust codegen failed');
      error.name = 'UmfCodegenError';
      error.code = outcome?.error?.code ?? 'RUST_CODEGEN_FAILED';
      for (const key of ['path', 'pointer']) if (Object.hasOwn(outcome?.error ?? {}, key)) error[key] = outcome.error[key];
      throw error;
    }
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
      const responseText = runtime.executeHostReadV3Wire(encodeRequestWire(request, hostWork), profile, frames.dispatcher, controlBridge);
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
    dispose() { if (!disposed) { disposed = true; runtime.dispose(); } },
    generatePythonClient(request) { return result('generatePythonClient', request); },
    call(operation, request) { return run(operation, request); },
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

// This private staged importer is opt-in and is not connected to the default adapter.
import {createJsonSchemaStagedImportSession, JSON_SCHEMA_STAGED_IMPORT_PROFILE} from './src/json-schema-import-session.js';
export {JSON_SCHEMA_STAGED_IMPORT_PROFILE};
export function createJsonSchemaStagedImportSessionEngine() {
  return createJsonSchemaStagedImportSession(addon);
}
