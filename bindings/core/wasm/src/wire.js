// Private umf.core-wire/1 admission for JavaScript hosts. Inspect before stringify.
const hasOwn = Function.call.bind(Object.prototype.hasOwnProperty);
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const defineProperty = Object.defineProperty;
const getPrototypeOf = Object.getPrototypeOf;
const ownKeys = Reflect.ownKeys;
const arrayIsArray = Array.isArray;
const isSafeInteger = Number.isSafeInteger;
const freeze = Object.freeze;
const min = Math.min;
const arrayPrototype = Array.prototype;
const objectPrototype = Object.prototype;
const toNumber = Number;
const toString = String;
const regexpTest = Function.call.bind(RegExp.prototype.test);
const stringSplit = Function.call.bind(String.prototype.split);
const stringCharCodeAt = Function.call.bind(String.prototype.charCodeAt);
const stringCharAt = Function.call.bind(String.prototype.charAt);
const mapSet = Function.call.bind(Map.prototype.set);
const mapGet = Function.call.bind(Map.prototype.get);
const mapDelete = Function.call.bind(Map.prototype.delete);
const mapClear = Function.call.bind(Map.prototype.clear);
// The envelope combines independently bounded catalog resources and an
// ordinary operation tree. Its structural limits allow those payloads plus
// their wire wrappers; copied string/key content has no aggregate text cap.
const REQUEST_LIMITS = Object.freeze({maxDepth: 256, maxValues: Number.MAX_SAFE_INTEGER});

export const HOST_READ_RESPONSE_FRAME_UNITS = 8192;
const HOST_READ_FRAME_EVENT = '__umf_host_read_v3_frame__';
const HOST_READ_ARRAY_ITEM_EVENT = '__umf_host_read_v3_array_item__';
const HOST_READ_RESPONSE_PREFIX = 'UMF-HOST-READ-V3';
const HOST_READ_FRAME_PREFIX = 'UMF-HOST-FRAME-V3';
const HEX_DIGITS = '0123456789abcdef';

/**
 * Keep host response strings in JS and expose only bounded UTF-16 frames to
 * native/WASM. The returned dispatcher intercepts private frame events so
 * user host getters still run only for the original closed semantic events.
 */
