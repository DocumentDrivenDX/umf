import {encodeRequestWire, fromWire, resultError, toWire} from './wire.js';

export const BIT128_PROFILE = 'umf-128/1';
const byteLengthGetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength').get;
const byteOffsetGetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteOffset').get;
const bufferGetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'buffer').get;
const typedArrayTagGetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), Symbol.toStringTag).get;

function error(code, message, path = '') {
  const result = new Error(message);
  result.name = 'UmfCoreError';
  result.code = code;
  result.path = path;
  return result;
}

function data(value, key, required = true) {
  if (!value || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new TypeError('Options must be a plain object');
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) { if (required) throw new TypeError(`Missing ${key}`); return undefined; }
  if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new TypeError(`${key} must be an enumerable data property`);
  return descriptor.value;
}

function makeControls(options) {
  if (options !== undefined) {
    if (!options || (Object.getPrototypeOf(options) !== Object.prototype && Object.getPrototypeOf(options) !== null)) throw new TypeError('Options must be a plain object');
    const keys = Reflect.ownKeys(options);
    if (keys.some(key => typeof key !== 'string' || !['profile', 'controls'].includes(key))) throw new TypeError('Unknown bit128 option');
    for (const key of keys) data(options, key);
  }
  const profile = data(options, 'profile', false) ?? 'cooperative';
  if (profile !== 'cooperative' && profile !== 'hard-isolated') throw new TypeError('Unknown resource profile');
  if (profile === 'hard-isolated') throw error('RESOURCE_PROFILE_UNAVAILABLE', 'HardIsolated resource profile is unavailable');
  const raw = data(options, 'controls', false) ?? Object.create(null);
  if (!raw || (Object.getPrototypeOf(raw) !== Object.prototype && Object.getPrototypeOf(raw) !== null)) throw new TypeError('controls must be a plain object');
  const controlKeys = Reflect.ownKeys(raw);
  if (controlKeys.some(key => typeof key !== 'string' || !['maxWork', 'meter', 'isCancelled', 'now', 'deadlineMs'].includes(key))) throw new TypeError('Unknown bit128 control');
  for (const key of controlKeys) data(raw, key);
  const controls = Object.create(null);
  for (const key of ['maxWork', 'meter', 'isCancelled', 'now', 'deadlineMs']) controls[key] = data(raw, key, false);
  if (controls.maxWork !== undefined && (!Number.isSafeInteger(controls.maxWork) || controls.maxWork < 0)) throw new TypeError('controls.maxWork must be a non-negative safe integer');
  if (controls.deadlineMs !== undefined && (typeof controls.deadlineMs !== 'number' || !Number.isFinite(controls.deadlineMs))) throw new TypeError('controls.deadlineMs must be finite');
  for (const key of ['meter', 'isCancelled', 'now']) if (controls[key] !== undefined && typeof controls[key] !== 'function') throw new TypeError(`controls.${key} must be a function`);
  if (controls.deadlineMs !== undefined && controls.now === undefined) throw new TypeError('controls.now is required with controls.deadlineMs');
  return controls;
}

function callbackMessage(value) {
  try {
    const message = Object.getOwnPropertyDescriptor(value, 'message');
    return message && Object.hasOwn(message, 'value') && typeof message.value === 'string' ? message.value : 'Host callback failed';
  } catch { return 'Host callback failed'; }
}

function controlBridge(controls) {
  let charged = 0;
  const bridge = amount => {
    charged += amount;
    const refuse = (code, message) => encodeRequestWire({ok: false, code, message});
    if (controls.maxWork !== undefined && charged > controls.maxWork) return refuse('RESOURCE_LIMIT', 'Host work budget exceeded');
    try { if (amount > 0) controls.meter?.(amount); } catch (cause) { return refuse('METER_FAILURE', callbackMessage(cause)); }
    try { if (controls.isCancelled?.()) return refuse('CANCELLED', 'Operation cancelled by host'); } catch (cause) { return refuse('CANCELLATION_CHECK_FAILURE', callbackMessage(cause)); }
    if (controls.deadlineMs !== undefined) {
      try {
        const now = controls.now();
        if (typeof now !== 'number' || !Number.isFinite(now)) return refuse('CLOCK_CAPABILITY_REQUIRED', 'Host clock did not return a finite millisecond value');
        if (now > controls.deadlineMs) return refuse('DEADLINE', 'Deadline elapsed');
      } catch (cause) { return refuse('CLOCK_CAPABILITY_REQUIRED', callbackMessage(cause)); }
    }
    return '';
  };
  bridge.beginOperation = () => { charged = 0; };
  return bridge;
}

