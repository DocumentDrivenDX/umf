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
const number = Number;
const NativeArrayBuffer = ArrayBuffer;
const NativeDataView = DataView;
const dataViewSetFloat64 = Function.call.bind(DataView.prototype.setFloat64);
const dataViewGetFloat64 = Function.call.bind(DataView.prototype.getFloat64);
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayBuffer = Function.call.bind(Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get);
const NativeUint8Array = Uint8Array;
const NativeObjectCreate = Object.create;
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
const arraySlice = Function.call.bind(Array.prototype.slice);
const nativeParseInt = Number.parseInt;
const safeInteger = Number.isSafeInteger.bind(Number);
const stringSlice = Function.call.bind(String.prototype.slice);
const HEX = '0123456789abcdef';
const MAX_CHUNK = 8192;

function transportRecord() { return NativeObjectCreate(null); }

function transportArray(length = 0) {
  const result = new NativeArray(length);
  // JSON.stringify consults inherited `toJSON` on arrays before serializing
  // their entries. Source Proxy traps run between replies and can mutate the
  // global prototypes, so transport arrays must not inherit from Array.prototype.
  setPrototypeOf(result, null);
  return result;
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

function executeHostInput(addon, resources, operation, inputs, ErrorType, controlBridge, operationArgs = [], preparedResourcesWire, retainedRuntime = false, includeBinary = false) {
  const handles = new NativeMap();
  const objectHandles = new NativeWeakMap();
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
        default: throw new NativeTypeError('Unknown umf.host-json/1 event');
      }
      return stringify(wire(reply));
    } catch (error) {
      hasThrown = true;
      thrown = error;
      return stringify(wire({kind: 'host-exception'}));
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
    const value = fromRustWire(result);
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

function fromUnits(units) {
  let result = '';
  for (let offset = 0; offset < units.length; offset += MAX_CHUNK) {
    result += nativeFromCharCode(...arraySlice(units, offset, offset + MAX_CHUNK));
  }
  return result;
}

export {declareCoreSchemaPropertiesHostInput, validateCoreRecordValuesHostInput, coreKindNullabilityHostInput, coreDatasetValuesHostInput, coreProtobufSourceHostInput, coreProtobufSourceHost, coreProtobufSourceHostResponse};
