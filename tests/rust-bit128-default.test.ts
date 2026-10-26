// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import * as predecessorBit from '../src/model/bit128';
import * as predecessorUuid from '../src/model/uuid';
import {bindBit128Rust} from '../src/access/rust-bit128-default';
import {createBit128Engine,isBit128EngineError} from '../bindings/core/node/index.js';
import packet from '../scripts/rust-migration/r5/bit128-default-route/predecessor.json';
import oracle from '../fixtures/validation/uuid/bit128-oracle.json';

const rust = bindBit128Rust(createBit128Engine(),isBit128EngineError);
const hex = '8000000000000000ffffffffffffffff';
const uuidText = '80000000-0000-0000-ffff-ffffffffffff';
const shape = (value: object) => ({
 prototype: Object.getPrototypeOf(value) === Object.prototype ? 'Object.prototype' : Object.getPrototypeOf(value) === null ? 'null' : Object.getPrototypeOf(value)?.constructor?.name ?? 'other',
 frozen: Object.isFrozen(value),
 keys: Object.keys(value),
 descriptors: Object.fromEntries(Object.keys(value).map(k => [k, Object.getOwnPropertyDescriptor(value, k)?.writable === false ? 'readonly' : 'mutable']))
});
function normalize(value: unknown): unknown {
 if (value instanceof Uint8Array) return {type: value.constructor.name, bytes: Array.from(value), shape: shape(value)};
 if (Array.isArray(value)) return value.map(normalize);
 if (value && typeof value === 'object') return {...Object.fromEntries(Object.keys(value).map(k => [k, normalize((value as Record<string, unknown>)[k])])), $shape: shape(value)};
 return value;
}
function outcome(run: () => unknown) {
 try { return {ok: true, value: normalize(run())}; }
 catch (cause) {
  const error = cause as {name?: string;code?: string;message?: string;path?: unknown};
  return {ok: false, error: {name: error.name, code: error.code, message: error.message, ...(Object.hasOwn(error, 'path') ? {path: error.path} : {})}};
 }
}

test('the default adapter matches the frozen predecessor for all eleven public functions', () => {
 const bitValue = predecessorBit.parseBits128(hex);
 const uuidValue = predecessorUuid.parseUuid(uuidText);
 const wordsUnsigned = predecessorBit.bits128ToWords(bitValue, false);
 const wordsSigned = predecessorBit.bits128ToWords(bitValue, true);
 const integerUnsigned = predecessorBit.bits128ToInteger(bitValue, false);
 const integerSigned = predecessorBit.bits128ToInteger(bitValue, true);
 const views = Uint8Array.from({length: 20}, (_, i) => i);
 const viewValue = predecessorBit.bits128FromBytes(new Uint8Array(views.buffer, 2, 16));
 const values: Record<string, unknown> = {
  parseBits128: outcome(() => rust.parseBits128(hex.toUpperCase())),
  parseUuid: outcome(() => rust.parseUuid(uuidText.toUpperCase())),
  bits128FromBytes: outcome(() => rust.bits128FromBytes(new Uint8Array(views.buffer, 2, 16))),
  bits128ToBytes: outcome(() => rust.bits128ToBytes(bitValue)),
  uuidFromBits128: outcome(() => rust.uuidFromBits128(bitValue)),
  uuidToBits128: outcome(() => rust.uuidToBits128(uuidValue)),
  compareBits128: outcome(() => [rust.compareBits128(predecessorBit.parseBits128('0'.repeat(32)), bitValue), rust.compareBits128(bitValue, bitValue), rust.compareBits128(bitValue, predecessorBit.parseBits128('f'.repeat(32)))]),
  bits128ToWords: outcome(() => {
   const unsigned = rust.bits128ToWords(bitValue, false), signed = rust.bits128ToWords(bitValue, true);
   return {unsigned, signed, unsignedShape: shape(unsigned), signedShape: shape(signed)};
  }),
  bits128FromWords: outcome(() => ({unsigned: rust.bits128FromWords(wordsUnsigned, false), signed: rust.bits128FromWords(wordsSigned, true)})),
  bits128ToInteger: outcome(() => {
   const unsigned = rust.bits128ToInteger(bitValue, false), signed = rust.bits128ToInteger(bitValue, true);
   return {unsigned, signed, unsignedShape: shape(unsigned), signedShape: shape(signed)};
  }),
  bits128FromInteger: outcome(() => ({zero: rust.bits128FromInteger({integerToken: '0'}, false), maxUnsigned: rust.bits128FromInteger({integerToken: '340282366920938463463374607431768211455'}, false), minSigned: rust.bits128FromInteger({integerToken: '-170141183460469231731687303715884105728'}, true)})),
 };
 for (const name of packet.publicFunctions as string[]) expect(values[name]).toEqual((packet.cases as Record<string, unknown>)[name]);
 expect(predecessorBit.BIT128_PROFILE).toBe('umf-128/1');
 expect(viewValue.hex).toBe('02030405060708090a0b0c0d0e0f1011');
});

