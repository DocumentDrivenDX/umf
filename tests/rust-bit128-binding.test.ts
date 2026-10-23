import {expect, test} from 'bun:test';
import {createBit128Engine} from '../bindings/core/node/index.js';
// @ts-expect-error The internal injectable adapter has no public declaration.
import {createBit128Engine as createBit128EngineWithInvoke} from '../bindings/core/node/src/bit128.js';
import {fromWire} from '../bindings/core/node/src/wire.js';
import oracle from '../fixtures/validation/uuid/bit128-oracle.json';
import frozen from '../scripts/rust-migration/r5/bit128/frozen-predecessor-edge-vectors.json';

function capture(run: () => unknown) {
  try { return {ok: true as const, value: run()}; }
  catch (error: any) { return {ok: false as const, code: error.code, message: error.message}; }
}

test('opt-in Node binding matches all independent umf-128/1 oracle rows', () => {
  const codec = createBit128Engine();
  for (const row of oracle.cases) {
    const bits = codec.parseBits128(row.hex.toUpperCase());
    expect(bits).toEqual({profile: 'umf-128/1', hex: row.hex});
    expect(codec.parseUuid(row.uuid).canonicalText).toBe(row.uuid);
    expect(codec.uuidFromBits128(bits).canonicalText).toBe(row.uuid);
    expect(codec.uuidToBits128(codec.uuidFromBits128(bits))).toEqual(bits);
    expect(codec.bits128ToWords(bits, false)).toEqual(row.unsigned);
    expect(codec.bits128ToWords(bits, true)).toEqual(row.signed);
    expect(codec.bits128FromWords(row.unsigned, false)).toEqual(bits);
    expect(codec.bits128FromWords(row.signed, true)).toEqual(bits);
    expect(codec.bits128ToInteger(bits, false).integerToken).toBe(row.integer);
    expect(codec.bits128ToInteger(bits, true).integerToken).toBe(row.signedInteger);
    expect(codec.bits128FromInteger({integerToken: row.integer}, false)).toEqual(bits);
    expect(codec.bits128FromInteger({integerToken: row.signedInteger}, true)).toEqual(bits);
    const carrier = new Uint8Array(20); carrier.set(codec.bits128ToBytes(bits), 2);
    expect(codec.bits128FromBytes(carrier.subarray(2, 18))).toEqual(bits);
    expect(codec.compareBits128(bits, bits)).toBe(0);
  }
  const original = 'ABCDEFAB-CDEF-ABCD-EFAB-CDEFABCDEFAB';
  expect(codec.parseUuid(original)).toEqual({profile: 'umf-128/1', hex: 'abcdefabcdefabcdefabcdefabcdefab', canonicalText: original.toLowerCase(), originalText: original});
  expect(codec.compareBits128(codec.parseBits128('7' + 'f'.repeat(31)), codec.parseBits128('8' + '0'.repeat(31)))).toBe(-1);
});

