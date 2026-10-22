// Private umf.core-wire/1 admission for JavaScript hosts. Inspect before stringify.
const hasOwn = Function.call.bind(Object.prototype.hasOwnProperty);
// The envelope combines independently bounded catalog resources and an
// ordinary operation tree. Its structural limits allow those payloads plus
// their wire wrappers; copied string/key content has no aggregate text cap.
const REQUEST_LIMITS = Object.freeze({maxDepth: 256, maxValues: Number.MAX_SAFE_INTEGER});

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
