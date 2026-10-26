import {expect, test} from 'bun:test';
import {createEngine, UmfCoreError} from '../index.js';
import {toWire} from '../src/wire.js';

const success = (value) => JSON.stringify({
  profile: 'umf.core-wire/1',
  status: 'ok',
  wire: JSON.stringify(toWire(value)),
});

function stubModule(calls = {}) {
  return {
    copyJsonWire() { throw new Error('unused'); },
    executeRequestWire() { throw new Error('unused'); },
    readValueWire(_wire, format) { calls.readValueFormat = format; return success('generic-read'); },
    writeValueWire(_wire, format) { calls.writeValueFormat = format; return success('generic-write'); },
    readTypescriptJsonValueWire(_wire, format) { calls.readJsonValueFormat = format; return success({ok: true}); },
    writeTypescriptJsonValueWire(_wire, format) { calls.writeJsonValueFormat = format; calls.writeCalls = (calls.writeCalls ?? 0) + 1; return success('profile-write'); },
  };
}

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

test('WASM JSON-value facade normalizes runtime formats while generic value formats pass through', () => {
  const calls = {};
  const engine = createEngine(stubModule(calls));
  expect(engine.readJsonValue('name: example\n', null)).toEqual({ok: true});
  expect(engine.writeJsonValue({name: 'example'}, Symbol('format'))).toBe('profile-write');
  expect(calls.readJsonValueFormat).toBe('yaml');
  expect(calls.writeJsonValueFormat).toBe('yaml');

  expect(engine.readValue('source', null)).toBe('generic-read');
  expect(engine.writeValue({value: 1}, 7)).toBe('generic-write');
  expect(calls.readValueFormat).toBe(null);
  expect(calls.writeValueFormat).toBe(7);
});

test('WASM JSON-value writer charges host admission before proxy reflection and FFI', () => {
  const calls = {};
  const meter = [];
  const zeroBudget = createEngine(stubModule(calls), undefined, {controls: {maxWork: 0, meter(amount) { meter.push(amount); }}});
  const zeroBudgetTraps = [];
  const zeroBudgetProxy = new Proxy({value: 1}, {
    getPrototypeOf(target) { zeroBudgetTraps.push('getPrototypeOf'); return Reflect.getPrototypeOf(target); },
    ownKeys(target) { zeroBudgetTraps.push('ownKeys'); return Reflect.ownKeys(target); },
  });
  expect(() => zeroBudget.writeJsonValue(zeroBudgetProxy)).toThrow(expect.objectContaining({code: 'RESOURCE_LIMIT'}));
  expect(zeroBudgetTraps).toEqual([]);
  expect(calls.writeCalls).toBeUndefined();
  expect(meter).toEqual([]);

  const limitedCalls = {};
  const limitedMeter = [];
  const limited = createEngine(stubModule(limitedCalls), undefined, {controls: {maxWork: 1, meter(amount) { limitedMeter.push(amount); }}});
  const trapOrder = [];
  const proxy = new Proxy({first: 1, second: 2}, {
    getPrototypeOf(target) { trapOrder.push('getPrototypeOf'); return Reflect.getPrototypeOf(target); },
    ownKeys(target) { trapOrder.push('ownKeys'); return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(target, key) { trapOrder.push(`descriptor:${String(key)}`); return Reflect.getOwnPropertyDescriptor(target, key); },
  });
  expect(() => limited.writeJsonValue(proxy)).toThrow(expect.objectContaining({code: 'RESOURCE_LIMIT'}));
  expect(trapOrder).toEqual(['getPrototypeOf', 'ownKeys']);
  expect(limitedCalls.writeCalls).toBeUndefined();
  expect(limitedMeter).toEqual([1]);
});