test('frozen Bun predecessor outcomes and strict JavaScript carriers are retained', () => {
  const codec = createBit128Engine();
  for (const row of frozen.cases as any[]) {
    if (row.operation === 'integer') {
      if (row.error) expect(capture(() => codec.bits128FromInteger({integerToken: row.token}, row.signed))).toEqual({ok: false, code: row.error.code, message: row.error.message});
      else expect(codec.bits128FromInteger({integerToken: row.token}, row.signed)).toEqual(row.result);
    } else if (row.operation === 'words') {
      expect(capture(() => codec.bits128FromWords({high: row.high, low: row.low}, row.signed))).toEqual({ok: false, code: row.error.code, message: row.error.message});
    } else if (row.operation === 'bits-snapshot') {
      expect(capture(() => codec.bits128ToBytes(row.value as any))).toEqual({ok: false, code: row.error.code, message: row.error.message});
    } else if (row.operation === 'uuid-snapshot') {
      expect(capture(() => codec.uuidToBits128(row.value as any))).toEqual({ok: false, code: row.error.code, message: row.error.message});
    } else if (row.operation === 'uuid-snapshot-shape') {
      const value = row.shape === 'null' ? null : row.shape === 'three'
        ? {profile: 'umf-128/1', hex: '0'.repeat(32), canonicalText: '00000000-0000-0000-0000-000000000000'}
        : {profile: 'umf-128/1', hex: '0'.repeat(32), canonicalText: '00000000-0000-0000-0000-000000000000', originalText: '00000000-0000-0000-0000-000000000000', extra: true};
      expect(capture(() => codec.uuidToBits128(value as any))).toEqual({ok: false, code: row.error.code, message: row.error.message});
    }
  }
  let getterCalls = 0;
  const hostile = {profile: 'umf-128/1', get hex() { getterCalls++; return '0'.repeat(32); }};
  expect(capture(() => codec.bits128ToBytes(hostile as any))).toEqual({ok: false, code: 'BIT128_VALUE', message: 'Accessors are not value snapshots'});
  expect(capture(() => codec.bits128ToBytes({profile: 'umf-128/1', hex: 1n} as any))).toEqual({ok: false, code: 'BIT128_VALUE', message: 'Noncanonical bit snapshot'});
  expect(capture(() => codec.bits128ToBytes({profile: 'other', hex: 1n} as any))).toEqual({ok: false, code: 'BIT128_VALUE', message: 'Unknown bit profile'});
  const profileAccessorExtra = {get profile() { getterCalls++; return 'umf-128/1'; }, hex: '0'.repeat(32), extra: true};
  expect(capture(() => codec.bits128ToBytes(profileAccessorExtra as any))).toEqual({ok: false, code: 'BIT128_VALUE', message: 'Invalid bit value snapshot'});
  const uuidAccessorExtra = {profile: 'umf-128/1', hex: '0'.repeat(32), canonicalText: '00000000-0000-0000-0000-000000000000', get originalText() { getterCalls++; return '00000000-0000-0000-0000-000000000000'; }, extra: true};
  expect(capture(() => codec.uuidToBits128(uuidAccessorExtra as any))).toEqual({ok: false, code: 'BIT128_VALUE', message: 'Invalid UUID snapshot'});
  for (const token of [undefined, 1n, Symbol('x'), () => '1']) {
    expect(capture(() => codec.bits128FromInteger({integerToken: token} as any, false))).toEqual({ok: false, code: 'BIT128_TYPE', message: 'Expected integer token text'});
  }
  const integerAccessorExtra = {get integerToken() { getterCalls++; return '1'; }, extra: true};
  expect(capture(() => codec.bits128FromInteger(integerAccessorExtra as any, false))).toEqual({ok: false, code: 'BIT128_TYPE', message: 'Expected one integerToken'});
  expect(getterCalls).toBe(0);
  const symbol = Symbol('extra');
  const extended = Object.assign(Object.create(null), {profile: 'umf-128/1', hex: '0'.repeat(32), [symbol]: 1});
  expect(() => codec.bits128ToBytes(extended)).toThrow();
  const withAccessor = Object.assign(Object.create(null), {profile: 'umf-128/1', hex: '0'.repeat(32)});
  Object.defineProperty(withAccessor, 'extra', {enumerable: true, get() { getterCalls++; return 1; }});
  expect(() => codec.bits128ToBytes(withAccessor)).toThrow();
  expect(getterCalls).toBe(0);
  const bytesSubclass = new (class extends Uint8Array {}) (codec.bits128ToBytes(codec.parseBits128('0'.repeat(32))));
  Object.defineProperty(bytesSubclass, symbol, {get() { getterCalls++; }});
  expect(codec.bits128FromBytes(bytesSubclass).hex).toBe('0'.repeat(32));
  expect(getterCalls).toBe(0);
  if (typeof Buffer !== 'undefined') expect(codec.bits128FromBytes(Buffer.alloc(16)).hex).toBe('0'.repeat(32));
  expect(() => codec.bits128FromBytes(new Uint8Array(15))).toThrow('Expected exactly 16 bytes');
  expect(() => codec.bits128FromBytes(new Uint8ClampedArray(16) as any)).toThrow('Expected a Uint8Array');
  expect(capture(() => codec.parseBits128(1 as any))).toEqual({ok: false, code: 'BIT128_TYPE', message: 'Expected hexadecimal text'});
  expect(capture(() => codec.bits128ToBytes(new Date() as any))).toEqual({ok: false, code: 'BIT128_VALUE', message: 'Invalid bit value snapshot'});
  const wordAccessor = {get high() { getterCalls++; return '0'; }, low: '0'};
  expect(capture(() => codec.bits128FromWords(wordAccessor as any, false))).toEqual({ok: false, code: 'BIT128_TYPE', message: 'Word accessors are forbidden'});
  const lowAccessor = {high: 'x', get low() { getterCalls++; return '0'; }};
  expect(capture(() => codec.bits128FromWords(lowAccessor as any, false))).toEqual({ok: false, code: 'BIT128_SYNTAX', message: 'Expected canonical decimal word'});
  expect(getterCalls).toBe(0);
  expect(capture(() => codec.bits128ToWords(codec.parseBits128('0'.repeat(32)), undefined as any))).toEqual({ok: false, code: 'BIT128_TYPE', message: 'Signedness must be explicit'});
  const badLeft = {profile: 'unknown', hex: '0'.repeat(32)};
  const rightAccessor = {profile: 'umf-128/1', get hex() { getterCalls++; return '0'.repeat(32); }};
  expect(capture(() => codec.compareBits128(badLeft as any, rightAccessor as any)).message).toBe('Unknown bit profile');
  const symbolRight = Object.assign(Object.create(null), {profile: 'umf-128/1', hex: '0'.repeat(32), [symbol]: 1});
  expect(capture(() => codec.compareBits128(badLeft as any, symbolRight)).message).toBe('Unknown bit profile');
  const bigintRight = {profile: 'umf-128/1', hex: 1n};
  expect(capture(() => codec.compareBits128(badLeft as any, bigintRight as any)).message).toBe('Unknown bit profile');
  const valid = codec.parseBits128('0'.repeat(32));
  const accessorPlusExtra = {profile: 'umf-128/1', get hex() { getterCalls++; return '0'.repeat(32); }, extra: true};
  expect(capture(() => codec.compareBits128(valid, accessorPlusExtra as any))).toEqual({ok: false, code: 'BIT128_VALUE', message: 'Invalid bit value snapshot'});
  expect(getterCalls).toBe(0);
  expect(capture(() => codec.compareBits128(valid, bigintRight as any))).toEqual({ok: false, code: 'BIT128_VALUE', message: 'Noncanonical bit snapshot'});
  const lowFunction = {high: 'x', low: () => '0'};
  expect(capture(() => codec.bits128FromWords(lowFunction as any, false))).toEqual({ok: false, code: 'BIT128_SYNTAX', message: 'Expected canonical decimal word'});
  const lowAccessorPlusExtra = {high: '0', get low() { getterCalls++; return '0'; }, extra: true};
  expect(capture(() => codec.bits128FromWords(lowAccessorPlusExtra as any, false))).toEqual({ok: false, code: 'BIT128_TYPE', message: 'Expected exactly high and low words'});
  expect(getterCalls).toBe(0);
  const mutableWords = codec.bits128ToWords(codec.parseBits128('0'.repeat(32)), false);
  mutableWords.high = '1';
  expect(mutableWords.high).toBe('1');
  const mutableInteger = codec.bits128ToInteger(codec.parseBits128('0'.repeat(32)), false);
  mutableInteger.integerToken = '1';
  expect(mutableInteger.integerToken).toBe('1');
});