test('Rust boundary preserves input-error ordering, error paths, and host byte carriers', () => {
 const getHex = {profile: 'umf-128/1', get hex() { throw new Error('getter invoked'); }};
 expect(outcome(() => rust.bits128ToBytes(getHex as never))).toEqual(outcome(() => predecessorBit.bits128ToBytes(getHex as never)));
 const profileFirst = {profile: 'other', get hex() { throw new Error('getter invoked'); }};
 expect(outcome(() => rust.bits128ToBytes(profileFirst as never))).toEqual(outcome(() => predecessorBit.bits128ToBytes(profileFirst as never)));
 const badWord = {high: '01', low: '0'};
 expect(outcome(() => rust.bits128FromWords(badWord, false))).toEqual(outcome(() => predecessorBit.bits128FromWords(badWord, false)));
 const badUuid = '00000000-0000-0000-0000-00000000000g';
 expect(outcome(() => rust.parseUuid(badUuid))).toEqual(outcome(() => predecessorUuid.parseUuid(badUuid)));
 const descriptorCases = {
  bitProfileBeforeHex: outcome(() => rust.bits128ToBytes({profile: 'other', get hex() { throw new Error('getter ran'); }} as never)),
  bitAccessorWithExtra: outcome(() => rust.bits128ToBytes({profile: 'umf-128/1', get hex() { throw new Error('getter ran'); }, extra: true} as never)),
  uuidOriginalBeforeConsistency: outcome(() => rust.uuidToBits128({profile: 'umf-128/1', hex: '0'.repeat(32), canonicalText: '00000000-0000-0000-0000-000000000000', originalText: 'x'} as never)),
  symbolMember: outcome(() => rust.bits128ToBytes(Object.assign({profile: 'umf-128/1', hex: '0'.repeat(32)}, {[Symbol('ignored')]: 1}) as never)),
  integerShapeBeforeType: outcome(() => rust.bits128FromInteger({integerToken: 1n, extra: true} as never, false)),
  wordsShapeBeforeAccessor: outcome(() => rust.bits128FromWords({get high() { throw new Error('getter ran'); }, low: '0', extra: true} as never, false)),
 };
 expect(descriptorCases).toEqual((packet.cases as Record<string, any>).descriptorAndErrorOrder);
 const boundaryCases = {
  utf16SurrogateBits: outcome(() => rust.parseBits128('0'.repeat(31) + '\ud800')),
  uuidUpperOriginal: rust.parseUuid(uuidText).originalText,
  negativeZeroInteger: outcome(() => rust.bits128FromInteger({integerToken: '-0'}, true)),
  noncanonicalInteger: outcome(() => rust.bits128FromInteger({integerToken: '01'}, false)),
  unsignedOverflow: outcome(() => rust.bits128FromInteger({integerToken: '340282366920938463463374607431768211456'}, false)),
  signedMinimumAndMaximum: [rust.bits128FromInteger({integerToken: '-170141183460469231731687303715884105728'}, true).hex, rust.bits128FromInteger({integerToken: '170141183460469231731687303715884105727'}, true).hex],
  signedWordMinimumAndMaximum: [rust.bits128FromWords({high: '-9223372036854775808', low: '9223372036854775807'}, true).hex, rust.bits128FromWords({high: '9223372036854775807', low: '-9223372036854775808'}, true).hex],
  invalidSignedness: outcome(() => rust.bits128ToWords(rust.parseBits128(hex), 0 as never)),
 };
 expect(boundaryCases).toEqual((packet.cases as Record<string, any>).syntaxAndBoundaries);
 const padded = new Uint8Array(20);
 padded.set(rust.bits128ToBytes(rust.parseBits128(hex)), 2);
 expect(rust.bits128FromBytes(padded.subarray(2, 18))).toEqual(rust.parseBits128(hex));
 const source = new Uint8Array(16); source.fill(42);
 const snapshot = rust.bits128FromBytes(source);
 source.fill(0);
 expect(rust.bits128ToBytes(snapshot)[0]).toBe(42);
 class ByteSubclass extends Uint8Array {}
 expect(rust.bits128FromBytes(new ByteSubclass(new Uint8Array(16))).hex).toBe('0'.repeat(32));
 expect(() => rust.bits128FromBytes(new Uint8Array(15))).toThrow('Expected exactly 16 bytes');
 expect(() => rust.bits128FromBytes(new Uint8ClampedArray(16) as never)).toThrow('Expected a Uint8Array');
 if (typeof Buffer !== 'undefined') expect(rust.bits128FromBytes(Buffer.alloc(16)).hex).toBe('0'.repeat(32));
});

test('the default adapter retains independent 128-bit oracle values', () => {
 for (const row of oracle.cases) {
  const value = rust.parseBits128(row.hex.toUpperCase());
  expect(value.hex).toBe(row.hex);
  expect(rust.bits128ToInteger(value, false).integerToken).toBe(row.integer);
  expect(rust.bits128ToInteger(value, true).integerToken).toBe(row.signedInteger);
  expect(rust.bits128FromInteger({integerToken: row.integer}, false).hex).toBe(row.hex);
  expect(rust.bits128FromInteger({integerToken: row.signedInteger}, true).hex).toBe(row.hex);
 }
});
