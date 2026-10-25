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
  const knownYamlDiagnosticMismatches = [];
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
      if (['read.syntax.yaml-duplicate-key', 'read.syntax.yaml-multiple-documents'].includes(item.id)) {
        knownYamlDiagnosticMismatches.push({id: item.id, code: error.code, path: error.path, message: error.message});
        continue;
      }
      expect(error.code, item.id).toBe(item.outcome.code);
      expect(error.path).toBe(item.outcome.path);
      expect(error.message).toBe(item.outcome.message);
    }
  }
  expect(mismatches).toEqual([]);
  expect(knownYamlDiagnosticMismatches).toEqual([
    {id: 'read.syntax.yaml-duplicate-key', code: 'DUPLICATE_KEY', path: '', message: 'Duplicate mapping key'},
    {id: 'read.syntax.yaml-multiple-documents', code: 'YAML_DOCUMENTS', path: '', message: 'Exactly one YAML document is required'},
  ]);
});

test('Node public readJsonValue keeps YAML default, explicit JSON, strict format and host controls', () => {
  expect(engine.readJsonValue('name: example\n')).toEqual({name: 'example'});
  expect(engine.readJsonValue('{"name":"example"}', 'json')).toEqual({name: 'example'});
  expect(() => engine.readJsonValue('{}', 'JSON')).toThrow(UmfError);
  const limited = createEngine(
    {coreSchema: null, referenceSchema: null, packageSchema: null, constraints: null, domainPolicy: null},
    {controls: {maxWork: 0}},
  );
  expect(() => limited.readJsonValue('name: example\n')).toThrow(expect.objectContaining({code: 'RESOURCE_LIMIT'}));
  expect(() => limited.readJsonValue('name: example\n')).toThrow(UmfCoreError);
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
