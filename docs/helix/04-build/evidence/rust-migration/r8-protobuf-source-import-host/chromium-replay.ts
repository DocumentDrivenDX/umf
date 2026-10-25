import {readFile, stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve, sep} from 'node:path';
import {chromium} from 'playwright';

const packageRoot = resolve(process.env.UMF_PROTOBUF_SOURCE_IMPORT_WASM_PACKAGE ?? '');
if (!(await stat(resolve(packageRoot, 'pkg/umf_core_wasm_bg.wasm'))).isFile()) throw new Error('Set UMF_PROTOBUF_SOURCE_IMPORT_WASM_PACKAGE to a fresh bindgen package');
const mime = (path: string) => path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
const server = createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (path === '/') {
    response.writeHead(200, {'content-type': 'text/html'});
    response.end('<!doctype html><meta charset="utf-8"><title>Protobuf source import replay</title>');
    return;
  }
  const local = resolve(packageRoot, `.${decodeURIComponent(path.slice('/package'.length))}`);
  if (path.startsWith('/package/') && (local === packageRoot || local.startsWith(`${packageRoot}${sep}`))) {
    try { response.writeHead(200, {'content-type': mime(local), 'cache-control': 'no-store'}); response.end(await readFile(local)); return; }
    catch { /* 404 below */ }
  }
  response.writeHead(404); response.end('missing');
});
await new Promise<void>(resolveListen => server.listen(Number(process.env.UMF_CHROMIUM_PORT ?? 41793), '127.0.0.1', resolveListen));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Browser server did not start');
let browser;
try {
  browser = await chromium.launch({headless: true, timeout: 30_000, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`);
  const result = await page.evaluate(async () => {
    const wrapper = await import('/package/index.js');
    const engine = await wrapper.initializeProtobufSourceImportWasm(() => import('/package/pkg/umf_core_wasm.js'), globalThis);
    const events: string[] = [];
    let reads = 0;
    const result = await engine.importProtobufSources({files: {'root.proto': 'syntax = "proto3";\nmessage A {}\n'}, roots: ['root.proto']}, {
      async compile(request: any) {
        if (arguments.length !== 1) throw new Error('callback arity mismatch');
        events.push('callback');
        return Object.defineProperties({}, {
          compiler: {get() { reads++; events.push(`compiler-${reads}`); return reads === 1 ? 'protoc' : 123; }},
          descriptorSet: {get() { events.push('descriptor'); return new Uint8Array(); }},
        });
      },
    }, {get id() { events.push('id'); return 'capture'; }}).then((value: any) => ({ok: true, value, events, reads}), (error: any) => ({ok: false, code: error.code, message: error.message, events, reads}));
    return {profile: engine.callbackControl, ...result};
  });
  if (result.profile !== 'boundary-only' || result.ok || result.reads !== 2 || result.events.join(',') !== 'callback,compiler-1,descriptor,id,compiler-2') throw new Error(`WASM host-order mismatch: ${JSON.stringify(result)}`);
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  server.close();
}
