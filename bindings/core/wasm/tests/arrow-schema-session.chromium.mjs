// SPDX-License-Identifier: MIT OR Apache-2.0
// Replays the opt-in prepared Arrow schema JSON binding in real Chromium.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {gunzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {chromium} from 'playwright';

const root = resolve(import.meta.dir, '../../../..');
const started = performance.now();
const packageDir = resolve(process.argv[2] ?? '/private/tmp/umf-arrow-wasm-session/pkg');
const packetPath = resolve(process.argv[3] ?? `${root}/docs/helix/04-build/evidence/rust-migration/r5-arrow-typescript-predecessor-20261027/typescript-arrow-schema-outcomes.json.gz`);
const packetBytes = await readFile(packetPath);
const packet = JSON.parse(gunzipSync(packetBytes).toString('utf8'));
assert.equal(packet.corpus.length, 52);
assert.equal(packet.focused.length, 17);
const cases = JSON.parse(await readFile(`${root}/fixtures/arrow/schema-cases.json`, 'utf8'));
const wasmJs = await readFile(resolve(packageDir, 'umf_core_wasm.js'));
const wasmBytes = await readFile(resolve(packageDir, 'umf_core_wasm_bg.wasm'));
const bindingBuild = await Bun.build({entrypoints: [`${root}/bindings/core/wasm/index.js`], target: 'browser', format: 'esm', write: false});
const oracleBuild = await Bun.build({entrypoints: [`${root}/src/adapters/arrow/index.ts`], target: 'browser', format: 'esm', write: false});
assert.equal(bindingBuild.success, true, JSON.stringify(bindingBuild.logs));
assert.equal(oracleBuild.success, true, JSON.stringify(oracleBuild.logs));
const modules = new Map([
  ['/binding.js', await bindingBuild.outputs[0].text()],
  ['/oracle.js', await oracleBuild.outputs[0].text()],
  ['/cases.json', JSON.stringify(cases)],
  ['/packet.json', JSON.stringify(packet)],
  ['/pkg/umf_core_wasm.js', wasmJs],
  ['/pkg/umf_core_wasm_bg.wasm', wasmBytes],
]);
const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (pathname === '/') {
    response.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
    response.end('<!doctype html><meta charset="utf-8"><title>Arrow schema WASM session</title>');
    return;
  }
  const value = modules.get(pathname);
  if (value === undefined) { response.writeHead(404); response.end('missing'); return; }
  const type = pathname.endsWith('.wasm') ? 'application/wasm' : pathname.endsWith('.json') ? 'application/json' : 'text/javascript';
  response.writeHead(200, {'content-type': type});
  response.end(value);
});
await new Promise(resolveListen => server.listen(Number(process.env.UMF_CHROMIUM_PORT ?? 41731), '127.0.0.1', resolveListen));
const address = server.address();
assert(address && typeof address !== 'string');
let browser;
try {
  browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto(`http://127.0.0.1:${address.port}/`);
  const result = await page.evaluate(async () => {
    const cases = await fetch('/cases.json').then(response => response.json());
    const packet = await fetch('/packet.json').then(response => response.json());
    const wasm = await import('/pkg/umf_core_wasm.js');
    await wasm.default('/pkg/umf_core_wasm_bg.wasm');
    const {createArrowSchemaEngine} = await import('/binding.js');
    const oracle = await import('/oracle.js');
    let wasmCalls = 0;
    const runtimePrototype = wasm.ArrowSchemaResourcesRuntime.prototype;
    const executeWire = runtimePrototype.executeWire;
    runtimePrototype.executeWire = function (...args) {
      wasmCalls++;
      return Reflect.apply(executeWire, this, args);
    };
    const engine = createArrowSchemaEngine(wasm);
    const capture = run => {
      try { return {kind: 'return', value: run()}; }
      catch (error) { return {kind: 'throw', error: {code: error?.code ?? null, path: error?.path ?? null, message: error?.message ?? String(error)}}; }
    };
    const same = (actual, expected, label) => {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} mismatch`);
    };
    const sameOutcome = (actual, expected, label) => {
      if (actual.kind !== expected.kind) throw new Error(`${label} kind mismatch`);
      if (expected.kind === 'return') same(actual.value, expected.value, label);
      else same(actual.error, {code: expected.error.code, path: expected.error.path, message: expected.error.message}, label);
    };
    const source = row => row.inputJson ?? JSON.stringify(row.input);
    let corpusCalls = 0;
    for (const row of cases) {
      const json = JSON.stringify(row.input);
      const tsDocument = oracle.importArrowSchema(json, {id: row.id});
      const document = engine.importSchema(json, row.id);
      same(document, tsDocument, `corpus import ${row.id}`); corpusCalls++;
      same(engine.inspect(document), oracle.inspectArrow(tsDocument), `corpus inspect ${row.id}`); corpusCalls++;
      same(engine.exportSchema(document), oracle.exportArrowSchema(tsDocument), `corpus export ${row.id}`); corpusCalls++;
      same(engine.getNode(document, ''), oracle.getArrowNode(tsDocument, ''), `corpus getNode ${row.id}`); corpusCalls++;
      const before = JSON.stringify(document);
      const expectedEdit = oracle.proposeArrowNodeEdit(tsDocument, '/fields/0/name', JSON.stringify(`${row.id}-edited`));
      const actualEdit = engine.proposeNodeEdit(document, '/fields/0/name', JSON.stringify(`${row.id}-edited`));
      same(actualEdit, expectedEdit, `corpus edit ${row.id}`);
      same(JSON.stringify(document), before, `corpus immutability ${row.id}`); corpusCalls++;
    }

    let focusedImports = 0;
    let focusedOperations = 0;
    for (const row of packet.focused) {
      if (row.name === 'proxy-reflection-throw-identity') continue;
      if (row.import) {
        const actual = capture(() => engine.importSchema(row.inputJson, row.id));
        sameOutcome(actual, row.import, `focused import ${row.name}`);
        focusedImports++;
        if (row.import.kind === 'return') {
          const document = actual.value;
          const before = JSON.stringify(document);
          const getPointer = row.name === 'future-type-duplicate-metadata-exact-numbers'
            ? '/fields/0/type/parameter'
            : row.name === 'dictionary-scientific-integer' || row.name === 'map-layout' || row.name === 'run-end-layout'
              ? '/fields/0' : '';
          const replacement = row.name === 'future-type-duplicate-metadata-exact-numbers'
            ? '"changed"' : JSON.stringify(`${row.id}-edited`);
          const operations = row.operations ?? {};
          if (operations.inspectArrow) { same(JSON.stringify(engine.inspect(document)), operations.inspectArrow.outputJson, `focused inspect ${row.name}`); focusedOperations++; }
          if (operations.exportArrowSchema) { same(engine.exportSchema(document), operations.exportArrowSchema.value, `focused export ${row.name}`); focusedOperations++; }
          if (operations.getArrowNode) {
            const pointer = row.name === 'future-type-duplicate-metadata-exact-numbers' ? '/fields/0/type/parameter' : getPointer;
            same(JSON.stringify(engine.getNode(document, pointer)), operations.getArrowNode.outputJson, `focused get ${row.name}`); focusedOperations++;
          }
          if (operations.proposeArrowNodeEdit) {
            const editText = row.name === 'future-type-duplicate-metadata-exact-numbers' ? '"changed"' : replacement;
            same(JSON.stringify(engine.proposeNodeEdit(document, '/fields/0/name', editText)), operations.proposeArrowNodeEdit.outputJson, `focused edit ${row.name}`); focusedOperations++;
          }
          same(JSON.stringify(document), before, `focused source immutability ${row.name}`);
        }
      }
    }

    const controls = packet.focused.find(row => row.name === 'operation-errors-and-edit-controls');
    const controlDoc = engine.importSchema(controls.inputJson, controls.id); focusedImports++;
    const controlRuns = [
      ['get-missing-pointer', () => engine.getNode(controlDoc, '/fields/3/name')],
      ['get-invalid-pointer-escape', () => engine.getNode(controlDoc, '/fields/0/name/~2')],
      ['edit-invalid-json-replacement', () => engine.proposeNodeEdit(controlDoc, '/fields/0/name', '{')],
      ['edit-missing-pointer', () => engine.proposeNodeEdit(controlDoc, '/fields/3/name', '"x"')],
      ['edit-invalid-type', () => engine.proposeNodeEdit(controlDoc, '/fields/0/type', '{"name":"int","bitWidth":7,"isSigned":true}')],
      ['edit-success', () => engine.proposeNodeEdit(controlDoc, '/fields/0/name', '"renamed"')],
    ];
    for (const [name, run] of controlRuns) {
      const expected = controls.operations[name];
      const actual = capture(run);
      sameOutcome(actual, expected, `focused operation ${name}`);
      focusedOperations++;
    }

    const representation = packet.focused.find(row => row.name === 'unknown-representation-field');
    const representationDoc = engine.importSchema(representation.inputJson, representation.id); focusedImports++;
    representationDoc.modules[0].elements[0].extensions['umf.arrow'].future = {keep: true};
    const representationOps = representation.operations;
    same(JSON.stringify(engine.inspect(representationDoc)), representationOps.inspectArrow.outputJson, 'unknown representation inspect'); focusedOperations++;
    const exportOutcome = capture(() => engine.exportSchema(representationDoc));
    sameOutcome(exportOutcome, representationOps.exportArrowSchema, 'unknown representation export'); focusedOperations++;
    same(JSON.stringify(engine.getNode(representationDoc, '/fields/0/name')), representationOps.getArrowNode.outputJson, 'unknown representation get'); focusedOperations++;
    same(JSON.stringify(engine.proposeNodeEdit(representationDoc, '/fields/0/name', '"renamed"')), representationOps.proposeArrowNodeEdit.outputJson, 'unknown representation edit'); focusedOperations++;

    const setupBudget = capture(() => createArrowSchemaEngine(wasm, {setupControls: {maxWork: 0}}));
    if (setupBudget.kind !== 'throw' || setupBudget.error.code !== 'RESOURCE_LIMIT') throw new Error('setup work budget was not enforced');
    const setupCancellation = capture(() => createArrowSchemaEngine(wasm, {setupControls: {isCancelled: () => true}}));
    if (setupCancellation.kind !== 'throw' || setupCancellation.error.code !== 'CANCELLED') throw new Error('setup cancellation was not enforced');
    const callEngine = createArrowSchemaEngine(wasm, {controls: {isCancelled: () => true}});
    const callCancellation = capture(() => callEngine.importSchema('{"fields":[]}', 'cancelled'));
    if (callCancellation.kind !== 'throw' || callCancellation.error.code !== 'CANCELLED') throw new Error('call cancellation was not enforced');
    callEngine.dispose();
    const budgetEngine = createArrowSchemaEngine(wasm, {controls: {maxWork: 0}});
    const callBudget = capture(() => budgetEngine.importSchema('{"fields":[]}', 'budget'));
    if (callBudget.kind !== 'throw' || callBudget.error.code !== 'RESOURCE_LIMIT') throw new Error('call work budget was not enforced');
    budgetEngine.dispose();
    engine.dispose(); engine.dispose();
    const disposed = capture(() => engine.inspect({}));
    if (disposed.kind !== 'throw' || disposed.error.code !== 'RUST_ARROW_SCHEMA_HANDLE_DISPOSED') throw new Error('disposed engine remained callable');
    if (typeof process !== 'undefined' || typeof Buffer !== 'undefined') throw new Error('Node globals leaked into Chromium');
    return {corpusCases: cases.length, corpusOperations: corpusCalls, focusedCases: packet.focused.length, focusedImports, focusedOperations, wasmCalls, proxyReflectionIdentity: 'host-specific TypeScript behavior not represented over WASM'};
  });
  assert.deepEqual(pageErrors, []);
  assert.equal(result.corpusCases, 52);
  assert.equal(result.corpusOperations, 260);
  assert.equal(result.focusedCases, 17);
  assert.equal(result.wasmCalls, 302);
  console.log(JSON.stringify({status: 'pass', browser: browser.version(), elapsedMs: Math.round(performance.now() - started), wasmSha256: createHash('sha256').update(wasmBytes).digest('hex'), wasmJsSha256: createHash('sha256').update(wasmJs).digest('hex'), packetSha256: createHash('sha256').update(packetBytes).digest('hex'), bindingBundleSha256: createHash('sha256').update(await bindingBuild.outputs[0].text()).digest('hex'), oracleBundleSha256: createHash('sha256').update(await oracleBuild.outputs[0].text()).digest('hex'), ...result}, null, 2));
} finally {
  await browser?.close();
  server.close();
}
