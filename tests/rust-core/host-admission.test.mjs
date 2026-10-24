// SPDX-License-Identifier: MIT OR Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeWire, fromWire, resultError, toWire} from '../../bindings/core/node/src/wire.js';

test('@covers US-089-AC19 umf.core-wire/1 preserves ordered members, raw UTF-16, and binary64 bits', () => {
  const raw = String.fromCharCode(0xd800, 0x61, 0xdc00);
  const value = Object.create(null);
  value.second = -0;
  value.first = raw;
  const wire = JSON.parse(encodeWire(value));
  assert.deepEqual(wire.members.map(({key}) => key), [[115,101,99,111,110,100],[102,105,114,115,116]]);
  assert.equal(wire.members[0].value.bits, '8000000000000000');
  assert.deepEqual(wire.members[1].value.units, [0xd800, 0x61, 0xdc00]);
  const copied = fromWire(wire);
  assert.equal(Object.is(copied.second, -0), true);
  assert.deepEqual(Array.from({length: copied.first.length}, (_, i) => copied.first.charCodeAt(i)), [0xd800, 0x61, 0xdc00]);
});

test('@covers US-089-AC20 admission rejects getters without invoking them', () => {
  let reads = 0;
  const value = {};
  Object.defineProperty(value, 'secret', {enumerable: true, get() { reads++; return 1; }});
  assert.throws(() => toWire(value), {code: 'ACCESSOR_PROPERTY'});
  assert.equal(reads, 0);
});

test('@covers US-089-AC22 admission rejects sparse arrays, custom prototypes, symbols and non-finite values', () => {
  const sparse = new Array(2); sparse[1] = 1;
  assert.throws(() => toWire(sparse), {code: 'SPARSE_OR_EXTENDED_ARRAY'});
  assert.throws(() => toWire(Object.create({x: 1})), {code: 'UNSUPPORTED_OBJECT'});
  assert.throws(() => toWire({[Symbol('x')]: 1}), {code: 'UNSUPPORTED_KEY'});
  assert.equal(toWire(Infinity).bits, '7ff0000000000000'); // Rust rejects non-finite bits during value admission
});

test('@covers US-089-AC24 large strings survive round-trip without argument-count overflow', () => {
  const source = 'x'.repeat(100_000);
  const result = fromWire(toWire(source));
  assert.equal(result, source);
  assert.doesNotThrow(() => toWire({a: 'ab', b: 'cd'}));
  assert.doesNotThrow(() => toWire({a: 'a'.repeat(10_000_001), b: 'b'.repeat(10_000_001)}));
});

test('@covers US-089-AC19 Rust error envelopes preserve raw UTF-16 path and message units', () => {
  const failure = resultError({
    profile: 'umf.core-wire/1', status: 'error', code: 'CALLBACK_ERROR',
    pathUnits: [47, 0xd800], messageUnits: [0xdc00, 0x61],
  });
  assert.equal(failure.code, 'CALLBACK_ERROR');
  assert.deepEqual(Array.from({length: failure.path.length}, (_, i) => failure.path.charCodeAt(i)), [47, 0xd800]);
  assert.deepEqual(Array.from({length: failure.message.length}, (_, i) => failure.message.charCodeAt(i)), [0xdc00, 0x61]);
  assert.equal(resultError({profile: 'umf.core-wire/1', status: 'ok', wire: '{"kind":"null"}'}), null);
  assert.throws(() => resultError({profile: 'umf.core-wire/1', status: 'error', code: 'x', pathUnits: [0x10000], messageUnits: []}), /Malformed UTF-16/);
});


test('@covers US-089-AC22 custom array prototypes reject before inherited getters', () => {
  class CustomArray extends Array {}
  assert.throws(() => toWire(new CustomArray(1, 2)), {code: 'UNSUPPORTED_ARRAY_PROTOTYPE'});
  let reads = 0;
  const prototype = Object.create(Array.prototype);
  Object.defineProperty(prototype, 'secret', {get() { reads++; return 1; }});
  const value = Object.setPrototypeOf([1], prototype);
  assert.throws(() => toWire(value), {code: 'UNSUPPORTED_ARRAY_PROTOTYPE'});
  assert.equal(reads, 0);
});
