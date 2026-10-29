// Invoke all bounded operations through the real built NAPI binding and public
// package facade. The Rust tagged-wire profile is opt-in and does not alter
// any TypeScript defaults.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const repo = resolve(import.meta.dirname, '../../../..');
const host = process.env.UMF_PARQUET_PAGES_HOST ?? 'node';
let engine;
if (host === 'wasm') {
  const packageRoot = resolve(process.env.UMF_PARQUET_CAPTURE_WASM_PACKAGE ?? resolve(repo, 'bindings/core/wasm/pkg'));
  const wasm = await import(pathToFileURL(resolve(packageRoot, 'umf_core_wasm.js')).href);
  await wasm.default({module_or_path: await readFile(resolve(packageRoot, 'umf_core_wasm_bg.wasm'))});
  const binding = await import(pathToFileURL(resolve(repo, 'bindings/core/wasm/index.js')).href);
  engine = binding.createParquetCaptureEngine(wasm);
} else {
  const packageRoot = process.env.UMF_PARQUET_CAPTURE_NODE_PACKAGE ?? resolve(repo, 'bindings/core/node');
  const binding = await import(pathToFileURL(resolve(packageRoot, 'index.js')).href);
  engine = binding.createParquetCaptureEngine();
}
assert.equal(engine.profile, 'umf-r8-parquet-capture-inspection/0.1.0');
assert.equal(engine.capabilities.complete, false);
const source = new Uint8Array(await readFile(resolve(repo, 'fixtures/parquet/rename/none.parquet')));
const captured = engine.captureParquet(source, {id: 'actual-node-parquet-binding'});
source.fill(0);
assert.deepEqual(engine.exportParquetCapture(captured), new Uint8Array(await readFile(resolve(repo, 'fixtures/parquet/rename/none.parquet'))));
assert.equal(engine.inspectParquetFraming(captured).status, 'located');
assert.equal(engine.decodeParquetFooter(captured).status, 'decoded');
assert.equal(engine.inspectParquetMetadata(captured).status, 'mapped');
assert.equal(engine.inspectParquetSchema(captured).status, 'checked');
const levelsInput = new Uint8Array(await readFile(resolve(repo, 'fixtures/parquet/pages/negative/valid-v1.parquet')));
assert.equal(engine.decodeParquetLevels(engine.captureParquet(levelsInput, {id: 'levels-node'})).status, 'decoded');
const utf16Source = new Uint8Array(await readFile(resolve(repo, 'fixtures/parquet/rename/none.parquet')));
const loneId = '\ud800k';
const unknownKey = 'f\udfffuture';
const unknownValue = 'v\ud800alue';
const loneIdDocument = engine.importParquetSchema(utf16Source, {id: loneId});
assert.equal(loneIdDocument.id, loneId);
const unknownDocument = structuredClone(loneIdDocument);
unknownDocument.vocabularies['future.vendor'] = {version: '0.1.0', [unknownKey]: unknownValue};
for (const inspect of [engine.inspectParquetLogicalTypes, engine.inspectParquetContainers]) {
  const result = inspect(unknownDocument);
  assert.equal(result.source.id, loneId);
  assert.equal(result.source.vocabularies['future.vendor'][unknownKey], unknownValue);
}
assert.equal(engine.getParquetFieldMetadata(unknownDocument).status, 'checked');
assert.deepEqual(engine.exportParquetCapture(unknownDocument), utf16Source);
const frozen = JSON.parse(await readFile(resolve(repo, 'tests/rust-core/fixtures/parquet-metadata-ts-freeze.json'), 'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));
const publicWireCases = new Set(['decimal32', 'list-wrong-child-repetition', 'map-key-only']);
for (const vector of frozen.cases.filter(({id}) => publicWireCases.has(id))) {
  const bytes = Buffer.from(vector.bytes, 'hex');
  const source = engine.captureParquet(bytes, {id: vector.id});
  const actual = {
    inspectParquetLogicalTypes: engine.inspectParquetLogicalTypes(source),
    inspectParquetContainers: engine.inspectParquetContainers(source),
    getParquetFieldMetadata: engine.getParquetFieldMetadata(source),
  };
  for (const key of ['inspectParquetLogicalTypes', 'inspectParquetContainers', 'getParquetFieldMetadata']) {
    assert.deepEqual(plain(actual[key]), vector.outputs[key], `${vector.id} ${key} full public envelope`);
  }
  try {
    const imported = engine.importParquetSchema(bytes, {id: vector.id});
    if (vector.outputs.importParquetSchema.error) assert.fail(`${vector.id} importParquetSchema should refuse`);
    assert.deepEqual(plain(imported), vector.outputs.importParquetSchema, `${vector.id} importParquetSchema full public envelope`);
  } catch (error) {
    if (!vector.outputs.importParquetSchema.error) throw error;
    assert.deepEqual({code: error.code, message: error.message}, {
      code: vector.outputs.importParquetSchema.error.code,
      message: vector.outputs.importParquetSchema.error.message,
    }, `${vector.id} importParquetSchema refusal`);
  }
}
console.log(JSON.stringify({status: 'passed', host, profile: engine.profile, operations: 11, frozenCases: publicWireCases.size}));
