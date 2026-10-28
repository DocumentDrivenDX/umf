// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay frozen CSV Boolean packets through installed Node and Bun routes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = resolve(process.env.UMF_R8_REPO_ROOT ?? new URL('../../../', import.meta.url).pathname);
const archive = resolve(process.env.UMF_R8_CSV_ARCHIVE_ROOT ?? '');
const out = resolve(process.env.UMF_R8_CSV_RECEIPT_DIR ?? '');
const archiveSha256 = process.env.UMF_R8_CSV_ARCHIVE_SHA256;
const sourceClosureSha256 = process.env.UMF_R8_CSV_SOURCE_CLOSURE_SHA256;
if (!process.env.UMF_R8_CSV_ARCHIVE_ROOT || !process.env.UMF_R8_CSV_RECEIPT_DIR || !archiveSha256 || !sourceClosureSha256) throw new Error('Archive root, receipt directory and source pins are required');
const cohortId = process.platform === 'darwin' && process.arch === 'arm64' ? 'darwin-arm64' : process.platform === 'linux' && process.arch === 'x64' ? 'linux-x86_64' : null;
if (!cohortId) throw new Error(`Unsupported retirement host cohort: ${process.platform}/${process.arch}`);
const hostPlatform = {os: process.platform, arch: process.arch};
const evidence = 'docs/helix/04-build/evidence/rust-migration/r8-csv-boolean-default-retirement-replay';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const canonical = value => JSON.stringify(stable(value));
const require = createRequire(import.meta.url);
const addon = require(join(archive, 'dist/umf_core_node.node'));
const original = addon.executeRequestWire;
if (typeof original !== 'function') throw new Error('Installed native addon has no executeRequestWire entry');
let rustCalls = 0;
addon.executeRequestWire = function(...args) { rustCalls++; return original.apply(this, args); };
const defaultEntry = join(archive, 'dist/umf-node.js');
const referenceEntry = join(archive, 'dist/umf.js');
const installed = process.env.UMF_R8_INSTALLED_PACKAGE_SPECIFIER === '1';
const defaults = installed ? await import('@umf/core') : await import(pathToFileURL(defaultEntry).href);
const reference = installed ? await import('@umf/core/reference') : await import(pathToFileURL(referenceEntry).href);
const exportsByName = {validateCsvBooleanLexical: defaults.validateCsvBooleanLexical, verifyCsvBooleanLexical: defaults.verifyCsvBooleanLexical, validateCoreRecordValues: defaults.validateCoreRecordValues};
const referenceByName = {validateCsvBooleanLexical: reference.validateCsvBooleanLexical, verifyCsvBooleanLexical: reference.verifyCsvBooleanLexical, validateCoreRecordValues: reference.validateCoreRecordValues};
const argsFor = (item, trace) => {
  const {input} = item;
  if (input.profile?.startsWith('host:')) {
    const profile = input.profile.slice(5), src = () => structuredClone(input.source), req = () => structuredClone(input.request);
    const accessor = (object, key, label) => Object.defineProperty(object, key, {enumerable: true, configurable: true, get() { trace.push(`accessor:${label}`); return label === 'profile' ? 'umf.csv-boolean-lexical/1.0.0' : label === 'token' ? 'true' : 'hidden'; }});
    if (profile === 'source-accessor-id' || profile === 'invalid-request-source-accessor') { const s = src(); accessor(s, 'id', 'source.id'); const r = req(); if (profile === 'invalid-request-source-accessor') r.profile = 'future'; return [s, r]; }
    if (profile === 'nested-source-accessor') { const s = src(); accessor(s.modules[0].elements[0], 'name', 'nested.name'); return [s, req()]; }
    if (profile.startsWith('request-accessor-')) { const r = req(); const key = profile.slice('request-accessor-'.length); accessor(r, key, key); return [src(), r]; }
    if (profile === 'hidden-source' || profile === 'competing-source-hidden') { const s = src(); Object.defineProperty(s, 'private', {value: 1, enumerable: false}); if (profile === 'competing-source-hidden') accessor(s, 'id', 'source.id'); return [s, req()]; }
    if (profile === 'hidden-request') { const r = req(); Object.defineProperty(r, 'private', {value: 1, enumerable: false}); return [src(), r]; }
    if (profile === 'source-symbol' || profile === 'request-symbol') { const object = profile === 'source-symbol' ? src() : req(); Object.defineProperty(object, Symbol('hidden'), {value: 1, enumerable: true}); return profile === 'source-symbol' ? [object, req()] : [src(), object]; }
    if (profile === 'competing-request-accessors') { const r = req(); accessor(r, 'futureA', 'futureA'); accessor(r, 'futureB', 'futureB'); return [src(), r]; }
    if (profile === 'source-ownkeys-throw') return [new Proxy({}, {ownKeys() { trace.push('source:ownKeys'); throw new Error('proxy-ownKeys-stop'); }}), req()];
    if (profile === 'source-descriptor-changes') { let descriptors = 0; const s = new Proxy({}, {ownKeys() { trace.push('source:ownKeys'); return ['umf']; }, getOwnPropertyDescriptor() { descriptors++; trace.push(`source:descriptor:${descriptors}`); if (descriptors === 1) return {enumerable: true, configurable: true, get() { trace.push('source:umf-getter'); return '0.10.0'; }}; throw new Error('proxy-descriptor-stop'); }}); return [s, req()]; }
    if (profile === 'source-changing-keys') { let calls = 0; const s = new Proxy({}, {ownKeys() { calls++; trace.push(`source:ownKeys:${calls}`); return calls === 1 ? ['umf'] : ['id']; }, getOwnPropertyDescriptor(_t, key) { trace.push(`source:descriptor:${String(key)}`); return {enumerable: true, configurable: true, get() { trace.push(`source:getter:${String(key)}`); return key === 'umf' ? '0.10.0' : 'hidden'; }}; }}); return [s, req()]; }
    if (profile === 'request-ownkeys-throw') { const r = new Proxy(req(), {ownKeys() { trace.push('request:ownKeys'); throw new Error('request-proxy-ownKeys-stop'); }}); return [src(), r]; }
    if (profile === 'source-trap-order') { const s = new Proxy({}, {ownKeys() { trace.push('source:ownKeys'); return ['umf']; }, getOwnPropertyDescriptor(_t, key) { trace.push(`source:descriptor:${String(key)}`); return {get() { trace.push('source:umf-getter'); return '0.10.0';}, enumerable: true, configurable: true}; }}); return [s, req()]; }
    if (profile === 'malformed-receipt-first') { const s = src(); accessor(s, 'id', 'source.id'); const r = req(); accessor(r, 'token', 'request.token'); return [{}, s, r]; }
    throw Error(`Unknown host control ${profile}`);
  }
  if (input.profile === 'exact-pair-byte-limit' || input.profile === 'over-pair-byte-limit') {
    const request = {profile: 'umf.csv-boolean-lexical/1.0.0', field: {module: 'domain', element: 'patients.active'}, token: input.token, sourceContext: 'x'.repeat(input.paddingBytes)};
    const bytes = Buffer.byteLength(JSON.stringify({source: input.source, request}), 'utf8');
    assert.equal(bytes, input.profile === 'exact-pair-byte-limit' ? 4_000_000 : 4_000_001, `${item.id} exact/over ceiling`);
    return [input.source, request];
  }
  if (input.profile === 'exact-receipt-byte-limit' || input.profile === 'over-receipt-byte-limit') {
    const request = {profile: 'umf.csv-boolean-lexical/1.0.0', field: {module: 'domain', element: 'patients.active'}, token: 'true', sourceContext: 'x'.repeat(input.paddingBytes)};
    return [input.source, request];
  }
  if (input.profile === 'exact-verify-receipt-byte-limit' || input.profile === 'over-verify-receipt-byte-limit') {
    const request = {profile: 'umf.csv-boolean-lexical/1.0.0', field: {module: 'domain', element: 'patients.active'}, token: 'true', sourceContext: 'x'.repeat(input.paddingBytes - (input.profile === 'over-verify-receipt-byte-limit' ? 1 : 0))};
    const receipt = reference.validateCsvBooleanLexical(input.source, request);
    if (input.profile === 'over-verify-receipt-byte-limit') receipt.request.sourceContext = 'x'.repeat(input.paddingBytes);
    return [receipt, input.source, request];
  }
  if (item.id.startsWith('record.')) return [input.source, input.identity, input.values];
  if (input.profile === 'verify-source-accessor') {
    const source = structuredClone(input.source);
    Object.defineProperty(source, 'umf', {enumerable: true, configurable: true, get() { trace.push('accessor:umf'); return undefined; }});
    return [input.receipt, source, input.request];
  }
  if (input.profile === 'receipt-proxy-ownkeys') {
    const callbackError = new Error('csv-receipt-proxy-stop');
    const receipt = new Proxy({}, {
      getPrototypeOf(target) { trace.push('receipt:getPrototypeOf'); return Reflect.getPrototypeOf(target); },
      ownKeys() { trace.push('receipt:ownKeys'); throw callbackError; },
    });
    return [receipt, input.source, input.request];
  }
  if (input.profile === 'source-accessor') {
    const source = structuredClone(input.source);
    Object.defineProperty(source, 'umf', {enumerable: true, configurable: true, get() { trace.push('accessor:umf'); return undefined; }});
    return [source, input.request];
  }
  return item.id.startsWith('validate.') ? [input.source, input.request] : [input.receipt, input.source, input.request];
};
const outcome = run => { try { return stable({status: 'returned', value: run()}); } catch (e) { return {status: 'threw', name: String(e?.name ?? ''), code: typeof e?.code === 'string' ? e.code : null, path: typeof e?.path === 'string' ? e.path : null, message: String(e?.message ?? '')}; } };
const runtime = process.versions.bun ? 'bun' : 'node';
for (const exportName of Object.keys(exportsByName)) {
  const packetPath = join(root, evidence, `${exportName}.packet.json`);
  const packetBytes = await readFile(packetPath);
  const packet = JSON.parse(packetBytes);
  const cases = [];
  for (const item of packet.cases) {
    const trace = []; rustCalls = 0;
    const defaultOutcome = outcome(() => exportsByName[exportName](...argsFor(item, trace)));
    const defaultRustCalls = rustCalls;
    assert.equal(canonical(defaultOutcome), canonical(item.expectedOutcome), `${item.id} default outcome`);
    assert.equal(canonical(trace), canonical(item.expectedTrace), `${item.id} default trace`);
    const referenceTrace = []; rustCalls = 0;
    const referenceOutcome = outcome(() => referenceByName[exportName](...argsFor(item, referenceTrace)));
    const referenceRustCalls = rustCalls;
    assert.equal(canonical(referenceOutcome), canonical(item.expectedOutcome), `${item.id} reference outcome`);
    assert.equal(canonical(referenceTrace), canonical(item.expectedTrace), `${item.id} reference trace`);
    assert.equal(referenceRustCalls, 0, `${item.id} reference route invoked native addon`);
    assert.equal(item.expectsRust ? defaultRustCalls > 0 : defaultRustCalls === 0, true, `${item.id} default Rust-call condition`);
    cases.push({id: item.id, defaultOutcome, defaultTrace: trace, defaultRustCalls, referenceOutcome, referenceTrace, referenceRustCalls});
  }
  const defaultBytes = await readFile(defaultEntry), referenceBytes = await readFile(referenceEntry), addonBytes = await readFile(join(archive, 'dist/umf_core_node.node'));
  const receipt = {format: 'umf.r8.default-route-retirement-host-receipt/2', status: 'pass', runtime, hostVersion: process.versions.bun ? Bun.version : process.version, cohortId, hostPlatform, archiveSha256, sourceClosureSha256, packetSha256: hash(packetBytes), defaultRoute: {routeId: 'package-root-node', entryMember: 'dist/umf-node.js', entrySha256: hash(defaultBytes), artifactMembers: [{path: 'dist/umf_core_node.node', sha256: hash(addonBytes)}]}, referenceRoute: {routeId: 'package-reference', entryMember: 'dist/umf.js', entrySha256: hash(referenceBytes), artifactMembers: []}, cases};
  await writeFile(join(out, `${exportName}-${runtime}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({exportName, runtime, caseCount: cases.length, defaultRustCalls: cases.map(item => item.defaultRustCalls), packetSha256: receipt.packetSha256}));
}