function hostWork(bridge) {
  return amount => {
    const response = bridge?.(amount);
    if (response) {
      const failure = fromWire(JSON.parse(response));
      throw error(failure.code, failure.message);
    }
  };
}

function call(invoke, bridge, op, args) {
  const work = hostWork(bridge);
  const request = {profile: BIT128_PROFILE, op, args};
  let requestWire;
  try { requestWire = encodeRequestWire(request, work); }
  catch (cause) {
    if (cause?.name !== 'AdmissionError') throw cause;
    if (op === 'bits128FromWords' && cause.code === 'ACCESSOR_PROPERTY') throw error('BIT128_TYPE', 'Word accessors are forbidden');
    if (op === 'bits128FromInteger' && cause.code === 'ACCESSOR_PROPERTY') throw error('BIT128_TYPE', 'Expected integer token text');
    if (['bits128ToBytes', 'uuidFromBits128', 'compareBits128', 'bits128ToWords', 'bits128ToInteger'].includes(op) && cause.code === 'ACCESSOR_PROPERTY') throw error('BIT128_VALUE', 'Accessors are not value snapshots');
    if (op === 'uuidToBits128' && cause.code === 'ACCESSOR_PROPERTY') throw error('BIT128_VALUE', 'Unknown UUID snapshot members or accessors');
    const mapped = {
      parseBits128: ['text', 'BIT128_TYPE', 'Expected hexadecimal text'],
      parseUuid: ['text', 'BIT128_TYPE', 'Expected UUID text'],
      bits128ToBytes: ['value', 'BIT128_VALUE', 'Invalid bit value snapshot'],
      uuidFromBits128: ['value', 'BIT128_VALUE', 'Invalid bit value snapshot'],
      uuidToBits128: ['value', 'BIT128_VALUE', 'Invalid UUID snapshot'],
      compareBits128: ['left|right', 'BIT128_VALUE', 'Invalid bit value snapshot'],
      bits128ToWords: ['value', 'BIT128_VALUE', 'Invalid bit value snapshot'],
      bits128FromWords: ['words', 'BIT128_TYPE', 'Expected exactly high and low words'],
      bits128ToInteger: ['value', 'BIT128_VALUE', 'Invalid bit value snapshot'],
      bits128FromInteger: ['literal', 'BIT128_TYPE', 'Expected one integerToken'],
    }[op];
    if (mapped) throw error(mapped[1], mapped[2]);
    throw cause;
  }
  const responseText = invoke(requestWire, bridge);
  work(responseText.length);
  const response = JSON.parse(responseText);
  const failure = resultError(response);
  if (failure) throw error(failure.code, failure.message, failure.path);
  work(response.wire.length);
  return fromWire(JSON.parse(response.wire), work);
}

function plainPrototype(value) {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalidBitsValue() {
  const value = Object.create(null);
  Object.defineProperties(value, {
    profile: {value: BIT128_PROFILE, enumerable: true},
    hex: {value: '0'.repeat(32), enumerable: true},
    extra: {value: true, enumerable: true},
  });
  return value;
}

function boundedText(value, width) {
  // Fixed-width codec fields are admitted without carrying arbitrary strings
  // into the tagged wire tree. Rust still owns all content/grammar checks.
  return typeof value === 'string' && value.length === width ? value : null;
}

function orderedBitValue(input, work, accessorSentinel = false) {
  // Reserve/check before proxy traps and charge returned keys before descriptor traversal.
  work(1);
  if (!plainPrototype(input)) return {value: invalidBitsValue()};
  const keys = Reflect.ownKeys(input);
  work(keys.length);
  if (keys.length !== 2 || keys.some(key => typeof key !== 'string') || !keys.includes('profile') || !keys.includes('hex')) {
    return {value: invalidBitsValue()};
  }
  const descriptors = Object.create(null);
  let accessor = false;
  for (const key of ['profile', 'hex']) {
    work(1);
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable) return {value: invalidBitsValue()};
    if (!Object.hasOwn(descriptor, 'value')) accessor = true;
    else descriptors[key] = descriptor.value;
  }
  if (accessor && !accessorSentinel) {
    const value = Object.create(null);
    Object.defineProperties(value, {
      profile: {value: BIT128_PROFILE, enumerable: true},
      hex: {value: '0'.repeat(32), enumerable: true},
    });
    return {value, deferred: true};
  }
  const value = Object.create(null);
  const profile = accessorSentinel && accessor ? null : boundedText(descriptors.profile, 9);
  const hex = accessorSentinel && accessor ? null : boundedText(descriptors.hex, 32);
  Object.defineProperty(value, 'profile', {value: profile, enumerable: true});
  Object.defineProperty(value, 'hex', {value: hex, enumerable: true});
  return {value, deferred: accessor};
}