test('one host budget covers admission, Rust execution, and result presentation', () => {
  expect(() => createBit128Engine({profile: 'unknown' as any})).toThrow('Unknown resource profile');
  expect(capture(() => createBit128Engine({profile: 'hard-isolated'})).code).toBe('RESOURCE_PROFILE_UNAVAILABLE');
  const codec = createBit128Engine({controls: {maxWork: 0}});
  expect(capture(() => codec.parseBits128('0'.repeat(32))).code).toBe('RESOURCE_LIMIT');
  let charged = 0;
  const measured = createBit128Engine({controls: {meter: amount => { charged += amount; }}});
  measured.parseBits128('0'.repeat(32));
  expect(charged).toBe(1507);
  const perOperation = createBit128Engine({controls: {maxWork: charged}});
  expect(perOperation.parseBits128('0'.repeat(32)).hex).toBe('0'.repeat(32));
  expect(perOperation.parseBits128('0'.repeat(32)).hex).toBe('0'.repeat(32));
  expect(capture(() => createBit128Engine().parseBits128('a'.repeat(100_000))).code).toBe('BIT128_SYNTAX');
  expect(capture(() => createBit128Engine().parseUuid('a'.repeat(100_000))).code).toBe('UUID_SYNTAX');
  let ownKeysCalls = 0;
  const noAdmissionBudget = createBit128Engine({controls: {maxWork: 0}});
  const blockedProxy = new Proxy({profile: 'umf-128/1', hex: '0'.repeat(32)}, {ownKeys(target) { ownKeysCalls++; return Reflect.ownKeys(target); }});
  expect(capture(() => noAdmissionBudget.compareBits128({profile: 'umf-128/1', hex: '0'.repeat(32)}, blockedProxy as any)).code).toBe('RESOURCE_LIMIT');
  expect(capture(() => noAdmissionBudget.bits128FromWords(blockedProxy as any, false)).code).toBe('RESOURCE_LIMIT');
  expect(capture(() => noAdmissionBudget.bits128FromInteger(blockedProxy as any, false)).code).toBe('RESOURCE_LIMIT');
  expect(ownKeysCalls).toBe(0);
  let chargedBeforeEnumeration = 0;
  const largeKeys = Object.fromEntries(Array.from({length: 500}, (_, index) => [`extra${index}`, index]));
  const largeProxy = new Proxy(largeKeys, {ownKeys(target) { expect(chargedBeforeEnumeration).toBeGreaterThan(0); return Reflect.ownKeys(target); }});
  const metered = createBit128Engine({controls: {maxWork: 1, meter: amount => { chargedBeforeEnumeration += amount; }}});
  expect(capture(() => metered.compareBits128({profile: 'umf-128/1', hex: '0'.repeat(32)}, largeProxy as any)).code).toBe('RESOURCE_LIMIT');
  expect(chargedBeforeEnumeration).toBe(1);
  let ticks = 0;
  const cancelled = createBit128Engine({controls: {isCancelled: () => ++ticks > 1}});
  expect(capture(() => cancelled.parseBits128('0'.repeat(32))).code).toBe('CANCELLED');
  const deadline = createBit128Engine({controls: {now: () => 11, deadlineMs: 10}});
  expect(capture(() => deadline.parseBits128('0'.repeat(32))).code).toBe('DEADLINE');
});

