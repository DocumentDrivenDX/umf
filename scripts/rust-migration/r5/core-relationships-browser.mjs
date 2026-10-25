// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay the frozen relationship packet against an extracted WASM package in Chromium.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve, sep} from 'node:path';
import {chromium} from 'playwright';

const root = resolve(process.env.UMF_R5_REPO_ROOT ?? new URL('../../../', import.meta.url).pathname);
const pkgRoot = resolve(process.env.UMF_R5_WASM_PACKAGE ?? '');
assert.ok(process.env.UMF_R5_WASM_PACKAGE, 'UMF_R5_WASM_PACKAGE must be the extracted candidate package');
const read = path => readFile(resolve(root, path));
const [frozenBytes, ...resourceBytes] = await Promise.all([
  read('docs/helix/04-build/evidence/rust-migration/r5-core-relationships/frozen-typescript.json'),
  ...[
    'spec/core/schema.json', 'spec/core/semantic-type-reference.schema.json',
    'spec/core/extension-package.schema.json', 'spec/metamodel/generated/core-constraints.json',
    'spec/metamodel/generated/domain-policy.json',
  ].map(read),
]);
const frozen = JSON.parse(frozenBytes);
const resourceNames = ['coreSchema', 'referenceSchema', 'packageSchema', 'constraints', 'domainPolicy'];
const inputs = JSON.stringify({frozen, resources: Object.fromEntries(resourceNames.map((name, i) => [name, JSON.parse(resourceBytes[i])]))});
const mime = path => path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (pathname === '/') { response.writeHead(200, {'content-type': 'text/html'}); response.end('<!doctype html>'); return; }
  if (pathname === '/inputs.json') { response.writeHead(200, {'content-type': 'application/json'}); response.end(inputs); return; }
  const suffix = decodeURIComponent(pathname.replace(/^\/package\//, ''));
  const local = resolve(pkgRoot, suffix);
  if (pathname.startsWith('/package/') && (local === pkgRoot || local.startsWith(`${pkgRoot}${sep}`))) {
    try { response.writeHead(200, {'content-type': mime(local), 'cache-control': 'no-store'}); response.end(await readFile(local)); return; }
    catch { /* 404 below */ }
  }
  response.writeHead(404); response.end('missing');
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const browser = await chromium.launch({headless: true, timeout: 30000, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`);
  const result = await page.evaluate(async () => {
    const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
      : value !== null && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
      : JSON.stringify(value);
    const {frozen, resources} = await fetch('/inputs.json').then(response => response.json());
    const wrapper = await import(new URL('/package/index.js', location.href));
    const wasm = await import(new URL('/package/pkg/umf_core_wasm.js', location.href));
    const api = await wrapper.initializeCoreModelWasm(resources, () => Promise.resolve(wasm), globalThis);
    const operations = {
      inspect_known: c => api.inspectCoreRelationships(c.source, c.identity),
      inspect_missing: c => api.inspectCoreRelationships(c.source, c.identity),
      lookup_stable_id: c => api.lookupCoreRelationship(c.source, c.identity),
      inspect_unknown_meaning: c => api.inspectCoreRelationships(c.source, c.identity),
      lookup_unknown_meaning: c => api.lookupCoreRelationship(c.source, c.identity),
      author_new_relationship: c => api.declareCoreRelationship(c.source, c.identity, c.request),
      aggregate_output_limit_refusal: c => api.declareCoreRelationship(c.source, c.identity, c.request),
      presentation_edit_preserves_unknowns: c => api.declareCoreRelationship(c.source, c.identity, c.request),
      unknown_meaning_edit_refused: c => api.declareCoreRelationship(c.source, c.identity, c.request),
      stable_id_endpoint_change_refused: c => api.declareCoreRelationship(c.source, c.identity, c.request),
      lookup_absent_id: c => api.lookupCoreRelationship(c.source, c.identity),
      invalid_identity_before_invalid_source: c => api.inspectCoreRelationships(c.source, c.identity),
      invalid_lookup_identity_before_invalid_source: c => api.lookupCoreRelationship(c.source, c.identity),
      invalid_request_before_invalid_source: c => api.declareCoreRelationship(c.source, c.identity, c.request),
      old_core_version_refused: c => api.inspectCoreRelationships(c.source, c.identity),
      future_lifecycle_edit_refused: c => api.declareCoreRelationship(c.source, c.identity, c.request),
      unknown_path_utf16_and_pointer_escape: c => ({view: api.lookupCoreRelationship(c.source, c.identity), expectedPath: c.expectedPath}),
    };
    const capture = run => { try { return {ok: true, value: run()}; } catch (error) { return {ok: false, error: {code: error.code ?? '', message: error.message ?? String(error), path: error.path ?? ''}}; } };
    for (const [name, operation] of Object.entries(operations)) {
      const actual = capture(() => operation(frozen.cases[name]));
      if (canonical(actual) !== canonical(frozen.outcomes[name])) throw Error(`${name} frozen outcome mismatch: ${canonical(actual)}`);
    }
    const author = frozen.cases.author_new_relationship;
    const receipt = api.declareCoreRelationship(author.source, author.identity, author.request);
    for (const [format, value] of [['json', api.readValue(api.writeValue(receipt, 'json'), 'json')], ['yaml', api.readValue(api.writeValue(receipt, 'yaml'), 'yaml')]]) {
      const actual = capture(() => api.verifyCoreRelationshipOperation(value, receipt.target));
      if (canonical(actual) !== canonical(frozen.outcomes[`verify_roundtrip_${format}`])) throw Error(`${format} receipt mismatch`);
    }
    const forged = structuredClone(receipt); forged.provenance.idealPath = '/wrong';
    if (canonical(capture(() => api.verifyCoreRelationshipOperation(forged, receipt.target))) !== canonical(frozen.outcomes.verify_forged_receipt)) throw Error('forged receipt mismatch');
    const source = structuredClone(frozen.cases.inspect_known.source);
    const result = api.inspectCoreRelationships(source, frozen.cases.inspect_known.identity);
    result.source.extensions.future.unknown[0] = 'mutated-result';
    if (source.extensions.future.unknown[0] !== '9007199254740993') throw Error('WASM copy isolation mismatch');
    let zero = '', cancelled = '', deadline = '';
    try { wrapper.createCoreModelEngine(wasm, resources, {controls: {maxWork: 0}}).inspectCoreRelationships(frozen.cases.inspect_missing.source, frozen.cases.inspect_missing.identity); } catch (error) { zero = error.code; }
    try { wrapper.createCoreModelEngine(wasm, resources, {controls: {isCancelled: () => true}}).inspectCoreRelationships(frozen.cases.inspect_missing.source, frozen.cases.inspect_missing.identity); } catch (error) { cancelled = error.code; }
    try { wrapper.createCoreModelEngine(wasm, resources, {controls: {now: () => 2, deadlineMs: 1}}).inspectCoreRelationships(frozen.cases.inspect_missing.source, frozen.cases.inspect_missing.identity); } catch (error) { deadline = error.code; }
    if (zero !== 'RESOURCE_LIMIT' || cancelled !== 'CANCELLED' || deadline !== 'DEADLINE') throw Error('host resource/cancellation controls mismatch');
    return {operations: Object.keys(operations).length, receiptVerifiers: 2, forgedReceipt: 'pass', copyIsolation: 'pass', controls: {zeroWork: zero, cancellation: cancelled, deadline}};
  });
  console.log(JSON.stringify({status: 'pass', chromium: browser.version(), ...result}));
} finally { await browser.close(); server.close(); }
