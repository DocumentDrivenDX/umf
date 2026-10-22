// SPDX-License-Identifier: MIT OR Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createEngine} from '../../bindings/core/node/index.js';
import {createEngine as createWasmEngine} from '../../bindings/core/wasm/index.js';

const resources = {
  coreSchema: {}, referenceSchema: {}, packageSchema: {}, constraints: {}, domainPolicy: {},
};

test('@covers US-089-AC20 engine extension admission reads only own data properties', () => {
  const wasmModule = {copyJsonWire() {}, executeRequestWire() {}};
  for (const engine of [createEngine(resources), createWasmEngine(wasmModule, resources)]) {
    let reads = 0;
    const extension = {};
    Object.defineProperty(extension, 'id', {enumerable: true, get() { reads++; return 'urn:x'; }});
    assert.throws(() => engine.validateDocument({}, [extension]), /data property/);
    assert.equal(reads, 0);
  }
});

test('@covers US-089-AC22 engine extension admission rejects sparse arrays and extra array properties', () => {
  const engine = createEngine(resources);
  const sparse = new Array(1);
  assert.throws(() => engine.validateDocument({}, sparse), /dense array/);
  const extra = [];
  extra.metadata = true;
  assert.throws(() => engine.validateDocument({}, extra), /dense array/);
  const wasm = createWasmEngine({copyJsonWire() {}, executeRequestWire() {}}, resources);
  assert.throws(() => wasm.validateDocument({}, sparse), /dense array/);
});


test('@covers US-089-AC22 extension arrays require the ordinary array prototype', () => {
  class CustomArray extends Array {}
  const wasmModule = {copyJsonWire() {}, executeRequestWire() {}};
  for (const engine of [createEngine(resources), createWasmEngine(wasmModule, resources)]) {
    let reads = 0;
    const prototype = Object.create(Array.prototype);
    Object.defineProperty(prototype, 'secret', {get() { reads++; return 1; }});
    assert.throws(() => engine.validateDocument({}, Object.setPrototypeOf([], prototype)), /plain array/);
    assert.throws(() => engine.validateDocument({}, new CustomArray()), /plain array/);
    assert.equal(reads, 0);
  }
});
