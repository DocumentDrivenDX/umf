// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {copyJson as typescriptCopyJson} from '../../../src/model/json.ts';
import {createEngine as createNodeEngine} from '../../../bindings/core/node/index.js';
import {createEngine as createWasmEngine} from '../../../bindings/core/wasm/index.js';
import {toWire} from '../../../bindings/core/wasm/src/wire.js';

const success = JSON.stringify({profile: 'umf.core-wire/1', status: 'ok', wire: JSON.stringify(toWire('ok'))});
const wasmModule = {
  copyJsonWire() { throw new Error('unused'); },
  executeRequestWire() { throw new Error('unused'); },
  writeTypescriptJsonValueWire() { return success; },
};

function refusalCases() {
  const accessor = {};
  Object.defineProperty(accessor, 'nested', {enumerable: true, get() { throw new Error('must not run'); }});
  const hidden = {};
  Object.defineProperty(hidden, 'a', {enumerable: false, value: 1});
  const arrayWithExtra = Object.assign([], {x: 1});
  const arrayWithHidden = [];
  Object.defineProperty(arrayWithHidden, 'x', {enumerable: false, value: 1});
  const arrayWithAccessor = [];
  Object.defineProperty(arrayWithAccessor, '0', {enumerable: true, get() { throw new Error('must not run'); }});
  return [
    ['undefined', undefined], ['function', () => {}], ['bigint', 1n], ['symbol', Symbol('x')],
    ['nested unsupported', {a: [undefined]}], ['custom prototype', new Date(0)],
    ['accessor', accessor], ['hidden property', hidden], ['array with extra property', arrayWithExtra],
    ['array with hidden property', arrayWithHidden], ['array indexed accessor', arrayWithAccessor],
    ['sparse array', Array(2)], ['negative zero', -0],
  ];
}

function outcome(run) {
  try { return {accepted: run()}; }
  catch (error) { return {name: error.name, code: error.code, message: error.message, path: error.path}; }
}

for (const [host, engine] of [
  ['Node', createNodeEngine({coreSchema: null, referenceSchema: null, packageSchema: null, constraints: null, domainPolicy: null})],
  ['WASM', createWasmEngine(wasmModule)],
]) {
  test(`${host} JSON-value host admission matches live TypeScript refusal code, path and message`, () => {
    for (const [label, value] of refusalCases()) {
      const expected = outcome(() => typescriptCopyJson(value));
      expect(expected.code, label).toBeDefined();
      expect(outcome(() => engine.writeJsonValue(value)), label).toEqual(expected);
    }
  });

  test(`${host} JSON-value host admission matches live TypeScript proxy reflection order`, () => {
    const trace = copy => {
      const events = [];
      const proxy = new Proxy({a: 1, b: 2}, {
        getPrototypeOf(target) { events.push('getPrototypeOf'); return Reflect.getPrototypeOf(target); },
        ownKeys(target) { events.push('ownKeys'); return Reflect.ownKeys(target); },
        getOwnPropertyDescriptor(target, key) { events.push(`descriptor:${String(key)}`); return Reflect.getOwnPropertyDescriptor(target, key); },
      });
      copy(proxy);
      return events;
    };
    expect(trace(value => engine.writeJsonValue(value))).toEqual(trace(typescriptCopyJson));
  });
}
