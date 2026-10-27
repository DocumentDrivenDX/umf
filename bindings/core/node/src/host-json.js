// Private synchronous umf.host-json/1 dispatcher. User objects remain opaque
// to Rust; only this invocation-local closure performs captured reflection.
const parse = JSON.parse.bind(JSON);
const stringify = JSON.stringify.bind(JSON);
const getPrototypeOf = Object.getPrototypeOf;
const getOwnPropertySymbols = Object.getOwnPropertySymbols;
const getOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const entries = Object.entries;
const keys = Object.keys;
const reflectApply = Reflect.apply;
const hasOwn = Function.call.bind(Object.prototype.hasOwnProperty);
const isArray = Array.isArray;
const iteratorSymbol = Symbol.iterator;
const number = Number;
const NativeArrayBuffer = ArrayBuffer;
const NativeDataView = DataView;
const dataViewSetFloat64 = Function.call.bind(DataView.prototype.setFloat64);
const dataViewGetFloat64 = Function.call.bind(DataView.prototype.getFloat64);
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayBuffer = Function.call.bind(Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get);
const NativeUint8Array = Uint8Array;
const NativeObjectCreate = Object.create;
const defineProperty = Object.defineProperty;
const setPrototypeOf = Object.setPrototypeOf;
const nativeFromCharCode = String.fromCharCode;
const arrayPrototype = Array.prototype;
const objectPrototype = Object.prototype;
const charCodeAt = Function.call.bind(String.prototype.charCodeAt);
const mapGet = Function.call.bind(Map.prototype.get);
const mapSet = Function.call.bind(Map.prototype.set);
const mapHas = Function.call.bind(Map.prototype.has);
const mapClear = Function.call.bind(Map.prototype.clear);
const weakGet = Function.call.bind(WeakMap.prototype.get);
const weakSet = Function.call.bind(WeakMap.prototype.set);
const NativeArray = Array;
const NativeMap = Map;
const NativeWeakMap = WeakMap;
const NativeTypeError = TypeError;
const NativeError = Error;
const arraySlice = Function.call.bind(Array.prototype.slice);
const nativeParseInt = Number.parseInt;
const safeInteger = Number.isSafeInteger.bind(Number);
const stringSlice = Function.call.bind(String.prototype.slice);
const HEX = '0123456789abcdef';
const MAX_CHUNK = 8192;

class HostProtocolError extends NativeTypeError {}

function transportRecord() { return NativeObjectCreate(null); }

function transportArray(length = 0) {
  const result = new NativeArray(length);
  // JSON.stringify consults inherited `toJSON` on arrays before serializing
  // their entries. Source Proxy traps run between replies and can mutate the
  // global prototypes, so transport arrays must not inherit from Array.prototype.
  setPrototypeOf(result, null);
  return result;
}

function readHostProperty(receiver, key) {
  const diagnostic = receiver;
  if (key === 'severity') return diagnostic.severity;
  if (key === 'path') return diagnostic.path;
  if (key === 'code') return diagnostic.code;
  if (key === 'message') return diagnostic.message;
  return receiver[key];
}


function bits(value) {
  const bytes = new NativeArrayBuffer(8);
  dataViewSetFloat64(new NativeDataView(bytes), 0, value, false);
  const view = new NativeUint8Array(bytes);
  let result = '';
  for (let i = 0; i < 8; i++) result += HEX[view[i] >> 4] + HEX[view[i] & 15];
  return result;
}

