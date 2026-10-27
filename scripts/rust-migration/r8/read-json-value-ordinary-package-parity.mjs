// SPDX-License-Identifier: MIT OR Apache-2.0
// Direct dedicated-entry comparison for the opt-in Rust ordinary primitive-string seam.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readJsonValue as reference } from '../../../dist/umf.js';

const bundlePath = resolve(process.env.UMF_RUST_ORDINARY_BUNDLE ?? 'dist/umf-ordinary-test-entry.mjs');
const { readJsonValueOrdinary } = await import(pathToFileURL(bundlePath).href);
const cases = [
  ['yaml-string', 'a: 1\nb: [true, null]\n', 'yaml'],
  ['json-string', '{"b":2,"a":[true,null]}', 'json'],
  ['json-primitive-results', '[null,false,true,0,1,"x"]', 'json'],
  ['json-duplicate-key', '{"x":1,"x":2}', 'json'],
  ['json-invalid', '{', 'json'],
  ['json-live-parse-accepts-malformed-input', '{', 'json'],
  ['yaml-duplicate-key', 'a: 1\na: 2', 'yaml'],
  ['yaml-null-prototype-ordered-own-descriptors', 'z: 1\n__proto__: 2\na: 3\n', 'yaml'],
  ['json-lone-surrogate-value', '"\\ud800"', 'json'],
  ['json-lone-surrogate-key', '{"\\ud800":"v"}', 'json'],
  ['yaml-lone-surrogate-value', '"\\uD800"\n', 'yaml'],
  ['yaml-lone-surrogate-key', '"\\uD800": 1\n', 'yaml'],
  ['array-own-index-under-inherited-setter', '[41,42]\n', 'yaml'],
  ['nonstring-format-no-coercion', 'x: 1\n', { toString() { throw Error('format coerced'); } }],
  ['exact-limit-valid', '"' + 'a'.repeat(3_999_998) + '"', 'json'],
  ['astral-utf16-exact-limit', '"' + '😀'.repeat(1_999_999) + '"', 'json'],
  ['yaml-exact-limit', ' '.repeat(4_000_000), 'yaml'],
  ['yaml-over-limit', ' '.repeat(4_000_001), 'yaml'],
];

function outcome(fn, source, format, setter) {
  let count = 0;
  const old = Object.getOwnPropertyDescriptor(Array.prototype, '0');
  try {
    if (setter) Object.defineProperty(Array.prototype, '0', { configurable: true, set(value) {
      count++;
      Object.defineProperty(this, '0', { configurable: true, enumerable: true, writable: true, value });
    } });
    try { return { kind: 'return', value: fn(source, format), setter: count }; }
    catch (error) { return { kind: 'throw', name: error?.name, code: error?.code, path: error?.path, message: error?.message, setter: count }; }
  } finally {
    if (setter) { if (old) Object.defineProperty(Array.prototype, '0', old); else delete Array.prototype[0]; }
  }
}

function withLenientLiveJsonParse(fn, source, format, setter) {
  const original = JSON.parse;
  try {
    JSON.parse = function (text, ...args) {
      if (text === '{') return null;
      return original.call(this, text, ...args);
    };
    return outcome(fn, source, format, setter);
  } finally {
    JSON.parse = original;
  }
}

function equivalent(a, b) {
  if (a.kind !== b.kind || a.setter !== b.setter) return false;
  if (a.kind === 'throw') return a.name === b.name && a.code === b.code && a.path === b.path && a.message === b.message;
  return isDeepStrictEqual(a.value, b.value) && sameOwnShape(a.value, b.value);
}

function sameOwnShape(a, b) {
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return Object.is(a, b);
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  const keysA = Reflect.ownKeys(a);
  const keysB = Reflect.ownKeys(b);
  if (keysA.length !== keysB.length || keysA.some((key, index) => !Object.is(key, keysB[index]))) return false;
  for (const key of keysA) {
    const left = Object.getOwnPropertyDescriptor(a, key);
    const right = Object.getOwnPropertyDescriptor(b, key);
    if (!left || !right || left.configurable !== right.configurable || left.enumerable !== right.enumerable) return false;
    if ('value' in left !== ('value' in right)) return false;
    if ('value' in left) {
      if (left.writable !== right.writable || !sameOwnShape(left.value, right.value)) return false;
    } else if (left.get !== right.get || left.set !== right.set) return false;
  }
  return true;
}

const matchedCases = [];
const mismatches = [];
for (const [id, source, format] of cases) {
  const setter = id === 'array-own-index-under-inherited-setter';
  const run = id === 'json-live-parse-accepts-malformed-input' ? withLenientLiveJsonParse : outcome;
  const expected = run(reference, source, format, setter);
  const actual = run(readJsonValueOrdinary, source, format, setter);
  if (equivalent(expected, actual)) matchedCases.push(id);
  else mismatches.push({ id, expected, actual });
}

const sha256 = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');
const sourceFiles = [
  'bindings/core/node/src/read_json_value.rs', 'bindings/core/node/src/lib.rs',
  'bindings/core/node/index.js', 'bindings/core/node/index.d.ts',
  'crates/umf-core/src/serialization.rs', 'crates/umf-core/src/context.rs',
  'src/access/read-json-value-ordinary.ts', 'src/index-node-v4.ts',
  'scripts/rust-migration/r8/read-json-value-ordinary-entry.ts',
  'src/model/serialization.ts', 'dist/umf.js',
  'tests/model/read-json-value-ordinary.test.ts',
  'scripts/rust-migration/r8/read-json-value-ordinary-package-parity.mjs',
];
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async (path) => [path, await sha256(path)])));
// The bundled Node entry calls createRequire(import.meta.url) for this sibling.
// Bind the hash to that actual resolution, not an arbitrary receipt-only path.
const addonPath = resolve(dirname(bundlePath), 'umf_core_node.node');
if (process.env.UMF_RUST_ORDINARY_ADDON) {
  assert.equal(await realpath(resolve(process.env.UMF_RUST_ORDINARY_ADDON)), await realpath(addonPath));
}
const expectedMismatchIds = ['array-own-index-under-inherited-setter'];
const expectedMismatchMode = process.argv.includes('--expected-mismatches');
const receipt = {
  packet: 'r8-read-json-value-ordinary-rust-package-parity-20261027-v1',
  runtime: process.versions.bun ? `Bun ${Bun.version}` : `Node ${process.version}`,
  bundle: { path: bundlePath, sha256: await sha256(bundlePath) },
  addon: { path: addonPath, sha256: await sha256(addonPath) },
  sourceHashes,
  count: cases.length,
  matched: matchedCases.length,
  mismatchCount: mismatches.length,
  matchedCases,
  mismatches,
  expectedMismatchMode,
};
console.log(JSON.stringify(receipt, null, 2));

if (expectedMismatchMode) {
  const ids = mismatches.map(({ id }) => id).sort();
  assert.deepEqual(ids, expectedMismatchIds);
  assert.equal(cases.length, 18);
  assert.equal(matchedCases.length, 17);
} else if (mismatches.length) {
  process.exitCode = 1;
}
