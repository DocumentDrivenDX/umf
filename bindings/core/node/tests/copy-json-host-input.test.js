// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe, expect, test} from 'bun:test';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {copyJson as reference} from '../../../../src/model/json.ts';

const bindingPath = process.env.UMF_COPY_JSON_NODE_BINDING
  ? pathToFileURL(resolve(process.env.UMF_COPY_JSON_NODE_BINDING)).href
  : '../copy-json-host-input.js';
const {createCopyJsonHostInputEngine} = await import(bindingPath);
const engine = createCopyJsonHostInputEngine();

function failure(operation) {
  try {
    operation();
    return null;
  } catch (error) {
    return error;
  }
}

function comparable(error) {
  return error && {name: error.name, code: error.code, path: error.path, message: error.message};
}

function cases() {
  return [
    ['accessor', () => {
      const value = {};
      Object.defineProperty(value, 'secret', {enumerable: true, get() { throw new Error('getter ran'); }});
      return value;
    }],
    ['hidden', () => {
      const value = {};
      Object.defineProperty(value, 'hidden', {value: 1});
      return value;
    }],
    ['custom prototype', () => Object.create({hidden: true})],
    ['symbol', () => ({[Symbol('not-json')]: true})],
    ['cycle', () => {
      const value = {};
      value.self = value;
      return value;
    }],
    ['depth limit', () => {
      let value = 0;
      for (let i = 0; i < 129; i++) value = [value];
      return value;
    }],
    ['unsafe number', () => ({nested: 9007199254740992})],
  ];
}

describe('Rust-owned host copyJson opt-in', () => {
  for (const [name, make] of cases()) {
    test(`matches TypeScript ${name} refusal`, () => {
      const value = make();
      expect(comparable(failure(() => engine.copyJson(value))))
        .toEqual(comparable(failure(() => reference(value))));
    });
  }

  test('matches proxy reflection order without invoking getters', () => {
    const traces = [];
    const make = () => new Proxy({a: 1}, {
      getPrototypeOf(target) { traces.push('getPrototypeOf'); return Reflect.getPrototypeOf(target); },
      ownKeys(target) { traces.push('ownKeys'); return Reflect.ownKeys(target); },
      getOwnPropertyDescriptor(target, key) {
        traces.push(`descriptor:${String(key)}`);
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
      get(target, key, receiver) { traces.push(`get:${String(key)}`); return Reflect.get(target, key, receiver); },
    });
    const value = make();
    expect(engine.copyJson(value)).toEqual(reference(value));
    expect(traces).toEqual([
      'getPrototypeOf', 'ownKeys', 'ownKeys', 'descriptor:a',
      'getPrototypeOf', 'ownKeys', 'ownKeys', 'descriptor:a',
    ]);
    expect(traces.some((item) => item.startsWith('get:'))).toBe(false);
  });

  test('rethrows a Proxy trap object by identity', () => {
    const sentinel = {reason: 'host trap'};
    for (const value of [
      new Proxy({}, {getPrototypeOf() { throw sentinel; }}),
      new Proxy({a: 1}, {getOwnPropertyDescriptor() { throw sentinel; }}),
    ]) {
      expect(failure(() => reference(value))).toBe(sentinel);
      expect(failure(() => engine.copyJson(value))).toBe(sentinel);
    }
  });

  test('retains dangerous and lone-surrogate keys as own JSON data', () => {
    const value = Object.create(null);
    Object.defineProperty(value, '__proto__', {value: {keep: true}, enumerable: true});
    Object.defineProperty(value, 'constructor', {value: ['future'], enumerable: true});
    Object.defineProperty(value, '\ud800', {value: 'surrogate', enumerable: true});
    const copied = engine.copyJson(value);
    expect(copied).toEqual(reference(value));
    expect(copied).not.toBe(value);
    expect(copied.__proto__).not.toBe(value.__proto__);
    expect(Object.getPrototypeOf(copied)).toBe(null);
    expect(Object.hasOwn(copied, '__proto__')).toBe(true);
    expect(Object.hasOwn(copied, 'constructor')).toBe(true);
    expect(Object.hasOwn(copied, '\ud800')).toBe(true);
  });

  test('matches UTF-16 string handling without a text-size admission cap', () => {
    const long = 'x'.repeat(4_000_001);
    expect(engine.copyJson(long)).toBe(reference(long));
  }, 30_000);

  test('admits exactly 100,000 JSON values through the native export', () => {
    const boundary = Array(99_999).fill(null);
    expect(engine.copyJson(boundary)).toHaveLength(99_999);
    const overflow = Array(100_000).fill(null);
    expect(comparable(failure(() => engine.copyJson(overflow))))
      .toEqual(comparable(failure(() => reference(overflow))));
  }, 120_000);
});
