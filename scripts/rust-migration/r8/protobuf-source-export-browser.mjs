// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay the 14 frozen R5 source-export outcomes in real Chromium/WASM.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {chromium} from 'playwright';

const root = resolve(import.meta.dir, '../../..');
const pkg = resolve(process.env.UMF_PROTOBUF_EXPORT_WASM_PACKAGE ?? '');
if (!process.env.UMF_PROTOBUF_EXPORT_WASM_PACKAGE) throw new Error('Set UMF_PROTOBUF_EXPORT_WASM_PACKAGE to the fresh bindgen package');
const packet = await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r5-protobuf-source-export/predecessor.json'));
const fixture = await readFile(resolve(root, 'fixtures/protobuf/authored.pb'));
const server = createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (path === '/') { response.writeHead(200, {'content-type': 'text/html'}); response.end('<!doctype html>'); return; }
  if (path === '/packet.json') { response.writeHead(200, {'content-type': 'application/json'}); response.end(packet); return; }
  if (path === '/fixture.pb') { response.writeHead(200, {'content-type': 'application/octet-stream'}); response.end(fixture); return; }
  const local = resolve(pkg, decodeURIComponent(path.slice('/pkg/'.length)));
  if (path.startsWith('/pkg/') && local.startsWith(`${pkg}${sep}`)) {
    try {
      response.writeHead(200, {'content-type': local.endsWith('.wasm') ? 'application/wasm' : local.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'});
      response.end(await readFile(local)); return;
    } catch { /* 404 below */ }
  }
  response.writeHead(404); response.end('missing');
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Browser server did not start');
let browser;
try {
  browser = await chromium.launch({headless: true, timeout: 30_000, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`);
  const receipt = await page.evaluate(async () => {
    const packet = await fetch('/packet.json').then(response => response.json());
    const fixture = new Uint8Array(await fetch('/fixture.pb').then(response => response.arrayBuffer()));
    const wasm = await import(new URL('/pkg/umf_core_wasm.js', location.href).href);
    await wasm.default();
    const binding = await import(new URL('/pkg/index.js', location.href).href);
    const descriptor = binding.createProtobufDescriptorDocumentEngine(wasm);
    const exporter = binding.createProtobufSourceExportEngine(wasm);
    const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(byte => byte.toString(16).padStart(2, '0')).join('');
    const makeSeed = () => {
      const source = descriptor.importProtobufDescriptorSet(new Uint8Array(), {id: 'source-export-capture'});
      source.modules[0].elements[0].extensions['umf.protobuf'].sourceArchive = {
        role: 'original', compiler: 'capture-compiler/1',
        files: {'root.proto': 'syntax = "proto3";\nmessage A { string label = 1; }\n', 'unicode-😀.proto': 'message B { string note = 1; }\n'},
        roots: ['root.proto'],
      };
      const edited = descriptor.importProtobufDescriptorSet(fixture, {id: 'edited-descriptor'});
      source.modules[0].elements[0].extensions['umf.protobuf'].descriptorSet = structuredClone(edited.modules[0].elements[0].extensions['umf.protobuf'].descriptorSet);
      return source;
    };
    const summarizeError = error => ({ok: false, code: error?.code ?? null, message: error?.message ?? String(error), path: error?.path ?? null});
    const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
      : value !== null && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
      : JSON.stringify(value);
    const outputs = [];
    for (const item of packet.cases) {
      const name = item.name;
      const source = makeSeed();
      let calls = 0;
      let descriptorBytesToEmitter;
      const capturedFiles = {'generated.proto': 'message Edited {}\n'};
      let emitter = {async emit(bytes) { calls++; descriptorBytesToEmitter = {sha256: await hash(bytes), byteLength: bytes.byteLength};
        if (name === 'edited-current-descriptor-and-original-archive') source.id = 'mutated during callback';
        return {files: capturedFiles, compiler: 'capture-compiler/1', printer: 'capture-printer/1'}; }};
      let input = source;
      if (name === 'invalid-document-before-emitter') input = {};
      if (name === 'invalid-emitter-null-result') emitter = {async emit(bytes) { calls++; descriptorBytesToEmitter = {sha256: await hash(bytes), byteLength: bytes.byteLength}; return null; }};
      if (name === 'invalid-emitter-missing-files') emitter = {async emit(bytes) { calls++; descriptorBytesToEmitter = {sha256: await hash(bytes), byteLength: bytes.byteLength}; return {compiler: 'c', printer: 'p'}; }};
      if (name === 'invalid-emitter-array-files') emitter = {async emit(bytes) { calls++; descriptorBytesToEmitter = {sha256: await hash(bytes), byteLength: bytes.byteLength}; return {files: [], compiler: 'c', printer: 'p'}; }};
      if (name === 'invalid-emitter-missing-compiler') emitter = {async emit(bytes) { calls++; descriptorBytesToEmitter = {sha256: await hash(bytes), byteLength: bytes.byteLength}; return {files: {}, printer: 'p'}; }};
      if (name === 'invalid-emitter-missing-printer') emitter = {async emit(bytes) { calls++; descriptorBytesToEmitter = {sha256: await hash(bytes), byteLength: bytes.byteLength}; return {files: {}, compiler: 'c'}; }};
      if (name === 'invalid-emitter-empty-name') emitter = {async emit(bytes) { calls++; descriptorBytesToEmitter = {sha256: await hash(bytes), byteLength: bytes.byteLength}; return {files: {'': 'x'}, compiler: 'c', printer: 'p'}; }};
      if (name === 'invalid-emitter-non-string-source') emitter = {async emit(bytes) { calls++; descriptorBytesToEmitter = {sha256: await hash(bytes), byteLength: bytes.byteLength}; return {files: {'a.proto': 7}, compiler: 'c', printer: 'p'}; }};
      if (name === 'invalid-emitter-unknown-emitter-field') emitter = {async emit(bytes) { calls++; descriptorBytesToEmitter = {sha256: await hash(bytes), byteLength: bytes.byteLength}; return {files: {}, compiler: 'c', printer: 'p', future: {keep: true}}; }};
      if (name === 'invalid-emitter-copy-number-precedence') emitter = {async emit() { return {files: {}, compiler: 'c', printer: 'p', future: Number.NaN}; }};
      if (name === 'callback-mutates-document-before-source-copy') emitter = {async emit(bytes) { calls++; descriptorBytesToEmitter = {sha256: await hash(bytes), byteLength: bytes.byteLength}; source.id = 'after callback'; source.modules[0].elements[0].extensions['umf.protobuf'].futureRepresentation = {retain: true}; return {files: {'generated.proto': 'message Edited {}\n'}, compiler: 'capture-compiler/1', printer: 'capture-printer/1'}; }};
      if (name === 'unknown-payload-field-before-emitter') source.modules[0].elements[0].extensions['umf.protobuf'].futureRepresentation = {retain: true};
      if (name === 'unknown-source-archive-field-before-emitter') source.modules[0].elements[0].extensions['umf.protobuf'].sourceArchive.futureArchiveField = {retain: true};
      let actual;
      try {
        const output = await exporter.exportProtobufSources(input, emitter);
        if (name === 'edited-current-descriptor-and-original-archive') {
          capturedFiles['generated.proto'] = 'mutated after callback';
          actual = {result: {ok: true, calls, descriptorBytesToEmitter,
            output: {files: {'generated.proto': 'message Edited {}\n'}, compiler: output.compiler, printer: output.printer,
              archive: output.source.modules[0].elements[0].extensions['umf.protobuf'].sourceArchive,
              sourceId: output.source.id, inputIdAfterReturnMutation: source.id,
              diagnosticCodes: output.diagnostics.map(value => value.code), layoutDiagnostic: output.diagnostics.at(-1)}}};
        } else if (name === 'invalid-emitter-unknown-emitter-field') {
          actual = {result: {ok: true, files: output.files, compiler: output.compiler, printer: output.printer,
            unknownFields: Object.keys(output).filter(key => !['files', 'compiler', 'printer', 'source', 'diagnostics'].includes(key)),
            archive: output.source.modules[0].elements[0].extensions['umf.protobuf'].sourceArchive,
            diagnosticCodes: output.diagnostics.map(value => value.code)}, callbackDescriptorBytes: descriptorBytesToEmitter};
        } else if (name === 'callback-mutates-document-before-source-copy') {
          actual = {result: {ok: true, descriptorBytesToEmitter, sourceId: output.source.id,
            sourceUnknownPayload: output.source.modules[0].elements[0].extensions['umf.protobuf'].futureRepresentation,
            diagnosticCodes: output.diagnostics.map(value => value.code)}};
        } else actual = {result: {ok: true, files: output.files, compiler: output.compiler, printer: output.printer}, calls, ...(descriptorBytesToEmitter ? {callbackDescriptorBytes: descriptorBytesToEmitter} : {})};
      } catch (error) {
        const result = summarizeError(error);
        if (name === 'invalid-document-before-emitter' || name.startsWith('unknown-')) actual = {result, calls};
        else if (descriptorBytesToEmitter) actual = {result, callbackDescriptorBytes: descriptorBytesToEmitter};
        else actual = {result};
      }
      const comparable = value => name === 'invalid-emitter-null-result'
        ? {...value, result: {...value.result, message: '<native TypeError>'}}
        : value;
      const {name: _caseName, ...expectedPacket} = item;
      const expected = name === 'invalid-emitter-null-result'
        ? {...expectedPacket, result: {...item.result, message: '<native TypeError>'}}
        : expectedPacket;
      outputs.push({name, actual,
        match: canonical(comparable(actual)) === canonical(comparable(expected))});
    }
    const mismatches = outputs.filter(value => !value.match);
    if (mismatches.length) throw Error(`Frozen predecessor mismatches: ${mismatches.map(value => value.name).join(', ')}`);
    return {frozenCases: outputs.length, matchingCases: outputs.filter(value => value.match).length, cases: outputs};
  });
  console.log(JSON.stringify({status: 'captured', browser: 'Chromium', browserVersion: browser.version(), ...receipt}));
} finally { await browser?.close(); server.close(); }
