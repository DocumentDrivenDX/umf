import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const packageRoot = resolve(process.env.UMF_R8_WASM_PACKAGE ?? '');
const receiptPath = process.env.UMF_R8_BROWSER_RECEIPT;
if (!process.env.UMF_R8_WASM_PACKAGE || !receiptPath) throw new Error('Set UMF_R8_WASM_PACKAGE and UMF_R8_BROWSER_RECEIPT');
const evidence = resolve(root, 'docs/helix/04-build/evidence/rust-migration');
const facadeBytes = await readFile(resolve(evidence, 'r5-json-schema-bindings/predecessor.json'));
const editBytes = await readFile(resolve(evidence, 'r5-json-schema-tree-operations/predecessor.json'));
const replayBytes = await readFile(new URL(import.meta.url));
const preparedRuntime = process.env.UMF_R8_PREPARED_RUNTIME === '1';
const facade = JSON.parse(facadeBytes);
const editPacket = JSON.parse(editBytes);
const editCases = editPacket.cases.filter(test => test.id.startsWith('edit.'));
const mime = path => path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (pathname === '/') { response.writeHead(200, {'content-type': 'text/html'}); response.end('<!doctype html><meta charset="utf-8">'); return; }
  if (!pathname.startsWith('/package/')) { response.writeHead(404).end(); return; }
  const file = resolve(packageRoot, `.${decodeURIComponent(pathname.slice('/package'.length))}`);
  if (!file.startsWith(`${packageRoot}${sep}`)) { response.writeHead(403).end(); return; }
  try { response.writeHead(200, {'content-type': mime(file), 'cache-control': 'no-store'}).end(await readFile(file)); }
  catch { response.writeHead(404).end('missing'); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Browser server did not start');
let browser;
try {
  browser = await chromium.launch({headless: true, timeout: 30_000, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`);
  const result = await page.evaluate(async ({facade, editCases, preparedRuntime}) => {
    const wrapper = await import('/package/index.js');
    const wasm = await import('/package/pkg/umf_core_wasm.js');
    const wasmBytes = await fetch('/package/pkg/umf_core_wasm_bg.wasm').then(response => response.arrayBuffer());
    await wasm.default({module: wasmBytes});
    const makeEngine = (options = {}) => preparedRuntime
      ? wrapper.createPreparedJsonSchemaEngine(wasm, options)
      : wrapper.createJsonSchemaEngine(wasm, options);
    const engine = makeEngine();
    const baseUri = 'https://schemas.example.test/root.json';
    const normalize = value => JSON.parse(JSON.stringify(value));
    const outcome = fn => { try { return {status: 'returned', value: normalize(fn())}; } catch (error) { return {status: 'threw', name: error?.name ?? 'Error', code: error?.code ?? null, message: error?.message ?? String(error)}; } };
    const documentFor = (input, id) => input.document !== undefined ? input.document : engine.importJsonSchema(input.schema ?? input.source, input.options ?? {id, baseUri});
    const replayFacade = test => {
      const input = test.input ?? {};
      if (test.id.startsWith('import.')) {
        const options = input.options ?? {id: input.id, baseUri: input.baseUri, resources: Object.fromEntries(input.resources ?? [])};
        if (options.resources && Array.isArray(options.resources)) options.resources = Object.fromEntries(options.resources);
        return outcome(() => engine.importJsonSchema(input.text, options));
      }
      if (test.id === 'inspect-escaped-surrogate-key-diagnostic') return outcome(() => engine.inspectJsonSchema(engine.importJsonSchema(input.source, {id: 'urn:umf:r5:surrogate-diagnostic', baseUri})));
      if (test.id === 'get-literal-surrogate-utf16-pointer') return outcome(() => engine.getJsonSchemaNode(documentFor(input, 'urn:umf:r5:utf16-key'), input.pointer));
      if (test.id === 'copy-isolation-get-bundle-walk') return outcome(() => {
        const snapshot = {getNode: engine.getJsonSchemaNode(input.document, '/properties/x'), bundle: engine.exportJsonSchemaBundle(input.document), walk: engine.walkJsonSchema(input.document)};
        const before = normalize(snapshot);
        snapshot.getNode.kind = 'null'; snapshot.bundle.source.id = 'mutated'; snapshot.bundle.resources['https://schemas.example.test/z.json'] = 'mutated';
        if (snapshot.walk[1]) snapshot.walk[1].node.kind = 'null';
        return {preMutationSnapshot: before, mutatedReturnedCopies: snapshot, postMutationRereads: {getNode: engine.getJsonSchemaNode(input.document, '/properties/x'), bundle: engine.exportJsonSchemaBundle(input.document), walk: engine.walkJsonSchema(input.document)}};
      });
      const document = documentFor(input, `urn:umf:r5:${test.id}`);
      if (test.id.startsWith('inspect')) return outcome(() => engine.inspectJsonSchema(document));
      if (test.id.startsWith('export.resources')) return outcome(() => engine.exportJsonSchemaResources(document));
      if (test.id.startsWith('export.bundle')) return outcome(() => engine.exportJsonSchemaBundle(document));
      if (test.id.startsWith('export')) return outcome(() => engine.exportJsonSchema(document));
      if (test.id.startsWith('get-and-walk-')) return outcome(() => ({get: outcome(() => engine.getJsonSchemaNode(document, input.pointer)), walk: engine.walkJsonSchema(document)}));
      if (test.id.startsWith('get')) return outcome(() => engine.getJsonSchemaNode(document, input.pointer));
      if (test.id.startsWith('walk')) return outcome(() => engine.walkJsonSchema(document));
      throw new Error(`No JSON Schema façade replay mapping for ${test.id}`);
    };
    const replayEdit = test => {
      const input = test.input ?? {};
      const schema = input.schema ?? (test.id === 'edit.incomplete-schema-refused' ? '{"$schema":"https://example.test/custom","type":"object"}' : '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"amount":{"type":"number","minimum":0},"text":{"type":"string","minLength":1}},"$defs":{"nested":{"type":"string"}}}');
      const identity = test.id.includes('array-pointer') ? 'urn:umf:r5:tree-array' : test.id.includes('escaped-pointer') ? 'urn:umf:r5:tree-escaped' : test.id.includes('lone-surrogate') ? 'urn:umf:r5:tree-surrogate' : test.id.includes('incomplete-schema') ? 'urn:umf:r5:tree-unknown' : 'urn:umf:r5:tree';
      const original = {umf: '0.10.0', id: identity, vocabularies: {'umf.json-schema': {version: '0.1.0'}}, modules: [{id: 'schema', namespace: 'https://schemas.example.test/tree.json', elements: [{id: 'schema', extensions: {'umf.json-schema': {dialect: 'https://json-schema.org/draft/2020-12/schema', baseUri: 'https://schemas.example.test/tree.json', root: engine.parseNativeJson(schema), resources: {}}}}]}]};
      if (test.id === 'edit.invalid-source-before-target-lookup') original.id = '';
      const before = JSON.stringify(original);
      try {
        if (test.id === 'edit.escaped-pointer-and-astral-key-success') {
          const slash = engine.editJsonSchemaNode(original, input.pointers[0], input.replacement);
          const astral = engine.editJsonSchemaNode(original, input.pointers[1], '"integer"');
          return {status: 'returned', value: {slashEditedSource: engine.exportJsonSchema(slash), astralEditedSource: engine.exportJsonSchema(astral), sourceUnchanged: JSON.stringify(original) === before}};
        }
        const edited = engine.editJsonSchemaNode(original, input.pointer, input.replacement);
        if (test.id === 'edit.success.changed-number-and-source-unchanged') return {status: 'returned', value: {edited: normalize(edited), editedSource: engine.exportJsonSchema(edited), sourceUnchanged: JSON.stringify(original) === before}};
        if (test.id === 'edit.lone-surrogate-schema-refused-atomically') return {status: 'returned', value: {edited: normalize(edited), sourceUnchanged: JSON.stringify(original) === before}};
        return {status: 'returned', value: normalize(edited)};
      } catch (error) {
        const thrown = {name: error?.name ?? 'Error', code: error?.code ?? null, path: error?.path ?? null, message: error?.message ?? String(error)};
        if (test.id === 'edit.lone-surrogate-schema-refused-atomically') return {status: 'returned', value: {refusal: thrown, sourceUnchanged: JSON.stringify(original) === before}};
        return {status: 'threw', ...thrown};
      }
    };
    const rows = [...facade.cases.map(test => ({id: `facade:${test.id}`, expected: test.outcome, actual: replayFacade(test)})), ...editCases.map(test => ({id: `edit:${test.id}`, expected: test.outcome, actual: replayEdit(test)}))];
    const mismatches = rows.filter(row => JSON.stringify(row.expected) !== JSON.stringify(row.actual)).map(({id, expected, actual}) => ({id, expected, actual}));
    const controlSource = '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"x":{"type":"number"}},"$defs":{"nested":{"type":"string"}}}';
    const controlDocument = makeEngine().importJsonSchema(controlSource, {id: 'urn:umf:r5:control-probe', baseUri: 'https://schemas.example.test/controls.json'});
    const controlCases = [];
    const runControl = (id, controls, operation = 'walkJsonSchema') => {
      let meterCalls = 0;
      const observed = controls ? {...controls, ...(controls.meter ? {meter: amount => { meterCalls++; controls.meter(amount); }} : {})} : undefined;
      const configured = makeEngine(observed ? {controls: observed} : {});
      let actual;
      try { actual = {status: 'returned', value: normalize(configured[operation](controlDocument))}; }
      catch (error) { actual = {status: 'threw', name: error?.name ?? 'Error', code: error?.code ?? null, message: error?.message ?? String(error), path: error?.path ?? ''}; }
      controlCases.push({id, operation, meterCalls, actual});
      return meterCalls;
    };
    runControl('controls.max-work-preflight', {maxWork: 0});
    runControl('controls.cancelled-preflight', {isCancelled: () => true});
    runControl('controls.deadline-preflight', {deadlineMs: 10, now: () => 11});
    runControl('controls.meter-first-hook-failure', {meter: () => { throw new Error('r5-meter-first-hook'); }});
    let lateCalls = 0;
    runControl('controls.meter-late-hook-failure', {meter: () => { lateCalls++; if (lateCalls === 4) throw new Error('r5-meter-late-hook'); }}, 'exportJsonSchemaBundle');
    controlCases[controlCases.length - 1].userMeterCalls = lateCalls;
    const expectedCodes = ['RESOURCE_LIMIT', 'CANCELLED', 'DEADLINE', 'METER_FAILURE', 'METER_FAILURE'];
    const controlsMatched = controlCases.filter((item, index) => item.actual.status === 'threw' && item.actual.code === expectedCodes[index] && (index !== 4 || item.userMeterCalls === 4)).length;
    const setupControls = [];
    if (preparedRuntime) {
      const setupProbe = (id, resourceControls) => {
        let setupMeterCalls = 0;
        let setupMeterUnits = 0;
        try {
          wrapper.createPreparedJsonSchemaEngine(wasm, {resourceControls: {...resourceControls, meter: resourceControls?.meter ? amount => { setupMeterCalls++; setupMeterUnits += amount; return resourceControls.meter(amount); } : undefined}});
          setupControls.push({id, status: 'returned', setupMeterCalls, setupMeterUnits});
        } catch (error) {
          setupControls.push({id, status: 'threw', name: error?.name ?? 'Error', code: error?.code ?? null, message: error?.message ?? String(error), setupMeterCalls, setupMeterUnits});
        }
      };
      setupProbe('setup.resource-meter', {meter: () => {}});
      setupProbe('setup.max-work-zero', {maxWork: 0});
      setupProbe('setup.meter-callback-failure', {meter: () => { throw new Error('r8-resource-meter-hook'); }});
      let operationFactoryConstructed = false;
      try {
        const configured = makeEngine({controls: {maxWork: 0}});
        operationFactoryConstructed = true;
        configured.walkJsonSchema(controlDocument);
        setupControls.push({id: 'setup.operation-controls-separate', status: 'unexpected-return', operationFactoryConstructed});
      } catch (error) {
        setupControls.push({id: 'setup.operation-controls-separate', status: 'threw', code: error?.code ?? null, operationFactoryConstructed});
      }
    }
    return {engineFactory: preparedRuntime ? 'createPreparedJsonSchemaEngine' : 'createJsonSchemaEngine', browser: navigator.userAgent, browserGlobalsClean: typeof process === 'undefined' && typeof Buffer === 'undefined', facadeCases: facade.cases.length, editCases: editCases.length, caseCount: rows.length, matched: rows.length - mismatches.length, outcomeCounts: rows.reduce((counts, row) => { counts[row.actual.status] = (counts[row.actual.status] ?? 0) + 1; return counts; }, {}), mismatches, controlCases, controlsMatched, setupControls, rows};
  }, {facade, editCases, preparedRuntime});
  assert.equal(result.browserGlobalsClean, true);
  const receipt = {
    format: 'umf-r8-json-schema-eight-operations-chromium-replay/1',
    engineFactory: result.engineFactory,
    status: result.matched === result.caseCount ? 'pass' : 'mismatch',
    chromium: browser.version(),
    packetHashes: {facadeSeven: createHash('sha256').update(facadeBytes).digest('hex'), treeEditPredecessor: createHash('sha256').update(editBytes).digest('hex')},
    replayScriptSha256: createHash('sha256').update(replayBytes).digest('hex'),
    packageRoot, wrapperSha256: createHash('sha256').update(await readFile(resolve(packageRoot, 'index.js'))).digest('hex'),
    wasmJsSha256: createHash('sha256').update(await readFile(resolve(packageRoot, 'pkg/umf_core_wasm.js'))).digest('hex'),
    wasmSha256: createHash('sha256').update(await readFile(resolve(packageRoot, 'pkg/umf_core_wasm_bg.wasm'))).digest('hex'),
    ...result,
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({...receipt, rows: undefined}));
  assert.equal(result.matched, result.caseCount, JSON.stringify(result.mismatches));
  assert.equal(result.controlsMatched, 5, JSON.stringify(result.controlCases));
} finally { await browser?.close(); server.close(); }
