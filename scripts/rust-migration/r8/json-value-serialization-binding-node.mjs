import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createEngine} from '../../../bindings/core/node/index.js';

const packetPath = new URL('../../../docs/helix/04-build/evidence/rust-migration/r8-json-value-serialization/predecessor.json', import.meta.url);
const packetBytes = await readFile(packetPath);
const packet = JSON.parse(packetBytes);
const engine = createEngine({coreSchema: null, referenceSchema: null, packageSchema: null, constraints: null, domainPolicy: null});
let matched = 0;
const mismatches = [];

function sourceFor(input) {
  if (typeof input.source === 'string') return input.source;
  if (typeof input.depth === 'number') return `${'['.repeat(input.depth)}0${']'.repeat(input.depth)}`;
  if (typeof input.arrayItems === 'number') return `[${Array(input.arrayItems).fill('null').join(',')}]`;
  throw new Error(`unhandled input ${JSON.stringify(input)}`);
}

for (const item of packet.cases.filter(({id}) => id.startsWith('read.'))) {
  try {
    const actual = engine.readJsonValue(sourceFor(item.input), item.input.format ?? 'yaml');
    if (item.outcome.status !== 'returned') {
      mismatches.push({id: item.id, actual: {status: 'returned', value: actual}, expected: item.outcome});
    } else {
      try { assert.deepEqual(JSON.parse(JSON.stringify(actual)), item.outcome.value); matched++; }
      catch { mismatches.push({id: item.id, actual: {status: 'returned', value: actual}, expected: item.outcome}); }
    }
  } catch (error) {
    const actual = {status: 'threw', name: error.name, code: error.code, path: error.path, message: error.message};
    if (item.outcome.status !== 'threw' ||
        (actual.name !== item.outcome.name || actual.code !== item.outcome.code || actual.path !== item.outcome.path || actual.message !== item.outcome.message)) {
      mismatches.push({id: item.id, actual, expected: item.outcome});
    } else matched++;
  }
}
for (const item of packet.cases.filter(({id}) => id.startsWith('write.'))) {
  let value = item.input.value;
  if (item.id === 'write.number-negative-zero') value = -0;
  if (item.id === 'write.rejects-nonfinite') value = Number.POSITIVE_INFINITY;
  if (item.id === 'write.rejects-cycle') { value = {}; value.self = value; }
  if (item.id === 'write.limit.text') value = 'x'.repeat(item.input.textUnits);
  try {
    const actual = engine.writeJsonValue(value, item.input.format ?? 'yaml');
    if (item.outcome.status !== 'returned' || actual !== item.outcome.value) mismatches.push({id: item.id, actual: {status: 'returned', value: actual}, expected: item.outcome});
    else matched++;
  } catch (error) {
    const actual = {status: 'threw', name: error.name, code: error.code, path: error.path, message: error.message};
    if (item.outcome.status !== 'threw' || actual.name !== item.outcome.name || actual.code !== item.outcome.code || actual.path !== item.outcome.path || actual.message !== item.outcome.message) mismatches.push({id: item.id, actual, expected: item.outcome});
    else matched++;
  }
}
assert.deepEqual(mismatches, []);
assert.equal(matched, packet.cases.length);
assert.deepEqual(JSON.parse(JSON.stringify(engine.readJsonValue('name: example\n'))), {name: 'example'});
assert.deepEqual(JSON.parse(JSON.stringify(engine.readJsonValue('{"name":"example"}', 'json'))), {name: 'example'});
assert.deepEqual(JSON.parse(JSON.stringify(engine.readJsonValue('{}', 'JSON'))), {});
assert.throws(() => engine.readValue('x: &a 1\ny: *a\n', 'yaml'), error => error.code === 'YAML_ALIAS');
const limited = createEngine({coreSchema: null, referenceSchema: null, packageSchema: null, constraints: null, domainPolicy: null}, {controls: {maxWork: 0}});
assert.throws(() => limited.readJsonValue('name: example\n'), error => error.code === 'RESOURCE_LIMIT');
console.log(JSON.stringify({runtime: process.versions.bun ? 'bun' : process.release.name, matched, mismatches: mismatches.length, unexpectedMismatches: 0, packetBytes: packetBytes.length}));