test('fixed-width bit and UUID snapshots stay bounded before tagged wire construction', () => {
  const requests: any[] = [];
  const recorder = createBit128EngineWithInvoke((wire: string) => {
    requests.push(fromWire(JSON.parse(wire)));
    throw new Error('recorded request');
  });
  const huge = 'x'.repeat(100_000);
  const zeroHex = '0'.repeat(32);
  const zeroUuid = '00000000-0000-0000-0000-000000000000';
  const record = (operation: () => unknown) => {
    expect(capture(operation).message).toBe('recorded request');
    expect(requests.at(-1)).toBeDefined();
    expect(JSON.stringify(requests.at(-1)).length).toBeLessThan(2_000);
  };

  record(() => recorder.bits128ToBytes({profile: 'umf-128/1', hex: huge} as any));
  expect(requests.at(-1).args.value.hex).toBeNull();
  record(() => recorder.bits128ToBytes({profile: huge, hex: zeroHex} as any));
  expect(requests.at(-1).args.value.profile).toBeNull();
  record(() => recorder.uuidToBits128({profile: 'umf-128/1', hex: zeroHex, canonicalText: zeroUuid, originalText: huge} as any));
  expect(requests.at(-1).args.value.originalText).toBeNull();
  record(() => recorder.uuidToBits128({profile: huge, hex: zeroHex, canonicalText: zeroUuid, originalText: zeroUuid} as any));
  expect(requests.at(-1).args.value.profile).toBeNull();
  record(() => recorder.uuidToBits128({profile: 'umf-128/1', hex: huge, canonicalText: zeroUuid, originalText: zeroUuid} as any));
  expect(requests.at(-1).args.value.hex).toBeNull();
  record(() => recorder.uuidToBits128({profile: 'umf-128/1', hex: zeroHex, canonicalText: huge, originalText: zeroUuid} as any));
  expect(requests.at(-1).args.value.canonicalText).toBeNull();

  const codec = createBit128Engine();
  expect(capture(() => codec.bits128ToBytes({profile: 'umf-128/1', hex: huge} as any)).message).toBe('Noncanonical bit snapshot');
  expect(capture(() => codec.bits128ToBytes({profile: 'other', hex: huge} as any)).message).toBe('Unknown bit profile');
  expect(capture(() => codec.uuidToBits128({profile: 'umf-128/1', hex: zeroHex, canonicalText: zeroUuid, originalText: huge} as any)).message).toBe('Invalid original UUID text in snapshot');
  expect(capture(() => codec.uuidToBits128({profile: 'umf-128/1', hex: huge, canonicalText: zeroUuid, originalText: zeroUuid} as any)).message).toBe('Inconsistent UUID snapshot');
});