function invalidUuidValue() {
  const value = Object.create(null);
  Object.defineProperties(value, {
    profile: {value: BIT128_PROFILE, enumerable: true},
    hex: {value: '0'.repeat(32), enumerable: true},
    canonicalText: {value: '00000000-0000-0000-0000-000000000000', enumerable: true},
    originalText: {value: '00000000-0000-0000-0000-000000000000', enumerable: true},
    extra: {value: true, enumerable: true},
  });
  return value;
}

function unknownUuidMembersValue() {
  const value = Object.create(null);
  Object.defineProperties(value, {
    profile: {value: BIT128_PROFILE, enumerable: true},
    hex: {value: '0'.repeat(32), enumerable: true},
    canonicalText: {value: '00000000-0000-0000-0000-000000000000', enumerable: true},
    unexpected: {value: null, enumerable: true},
  });
  return value;
}

function orderedUuidValue(input, work) {
  work(1);
  if (!plainPrototype(input)) return {value: invalidUuidValue()};
  const keys = Reflect.ownKeys(input);
  work(keys.length);
  const fields = ['profile', 'hex', 'canonicalText', 'originalText'];
  if (keys.length !== fields.length || keys.some(key => typeof key !== 'string')) return {value: invalidUuidValue()};
  if (keys.some(key => !fields.includes(key))) return {value: unknownUuidMembersValue()};
  const descriptors = Object.create(null);
  let accessor = false;
  for (const key of fields) {
    work(1);
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable) return {value: invalidUuidValue()};
    if (!Object.hasOwn(descriptor, 'value')) accessor = true;
    else descriptors[key] = descriptor.value;
  }
  if (accessor) {
    const value = Object.create(null);
    Object.defineProperties(value, {
      profile: {value: BIT128_PROFILE, enumerable: true},
      hex: {value: '0'.repeat(32), enumerable: true},
      canonicalText: {value: '00000000-0000-0000-0000-000000000000', enumerable: true},
      originalText: {value: '00000000-0000-0000-0000-000000000000', enumerable: true},
    });
    return {value, deferred: true};
  }
  const value = Object.create(null);
  const widths = {profile: 9, hex: 32, canonicalText: 36, originalText: 36};
  for (const key of fields) Object.defineProperty(value, key, {
    value: boundedText(descriptors[key], widths[key]),
    enumerable: true,
  });
  return {value};
}

function orderedWords(words, work) {
  work(1);
  if (!plainPrototype(words)) return {value: {high: '0', low: '0', extra: true}};
  const keys = Reflect.ownKeys(words);
  work(keys.length);
  if (keys.length !== 2 || keys.some(key => typeof key !== 'string') || !keys.includes('high') || !keys.includes('low')) {
    return {value: {high: '0', low: '0', extra: true}};
  }
  const descriptors = Object.create(null);
  const accessors = Object.create(null);
  for (const key of ['high', 'low']) {
    work(1);
    const descriptor = Object.getOwnPropertyDescriptor(words, key);
    if (!descriptor || !descriptor.enumerable) return {value: {high: '0', low: '0', extra: true}};
    if (!Object.hasOwn(descriptor, 'value')) accessors[key] = true;
    else descriptors[key] = descriptor.value;
  }
  // Non-string data values become null so Rust reports the predecessor type refusal.
  const value = Object.create(null);
  const high = accessors.high ? null : typeof descriptors.high === 'string' ? descriptors.high : null;
  const low = accessors.high ? '0' : accessors.low ? null : typeof descriptors.low === 'string' ? descriptors.low : null;
  Object.defineProperty(value, 'high', {value: high, enumerable: true});
  Object.defineProperty(value, 'low', {value: low, enumerable: true});
  return {value, accessorKeys: Object.keys(accessors), highValueIsString: typeof descriptors.high === 'string'};
}

