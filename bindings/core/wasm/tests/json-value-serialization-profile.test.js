import {expect, test} from 'bun:test';
import {createEngine, UmfCoreError} from '../index.js';

test('WASM facade fails closed when the opt-in TypeScript profile binding is absent', () => {
  const calls = [];
  const module = {
    copyJsonWire() { throw new Error('unused'); },
    executeRequestWire() { throw new Error('unused'); },
    readValueWire(_wire, format) { calls.push(format); return JSON.stringify({status: 'error', code: 'YAML_ALIAS', pathUnits: [], messageUnits: []}); },
  };
  const engine = createEngine(module);
  expect(() => engine.readJsonValue('x: 1\n')).toThrow(expect.objectContaining({code: 'RUST_BINDING_MISSING'}));
  expect(calls).toEqual([]);
});
