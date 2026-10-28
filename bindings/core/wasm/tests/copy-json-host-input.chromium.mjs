// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';

const packageArg = process.argv[2];
if (!packageArg) {
  throw new Error('Usage: bun bindings/core/wasm/tests/copy-json-host-input.chromium.mjs <wasm-bindgen-package-dir>');
}
const packagePath = resolve(packageArg);
const wasmJsPath = resolve(packagePath, 'umf_core_wasm.js');
const wasmBinaryPath = resolve(packagePath, 'umf_core_wasm_bg.wasm');
const wasmJs = await readFile(wasmJsPath);
const wasmBinary = await readFile(wasmBinaryPath);
const bindingPath = resolve(import.meta.dir, '../copy-json-host-input.js');
const bindingJs = await readFile(bindingPath);
const hostJsonPath = resolve(import.meta.dir, '../src/host-json.js');
const hostJsonJs = await readFile(hostJsonPath);
const jsonSchemaPath = resolve(import.meta.dir, '../src/json-schema.js');
const jsonSchemaJs = await readFile(jsonSchemaPath);
const wirePath = resolve(import.meta.dir, '../src/wire.js');
const wireJs = await readFile(wirePath);

const referenceEntry = resolve(import.meta.dir, '../../../../src/model/json.ts');
const referenceBuild = await Bun.build({entrypoints: [referenceEntry], target: 'browser', format: 'esm', write: false});
if (!referenceBuild.success || referenceBuild.outputs.length !== 1) {
  throw new Error(`Could not bundle the TypeScript copyJson reference: ${JSON.stringify(referenceBuild.logs)}`);
}
const referenceJs = await referenceBuild.outputs[0].text();
const modules = new Map([
  ['/copy-json-host-input.js', {body: bindingJs, type: 'text/javascript'}],
  ['/src/host-json.js', {body: hostJsonJs, type: 'text/javascript'}],
  ['/src/json-schema.js', {body: jsonSchemaJs, type: 'text/javascript'}],
  ['/src/wire.js', {body: wireJs, type: 'text/javascript'}],
  ['/reference.js', {body: referenceJs, type: 'text/javascript'}],
  ['/pkg/umf_core_wasm.js', {body: wasmJs, type: 'text/javascript'}],
  ['/pkg/umf_core_wasm_bg.wasm', {body: wasmBinary, type: 'application/wasm'}],
]);
const requests = new Map();
let server;
try {
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const pathname = new URL(request.url).pathname;
      requests.set(pathname, (requests.get(pathname) ?? 0) + 1);
      if (pathname === '/') {
        return new Response('<!doctype html><meta charset="utf-8"><title>copyJson WASM check</title>', {
          headers: {'content-type': 'text/html; charset=utf-8'},
        });
      }
      const resource = modules.get(pathname);
      return resource
        ? new Response(resource.body, {headers: {'content-type': resource.type}})
        : new Response('not found', {status: 404});
    },
  });
} catch (error) {
  throw new Error(`Could not bind the Chromium loopback server: ${String(error)}`);
}

