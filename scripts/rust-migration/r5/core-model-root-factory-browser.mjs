import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve, sep} from 'node:path';
import {chromium} from 'playwright';

const root = resolve(import.meta.dir, '../../..');
const packageRoot = resolve(process.env.UMF_ROOT_FACTORY_PACKAGE ?? '');
if (!process.env.UMF_ROOT_FACTORY_PACKAGE) throw new Error('UMF_ROOT_FACTORY_PACKAGE is required');
const resourcePaths = {
  coreSchema: 'spec/core/schema.json',
  referenceSchema: 'spec/core/semantic-type-reference.schema.json',
  packageSchema: 'spec/core/extension-package.schema.json',
  constraints: 'spec/metamodel/generated/core-constraints.json',
  domainPolicy: 'spec/metamodel/generated/domain-policy.json',
};
const resources = Object.fromEntries(await Promise.all(Object.entries(resourcePaths).map(async ([key, path]) => [
  key, JSON.parse(await readFile(`${root}/${path}`, 'utf8')),
])));
const server = createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (path === '/') {
    response.writeHead(200, {'content-type': 'text/html'});
    response.end('<!doctype html><meta charset="utf-8">');
    return;
  }
  if (path === '/resources.json') {
    response.writeHead(200, {'content-type': 'application/json'});
    response.end(JSON.stringify(resources));
    return;
  }
  if (path.startsWith('/package/')) {
    const local = resolve(packageRoot, `.${decodeURIComponent(path.slice('/package'.length))}`);
    if (local === packageRoot || !local.startsWith(`${packageRoot}${sep}`)) {
      response.writeHead(403); response.end('outside package'); return;
    }
    try {
      const bytes = await readFile(local);
      response.writeHead(200, {
        'content-type': local.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
        'cache-control': 'no-store',
      });
      response.end(bytes);
      return;
    } catch { /* handled as 404 */ }
  }
  response.writeHead(404); response.end('missing');
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Browser test server failed to start');
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    timeout: 30_000,
    ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {}),
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`);
  const actual = await page.evaluate(async () => {
    const wrapper = await import(new URL('/package/index.js', location.href).href);
    const wasm = await import(new URL('/package/pkg/umf_core_wasm.js', location.href).href);
    if (typeof wasm.default === 'function') await wasm.default();
    const resources = await fetch('/resources.json').then(response => response.json());
    const root = wrapper.createCoreModelRootEngine(wasm, resources);
    const rootTupleKeys = ['encodeCoreKeyTuple', 'verifyCoreKeyTuple', 'readCoreKeyTupleBytes', 'prepareCoreKeyTuples'];
    const omitted = rootTupleKeys.every(key => !(key in root));
    const publicModel = wrapper.createCoreModelEngine(wasm, resources);
    const eagerPublic = rootTupleKeys.every(key => typeof publicModel[key] === 'function');
    return {omitted, eagerPublic, nodeGlobalsAbsent: typeof process === 'undefined' && typeof Buffer === 'undefined'};
  });
  assert.deepEqual(actual, {omitted: true, eagerPublic: true, nodeGlobalsAbsent: true});
  console.log(JSON.stringify({status: 'pass', browser: await browser.version(), packageRoot, ...actual}));
} finally {
  await browser?.close();
  server.close();
}