export function createHostReadResponseFrames(readHost) {
  const pending = new Map();
  let nextToken = 1;

  function token() {
    if (!isSafeInteger(nextToken) || nextToken <= 0) throw new RangeError('Host response token space exhausted');
    return nextToken++;
  }

  function storeString(value) {
    const id = token();
    if (value.length) mapSet(pending, id, {kind: 'string', value, offset: 0});
    return `${HOST_READ_RESPONSE_PREFIX}|string|${id}|${value.length}`;
  }

  function describe(value) {
    if (value === null) return `${HOST_READ_RESPONSE_PREFIX}|null`;
    if (typeof value === 'boolean') return `${HOST_READ_RESPONSE_PREFIX}|bool|${value}`;
    if (typeof value === 'string') return storeString(value);
    if (arrayIsArray(value)) {
      if (getPrototypeOf(value) !== arrayPrototype) throw new TypeError('Host-read string array prototype is invalid');
      const length = getOwnPropertyDescriptor(value, 'length')?.value;
      if (!isSafeInteger(length) || length < 0) throw new TypeError('Host-read string array length is invalid');
      const keys = ownKeys(value);
      if (keys.length !== length + 1) throw new TypeError('Host-read string array is sparse or has extra properties');
      const items = [];
      let units = 0;
      for (let index = 0; index < length; index++) {
        const descriptor = getOwnPropertyDescriptor(value, toString(index));
        if (!descriptor || !hasOwn(descriptor, 'value') || !descriptor.enumerable || typeof descriptor.value !== 'string') {
          throw new TypeError('Host-read string array contains a non-string entry');
        }
        defineProperty(items, toString(index), {value: descriptor.value, enumerable: true, writable: true, configurable: true});
        units += descriptor.value.length;
        if (!isSafeInteger(units)) throw new RangeError('Host-read string array length exceeds safe integer range');
      }
      const id = token();
      if (items.length) mapSet(pending, id, {kind: 'array', items, nextItem: 0});
      return `${HOST_READ_RESPONSE_PREFIX}|array|${id}|${items.length}|${units}`;
    }
    if (value && typeof value === 'object') {
      const descriptor = getOwnPropertyDescriptor(value, 'kind');
      const pathDescriptor = getOwnPropertyDescriptor(value, 'path');
      if ((getPrototypeOf(value) === objectPrototype || getPrototypeOf(value) === null) &&
          ownKeys(value).length === 2 && descriptor && hasOwn(descriptor, 'value') && descriptor.enumerable && descriptor.value === 'umf.host-resource-limit/4' &&
          pathDescriptor && hasOwn(pathDescriptor, 'value') && pathDescriptor.enumerable && (pathDescriptor.value === 'records' || pathDescriptor.value === 'actions')) {
        return `UMF-HOST-READ-V4|resource|${pathDescriptor.value}`;
      }
      if ((getPrototypeOf(value) === objectPrototype || getPrototypeOf(value) === null) && ownKeys(value).length === 1 && descriptor && hasOwn(descriptor, 'value') && descriptor.enumerable && descriptor.value === 'umf.host-abort/3') {
        return `${HOST_READ_RESPONSE_PREFIX}|abort`;
      }
    }
    throw new TypeError('Host-read value is outside the closed V3 response set');
  }

  function parseTriple(argument) {
    if (typeof argument !== 'string' || !regexpTest(/^[1-9][0-9]*:[0-9]+:[0-9]+$/, argument)) {
      throw new TypeError('Malformed private host-response request');
    }
    const [idText, indexText, countText] = stringSplit(argument, ':');
    const id = toNumber(idText), index = toNumber(indexText), count = toNumber(countText);
    if (!isSafeInteger(id) || !isSafeInteger(index) || !isSafeInteger(count)) throw new TypeError('Host-response request exceeds integer range');
    return [id, index, count];
  }

  function dispatcher(event, argument) {
    if (event === HOST_READ_ARRAY_ITEM_EVENT) {
      const [id, index] = parseTriple(`${argument}:0`);
      const entry = mapGet(pending, id);
      if (!entry || entry.kind !== 'array' || index !== entry.nextItem || index >= entry.items.length) {
        throw new TypeError('Host-response array token or offset mismatch');
      }
      entry.nextItem++;
      const value = entry.items[index];
      if (entry.nextItem === entry.items.length) mapDelete(pending, id);
      return storeString(value);
    }
    if (event === HOST_READ_FRAME_EVENT) {
      const [id, offset, maximum] = parseTriple(argument);
      const entry = mapGet(pending, id);
      if (!entry || entry.kind !== 'string' || offset !== entry.offset || maximum !== HOST_READ_RESPONSE_FRAME_UNITS) {
        throw new TypeError('Host-response frame token or offset mismatch');
      }
      let end = min(offset + maximum, entry.value.length);
      if (end < entry.value.length) {
        const high = stringCharCodeAt(entry.value, end - 1);
        const low = stringCharCodeAt(entry.value, end);
        if (high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff) end--;
      }
      const count = end - offset;
      let hex = '';
      for (let index = 0; index < count; index++) {
        const unit = stringCharCodeAt(entry.value, offset + index);
        hex += stringCharAt(HEX_DIGITS, unit >>> 12);
        hex += stringCharAt(HEX_DIGITS, (unit >>> 8) & 15);
        hex += stringCharAt(HEX_DIGITS, (unit >>> 4) & 15);
        hex += stringCharAt(HEX_DIGITS, unit & 15);
      }
      entry.offset = end;
      if (entry.offset === entry.value.length) mapDelete(pending, id);
      return `${HOST_READ_FRAME_PREFIX}|${id}|${offset}|${count}|${hex}`;
    }
    return describe(readHost(event, argument));
  }

  return freeze({dispatcher, dispose() { mapClear(pending); }});
}

export class AdmissionError extends TypeError {
  constructor(code, message, path = '') {
    super(message);
    this.name = 'AdmissionError';
    this.code = code;
    this.path = path;
  }
}

function fail(code, message, path) {
  throw new AdmissionError(code, message, path);
}

function objectKeys(value, path, work) {
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    fail('UNSUPPORTED_OBJECT', 'Only plain objects are accepted', path);
  }
  const keys = Reflect.ownKeys(value);
  work?.(keys.length);
  const members = [];
  for (const key of keys) {
    if (typeof key !== 'string') fail('UNSUPPORTED_KEY', 'Symbol keys are not JSON values', path);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !hasOwn(descriptor, 'value')) {
      fail('ACCESSOR_PROPERTY', 'Accessor properties are not invoked during admission', path);
    }
    if (!descriptor.enumerable) fail('NON_ENUMERABLE_PROPERTY', 'Non-enumerable properties are not JSON values', path);
    work?.(key.length + 1);
    members.push([key, descriptor.value]);
  }
  return members;
}

function arrayItems(value, path, work) {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    fail('UNSUPPORTED_ARRAY_PROTOTYPE', 'Only plain arrays are accepted', path);
  }
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
  work?.(Number.isSafeInteger(length) && length > 0 ? length : 1);
  const keys = Reflect.ownKeys(value);
  if (!Number.isSafeInteger(length) || keys.length !== length + 1) {
    fail('SPARSE_OR_EXTENDED_ARRAY', 'Sparse arrays and arrays with extra properties are not JSON values', path);
  }
  const items = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !hasOwn(descriptor, 'value') || !descriptor.enumerable) {
      fail('SPARSE_OR_ACCESSOR_ARRAY', 'Sparse arrays and indexed accessors are not admitted', `${path}/${index}`);
    }
    items.push(descriptor.value);
  }
  return items;
}