function invalidIntegerLiteral() {
  const value = Object.create(null);
  Object.defineProperties(value, {
    integerToken: {value: '0', enumerable: true},
    extra: {value: true, enumerable: true},
  });
  return value;
}

function orderedIntegerLiteral(literal, work) {
  work(1);
  if (!plainPrototype(literal)) return {value: invalidIntegerLiteral()};
  const keys = Reflect.ownKeys(literal);
  work(keys.length);
  if (keys.length !== 1 || keys[0] !== 'integerToken') return {value: invalidIntegerLiteral()};
  work(1);
  const descriptor = Object.getOwnPropertyDescriptor(literal, 'integerToken');
  if (!descriptor || !descriptor.enumerable) return {value: invalidIntegerLiteral()};
  const token = Object.hasOwn(descriptor, 'value') ? descriptor.value : null;
  const value = Object.create(null);
  Object.defineProperty(value, 'integerToken', {
    value: typeof token === 'string' ? token : null,
    enumerable: true,
  });
  return {value};
}

function typedArraySnapshot(input, work) {
  work(1);
  let length, offset, buffer, tag;
  try {
    if (!ArrayBuffer.isView(input)) throw new TypeError();
    length = byteLengthGetter.call(input);
    offset = byteOffsetGetter.call(input);
    buffer = bufferGetter.call(input);
    tag = typedArrayTagGetter.call(input);
  } catch { throw error('BIT128_TYPE', 'Expected a Uint8Array'); }
  if (tag !== 'Uint8Array') throw error('BIT128_TYPE', 'Expected a Uint8Array');
  if (length !== 16) throw error('BIT128_SYNTAX', 'Expected exactly 16 bytes');
  work(length);
  try { return Array.from(new Uint8Array(buffer, offset, length)); }
  catch { throw error('BIT128_TYPE', 'Expected a Uint8Array'); }
}

function presentObject(value, keys, work, frozen = true) {
  work(keys.length + 1);
  if (!value || Object.getPrototypeOf(value) !== null) throw new TypeError('Malformed Rust codec result object');
  const own = Reflect.ownKeys(value);
  work(own.length);
  if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) throw new TypeError('Malformed Rust codec result members');
  const result = {};
  for (const key of keys) {
    work(1);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new TypeError('Malformed Rust codec result property');
    const item = descriptor.value;
    if (typeof item === 'string') work(item.length);
    Object.defineProperty(result, key, {value: item, enumerable: true, writable: true, configurable: true});
  }
  return frozen ? Object.freeze(result) : result;
}