let browser;
try {
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage();
  const browserErrors = [];
  const failedRequests = [];
  let externalRequests = 0;
  await page.route('**/*', route => {
    if (!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)) {
      externalRequests++;
      return route.abort();
    }
    return route.continue();
  });
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('requestfailed', request => failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('response', response => {
    if (response.status() >= 400) browserErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.goto(`http://127.0.0.1:${server.port}/`, {waitUntil: 'load'});
  const result = await page.evaluate(async () => {
    const {copyJson: reference} = await import('/reference.js');
    const wasm = await import('/pkg/umf_core_wasm.js');
    await wasm.default('/pkg/umf_core_wasm_bg.wasm');
    if (typeof wasm.executeCopyJsonHostJson !== 'function') throw new Error('WASM copyJson export is missing');
    const calls = {copyJson: 0};
    const countedWasm = new Proxy(wasm, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver);
        if (key !== 'executeCopyJsonHostJson') return value;
        return (...args) => {
          calls.copyJson++;
          return Reflect.apply(value, target, args);
        };
      },
    });
    const {createCopyJsonHostInputEngine} = await import('/copy-json-host-input.js');
    const engine = createCopyJsonHostInputEngine(countedWasm);

    function describe(run, value) {
      try {
        const result = run(value);
        const sparse = [];
        const walk = (item, path) => {
          if (Array.isArray(item)) {
            const holes = [];
            for (let index = 0; index < item.length; index++) if (!Object.hasOwn(item, index)) holes.push(index);
            if (holes.length) sparse.push({path, holes});
            for (let index = 0; index < item.length; index++) if (Object.hasOwn(item, index)) walk(item[index], `${path}/${index}`);
          } else if (item && typeof item === 'object') {
            for (const key of Object.keys(item)) walk(item[key], `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`);
          }
        };
        walk(result, '');
        return {ok: true, json: JSON.stringify(result), sparse};
      }
      catch (error) {
        return {
          ok: false,
          name: error?.name,
          code: error?.code,
          path: error?.path,
          message: error?.message,
          identity: error === globalThis.sentinel,
        };
      }
    }
    function pair(name, make) {
      const trace = [];
      globalThis.trace = trace;
      const referenceResult = describe(reference, make());
      const referenceTrace = [...trace];
      trace.length = 0;
      const candidateResult = describe(value => engine.copyJson(value), make());
      const candidateTrace = [...trace];
      if (JSON.stringify(referenceResult) !== JSON.stringify(candidateResult)) {
        throw new Error(`Result mismatch: ${name}: ${JSON.stringify({referenceResult, candidateResult})}`);
      }
      if (JSON.stringify(referenceTrace) !== JSON.stringify(candidateTrace)) throw new Error(`Trace mismatch: ${name}`);
      if (name === 'proxy reflection order' && candidateTrace.some(item => item.startsWith('get:'))) {
        throw new Error('Proxy property getter was invoked');
      }
      if (name === 'proxy thrown-object identity' && (!referenceResult.identity || !candidateResult.identity)) {
        throw new Error('Proxy trap object identity was not preserved');
      }
      return {name, result: 'match', trace: candidateTrace};
    }

    const dynamicArray = () => {
      const target = [10, 20];
      let ownKeysCalls = 0;
      return new Proxy(target, {
        ownKeys(value) {
          ownKeysCalls++;
          return ownKeysCalls <= 2 ? ['1', 'length'] : Reflect.ownKeys(value);
        },
      });
    };

    const cases = [
      pair('accessor', () => {
        const value = {};
        Object.defineProperty(value, 'secret', {enumerable: true, get() { throw new Error('getter invoked'); }});
        return value;
      }),
      pair('custom prototype', () => Object.create({hidden: true})),
      pair('cycle', () => { const value = {}; value.self = value; return value; }),
      pair('hidden property', () => { const value = {}; Object.defineProperty(value, 'hidden', {value: 1}); return value; }),
      pair('symbol key', () => ({[Symbol('not-json')]: true})),
      pair('proxy reflection order', () => new Proxy({a: 1}, {
        getPrototypeOf(target) { globalThis.trace.push('getPrototypeOf'); return Reflect.getPrototypeOf(target); },
        ownKeys(target) { globalThis.trace.push('ownKeys'); return Reflect.ownKeys(target); },
        getOwnPropertyDescriptor(target, key) {
          globalThis.trace.push(`descriptor:${String(key)}`);
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
        get(target, key, receiver) { globalThis.trace.push(`get:${String(key)}`); return Reflect.get(target, key, receiver); },
      })),
      pair('proxy thrown-object identity', () => {
        const sentinel = {cause: 'trap'};
        globalThis.sentinel = sentinel;
        return new Proxy({}, {getPrototypeOf() { throw sentinel; }});
      }),
      pair('dynamic sparse snapshot root', dynamicArray),
      pair('dynamic sparse snapshot nested escaped path', () => ({'a/b~': dynamicArray()})),
      pair('depth 129', () => { let value = 0; for (let i = 0; i < 129; i++) value = [value]; return value; }),
      pair('unsafe integer', () => ({n: 9007199254740992})),
      pair('lone-surrogate key', () => Object.defineProperty(Object.create(null), '\ud800', {value: 1, enumerable: true})),
      pair('isolated-surrogate string', () => '\ud800'),
      pair('surrogate-pair split across text frames', () => 'x'.repeat(8191) + '😀' + '\udfff'),
      pair('long string across many text frames', () => 'x'.repeat(131_073)),
    ];
    const memory = () => performance.memory ? {
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
    } : null;
    const memoryBeforeBoundary = memory();
    const boundaryStarted = performance.now();
    const boundaryInput = Array(99_999).fill(null);
    const boundaryOutput = engine.copyJson(boundaryInput);
    if (boundaryOutput.length !== 99_999 || boundaryOutput[0] !== null || boundaryOutput.at(-1) !== null) {
      throw new Error('Exactly 100,000 JSON values were not admitted');
    }
    const overflowInput = Array(100_000).fill(null);
    const referenceOverflow = describe(reference, overflowInput);
    const candidateOverflow = describe(value => engine.copyJson(value), overflowInput);
    if (JSON.stringify(referenceOverflow) !== JSON.stringify(candidateOverflow) || candidateOverflow.ok) {
      throw new Error('100,001-value overflow refusal differs from TypeScript');
    }
    const boundary = {
      admittedValues: 100_000,
      overflowValues: 100_001,
      result: 'match',
      elapsedMs: Math.round(performance.now() - boundaryStarted),
      memoryBefore: memoryBeforeBoundary,
      memoryAfter: memory(),
    };
    if (calls.copyJson !== cases.length + 2) throw new Error(`Expected ${cases.length + 2} WASM copy calls, got ${calls.copyJson}`);
    if (!wasm.engineVersion || typeof wasm.engineVersion !== 'function') throw new Error('WASM module did not initialize');
    return {engineVersion: wasm.engineVersion(), wasmCopyCalls: calls.copyJson, cases, boundary};
  });

  assert.match(browser.version(), /^\d+\./, `Invalid Chromium version ${browser.version()}`);
  assert.equal(result.engineVersion, 'umf-core-r2');
  assert.equal(result.wasmCopyCalls, 17);
  assert.deepEqual(result.cases.map(item => item.name), [
    'accessor', 'custom prototype', 'cycle', 'hidden property', 'symbol key',
    'proxy reflection order', 'proxy thrown-object identity', 'dynamic sparse snapshot root',
    'dynamic sparse snapshot nested escaped path', 'depth 129',
    'unsafe integer', 'lone-surrogate key', 'isolated-surrogate string',
    'surrogate-pair split across text frames', 'long string across many text frames',
  ]);
  assert.equal(result.cases.every(item => item.result === 'match'), true);
  assert.deepEqual(result.cases.find(item => item.name === 'proxy reflection order').trace,
    ['getPrototypeOf', 'ownKeys', 'ownKeys', 'descriptor:a']);
  assert.equal(externalRequests, 0);
  assert.deepEqual(browserErrors, []);
  assert.deepEqual(failedRequests, []);
  assert.ok((requests.get('/pkg/umf_core_wasm_bg.wasm') ?? 0) > 0, 'The WASM binary was not fetched');
  console.log(JSON.stringify({status: 'pass', chromium: browser.version(), engineVersion: result.engineVersion,
    wasmCopyCalls: result.wasmCopyCalls, cases: result.cases.map(item => item.name), boundary: result.boundary,
    externalRequests}, null, 2));
} finally {
  await browser?.close();
  server.stop(true);
}
