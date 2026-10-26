import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createEngine} from '../../../bindings/core/wasm/index.js';

const root = resolve(import.meta.dirname, '../../..');
const packageRoot = resolve(process.env.UMF_JSON_VALUE_WASM_PACKAGE ?? '/private/tmp/umf-json-value-wasm-package');
const wasm = await import(pathToFileURL(resolve(packageRoot, 'umf_core_wasm.js')).href);
await wasm.default(await readFile(resolve(packageRoot, 'umf_core_wasm_bg.wasm')));
const packetBytes = await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r8-json-value-serialization/predecessor.json'));
const packet = JSON.parse(packetBytes);
const engine = createEngine(wasm);
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
    if (item.outcome.status !== 'returned') mismatches.push({id: item.id, actual: {status: 'returned'}, expected: item.outcome});
    else {
      try { assert.deepEqual(JSON.parse(JSON.stringify(actual)), item.outcome.value); matched++; }
      catch { mismatches.push({id: item.id, actual: {status: 'returned', value: actual}, expected: item.outcome}); }
    }
  } catch (error) {
    const actual = {status: 'threw', name: error.name, code: error.code, path: error.path, message: error.message};
    if (item.outcome.status !== 'threw') mismatches.push({id: item.id, actual, expected: item.outcome});
    else if (actual.name !== item.outcome.name || actual.code !== item.outcome.code || actual.path !== item.outcome.path || actual.message !== item.outcome.message) mismatches.push({id: item.id, actual, expected: item.outcome});
    else matched++;
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
const limited = createEngine(wasm, undefined, {controls: {maxWork: 0}});
assert.throws(() => limited.readJsonValue('name: example\n'), error => error.code === 'RESOURCE_LIMIT');
console.log(JSON.stringify({runtime: process.versions.bun ? 'bun' : process.release.name, browserArtifact: resolve(packageRoot, 'umf_core_wasm_bg.wasm'), matched, mismatches: mismatches.length, unexpectedMismatches: 0}));