/** Create the opt-in `umf-128/1` codec over the shared Rust core-wire path. */
export function createBit128Engine(invoke, options = {}) {
  if (typeof invoke !== 'function') throw new TypeError('Rust bit128 wire function is required');
  const controls = makeControls(options);
  const bridge = Object.keys(controls).some(key => controls[key] !== undefined) ? controlBridge(controls) : undefined;
  const run = (op, args) => call(invoke, bridge, op, args);
  const work = hostWork(bridge);
  const beginOperation = () => bridge?.beginOperation();
  const textArgument = (text, expected, code) => {
    if (typeof text !== 'string') throw error('BIT128_TYPE', expected);
    if (text.length !== 32 && code === 'BIT128_SYNTAX') throw error(code, 'Expected exactly 32 hexadecimal digits');
    if (text.length !== 36 && code === 'UUID_SYNTAX') throw error(code, 'Expected complete hyphenated UUID text');
    return text;
  };
  const signedArgument = signed => {
    work(1);
    if (typeof signed !== 'boolean') throw error('BIT128_TYPE', 'Signedness must be explicit');
    return signed;
  };
  const engine = {
    parseBits128(text) { beginOperation(); return presentObject(run('parseBits128', {text: textArgument(text, 'Expected hexadecimal text', 'BIT128_SYNTAX')}), ['profile', 'hex'], work); },
    parseUuid(text) { beginOperation(); return presentObject(run('parseUuid', {text: textArgument(text, 'Expected UUID text', 'UUID_SYNTAX')}), ['profile', 'hex', 'canonicalText', 'originalText'], work); },
    bits128FromBytes(bytes) { beginOperation(); return presentObject(run('bits128FromBytes', {bytes: typedArraySnapshot(bytes, work)}), ['profile', 'hex'], work); },
    bits128ToBytes(value) {
      beginOperation();
      const candidate = orderedBitValue(value, work);
      const result = run('bits128ToBytes', {value: candidate.value});
      if (candidate.deferred) throw error('BIT128_VALUE', 'Accessors are not value snapshots');
      hostWork(bridge)(result.length);
      return Uint8Array.from(result);
    },
    uuidFromBits128(value) {
      beginOperation();
      const candidate = orderedBitValue(value, work);
      const result = presentObject(run('uuidFromBits128', {value: candidate.value}), ['profile', 'hex', 'canonicalText', 'originalText'], work);
      if (candidate.deferred) throw error('BIT128_VALUE', 'Accessors are not value snapshots');
      return result;
    },
    uuidToBits128(value) {
      beginOperation();
      const candidate = orderedUuidValue(value, work);
      const result = presentObject(run('uuidToBits128', {value: candidate.value}), ['profile', 'hex'], work);
      if (candidate.deferred) throw error('BIT128_VALUE', 'Unknown UUID snapshot members or accessors');
      return result;
    },
    compareBits128(left, right) {
      beginOperation();
      const leftCandidate = orderedBitValue(left, work, true);
      const rightCandidate = orderedBitValue(right, work);
      let result;
      try { result = run('compareBits128', {left: leftCandidate.value, right: rightCandidate.value}); }
      catch (cause) {
        if (leftCandidate.deferred && cause?.code === 'BIT128_VALUE' && cause?.message === 'Unknown bit profile') {
          throw error('BIT128_VALUE', 'Accessors are not value snapshots');
        }
        throw cause;
      }
      if (rightCandidate.deferred) throw error('BIT128_VALUE', 'Accessors are not value snapshots');
      return result;
    },
    bits128ToWords(value, signed) {
      beginOperation();
      const isSigned = signedArgument(signed);
      const candidate = orderedBitValue(value, work);
      const result = presentObject(run('bits128ToWords', {value: candidate.value, signed: isSigned}), ['high', 'low'], work, false);
      if (candidate.deferred) throw error('BIT128_VALUE', 'Accessors are not value snapshots');
      return result;
    },
    bits128FromWords(words, signed) {
      beginOperation();
      const isSigned = signedArgument(signed);
      const candidate = orderedWords(words, work);
      let result;
      try { result = presentObject(run('bits128FromWords', {words: candidate.value, signed: isSigned}), ['profile', 'hex'], work); }
      catch (cause) {
        const highAccessor = candidate.accessorKeys?.includes('high');
        const lowAccessorAfterValidHigh = candidate.accessorKeys?.includes('low') && candidate.highValueIsString;
        if ((highAccessor || lowAccessorAfterValidHigh) && cause?.code === 'BIT128_TYPE' && cause?.message === 'Words require exact text') {
          throw error('BIT128_TYPE', 'Word accessors are forbidden');
        }
        throw cause;
      }
      return result;
    },
    bits128ToInteger(value, signed) {
      beginOperation();
      const isSigned = signedArgument(signed);
      const candidate = orderedBitValue(value, work);
      const result = presentObject(run('bits128ToInteger', {value: candidate.value, signed: isSigned}), ['integerToken'], work, false);
      if (candidate.deferred) throw error('BIT128_VALUE', 'Accessors are not value snapshots');
      return result;
    },
    bits128FromInteger(literal, signed) {
      beginOperation();
      const isSigned = signedArgument(signed);
      const candidate = orderedIntegerLiteral(literal, work);
      return presentObject(run('bits128FromInteger', {literal: candidate.value, signed: isSigned}), ['profile', 'hex'], work);
    },
  };
  return Object.freeze(engine);
}