function numberBits(value) {
  const bytes = new ArrayBuffer(8);
  new DataView(bytes).setFloat64(0, value, false);
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function units(text) {
  const out = new Array(text.length);
  for (let index = 0; index < text.length; index++) out[index] = text.charCodeAt(index);
  return out;
}

export function toWire(value, limits = {}) {
  const maxDepth = limits.maxDepth ?? 128;
  let values = 0;
  function visit(item, path, depth) {
    limits.work?.(1);
    values++;
    if (values > (limits.maxValues ?? 100_000)) fail('RESOURCE_LIMIT', 'JSON value count exceeds the admission limit', path);
    if (depth > maxDepth) fail('RESOURCE_LIMIT', 'JSON nesting exceeds the admission limit', path);
    if (item === null) return {kind: 'null'};
    if (typeof item === 'boolean') return {kind: 'boolean', value: item};
    if (typeof item === 'number') return {kind: 'number', bits: numberBits(item)};
    if (typeof item === 'string') { limits.work?.(item.length); return {kind: 'string', units: units(item)}; }
    if (Array.isArray(item)) return {kind: 'array', items: arrayItems(item, path, limits.work).map((entry, index) => visit(entry, `${path}/${index}`, depth + 1))};
    if (typeof item === 'object') return {kind: 'object', members: objectKeys(item, path, limits.work).map(([key, entry]) => ({key: units(key), value: visit(entry, `${path}/${escapePointer(key)}`, depth + 1)}))};
    fail('UNSUPPORTED_VALUE', `Unsupported JavaScript value type: ${typeof item}`, path);
  }
  return visit(value, '', 0);
}

function escapePointer(text) { return text.replaceAll('~', '~0').replaceAll('/', '~1'); }

export function encodeWire(value, limits) {
  // JSON.stringify is safe only after toWire built fresh, data-only transport objects.
  return JSON.stringify(toWire(value, limits));
}

export function encodeRequestWire(value, work) {
  return encodeWire(value, {...REQUEST_LIMITS, work});
}

export function fromWire(wire, work) {
  work?.(1);
  if (!wire || typeof wire !== 'object' || typeof wire.kind !== 'string') throw new TypeError('Malformed umf.core-wire/1 value');
  switch (wire.kind) {
    case 'null': return null;
    case 'boolean': return wire.value;
    case 'number': {
      if (!/^[0-9a-f]{16}$/.test(wire.bits)) throw new TypeError('Malformed binary64 bit pattern');
      const bytes = Uint8Array.from(wire.bits.match(/../g), part => Number.parseInt(part, 16));
      return new DataView(bytes.buffer).getFloat64(0, false);
    }
    case 'string': return unitsToString(wire.units, work);
    case 'array': work?.(wire.items.length); return wire.items.map(item => fromWire(item, work));
    case 'object': {
      const result = Object.create(null);
      for (const member of wire.members) {
        const key = unitsToString(member.key, work);
        if (hasOwn(result, key)) throw new TypeError('Duplicate key in umf.core-wire/1 object');
        Object.defineProperty(result, key, {value: fromWire(member.value, work), enumerable: true, writable: true, configurable: true});
      }
      return result;
    }
    default: throw new TypeError(`Unknown umf.core-wire/1 tag: ${wire.kind}`);
  }
}

/** Validate a Rust result envelope and return its exact host-side error, if any. */
export function resultError(result) {
  if (!result || result.profile !== 'umf.core-wire/1' || !['ok', 'error'].includes(result.status)) {
    throw new TypeError('Malformed umf.core-wire/1 result envelope');
  }
  if (result.status === 'ok') {
    if (typeof result.wire !== 'string' || Object.keys(result).some(key => !['profile', 'status', 'wire'].includes(key))) {
      throw new TypeError('Malformed umf.core-wire/1 success envelope');
    }
    return null;
  }
  if (typeof result.code !== 'string' || Object.keys(result).some(key => !['profile', 'status', 'code', 'pathUnits', 'messageUnits'].includes(key))) {
    throw new TypeError('Malformed umf.core-wire/1 error envelope');
  }
  return {
    code: result.code,
    path: unitsToString(result.pathUnits),
    message: unitsToString(result.messageUnits),
  };
}

function unitsToString(codeUnits, work) {
  work?.(codeUnits?.length ?? 1);
  if (!Array.isArray(codeUnits) || codeUnits.some(unit => !Number.isInteger(unit) || unit < 0 || unit > 0xffff)) {
    throw new TypeError('Malformed UTF-16 code-unit array');
  }
  let result = '';
  for (let offset = 0; offset < codeUnits.length; offset += 8192) {
    result += String.fromCharCode(...codeUnits.slice(offset, offset + 8192));
  }
  return result;
}
