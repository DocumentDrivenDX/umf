import {readFileSync} from 'node:fs';
import {expect, test} from 'bun:test';
import {createEngine, UmfCoreError, UmfError} from '../index.js';

const packet = JSON.parse(readFileSync(new URL('../../../../docs/helix/04-build/evidence/rust-migration/r8-json-value-serialization/predecessor.json', import.meta.url), 'utf8'));
const engine = createEngine({coreSchema: null, referenceSchema: null, packageSchema: null, constraints: null, domainPolicy: null});

function sourceFor(input) {
  if (typeof input.source === 'string') return input.source;
  if (typeof input.depth === 'number') return `${'['.repeat(input.depth)}0${']'.repeat(input.depth)}`;
  if (typeof input.arrayItems === 'number') return `[${Array(input.arrayItems).fill('null').join(',')}]`;
  throw new Error(`unhandled frozen read input ${JSON.stringify(input)}`);
}

test('Node public readJsonValue facade replays frozen predecessor cases', () => {
  const cases = packet.cases.filter(({id}) => id.startsWith('read.'));
  const mismatches = [];
  for (const item of cases) {
    const format = item.input.format ?? 'yaml';
    try {
      const actual = engine.readJsonValue(sourceFor(item.input), format);
      if (item.outcome.status !== 'returned') {
        mismatches.push({id: item.id, actual: 'returned', expected: item.outcome});
      } else {
        expect(actual).toEqual(item.outcome.value);
      }
    } catch (error) {
      if (item.outcome.status !== 'threw') {
        mismatches.push({id: item.id, actual: error, expected: item.outcome});
        continue;
      }
      expect(error).toBeInstanceOf(UmfError);
      expect(error.name, item.id).toBe(item.outcome.name);
      expect(error.code, item.id).toBe(item.outcome.code);
      expect(error.path).toBe(item.outcome.path);
      expect(error.message).toBe(item.outcome.message);
    }
  }
  expect(mismatches).toEqual([]);
});

test('Node public readJsonValue keeps YAML default, explicit JSON and host controls', () => {
  expect(engine.readJsonValue('name: example\n')).toEqual({name: 'example'});
  expect(engine.readJsonValue('{"name":"example"}', 'json')).toEqual({name: 'example'});
  expect(engine.readJsonValue('{}', 'JSON')).toEqual({});
  const limited = createEngine(
    {coreSchema: null, referenceSchema: null, packageSchema: null, constraints: null, domainPolicy: null},
    {controls: {maxWork: 0}},
  );
  expect(() => limited.readJsonValue('name: example\n')).toThrow(expect.objectContaining({code: 'RESOURCE_LIMIT'}));
  expect(() => limited.readJsonValue('name: example\n')).toThrow(UmfCoreError);
});

test('Node JSON-value facade maps every non-json runtime format to YAML', () => {
  expect(engine.readJsonValue('name: example\n', null)).toEqual({name: 'example'});
  expect(engine.readJsonValue('name: example\n', Symbol('format'))).toEqual({name: 'example'});
  expect(engine.writeJsonValue({name: 'example'}, 7)).toBe(engine.writeJsonValue({name: 'example'}, 'yaml'));
});

test('Node generic readValue and writeValue retain their existing JSON/YAML behavior', () => {
  expect(() => engine.readValue('x: &a 1\ny: *a\n', 'yaml')).toThrow(expect.objectContaining({code: 'YAML_ALIAS'}));
  expect(engine.writeValue({name: 'example'}, 'yaml')).toBe('"name": "example"\n');
  expect(() => engine.readJsonValue('x: &a 1\ny: *a\n')).toThrow(expect.objectContaining({code: 'ALIAS'}));
});

test('Node public writeJsonValue facade replays the frozen writer cases', () => {
  const cases = packet.cases.filter(({id}) => id.startsWith('write.'));
  for (const item of cases) {
    let value = item.input.value;
    if (item.id === 'write.number-negative-zero') value = -0;
    if (item.id === 'write.rejects-nonfinite') value = Number.POSITIVE_INFINITY;
    if (item.id === 'write.rejects-cycle') { value = {}; value.self = value; }
    if (item.id === 'write.limit.text') value = 'x'.repeat(item.input.textUnits);
    try {
      const actual = engine.writeJsonValue(value, item.input.format ?? 'yaml');
      expect(item.outcome.status, item.id).toBe('returned');
      expect(actual).toBe(item.outcome.value);
    } catch (error) {
      expect(item.outcome.status, item.id).toBe('threw');
      expect(error).toBeInstanceOf(UmfError);
      expect(error.name).toBe(item.outcome.name);
      expect(error.code).toBe(item.outcome.code);
      expect(error.path).toBe(item.outcome.path);
      expect(error.message).toBe(item.outcome.message);
    }
  }
});

test('Node JSON-value writer meters host admission before reflection and never invokes getters', () => {
  const zeroBudget = createEngine(
    {coreSchema: null, referenceSchema: null, packageSchema: null, constraints: null, domainPolicy: null},
    {controls: {maxWork: 0}},
  );
  const zeroBudgetTraps = [];
  const zeroBudgetProxy = new Proxy({value: 1}, {
    getPrototypeOf(target) { zeroBudgetTraps.push('getPrototypeOf'); return Reflect.getPrototypeOf(target); },
    ownKeys(target) { zeroBudgetTraps.push('ownKeys'); return Reflect.ownKeys(target); },
  });
  expect(() => zeroBudget.writeJsonValue(zeroBudgetProxy)).toThrow(expect.objectContaining({code: 'RESOURCE_LIMIT'}));
  expect(zeroBudgetTraps).toEqual([]);

  const metered = [];
  const trapOrder = [];
  const limited = createEngine(
    {coreSchema: null, referenceSchema: null, packageSchema: null, constraints: null, domainPolicy: null},
    {controls: {maxWork: 1, meter(amount) { metered.push(amount); }}},
  );
  const proxy = new Proxy({first: 1, second: 2}, {
    getPrototypeOf(target) { trapOrder.push('getPrototypeOf'); return Reflect.getPrototypeOf(target); },
    ownKeys(target) { trapOrder.push('ownKeys'); return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(target, key) { trapOrder.push(`descriptor:${String(key)}`); return Reflect.getOwnPropertyDescriptor(target, key); },
  });
  expect(() => limited.writeJsonValue(proxy)).toThrow(expect.objectContaining({code: 'RESOURCE_LIMIT'}));
  expect(trapOrder).toEqual(['getPrototypeOf', 'ownKeys', 'ownKeys']);
  expect(metered).toEqual([1]);

  let getterCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, 'hiddenFromTraversal', {enumerable: true, get() { getterCalls++; return 1; }});
  expect(() => engine.writeJsonValue(accessor)).toThrow(expect.objectContaining({code: 'NON_JSON'}));
  expect(getterCalls).toBe(0);

  const shared = {value: 1};
  expect(engine.writeJsonValue({left: shared, right: shared}, 'json')).toBe(
    '{\n  "left": {\n    "value": 1\n  },\n  "right": {\n    "value": 1\n  }\n}\n',
  );
});

// Live TypeScript host-oracle comparison lives in
// scripts/rust-migration/r8/json-value-host-admission.test.js so the binding
// boundary scan cannot gain a reference semantic import.
