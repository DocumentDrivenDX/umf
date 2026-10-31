import {describe, expect, test} from 'bun:test';
import {assertExactJsonNumber} from '../../src/model/internal/json-number';

describe('assertExactJsonNumber untyped host-value semantics', () => {
  test('retains Number and later string-coercion behavior for primitive inputs', () => {
    expect(() => assertExactJsonNumber(undefined as unknown as string)).toThrow('Noninteroperable JSON number');
    expect(() => assertExactJsonNumber(null as unknown as string)).toThrow(TypeError);
    expect(() => assertExactJsonNumber(true as unknown as string)).toThrow('Unsupported numeric spelling');
    expect(() => assertExactJsonNumber(1 as unknown as string)).not.toThrow();
    expect(() => assertExactJsonNumber(0 as unknown as string)).toThrow(TypeError);
  });

  test('retains number-hint then string-hint conversion and fallback coercion order', () => {
    const primitiveHints: string[] = [];
    const primitive = {[Symbol.toPrimitive](hint: string) { primitiveHints.push(hint); return '1'; }};
    assertExactJsonNumber(primitive as unknown as string);
    expect(primitiveHints).toEqual(['number', 'string']);

    const fallback: string[] = [];
    const value = {
      valueOf() { fallback.push('valueOf'); return {}; },
      toString() { fallback.push('toString'); return '1'; },
    };
    assertExactJsonNumber(value as unknown as string);
    expect(fallback).toEqual(['valueOf', 'toString', 'toString']);
  });

  test('rethrows the same host coercion exception', () => {
    const sentinel = new Error('host coercion sentinel');
    const value = {[Symbol.toPrimitive]() { throw sentinel; }};
    try {
      assertExactJsonNumber(value as unknown as string);
      throw new Error('expected coercion to throw');
    } catch (error) {
      expect(error).toBe(sentinel);
    }
  });
});
