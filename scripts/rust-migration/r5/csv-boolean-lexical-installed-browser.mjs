// SPDX-License-Identifier: MIT OR Apache-2.0
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join, resolve, extname} from 'node:path';
import {chromium} from 'playwright';

const site = resolve(process.argv[2]);
const repo = resolve(process.argv[3]);
const receiptPath = resolve(process.argv[4]);
const resourceDir = join(site, 'resources');
await mkdir(resourceDir, {recursive: true});
const readJson = async path => JSON.parse(await readFile(join(repo, path), 'utf8'));
const resources = {
  coreSchema: await readJson('spec/core/schema.json'),
  referenceSchema: await readJson('spec/core/semantic-type-reference.schema.json'),
  packageSchema: await readJson('spec/core/extension-package.schema.json'),
  constraints: await readJson('spec/metamodel/generated/core-constraints.json'),
  domainPolicy: await readJson('spec/metamodel/generated/domain-policy.json'),
};
await writeFile(join(resourceDir, 'resources.json'), JSON.stringify(resources));
await writeFile(join(resourceDir, 'ontology.json'), await readFile(join(repo, 'spec/domain-packs/medical/ontology.json')));
await writeFile(join(site, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body>CSV Boolean WASM replay</body></html>');
const mime = {'.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.html': 'text/html'};
const server = Bun.serve({port: 0, async fetch(request) {
  const url = new URL(request.url);
  const path = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const absolute = join(site, path);
  if (!absolute.startsWith(`${site}/`)) return new Response('bad path', {status: 400});
  try { return new Response(await Bun.file(absolute).arrayBuffer(), {headers: {'content-type': mime[extname(absolute)] ?? 'application/octet-stream'}}); }
  catch { return new Response('not found', {status: 404}); }
}});
const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(180_000);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.port}/`, {waitUntil: 'load'});
  const outcome = await page.evaluate(async () => {
    const capture = run => {
      try { return {status: 'accepted', value: run()}; }
      catch (error) { return {status: 'refused', code: error?.code ?? null, path: error?.path ?? '', message: error?.message ?? String(error)}; }
    };
    const [lib, wire] = await Promise.all([import('/index.js'), import('/src/wire.js')]);
    const wasm = await import('/pkg/umf_core_wasm.js');
    await wasm.default();
    const resources = await (await fetch('/resources/resources.json')).json();
    const source = await (await fetch('/resources/ontology.json')).json();
    const engine = lib.createCoreModelEngine(wasm, resources);
    const request = (token, sourceContext = {source: 'original.csv', row: 1, unknown: ['雪', null]}) => ({
      profile: 'umf.csv-boolean-lexical/1.0.0',
      field: {module: 'domain', element: 'patients.active'},
      token, sourceContext,
    });
    const outcomes = {};
    for (const [token, boolean] of [['true', true], ['false', false], ['True', true], ['False', false]]) {
      const receipt = engine.validateCsvBooleanLexical(source, request(token));
      if (receipt.value.boolean !== boolean) throw new Error(`token mismatch ${token}`);
      if (engine.verifyCsvBooleanLexical(receipt, source, request(token)).value.boolean !== boolean) throw new Error(`verify mismatch ${token}`);
      outcomes[`token:${token}`] = {boolean, validation: receipt.validation};
    }
    let getterCalls = 0;
    const unread = Object.defineProperty({}, 'umf', {enumerable: true, get() { getterCalls++; return '0.10.0'; }});
    outcomes.malformedReceiptBeforeExpectedInputs = {refusal: capture(() => engine.verifyCsvBooleanLexical({}, unread, request('true'))), getterCalls};
    const valid = engine.validateCsvBooleanLexical(source, request('true'));
    outcomes.crossedInvalidExpectedSourceAndRequest = capture(() => engine.verifyCsvBooleanLexical(valid, {}, {...request('true'), profile: 'future'}));
    const astralAndLone = request('True', {opaque: 'astral:😀; lone:\ud800'});
    const echoed = engine.validateCsvBooleanLexical(source, astralAndLone);
    if (echoed.request.sourceContext.opaque !== astralAndLone.sourceContext.opaque) throw new Error('UTF-16 round trip changed astral/lone-surrogate text');
    outcomes.astralAndLoneSurrogatePreserved = true;
    const size = value => new TextEncoder().encode(JSON.stringify(value)).length;
    const missing = {profile: 'umf.csv-boolean-lexical/1.0.0', field: {module: 'domain', element: 'patients.active'}, sourceContext: ''};
    const exactContext = 'x'.repeat(4_000_000 - size({source, request: missing}));
    const exact = {...missing, sourceContext: exactContext};
    const over = {...missing, sourceContext: `${exactContext}x`};
    outcomes.sourceRequestByteCeiling = {exactBytes: size({source, request: exact}), exact: capture(() => engine.validateCsvBooleanLexical(source, exact)), overBytes: size({source, request: over}), over: capture(() => engine.validateCsvBooleanLexical(source, over))};
    const empty = engine.validateCsvBooleanLexical(source, request('true', ''));
    const receiptBytes = size(empty);
    const at = request('true', 'x'.repeat(4_000_000 - receiptBytes));
    const above = request('true', `${at.sourceContext}x`);
    outcomes.fullReceiptByteCeiling = {exactBytes: size(engine.validateCsvBooleanLexical(source, at)), exact: capture(() => engine.validateCsvBooleanLexical(source, at)).status, over: capture(() => engine.validateCsvBooleanLexical(source, above))};
    const direct = JSON.parse(wasm.executeRequestWire(wire.encodeRequestWire({op: 'model/finishCsvBooleanLexicalVerification', resources, registry: [], preparedReceipt: {forged: true}, source, csvRequest: request('true')}), 'cooperative', () => ''));
    if (direct.status !== 'error' || direct.code !== 'CSV_BOOLEAN_LEXICAL') throw new Error('forged direct-wire prepared receipt accepted');
    outcomes.directWireForgedPreparedReceipt = {status: direct.status, code: direct.code, messageUnits: direct.messageUnits};
    return {outcomes, userAgent: navigator.userAgent};
  });
  if (errors.length) throw new Error(`browser errors: ${errors.join('; ')}`);
  const fileSha = async path => createHash('sha256').update(await readFile(path)).digest('hex');
  const receipt = {
    format: 'umf-r5-csv-boolean-lexical-installed-browser/1',
    browser: {userAgent: outcome.userAgent},
    wasmArtifactSha256: await fileSha(join(site, 'pkg/umf_core_wasm_bg.wasm')),
    sourceHashes: {
      'crates/umf-core/src/csv_boolean_lexical.rs': await fileSha(join(repo, 'crates/umf-core/src/csv_boolean_lexical.rs')),
      'crates/umf-core-wire/src/lib.rs': await fileSha(join(repo, 'crates/umf-core-wire/src/lib.rs')),
      'bindings/core/wasm/index.js': await fileSha(join(repo, 'bindings/core/wasm/index.js')),
      'bindings/core/wasm/src/csv-boolean-lexical.js': await fileSha(join(repo, 'bindings/core/wasm/src/csv-boolean-lexical.js')),
    },
    outcomes: outcome.outcomes,
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt));
} finally {
  await browser.close();
  server.stop();
}
