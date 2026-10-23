// SPDX-License-Identifier: MIT OR Apache-2.0
// Qualify the opt-in Protobuf inspector WASM binding in real Chromium.
import {mkdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';

const root = process.cwd();
const host = '/private/tmp/umf-r5-protobuf-inspect-browser';
const pkg = join(host, 'wasm/pkg');
await mkdir(join(host, 'wasm/src'), {recursive: true});
await mkdir(pkg, {recursive: true});
const stagedFiles: [string, string][] = [
  ['bindings/core/wasm/index.js', join(host, 'wasm/index.js')],
  ['bindings/core/wasm/src/core-model.js', join(host, 'wasm/src/core-model.js')],
  ['bindings/core/node/src/wire.js', join(host, 'wasm/src/wire.js')],
  ['bindings/core/node/src/bit128.js', join(host, 'wasm/src/bit128.js')],
  ['bindings/core/node/src/javascript-numeric.js', join(host, 'wasm/src/javascript-numeric.js')],
];
for (const [source, target] of stagedFiles) await Bun.write(target, await readFile(join(root, source)));
await Bun.write(join(host, 'wasm/package.json'), '{"type":"module"}');
for (const file of ['umf_core_wasm.js', 'umf_core_wasm_bg.wasm', 'umf_core_wasm.d.ts']) await Bun.write(join(pkg, file), await readFile(join('/private/tmp/umf-r5-protobuf-inspect-pkg', file)));

const baseline = JSON.parse(await readFile(join(root, 'docs/helix/04-build/evidence/rust-migration/r5-protobuf-descriptor-codec/inspector-predecessor.json'), 'utf8'));
const frozen = (label: string) => baseline.observations.find((row: any) => row.label === label).value;
const server = createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (path === '/') { response.writeHead(200, {'content-type': 'text/html'}); response.end('<!doctype html><meta charset="utf-8">'); return; }
  if (path === '/baseline.json') { response.writeHead(200, {'content-type': 'application/json'}); response.end(JSON.stringify(baseline)); return; }
  try { const bytes = await readFile(join(host, path)); response.writeHead(200, {'content-type': path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'}); response.end(bytes); }
  catch { response.writeHead(404); response.end('missing'); }
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Browser server did not start');
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`);
  const result = await page.evaluate(async () => {
    const baseline = await fetch('/baseline.json').then(response => response.json());
    const frozen = (label: string) => baseline.observations.find((row: any) => row.label === label).value;
    const canonical = (value: any): string => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    const {initializeProtobufInspectWasm, PROTOBUF_INSPECT_PROFILE} = await import(new URL('/wasm/index.js', location.href).href);
    const {encodeRequestWire} = await import(new URL('/wasm/src/wire.js', location.href).href);
    const inspect = await initializeProtobufInspectWasm();
    const node = (type: string, fields: Record<string, unknown> = {}, unknown: unknown[] = []) => ({type, fields, unknown});
    const doc = (descriptorSet: unknown) => ({umf: '0.10.0', id: 'browser-inspect', vocabularies: {'umf.protobuf': {version: '0.1.0'}}, modules: [{id: 'schema', namespace: '', elements: [{id: 'schema', extensions: {'umf.protobuf': {descriptorProfile: 'protobuf-es-2.15.0', descriptorSet}}}]}]});
    const empty = inspect.inspect(doc(node('google.protobuf.FileDescriptorSet')));
    if (canonical(empty.diagnostics) !== canonical(frozen('empty-document-diagnostics'))) throw Error('empty predecessor observation mismatch');
    const unknown = inspect.inspect(doc(node('google.protobuf.FileDescriptorSet', {}, [{number: 50000, wireType: 2, data: '04000102ff'}])));
    if (canonical(unknown.diagnostics) !== canonical(frozen('unknown-root-diagnostic-order'))) throw Error('unknown-wire predecessor observation mismatch');
    const utf16Document: any = doc(node('google.protobuf.FileDescriptorSet'));
    utf16Document.modules[0].elements[0].extensions['umf.protobuf']['future\ud800'] = true;
    const utf16Path = inspect.inspect(utf16Document).diagnostics.find((item: {code: string}) => item.code === 'PROTOBUF_REPRESENTATION')?.path;
    if (utf16Path !== '/future\ud800') throw Error(`UTF-16 diagnostic path was ${JSON.stringify(utf16Path)}`);
    let meter = 0;
    const metered = await initializeProtobufInspectWasm(undefined, globalThis, {controls: {meter: (amount: number) => { meter += amount; }}});
    metered.inspect(doc(node('google.protobuf.FileDescriptorSet')));
    if (meter <= 0) throw Error('host meter was not charged');
    let resourceCode = '';
    try { (await initializeProtobufInspectWasm(undefined, globalThis, {controls: {maxWork: 0}})).inspect(doc(node('google.protobuf.FileDescriptorSet'))); }
    catch (error: unknown) { resourceCode = (error as {code?: string}).code ?? ''; }
    if (resourceCode !== 'RESOURCE_LIMIT') throw Error(`resource refusal was ${resourceCode}`);
    let cancellationCode = '';
    try { (await initializeProtobufInspectWasm(undefined, globalThis, {controls: {isCancelled: () => true}})).inspect(doc(node('google.protobuf.FileDescriptorSet'))); }
    catch (error: unknown) { cancellationCode = (error as {code?: string}).code ?? ''; }
    if (cancellationCode !== 'CANCELLED') throw Error(`cancellation refusal was ${cancellationCode}`);
    let meterFailure = '';
    const meterDocument = doc(node('google.protobuf.FileDescriptorSet'));
    let preRustMeterCalls = 1;
    encodeRequestWire({op: 'protobuf.descriptor.inspect', document: meterDocument}, () => { preRustMeterCalls++; });
    let meterCalls = 0;
    let failedInsideRust = false;
    try { (await initializeProtobufInspectWasm(undefined, globalThis, {controls: {meter() {
      meterCalls++;
      if (!failedInsideRust && meterCalls > preRustMeterCalls) { failedInsideRust = true; throw Error('\ud800'); }
    }}})).inspect(meterDocument); }
    catch (error: unknown) {
      const failure = error as {code?: string; message?: string};
      if (failure.code === 'METER_FAILURE' && failure.message === 'Error: \ud800') meterFailure = failure.code;
    }
    if (meterFailure !== 'METER_FAILURE' || !failedInsideRust || meterCalls <= preRustMeterCalls) throw Error(`UTF-16 meter failure envelope was ${meterFailure}; Rust hook=${failedInsideRust}`);
    if (typeof process !== 'undefined' || typeof Buffer !== 'undefined') throw Error('Node globals leaked into browser');
    return {profile: PROTOBUF_INSPECT_PROFILE, predecessorObservations: 2, utf16DiagnosticPath: 'pass', meteredWork: meter, resourceCode, cancellationCode, utf16ErrorEnvelope: meterFailure, failureInsideRustHook: 'pass'};
  });
  console.log(JSON.stringify({status: 'pass', browser: 'Chromium', browserVersion: browser.version(), ...result}));
} finally { await browser?.close(); server.close(); }