function wire(value) {
  if (value === null) { const result = transportRecord(); result.kind = 'null'; return result; }
  if (typeof value === 'boolean') { const result = transportRecord(); result.kind = 'boolean'; result.value = value; return result; }
  if (typeof value === 'number') { const result = transportRecord(); result.kind = 'number'; result.bits = bits(value); return result; }
  if (typeof value === 'string') {
    const units = transportArray(value.length);
    for (let i = 0; i < value.length; i++) units[i] = charCodeAt(value, i);
    const result = transportRecord(); result.kind = 'string'; result.units = units; return result;
  }
  if (isArray(value)) {
    const items = transportArray(value.length);
    for (let i = 0; i < value.length; i++) items[i] = wire(value[i]);
    const result = transportRecord(); result.kind = 'array'; result.items = items; return result;
  }
  const members = transportArray();
  for (const key of keys(value)) {
    const units = transportArray(key.length);
    for (let i = 0; i < key.length; i++) units[i] = charCodeAt(key, i);
    const member = transportRecord(); member.key = units; member.value = wire(value[key]);
    members[members.length] = member;
  }
  const result = transportRecord(); result.kind = 'object'; result.members = members; return result;
}

function declareCoreSchemaPropertiesHostInput(addon, resources, source, identity, patch, ErrorType = Error) {
  return executeHostInput(addon, resources, 'executeDeclareCoreSchemaPropertiesHostJson', [source, identity, patch], ErrorType);
}

function schemaPropertiesHostInput(addon, resources, operation, inputs, ErrorType = Error) {
  return executeHostInput(addon, resources, 'executeCoreSchemaPropertiesHostJson', inputs, ErrorType, undefined, [operation]);
}

function cardinalityHostInput(addon, resources, operation, inputs, ErrorType = Error) {
  return executeHostInput(addon, resources, 'executeCoreCardinalityHostJson', inputs, ErrorType, undefined, [operation]);
}

// Private route probe. It does not alter either V4 package root selection.
function coreElementSelectionHostInput(addon, resources, source, query, registry, ErrorType = Error) {
  return executeHostInput(addon, resources, 'executeCoreElementSelectionHostJson', [source, query, registry], ErrorType, undefined, [registry !== undefined], undefined, false, false, fromRustWire);
}

// Private R8 probe for a host-owned object returned from inside Rust. The
// wrapper resolves the invocation-local handle before executeHostInput clears it.
function coreOpaqueReturnHostInput(addon, fn, receiver, argument, ErrorType = Error) {
  return executeHostInput(addon, undefined, 'executeCoreOpaqueReturnHostJson', [fn, receiver, argument], ErrorType, undefined, [], undefined, true, false, fromRustWire, true);
}

// Private exact delegation stage for validateDocument's caller kindRuntime branch.
function kindRuntimeValidationHostInput(addon, source, registry, ErrorType = Error) {
  return executeHostInput(addon, undefined, 'executeCoreKindRuntimeValidationHostJson', [source, registry], ErrorType, undefined, [registry !== undefined], undefined, true, false, fromRustWire, true, true);
}

/** Private reusable engine facade for the R8 Selection host-input route. */
function createCoreElementSelectionHostInputEngine(addon, resources, ErrorType = Error) {
  if (typeof addon?.executeCoreElementSelectionHostJson !== 'function') throw new ErrorType('RUST_BINDING_MISSING', 'Binding does not expose umf.host-json/1 Core Element Selection');
  return Object.freeze({
    selectCoreElements(source, query, registry) {
      return coreElementSelectionHostInput(addon, resources, source, query, registry, ErrorType);
    },
  });
}

function validateCoreRecordValuesHostInput(addon, resources, source, identity, values, ErrorType = Error, controlBridge) {
  return executeHostInput(addon, resources, 'executeValidateCoreRecordValuesHostJson', [source, identity, values], ErrorType, controlBridge);
}

function coreKindNullabilityHostInput(runtime, operation, inputs, ErrorType = Error, controlBridge) {
  return executeHostInput(runtime, undefined, 'execute', inputs, ErrorType, controlBridge, [operation], undefined, true);
}

function coreDatasetValuesHostInput(runtime, operation, inputs, ErrorType = Error, controlBridge) {
  return executeHostInput(runtime, undefined, 'execute', inputs, ErrorType, controlBridge, [operation], undefined, true);
}

function coreProtobufSourceHostInput(runtime, request, ErrorType = Error, controlBridge) {
  return coreProtobufSourceHost(runtime, 'prepareImportHost', request, ErrorType, controlBridge);
}

