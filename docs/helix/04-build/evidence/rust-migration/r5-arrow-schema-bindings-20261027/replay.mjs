// SPDX-License-Identifier: MIT OR Apache-2.0
// Exact JSON outcome replay against the frozen TypeScript predecessor packet.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';

const root = resolve(fileURLToPath(new URL('../../../../../../', import.meta.url)));
const packageDir = resolve(process.argv[2] ?? '');
assert(process.argv[2], 'pass a private built Node package directory');
const packetPath = resolve(process.argv[3] ?? `${root}/docs/helix/04-build/evidence/rust-migration/r5-arrow-typescript-predecessor-20261027/typescript-arrow-schema-outcomes.json.gz`);
const packetBytes = await readFile(packetPath);
const packet = JSON.parse(gunzipSync(packetBytes).toString('utf8'));
assert.equal(packet.corpus.length, 52);
assert.equal(packet.focused.length, 17);
const packageEntry = await import(pathToFileURL(resolve(packageDir, 'index.js')).href);
const {createArrowSchemaEngine} = packageEntry;
assert.equal(typeof createArrowSchemaEngine, 'function');
const require = createRequire(import.meta.url);
const addonBytes = await readFile(resolve(packageDir, 'umf_core_node.node'));
const addon = require(resolve(packageDir, 'umf_core_node.node'));
let wasmEquivalentCalls = 0;
const Runtime = addon.ArrowSchemaResourcesRuntime;
const executeWire = Runtime.prototype.executeWire;
Runtime.prototype.executeWire = function (...args) {
  wasmEquivalentCalls++;
  return Reflect.apply(executeWire, this, args);
};
const capture = fn => {
  try { return {kind: 'return', value: fn()}; }
  catch (error) { return {kind: 'throw', error: {code: error?.code ?? null, path: error?.path ?? null, message: error?.message ?? String(error)}}; }
};
function check(actual, expected, label) {
  assert.equal(actual.kind, expected.kind, `${label} kind`);
  if (expected.kind === 'return') {
    assert.equal(JSON.stringify(actual.value), expected.outputJson, `${label} JSON`);
    if (expected.nativeOutputBytes) {
      assert.equal(actual.value, Buffer.from(expected.nativeOutputBytes.utf8Base64, 'base64').toString('utf8'), `${label} native bytes`);
    }
  } else {
    assert.deepEqual(actual.error, {code: expected.error.code, path: expected.error.path, message: expected.error.message}, `${label} error`);
  }
}

const started = performance.now();
const engine = createArrowSchemaEngine();
let corpusOperations = 0;
for (const row of packet.corpus) {
  const imported = capture(() => engine.importSchema(row.inputJson, row.id));
  check(imported, row.operations.importArrowSchema, `${row.id} import`);
  corpusOperations++;
  const doc = imported.value;
  const before = JSON.stringify(doc);
  for (const [name, run] of [
    ['inspectArrow', () => engine.inspect(doc)],
    ['exportArrowSchema', () => engine.exportSchema(doc)],
    ['getArrowNode', () => engine.getNode(doc, '')],
    ['proposeArrowNodeEdit', () => engine.proposeNodeEdit(doc, '/fields/0/name', JSON.stringify(`${row.id}-edited`))],
  ]) {
    check(capture(run), row.operations[name], `${row.id} ${name}`);
    corpusOperations++;
  }
  assert.equal(JSON.stringify(doc), before, `${row.id} input immutability`);
}

let focusedImports = 0;
let focusedOperations = 0;
for (const row of packet.focused) {
  if (row.name === 'proxy-reflection-throw-identity' || !row.import) continue;
  const imported = capture(() => engine.importSchema(row.inputJson, row.id));
  check(imported, row.import, `${row.name} import`);
  focusedImports++;
  if (imported.kind !== 'return') continue;
  const doc = imported.value;
  const before = JSON.stringify(doc);
  const ops = row.operations ?? {};
  const pointer = row.name === 'future-type-duplicate-metadata-exact-numbers'
    ? '/fields/0/type/parameter'
    : ['dictionary-scientific-integer', 'map-layout', 'run-end-layout'].includes(row.name) ? '/fields/0' : '';
  const replacement = row.name === 'future-type-duplicate-metadata-exact-numbers'
    ? '"changed"' : JSON.stringify(`${row.id}-edited`);
  for (const [name, run] of [
    ['inspectArrow', () => engine.inspect(doc)],
    ['exportArrowSchema', () => engine.exportSchema(doc)],
    ['getArrowNode', () => engine.getNode(doc, pointer)],
    ['proposeArrowNodeEdit', () => engine.proposeNodeEdit(doc, '/fields/0/name', replacement)],
  ]) {
    if (ops[name]) { check(capture(run), ops[name], `${row.name} ${name}`); focusedOperations++; }
  }
  assert.equal(JSON.stringify(doc), before, `${row.name} immutability`);
}

