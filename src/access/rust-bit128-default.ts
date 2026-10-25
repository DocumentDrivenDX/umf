// SPDX-License-Identifier: MIT OR Apache-2.0
import {BIT128_PROFILE} from '../model/bit128';
import type {
 Bit128Value, parseBits128, bits128FromBytes, bits128ToBytes, compareBits128,
 bits128ToWords, bits128FromWords, bits128ToInteger, bits128FromInteger,
} from '../model/bit128';
import type {parseUuid, uuidFromBits128, uuidToBits128, UuidValue} from '../model/uuid';
import {UmfError} from '../model/errors';

export {BIT128_PROFILE};

/** Structural surface implemented by both Node createBit128Engine and WASM initializeBit128Wasm. */
export interface Bit128RustEngine {
 parseBits128: typeof parseBits128;
 parseUuid: typeof parseUuid;
 bits128FromBytes: typeof bits128FromBytes;
 bits128ToBytes: typeof bits128ToBytes;
 uuidFromBits128: typeof uuidFromBits128;
 uuidToBits128: typeof uuidToBits128;
 compareBits128: typeof compareBits128;
 bits128ToWords: typeof bits128ToWords;
 bits128FromWords: typeof bits128FromWords;
 bits128ToInteger: typeof bits128ToInteger;
 bits128FromInteger: typeof bits128FromInteger;
}

function rustCall<T>(operation: () => T): T {
 try { return operation(); }
 catch (error) {
  const candidate = error as {name?: unknown; code?: unknown; message?: unknown; path?: unknown};
  if (candidate?.name === 'UmfCoreError' && typeof candidate.code === 'string' &&
   (candidate.code.startsWith('BIT128_') || candidate.code.startsWith('UUID_'))) {
   throw new UmfError(candidate.code, String(candidate.message ?? ''), typeof candidate.path === 'string' ? candidate.path : '');
  }
  throw error;
 }
}

/**
 * Bind the Rust codec to the public TypeScript value signatures. Host admission,
 * ordering, carrier copying, and codec semantics remain in the existing engine
 * and shared Rust implementation; this boundary only presents UMF errors.
 */
export function bindBit128Rust(engine: Bit128RustEngine) {
 const call = <T>(operation: () => T) => rustCall(operation);
 return Object.freeze({
  parseBits128(hex: string): Bit128Value { return call(() => engine.parseBits128(hex)); },
  parseUuid(text: string): UuidValue { return call(() => engine.parseUuid(text)); },
  bits128FromBytes(bytes: Uint8Array): Bit128Value { return call(() => engine.bits128FromBytes(bytes)); },
  bits128ToBytes(value: Bit128Value): Uint8Array { return call(() => engine.bits128ToBytes(value)); },
  uuidFromBits128(value: Bit128Value): UuidValue { return call(() => engine.uuidFromBits128(value)); },
  uuidToBits128(value: UuidValue): Bit128Value { return call(() => engine.uuidToBits128(value)); },
  compareBits128(left: Bit128Value, right: Bit128Value): -1 | 0 | 1 { return call(() => engine.compareBits128(left, right)); },
  bits128ToWords(value: Bit128Value, signed: boolean): {high: string; low: string} { return call(() => engine.bits128ToWords(value, signed)); },
  bits128FromWords(words: {high: string; low: string}, signed: boolean): Bit128Value { return call(() => engine.bits128FromWords(words, signed)); },
  bits128ToInteger(value: Bit128Value, signed: boolean): {integerToken: string} { return call(() => engine.bits128ToInteger(value, signed)); },
  bits128FromInteger(literal: {integerToken: string}, signed: boolean): Bit128Value { return call(() => engine.bits128FromInteger(literal, signed)); },
 });
}