function coreProtobufSourceHost(runtime, operation, value, ErrorType = Error, controlBridge) {
  return executeHostInput(runtime, undefined, operation, [value], ErrorType, controlBridge, [], undefined, true);
}

function coreProtobufSourceHostResponse(runtime, operation, value, ErrorType = Error, controlBridge) {
  return executeHostInput(runtime, undefined, operation, [value], ErrorType, controlBridge, [], undefined, true, true);
}

function executeHostInput(addon, resources, operation, inputs, ErrorType, controlBridge, operationArgs = [], preparedResourcesWire, retainedRuntime = false, includeBinary = false, resultProjection = fromRustWire, opaqueReturn = false, allowPrimitiveReturn = false) {
  const handles = new NativeMap();
  const objectHandles = new NativeWeakMap();
  const primitiveOpaqueHandles = new NativeMap();
  const strings = new NativeMap();
  const stringTokens = new NativeMap();
  const snapshots = new NativeMap();
  let nextHandle = 1;
  let nextString = 1;
  let nextSnapshot = 1;
  let hasThrown = false;
  let thrown;

  function putString(value) {
    if (mapHas(stringTokens, value)) return {token: mapGet(stringTokens, value), units: value.length};
    const token = nextString++;
    mapSet(strings, token, value);
    mapSet(stringTokens, value, token);
    return {token, units: value.length};
  }
  function data(value) {
    if (value === null) return {kind: 'null'};
    switch (typeof value) {
      case 'boolean': return {kind: 'boolean', value};
      case 'number': return {kind: 'number', bits: bits(value)};
      case 'string': return {kind: 'string', ...putString(value)};
      case 'undefined': return {kind: 'unsupported', value: 'undefined'};
      case 'function': return {kind: 'unsupported', value: 'function'};
      case 'symbol': return {kind: 'unsupported', value: 'symbol'};
      case 'bigint': return {kind: 'unsupported', value: 'bigint'};
      default: return {kind: 'object', handle: putHandle(value)};
    }
  }

  function putHandle(value) {
    if ((typeof value === 'object' && value !== null) || typeof value === 'function') {
      let handle = weakGet(objectHandles, value);
      if (handle !== undefined) return handle;
      handle = nextHandle++;
      weakSet(objectHandles, value, handle);
      mapSet(handles, handle, value);
      return handle;
    }
    const handle = nextHandle++;
    mapSet(handles, handle, value);
    return handle;
  }

  function putOpaqueHandle(value) {
    if ((typeof value === 'object' && value !== null) || typeof value === 'function') return putHandle(value);
    let handle = mapGet(primitiveOpaqueHandles, value);
    if (handle !== undefined) return handle;
    handle = nextHandle++;
    mapSet(primitiveOpaqueHandles, value, handle);
    mapSet(handles, handle, value);
    return handle;
  }

  function requireHostHandle(handle) {
    if (!safeInteger(handle) || handle <= 0 || !mapHas(handles, handle)) {
      throw new HostProtocolError('Unknown opaque host handle');
    }
    return mapGet(handles, handle);
  }

  function recordThrown(error) {
    hasThrown = true;
    thrown = error;
    return stringify(wire({kind: 'host-exception'}));
  }

  function opaqueValue(value) {
    if (value === undefined) return {kind: 'undefined'};
    if (value === null) return {kind: 'null'};
    switch (typeof value) {
      case 'boolean': return {kind: 'boolean', value};
      case 'number': return {kind: 'number', bits: bits(value)};
      case 'string': return {kind: 'string', ...putString(value)};
      case 'bigint': return {kind: 'bigint', handle: putOpaqueHandle(value), isZero: value === 0n};
      default: return {kind: 'opaque', handle: putOpaqueHandle(value), opaqueType: typeof value};
    }
  }

  function invocationValue(value) {
    if (!value || typeof value !== 'object') throw new HostProtocolError('Malformed opaque invocation value');
    switch (value.kind) {
      case 'undefined': return undefined;
      case 'opaque': return requireHostHandle(value.handle);
      case 'json':
        try { return fromRustWire(value.value); }
        catch { throw new HostProtocolError('Malformed tagged JSON invocation value'); }
      case 'json-root-ordinary':
        try { return fromRustWireRootOrdinary(value.value); }
        catch { throw new HostProtocolError('Malformed tagged JSON invocation value'); }
      default: throw new HostProtocolError('Malformed opaque invocation value');
    }
  }

  // Root identity assignment is inert: no getters, proxy traps or conversion.
  const handlesForInputs = new NativeArray(inputs.length);
  setPrototypeOf(handlesForInputs, null);
  for (let index = 0; index < inputs.length; index++) handlesForInputs[index] = putHandle(inputs[index]);

  function classify(value) {
    if (value === null) return {kind: 'null'};
    switch (typeof value) {
      case 'boolean': return {kind: 'boolean', value};
      case 'number': return {kind: 'number', bits: bits(value)};
      case 'string': return {kind: 'string', ...putString(value)};
      case 'undefined': return {kind: 'unsupported', value: 'undefined'};
      case 'function': return {kind: 'unsupported', value: 'function'};
      case 'symbol': return {kind: 'unsupported', value: 'symbol'};
      case 'bigint': return {kind: 'unsupported', value: 'bigint'};
      default: return {kind: 'object', handle: putHandle(value)};
    }
  }

  function dispatch(text) {
    try {
      const request = parse(text);
      const value = mapGet(handles, request.handle);
      let reply;
      switch (request.event) {
        case 'read-property': {
          const key = fromUnits(request.keyUnits);
          reply = classify(value[key]);
          break;
        }
        case 'get-opaque-property': {
          if (typeof request.semanticCatch !== 'boolean') throw new HostProtocolError('Malformed opaque property request');
          const receiver = invocationValue(request.receiver);
          let key = null;
          if (request.key?.kind === 'iterator-symbol') key = iteratorSymbol;
          else if (request.key?.kind === 'string' && isArray(request.key.units)) {
            let valid = true;
            for (let i = 0; i < request.key.units.length; i++) {
              const unit = request.key.units[i];
              if (!safeInteger(unit) || unit < 0 || unit > 65535) { valid = false; break; }
            }
            if (valid) key = fromUnits(request.key.units);
          }
          if (key === null) throw new HostProtocolError('Malformed opaque property key');
          if (request.semanticCatch) {
            let propertyValue;
            try { propertyValue = readHostProperty(receiver, key); }
            catch (error) {
              let message;
              try { message = String(error); }
              catch (stringError) { return recordThrown(stringError); }
              reply = {kind: 'semantic-throw', message: putString(message)};
              break;
            }
            reply = {kind: 'opaque-value', value: opaqueValue(propertyValue)};
          } else reply = {kind: 'opaque-value', value: opaqueValue(readHostProperty(receiver, key))};
          break;
        }
        case 'invoke-opaque': {
          if (typeof request.semanticCatch !== 'boolean' || !isArray(request.args)) throw new HostProtocolError('Malformed opaque invocation');
          const fn = requireHostHandle(request.function);
          const receiver = invocationValue(request.receiver);
          const args = new NativeArray(request.args.length);
          for (let i = 0; i < args.length; i++) args[i] = invocationValue(request.args[i]);
          if (request.semanticCatch) {
            let returned;
            try {
              returned = reflectApply(fn, receiver, args);
            } catch (error) {
              let message;
              try { message = String(error); }
              catch (stringError) { return recordThrown(stringError); }
              reply = {kind: 'semantic-throw', message: putString(message)};
              break;
            }
            reply = {kind: 'invocation', value: opaqueValue(returned)};
          } else {
            reply = {kind: 'invocation', value: opaqueValue(reflectApply(fn, receiver, args))};
          }
          break;
        }
        case 'string-concat': {
          if (!isArray(request.prefix)) throw new HostProtocolError('Malformed string concatenation request');
          let valid = true;
          for (let i = 0; i < request.prefix.length; i++) {
            const unit = request.prefix[i];
            if (!safeInteger(unit) || unit < 0 || unit > 65535) { valid = false; break; }
          }
          if (!valid) throw new HostProtocolError('Malformed string concatenation prefix');
          const prefix = fromUnits(request.prefix);
          reply = {kind: 'opaque-value', value: opaqueValue(prefix + invocationValue(request.value))};
          break;
        }
        case 'stringify-diagnostic-array': {
          if (!isArray(request.items)) throw new HostProtocolError('Malformed diagnostic serialization request');
          const diagnostics = new NativeArray(request.items.length);
          for (let index = 0; index < request.items.length; index++) {
            const item = request.items[index];
            if (item?.kind === 'opaque' && safeInteger(item.handle) && item.handle > 0) {
              diagnostics[index] = requireHostHandle(item.handle);
            } else if (item?.kind === 'static') {
              diagnostics[index] = fromRustWireOrdinary(item.value);
            } else if (item?.kind === 'structure'
              && safeInteger(item.messageToken) && item.messageToken > 0
              && mapHas(strings, item.messageToken)) {
              const entry = NativeObjectCreate(objectPrototype);
              defineProperty(entry, 'code', {value: fromRustWireOrdinary(item.code), writable: true, enumerable: true, configurable: true});
              defineProperty(entry, 'path', {value: fromRustWireOrdinary(item.path), writable: true, enumerable: true, configurable: true});
              defineProperty(entry, 'message', {value: mapGet(strings, item.messageToken), writable: true, enumerable: true, configurable: true});
              defineProperty(entry, 'severity', {value: fromRustWireOrdinary(item.severity), writable: true, enumerable: true, configurable: true});
              diagnostics[index] = entry;
            } else {
              throw new HostProtocolError('Malformed diagnostic serialization item');
            }
          }
          const liveJson = globalThis.JSON;
          reply = {kind: 'opaque-value', value: opaqueValue(liveJson.stringify(diagnostics))};
          break;
        }
        case 'stringify-opaque-value': {
          const liveJson = globalThis.JSON;
          reply = {kind: 'opaque-value', value: opaqueValue(liveJson.stringify(invocationValue(request.value)))};
          break;
        }
        case 'construct-error-carrier': {
          const value = invocationValue(request.value);
          reply = {kind: 'opaque-value', value: opaqueValue(new NativeError(value))};
          break;
        }
        case 'materialize-spread-failure': {
          const target = request.target;
          if (!target || typeof target !== 'object') throw new HostProtocolError('Malformed spread-failure target');
          let candidate;
          if (target.kind === 'nullish') {
            candidate = invocationValue(target.value);
            if (candidate !== null && candidate !== undefined) throw new HostProtocolError('Nullish spread target is not nullish');
          } else if (target.kind === 'iterator-method') {
            const method = invocationValue(target.value);
            if (typeof method === 'function') throw new HostProtocolError('Iterator method target is callable');
            candidate = NativeObjectCreate(null);
            defineProperty(candidate, iteratorSymbol, {value: method, writable: true, enumerable: true, configurable: true});
          } else if (target.kind === 'iterator-result-primitive') {
            candidate = NativeObjectCreate(null);
            const iteratorResult = invocationValue(target.value);
            defineProperty(candidate, iteratorSymbol, {value() { return iteratorResult; }, writable: true, enumerable: true, configurable: true});
          } else if (target.kind === 'iterator-next-method') {
            candidate = NativeObjectCreate(null);
            const nextMethod = invocationValue(target.value);
            defineProperty(candidate, iteratorSymbol, {value() { return {next: nextMethod}; }, writable: true, enumerable: true, configurable: true});
          } else if (target.kind === 'iterator-step-primitive') {
            candidate = NativeObjectCreate(null);
            const iteratorResult = invocationValue(target.value);
            defineProperty(candidate, iteratorSymbol, {value() { return {next() { return iteratorResult; }}; }, writable: true, enumerable: true, configurable: true});
          } else throw new HostProtocolError('Unknown spread-failure target');
          const entry = NativeObjectCreate(null);
          defineProperty(entry, 'semantics', {value: function semantics() { return candidate; }, writable: true, enumerable: true, configurable: true});
          const out = NativeObjectCreate(null);
          defineProperty(out, 'push', {value: function push() {}, writable: true, enumerable: true, configurable: true});
          const payload = NativeObjectCreate(null), doc = NativeObjectCreate(null), at = '', scope = '';
          const copyJson = () => NativeObjectCreate(null);
          try {
            out.push(...entry.semantics(copyJson(payload), { document: copyJson(doc), path: at, scope }));
            throw new HostProtocolError('Spread-failure target unexpectedly iterated');
          } catch (error) {
            if (error instanceof HostProtocolError) throw error;
            let message;
            try { message = String(error); }
            catch (stringError) { return recordThrown(stringError); }
            reply = {kind: 'spread-failure', message: putString(message)};
          }
          break;
        }
        case 'close-opaque-iterator': {
          if (!hasThrown) throw new HostProtocolError('IteratorClose requires a pending thrown completion');
          try {
            const iterator = requireHostHandle(request.iterator);
            const closeMethod = iterator.return;
            if (closeMethod !== null && closeMethod !== undefined) {
              if (typeof closeMethod !== 'function') throw new NativeTypeError('Iterator return method is not callable');
              const result = reflectApply(closeMethod, iterator, []);
              if ((typeof result !== 'object' || result === null) && typeof result !== 'function') {
                throw new NativeTypeError('Iterator return result is not an object');
              }
            }
          } catch (_) {
            // IteratorClose with a pending throw preserves that original throw.
          }
          reply = {kind: 'iterator-closed'};
          break;
        }
        case 'classify': reply = classify(value); break;
        case 'get-prototype': {
          const proto = getPrototypeOf(value);
          reply = {kind: 'prototype', value: proto === null ? 'null' : proto === arrayPrototype ? 'array' : proto === objectPrototype ? 'ordinary' : 'other'};
          break;
        }
        case 'is-array': reply = {kind: 'boolean', value: isArray(value)}; break;
        case 'own-symbol-count': reply = {kind: 'count', value: getOwnPropertySymbols(value).length}; break;
        case 'descriptor-snapshot': {
          const snapshot = entries(getOwnPropertyDescriptors(value));
          const token = nextSnapshot++;
          mapSet(snapshots, token, snapshot);
          reply = {kind: 'snapshot', token, count: snapshot.length};
          break;
        }
        case 'descriptor-at': {
          const snapshot = mapGet(snapshots, request.token);
          if (!snapshot || request.index >= snapshot.length) throw new NativeTypeError('Unknown descriptor snapshot');
          const [key, descriptor] = snapshot[request.index];
          const hasValue = hasOwn(descriptor, 'value');
          reply = {kind: 'descriptor', key: putString(key), enumerable: descriptor.enumerable,
            isData: hasValue, hasValue, ...(hasValue ? {value: data(descriptor.value)} : {})};
          break;
        }
        case 'array-index-at-or-past-length': {
          const key = mapGet(strings, request.keyToken);
          if (key === undefined) throw new NativeTypeError('Unknown host string token');
          reply = {kind: 'boolean', value: number(key) >= value.length};
          break;
        }
        case 'array-is-sparse-or-extended': reply = {kind: 'boolean', value: keys(value).length !== value.length}; break;
        case 'read-utf16-chunk': {
          if (!safeInteger(request.offset) || !safeInteger(request.maxUnits) || request.maxUnits < 0 || request.maxUnits > MAX_CHUNK) throw new NativeTypeError('Invalid UTF-16 chunk request');
          const textValue = mapGet(strings, request.token);
          if (textValue === undefined || request.offset > textValue.length) throw new NativeTypeError('Unknown host string token or offset');
          const remaining = textValue.length - request.offset;
          const count = remaining < request.maxUnits ? remaining : request.maxUnits;
          const units = new NativeArray(count);
          for (let i = 0; i < count; i++) units[i] = charCodeAt(textValue, request.offset + i);
          reply = {kind: 'utf16-chunk', offset: request.offset, units};
          break;
        }
        case 'unicode-count': {
          const value = fromRustWire(request.carrier);
          let count = 0;
          for (let i = 0; i < value.length; i++, count++) { const c = value.charCodeAt(i); }
          reply = {kind: 'count', value: count};
          break;
        }
        default: throw new NativeTypeError('Unknown umf.host-json/1 event');
      }
      return stringify(wire(reply));
    } catch (error) {
      if (error instanceof HostProtocolError) return stringify(wire({kind: 'protocol-error'}));
      return recordThrown(error);
    }
  }

  try {
    const resourcesWire = retainedRuntime ? undefined : (preparedResourcesWire ?? stringify(wire(resources)));
    const headLength = retainedRuntime ? 0 : 1;
    const argumentsList = new NativeArray(headLength + operationArgs.length + inputs.length + (controlBridge === undefined ? 1 : 2));
    setPrototypeOf(argumentsList, null);
    if (!retainedRuntime) argumentsList[0] = resourcesWire;
    for (let index = 0; index < operationArgs.length; index++) argumentsList[index + headLength] = operationArgs[index];
    const handleOffset = headLength + operationArgs.length;
    for (let index = 0; index < handlesForInputs.length; index++) argumentsList[handleOffset + index] = handlesForInputs[index];
    argumentsList[handleOffset + inputs.length] = dispatch;
    if (controlBridge !== undefined) argumentsList[handleOffset + inputs.length + 1] = controlBridge;
    const rawResponse = reflectApply(addon[operation], addon, argumentsList);
    let response = typeof rawResponse === 'string' ? parse(rawResponse) : rawResponse;
    const binary = response?.binary;
    if (response && typeof response.wireEnvelope === 'string') response = parse(response.wireEnvelope);
    if (hasThrown) throw thrown;
    if (!response || response.profile !== 'umf.core-wire/1') throw new NativeTypeError('Malformed umf.core-wire/1 result envelope');
    if (response.status === 'error') {
      const path = fromUnits(response.pathUnits);
      const message = fromUnits(response.messageUnits);
      throw new ErrorType(response.code, message, path);
    }
    if (response.status !== 'ok' || typeof response.wire !== 'string') throw new NativeTypeError('Malformed umf.core-wire/1 result envelope');
    const result = parse(response.wire);
    // The result is Rust-produced umf.core-wire/1. Convert it without passing
    // any original argument through the existing eager host serializer.
    if (opaqueReturn) {
      const carrier = resultProjection(result);
      if (carrier && hasOwn(carrier, '__umf_host_opaque_return_v1')) {
        if (carrier.__umf_host_opaque_return_v1 !== true || !safeInteger(carrier.handle) || carrier.handle <= 0 || !mapHas(handles, carrier.handle)) {
          throw new NativeTypeError('Malformed opaque host return carrier');
        }
        return mapGet(handles, carrier.handle);
      }
      if (!allowPrimitiveReturn) throw new NativeTypeError('Malformed opaque host return carrier');
      if (carrier && hasOwn(carrier, '__umf_host_undefined_return_v1')) {
        if (carrier.__umf_host_undefined_return_v1 !== true) throw new NativeTypeError('Malformed undefined host return carrier');
        return undefined;
      }
      if (carrier && hasOwn(carrier, '__umf_host_number_return_v1')) {
        if (carrier.__umf_host_number_return_v1 !== true || typeof carrier.bits !== 'string' || carrier.bits.length !== 16) throw new NativeTypeError('Malformed number host return carrier');
        const bytes = new NativeUint8Array(new NativeArrayBuffer(8));
        for (let index = 0; index < 8; index++) {
          const pair = stringSlice(carrier.bits, index * 2, index * 2 + 2);
          const byte = nativeParseInt(pair, 16);
          if (!safeInteger(byte) || byte < 0 || byte > 255 || pair !== HEX[byte >> 4] + HEX[byte & 15]) throw new NativeTypeError('Malformed number host return carrier');
          bytes[index] = byte;
        }
        return dataViewGetFloat64(new NativeDataView(typedArrayBuffer(bytes)), 0, false);
      }
      if (carrier === null || typeof carrier !== 'object') return carrier;
      throw new NativeTypeError('Malformed primitive host return carrier');
    }
    const value = resultProjection(result);
    return includeBinary ? {value, binary} : value;
  } finally {
    mapClear(handles);
    mapClear(strings);
    mapClear(stringTokens);
    mapClear(snapshots);
  }
}

