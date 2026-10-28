import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';

const root = process.cwd();
const stage = '/private/tmp/umf-r8-protobuf-browser';
const pkg = join(stage, 'pkg');
await Bun.$`rm -rf ${stage}`;
await Bun.$`mkdir -p ${pkg} ${join(stage, 'src')}`;
await Bun.write(join(stage, 'index.js'), await readFile(join(root, 'bindings/core/wasm/index.js')));
for (const file of await Array.fromAsync(new Bun.Glob('*.js').scan({cwd: join(root, 'bindings/core/wasm/src')}))) {
  await Bun.write(join(stage, 'src', file), await readFile(join(root, 'bindings/core/wasm/src', file)));
}
for (const file of ['umf_core_wasm.js', 'umf_core_wasm_bg.wasm']) await Bun.write(join(pkg, file), await readFile(join('/private/tmp/umf-r8-protobuf-wasm-pkg', file)));
await Bun.write(join(stage, 'package.json'), '{"type":"module"}');
const authored = await readFile(join(root, 'fixtures/protobuf/authored.pb'));
const server = createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (path === '/') { response.writeHead(200, {'content-type': 'text/html'}); return response.end('<!doctype html><meta charset="utf-8">'); }
  if (path === '/authored.pb') { response.writeHead(200, {'content-type': 'application/octet-stream'}); return response.end(authored); }
  try {
    const bytes = await readFile(join(stage, path));
    response.writeHead(200, {'content-type': path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'});
    response.end(bytes);
  } catch { response.writeHead(404); response.end('missing'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const receipt = await page.evaluate(async () => {
    const {initializeProtobufDescriptorDocumentWasm, createProtobufDescriptorDocumentEngine, PROTOBUF_DOCUMENT_PROFILE} = await import('/index.js');
    const engine = await initializeProtobufDescriptorDocumentWasm();
    const authored = new Uint8Array(await fetch('/authored.pb').then(r => r.arrayBuffer()));
    const unknown = new Uint8Array([0x82, 0xb5, 0x18, 0x04, 0x00, 0x01, 0x02, 0xff]);
    const descriptor = engine.readDescriptorSet(unknown);
    if (descriptor.unknown?.[0]?.data !== '04000102ff') throw Error('unknown wire read mismatch');
    const document = engine.importProtobufDescriptorSet(authored, {id: 'browser-packet'});
    const got = engine.exportProtobufDescriptorSet(document);
    const canonicalAuthored = engine.writeDescriptorSet(engine.readDescriptorSet(authored));
    if (got.length !== canonicalAuthored.length || got.some((byte, index) => byte !== canonicalAuthored[index])) throw Error('document export mismatch');
    const bundle = engine.exportProtobufBundle(document);
    if (bundle.descriptorSet.length !== got.length || bundle.descriptorSet.some((byte, index) => byte !== got[index])) throw Error('bundle bytes mismatch');
    const first = engine.writeDescriptorSet(descriptor);
    if (first.length !== unknown.length || first.some((byte, index) => byte !== unknown[index])) throw Error('unknown wire write mismatch');
    class HostileBytes extends Uint8Array { get byteLength() { throw Error('byteLength override'); } [Symbol.iterator]() { throw Error('iterator override'); } }
    const backing = new HostileBytes([0xaa, ...unknown, 0xbb]);
    const view = new HostileBytes(backing.buffer, 1, unknown.length);
    if (engine.readDescriptorSet(view).unknown[0].data !== '04000102ff') throw Error('offset view mismatch');
    backing[1] = 0;
    if (descriptor.unknown[0].data !== '04000102ff') throw Error('input snapshot was not isolated');
    let limitCode = '';
    try { engine.readDescriptorSet(new HostileBytes(4_000_001)); } catch (error) { limitCode = error.code; }
    if (limitCode !== 'LIMIT') throw Error(`large input result ${limitCode}`);
    const malformed = new Uint8Array(11).fill(0x80);
    let malformedFailure;
    try { engine.readDescriptorSet(malformed); } catch (error) { malformedFailure = error; }
    if (malformedFailure?.name !== 'UmfError' || malformedFailure?.code !== 'PROTOBUF_BINARY' || malformedFailure?.message !== 'Error: invalid varint') throw Error(`malformed descriptor diagnostic mismatch: ${malformedFailure?.name}/${malformedFailure?.code}/${malformedFailure?.message}`);
    const wasmModule = await import('/pkg/umf_core_wasm.js');
    class PublicUmfError extends Error { constructor(code, message, path = '') { super(message); this.name = 'UmfError'; this.code = code; this.path = path; } }
    const publicEngine = createProtobufDescriptorDocumentEngine(wasmModule, {ErrorType: PublicUmfError});
    let injectedFailure;
    try { publicEngine.readDescriptorSet(malformed); } catch (error) { injectedFailure = error; }
    if (!(injectedFailure instanceof PublicUmfError)) throw Error('injected public UmfError constructor identity was lost');
    let idGetterFailure;
    const hostileOptions = {};
    Object.defineProperty(hostileOptions, 'id', {enumerable: true, get() { throw Error('id getter observed'); }});
    try { engine.importProtobufDescriptorSet(new Uint8Array(4_000_001), hostileOptions); } catch (error) { idGetterFailure = error; }
    if (idGetterFailure?.message !== 'id getter observed') throw Error('import id getter did not precede byte admission');
    let rawHostFailure;
    try { engine.readDescriptorSet(new Uint16Array([10])); } catch (error) { rawHostFailure = error; }
    if (rawHostFailure?.name !== 'UmfError' || rawHostFailure?.code !== 'PROTOBUF_BINARY' || rawHostFailure?.message !== 'RangeError: premature EOF') throw Error('frozen Uint16Array admission observation mismatch');
    if (typeof process !== 'undefined' || typeof Buffer !== 'undefined') throw Error('Node globals leaked');
    return {profile: PROTOBUF_DOCUMENT_PROFILE, unknownRawRoundTrip: true, documentOperations: true, hostileOffsetView: true, snapshotIsolation: true, overLimit: limitCode, publicErrorAndDiagnostic: true, publicErrorInjection: true, optionGetterOrder: true, rawHostAdmission: true, browserGlobals: true};
  });
  console.log(JSON.stringify({status: 'pass', browser: 'Chromium', browserVersion: browser.version(), ...receipt}));
} finally { await browser?.close(); server.close(); }