const controls = packet.focused.find(row => row.name === 'operation-errors-and-edit-controls');
const controlDoc = engine.importSchema(controls.inputJson, controls.id);
focusedImports++;
for (const [name, run] of [
  ['get-missing-pointer', () => engine.getNode(controlDoc, '/fields/3/name')],
  ['get-invalid-pointer-escape', () => engine.getNode(controlDoc, '/fields/0/name/~2')],
  ['edit-invalid-json-replacement', () => engine.proposeNodeEdit(controlDoc, '/fields/0/name', '{')],
  ['edit-missing-pointer', () => engine.proposeNodeEdit(controlDoc, '/fields/3/name', '"x"')],
  ['edit-invalid-type', () => engine.proposeNodeEdit(controlDoc, '/fields/0/type', '{"name":"int","bitWidth":7,"isSigned":true}')],
  ['edit-success', () => engine.proposeNodeEdit(controlDoc, '/fields/0/name', '"renamed"')],
]) {
  check(capture(run), controls.operations[name], name);
  focusedOperations++;
}
const representation = packet.focused.find(row => row.name === 'unknown-representation-field');
const representationDoc = engine.importSchema(representation.inputJson, representation.id);
focusedImports++;
representationDoc.modules[0].elements[0].extensions['umf.arrow'].future = {keep: true};
for (const [name, run] of [
  ['inspectArrow', () => engine.inspect(representationDoc)],
  ['exportArrowSchema', () => engine.exportSchema(representationDoc)],
  ['getArrowNode', () => engine.getNode(representationDoc, '/fields/0/name')],
  ['proposeArrowNodeEdit', () => engine.proposeNodeEdit(representationDoc, '/fields/0/name', '"renamed"')],
]) {
  check(capture(run), representation.operations[name], `unknown representation ${name}`);
  focusedOperations++;
}

assert.equal(corpusOperations, 260);
assert.equal(focusedImports, 16);
assert.equal(focusedOperations, 26);
assert.equal(wasmEquivalentCalls, 302);
const setupCancellation = capture(() => createArrowSchemaEngine({setupControls: {isCancelled: () => true}}));
assert.equal(setupCancellation.error.code, 'CANCELLED');
const setupBudget = capture(() => createArrowSchemaEngine({setupControls: {maxWork: 0}}));
assert.equal(setupBudget.error.code, 'RESOURCE_LIMIT');
const callEngine = createArrowSchemaEngine({controls: {isCancelled: () => true}});
assert.equal(capture(() => callEngine.importSchema('{"fields":[]}', 'cancel')).error.code, 'CANCELLED');
callEngine.dispose();
const callBudgetEngine = createArrowSchemaEngine({controls: {maxWork: 0}});
assert.equal(capture(() => callBudgetEngine.importSchema('{"fields":[]}', 'budget')).error.code, 'RESOURCE_LIMIT');
callBudgetEngine.dispose();
engine.dispose();
engine.dispose();
assert.equal(capture(() => engine.inspect({})).error.code, 'RUST_ARROW_SCHEMA_HANDLE_DISPOSED');

console.log(JSON.stringify({
  status: 'pass',
  runtime: typeof Bun === 'undefined' ? `Node ${process.version}` : `Bun ${Bun.version}`,
  platform: `${process.platform}-${process.arch}`,
  elapsedMs: Math.round(performance.now() - started),
  packetSha256: createHash('sha256').update(packetBytes).digest('hex'),
  addonSha256: createHash('sha256').update(addonBytes).digest('hex'),
  corpusCases: packet.corpus.length,
  corpusOperations,
  focusedCases: packet.focused.length,
  focusedImports,
  focusedOperations,
  wasmEquivalentCalls,
  hostSpecificSkipped: ['proxy-reflection-throw-identity: TypeScript preserves proxy trap thrown-object identity, which cannot be transferred through the native JSON wire'],
  controls: 'setup/call cancellation, setup/call RESOURCE_LIMIT, disposed handle',
}, null, 2));