function fromRustWire(value) {
  switch (value.kind) {
    case 'null': return null;
    case 'boolean': return value.value;
    case 'number': {
      if (typeof value.bits !== 'string' || value.bits.length !== 16) throw new NativeTypeError('Malformed Rust number wire');
      const bytes = new NativeUint8Array(8);
      for (let i = 0; i < 8; i++) bytes[i] = nativeParseInt(stringSlice(value.bits, i * 2, i * 2 + 2), 16);
      return dataViewGetFloat64(new NativeDataView(typedArrayBuffer(bytes)), 0, false);
    }
    case 'string': {
      return fromUnits(value.units);
    }
    case 'array': {
      const result = new NativeArray(value.items.length);
      for (let i = 0; i < result.length; i++) result[i] = fromRustWire(value.items[i]);
      return result;
    }
    case 'object': {
      const result = NativeObjectCreate(null);
      for (const member of value.members) result[fromUnits(member.key)] = fromRustWire(member.value);
      return result;
    }
    default: throw new NativeTypeError('Malformed Rust result wire');
  }
}

// Refusal diagnostics are reconstructed as ordinary JavaScript values because
// inherited toJSON and ordinary JSON.stringify semantics are observable here.
function fromRustWireOrdinary(value) {
  switch (value.kind) {
    case 'null': return null;
    case 'boolean': return value.value;
    case 'number': {
      if (typeof value.bits !== 'string' || value.bits.length !== 16) throw new NativeTypeError('Malformed Rust number wire');
      const bytes = new NativeUint8Array(8);
      for (let i = 0; i < 8; i++) bytes[i] = nativeParseInt(stringSlice(value.bits, i * 2, i * 2 + 2), 16);
      return dataViewGetFloat64(new NativeDataView(typedArrayBuffer(bytes)), 0, false);
    }
    case 'string': return fromUnits(value.units);
    case 'array': {
      const result = new NativeArray(value.items.length);
      for (let i = 0; i < result.length; i++) result[i] = fromRustWireOrdinary(value.items[i]);
      return result;
    }
    case 'object': {
      const result = NativeObjectCreate(objectPrototype);
      for (const member of value.members) defineProperty(result, fromUnits(member.key), {
        value: fromRustWireOrdinary(member.value), writable: true, enumerable: true, configurable: true,
      });
      return result;
    }
    default: throw new NativeTypeError('Malformed Rust result wire');
  }
}

function fromRustWireRootOrdinary(value) {
  if (value?.kind !== 'object' || !isArray(value.members)) throw new NativeTypeError('Malformed ordinary-root JSON invocation value');
  const result = NativeObjectCreate(objectPrototype);
  for (const member of value.members) defineProperty(result, fromUnits(member.key), {
    value: fromRustWire(member.value), writable: true, enumerable: true, configurable: true,
  });
  return result;
}

function fromUnits(units) {
  let result = '';
  for (let offset = 0; offset < units.length; offset += MAX_CHUNK) {
    result += nativeFromCharCode(...arraySlice(units, offset, offset + MAX_CHUNK));
  }
  return result;
}

export {declareCoreSchemaPropertiesHostInput, schemaPropertiesHostInput, cardinalityHostInput, coreElementSelectionHostInput, coreOpaqueReturnHostInput, kindRuntimeValidationHostInput, createCoreElementSelectionHostInputEngine, validateCoreRecordValuesHostInput, coreKindNullabilityHostInput, coreDatasetValuesHostInput, coreProtobufSourceHostInput, coreProtobufSourceHost, coreProtobufSourceHostResponse};
