import {describe, expect, test} from 'bun:test';
import {readJsonValueOrdinary} from '../../src/access/read-json-value-ordinary';
import {UmfError} from '../../src/model/errors';

describe('opt-in ordinary Rust readJsonValue facade', () => {
  test('keeps the live preflight before the binding and rebuilds null-prototype objects safely', () => {
    const calls: unknown[][] = [];
    const result = readJsonValueOrdinary({
      readJsonValueOrdinaryText(source, formatIsJson) {
        calls.push([source, formatIsJson]);
        return '{"ok":true,"value":{"__proto__":{"kept":1},"items":[{"x":2}]}}';
      },
    }, '{"x":1}', 'json') as Record<string, any>;

    expect(calls).toEqual([['{"x":1}', true]]);
    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(result.__proto__)).toBeNull();
    expect(Array.isArray(result.items)).toBe(true);
    expect(Object.getPrototypeOf(result.items[0])).toBeNull();
  });

  test('maps native error frames to the public UmfError class with path intact', () => {
    expect(() => readJsonValueOrdinary({
      readJsonValueOrdinaryText() {
        return '{"ok":false,"code":"DUPLICATE_KEY","path":"/a","message":"Duplicate mapping key"}';
      },
    }, 'a: 1\na: 2')).toThrow(expect.objectContaining({
      constructor: UmfError,
      code: 'DUPLICATE_KEY',
      path: '/a',
      message: 'Duplicate mapping key',
    }));
  });

  test('maps explicit JSON preflight failures before calling Rust', () => {
    let called = false;
    try {
      readJsonValueOrdinary({
        readJsonValueOrdinaryText() { called = true; return ''; },
      }, '{', 'json');
      throw new Error('expected syntax rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(UmfError);
      expect((error as UmfError).code).toBe('SYNTAX');
      expect((error as Error).message).toBe('Invalid JSON syntax');
      expect(called).toBe(false);
    }
  });

  test('keeps lone surrogate units from the Rust frame in values and keys', () => {
    const value = readJsonValueOrdinary({
      readJsonValueOrdinaryText() {
        return '{"ok":true,"value":{"\\ud800":"\\udfff"}}';
      },
    }, 'x') as Record<string, string>;
    const key = Object.keys(value)[0]!;
    expect(key.charCodeAt(0)).toBe(0xd800);
    expect(value[key]!.charCodeAt(0)).toBe(0xdfff);
  });

  test('keeps an isolated surrogate in a Rust error path', () => {
    let caught: unknown;
    try {
      readJsonValueOrdinary({
        readJsonValueOrdinaryText() {
          return '{"ok":false,"code":"KEY","path":"/\\ud800","message":"bad key"}';
        },
      }, 'x');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UmfError);
    expect((caught as UmfError).path.charCodeAt(1)).toBe(0xd800);
  });

  test('admits exactly four million source units and rejects the next unit before Rust', () => {
    let calls = 0;
    const binding = {
      readJsonValueOrdinaryText() {
        calls++;
        return '{"ok":true,"value":null}';
      },
    };
    expect(readJsonValueOrdinary(binding, ' '.repeat(4_000_000))).toBeNull();
    expect(calls).toBe(1);
    expect(() => readJsonValueOrdinary(binding, ' '.repeat(4_000_001))).toThrow(
      expect.objectContaining({constructor: UmfError, code: 'LIMIT', path: ''}),
    );
    expect(calls).toBe(1);
  });

  test('does a live JSON.parse lookup for semantic preflight', () => {
    const original = JSON.parse;
    const seen: string[] = [];
    JSON.parse = function (text: string, reviver?: (this: any, key: string, value: any) => any): any {
      seen.push(text);
      return Reflect.apply(original, JSON, [text, reviver]);
    } as typeof JSON.parse;
    try {
      const result = readJsonValueOrdinary({
        readJsonValueOrdinaryText() { return '{"ok":true,"value":7}'; },
      }, '7', 'json');
      expect(result).toBe(7);
      expect(seen).toEqual(['7']);
    } finally {
      JSON.parse = original;
    }
  });

  test('keeps private frame reconstruction stable when host reflection globals change', () => {
    const originalKeys = Object.keys;
    const originalIsArray = Array.isArray;
    Object.keys = (() => { throw new Error('frame parser used live Object.keys'); }) as typeof Object.keys;
    Array.isArray = (() => { throw new Error('frame parser used live Array.isArray'); }) as unknown as typeof Array.isArray;
    try {
      const result = readJsonValueOrdinary({
        readJsonValueOrdinaryText() { return '{"ok":true,"value":{"x":[1]}}'; },
      }, 'x') as Record<string, number[]>;
      expect(result.x![0]).toBe(1);
      expect(Object.getPrototypeOf(result)).toBeNull();
    } finally {
      Object.keys = originalKeys;
      Array.isArray = originalIsArray;
    }
  });
});
