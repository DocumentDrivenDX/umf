// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {copyJson as reference} from '../../../../src/model/json.ts';
import {createCopyJsonHostInputEngine} from '../copy-json-host-input.js';

const packagePath = process.argv[2];
if (!packagePath) throw new Error('Usage: bun bindings/core/wasm/tests/copy-json-host-input.mjs <wasm-bindgen-pkg-dir>');
const wasm = await import(pathToFileURL(resolve(packagePath, 'umf_core_wasm.js')).href);
await wasm.default(new Uint8Array(await readFile(resolve(packagePath, 'umf_core_wasm_bg.wasm'))));
const engine = createCopyJsonHostInputEngine(wasm);

function failure(operation) {
  try { operation(); return null; }
  catch (error) { return error; }
}
function comparable(error) {
  return error && {name: error.name, code: error.code, path: error.path, message: error.message};
}
const cases = [
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
for (const [name, make] of cases) {
  const value = make();
  assert.deepEqual(comparable(failure(() => engine.copyJson(value))), comparable(failure(() => reference(value))), name);
}

const trace = [];
const proxy = new Proxy({a: 1}, {
  getPrototypeOf(target) { trace.push('getPrototypeOf'); return Reflect.getPrototypeOf(target); },
  ownKeys(target) { trace.push('ownKeys'); return Reflect.ownKeys(target); },
  getOwnPropertyDescriptor(target, key) {
    trace.push(`descriptor:${String(key)}`);
    return Reflect.getOwnPropertyDescriptor(target, key);
  },
  get(target, key, receiver) { trace.push(`get:${String(key)}`); return Reflect.get(target, key, receiver); },
});
assert.deepEqual(engine.copyJson(proxy), reference(proxy));
assert.deepEqual(trace, ['getPrototypeOf', 'ownKeys', 'ownKeys', 'descriptor:a', 'getPrototypeOf', 'ownKeys', 'ownKeys', 'descriptor:a']);
assert.equal(trace.some((item) => item.startsWith('get:')), false);

const sentinel = {reason: 'host trap'};
for (const value of [
  new Proxy({}, {getPrototypeOf() { throw sentinel; }}),
  new Proxy({a: 1}, {getOwnPropertyDescriptor() { throw sentinel; }}),
]) {
  assert.equal(failure(() => reference(value)), sentinel);
  assert.equal(failure(() => engine.copyJson(value)), sentinel);
}

const dangerous = Object.create(null);
Object.defineProperty(dangerous, '__proto__', {value: {keep: true}, enumerable: true});
Object.defineProperty(dangerous, 'constructor', {value: ['future'], enumerable: true});
Object.defineProperty(dangerous, '\ud800', {value: 'surrogate', enumerable: true});
const copied = engine.copyJson(dangerous);
assert.deepEqual(copied, reference(dangerous));
assert.notEqual(copied, dangerous);
assert.notEqual(copied.__proto__, dangerous.__proto__);
assert.equal(Object.getPrototypeOf(copied), null);
assert.equal(Object.hasOwn(copied, '__proto__'), true);
assert.equal(Object.hasOwn(copied, 'constructor'), true);
assert.equal(Object.hasOwn(copied, '\ud800'), true);

const long = 'x'.repeat(4_000_001);
assert.equal(engine.copyJson(long), reference(long));
const boundary = Array(99_999).fill(null);
assert.equal(engine.copyJson(boundary).length, 99_999);
const overflow = Array(100_000).fill(null);
assert.deepEqual(comparable(failure(() => engine.copyJson(overflow))), comparable(failure(() => reference(overflow))));
console.log(JSON.stringify({status: 'pass', cases: cases.map(([name]) => name), proxyTrace: trace.slice(0, 4), exactValueBoundary: 100_000, longStringUnits: long.length}));
