// SPDX-License-Identifier: MIT OR Apache-2.0
// Build the opt-in Core Bit128 Field WASM binding and replay it in Chromium.
import assert from 'node:assert/strict';
import {copyFile, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {extname, join} from 'node:path';
import {chromium} from 'playwright';
import {FIELD, uuidDocument} from '../../../../tests/helpers/uuid-fixtures.ts';

const root = new URL('../../../../', import.meta.url).pathname;
const temp = await mkdtemp(join(tmpdir(), 'umf-r8-bit128-browser-'));
const wasmOut = join(temp, 'wasm');
const browserOut = join(temp, 'browser');
const target = join(temp, 'target');
const run = async (command, args) => {
  const child = Bun.spawn([command, ...args], {cwd: root, env: {...process.env, CARGO_TARGET_DIR: target}, stdout: 'pipe', stderr: 'pipe'});
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  if (await child.exited) throw Error(`${command} ${args.join(' ')} failed\n${stdout}\n${stderr}`);
};
const json = async path => JSON.parse(await readFile(join(root, path), 'utf8'));
const resources = {
  coreSchema: await json('spec/core/schema.json'),
  referenceSchema: await json('spec/core/semantic-type-reference.schema.json'),
  packageSchema: await json('spec/core/extension-package.schema.json'),
  constraints: await json('spec/metamodel/generated/core-constraints.json'),
  domainPolicy: await json('spec/metamodel/generated/domain-policy.json'),
};
let browser;
let server;
try {
  await mkdir(wasmOut, {recursive: true});
  await mkdir(browserOut, {recursive: true});
  await run(process.env.CARGO ?? 'cargo', ['build', '--release', '--locked', '--offline', '--manifest-path', 'bindings/core/wasm/Cargo.toml', '--target', 'wasm32-unknown-unknown']);
  const wasmBinary = join(target, 'wasm32-unknown-unknown/release/umf_core_wasm.wasm');
  await run(process.env.UMF_WASM_BINDGEN ?? 'wasm-bindgen', ['--target', 'web', '--out-dir', wasmOut, '--out-name', 'umf_core_wasm', wasmBinary]);
  await mkdir(join(wasmOut, 'pkg'), {recursive: true});
  await copyFile(join(wasmOut, 'umf_core_wasm.js'), join(wasmOut, 'pkg/umf_core_wasm.js'));
  await copyFile(join(wasmOut, 'umf_core_wasm_bg.wasm'), join(wasmOut, 'pkg/umf_core_wasm_bg.wasm'));
  await copyFile(join(root, 'bindings/core/wasm/index.js'), join(wasmOut, 'index.js'));
  await copyFile(join(root, 'bindings/core/wasm/index.d.ts'), join(wasmOut, 'index.d.ts'));
  await Bun.$`cp -R ${join(root, 'bindings/core/wasm/src')} ${wasmOut}`;
  const entry = join(temp, 'entry.js');
  const source = uuidDocument('binary');
  await writeFile(entry, `import {initializeCoreBit128FieldWasm} from ${JSON.stringify(join(wasmOut, 'index.js'))};\nimport * as wasm from ${JSON.stringify(join(wasmOut, 'pkg/umf_core_wasm.js'))};\nconst resources=${JSON.stringify(resources)};const source=${JSON.stringify(source)};const identity=${JSON.stringify(FIELD)};\nwindow.run=async()=>{let wireCalls=0;const observedWasm=new Proxy(wasm,{get(target,key,receiver){const value=Reflect.get(target,key,receiver);if(key==='executeCoreBit128FieldRequestWire')return (...args)=>{wireCalls++;return value.apply(target,args)};return typeof value==='function'?value.bind(target):value}});const api=await initializeCoreBit128FieldWasm(resources,async()=>observedWasm);const output=api.declareCoreBit128Field(source,identity,'uuid');window.result={loaded:true,version:output.umf,wireCalls,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis),extensionsPreserved:JSON.stringify(output.vocabularies)===JSON.stringify(source.vocabularies)}};window.run().catch(e=>window.failure=String(e.stack||e));`);
  const built = await Bun.build({entrypoints: [entry], outdir: browserOut, naming: 'browser.js', target: 'browser', format: 'esm'});
  if (!built.success) throw Error(built.logs.map(log => log.message).join('\n'));
  await copyFile(join(wasmOut, 'umf_core_wasm_bg.wasm'), join(browserOut, 'umf_core_wasm_bg.wasm'));
  server = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname.slice(1);
    if (path === 'index.html') { response.end('<script type="module" src="/browser.js"></script>'); return; }
    try {
      const body = await readFile(join(browserOut, path));
      response.setHeader('content-type', extname(path) === '.wasm' ? 'application/wasm' : 'text/javascript');
      response.end(body);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(() => window.result || window.failure, undefined, {timeout: 120_000});
  const result = await page.evaluate(() => ({result: window.result, failure: window.failure, userAgent: navigator.userAgent}));
  assert.deepEqual(errors, []);
  assert.equal(result.failure, undefined);
  assert.deepEqual(result.result, {loaded: true, version: '0.10.0', wireCalls: 1, nodeGlobalsAbsent: true, extensionsPreserved: true});
  console.log(JSON.stringify({status: 'pass', browser: result.userAgent, checks: result.result}));
} finally {
  await browser?.close();
  server?.close();
  await rm(temp, {recursive: true, force: true});
}
