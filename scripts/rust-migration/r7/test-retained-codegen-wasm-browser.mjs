#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join, resolve, sep} from 'node:path';
import {chromium} from 'playwright';

const repo = resolve(new URL('../../../', import.meta.url).pathname);
const pkgDir = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('usage: node scripts/rust-migration/r7/test-retained-codegen-wasm-browser.mjs <wasm-bindgen-web-pkg-dir>');
const pins = {
  'docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json': '40c05901135a90b4d9777b88a1f62aa0ade6aa47dcf85f054db01dad04560c78',
  'docs/helix/04-build/evidence/rust-migration/r3/sol-generation-binding-module-boundary-review/frozen.json': '574607790d9c91f72b4b0213facbf6f80ad8ea68c9bdaa953e3215e81dfc9120',
  'docs/helix/04-build/evidence/rust-migration/r3/sol-final-access-diff-utf16-review/frozen.json': 'db359e559fd320c3ea28487e594b31b5438e8bcef51c2a73f23e664e787f2820',
};
for (const [path, expected] of Object.entries(pins)) {
  const actual = createHash('sha256').update(await readFile(join(repo, path))).digest('hex');
  assert.equal(actual, expected, `frozen fixture hash: ${path}`);
}
const resources = {};
for (const [name, path] of Object.entries({
  coreSchema: 'spec/core/schema.json', referenceSchema: 'spec/core/semantic-type-reference.schema.json',
  packageSchema: 'spec/core/extension-package.schema.json', constraints: 'spec/metamodel/generated/core-constraints.json',
  domainPolicy: 'spec/metamodel/generated/domain-policy.json', tablesPackage: 'spec/extensions/tables/package.json',
  actionsPackage: 'spec/extensions/actions/package.json', bindingPackage: 'spec/extensions/binding/package.json',
  stableBindingPackage: 'spec/extensions/binding-stable/package.json',
})) resources[name] = JSON.parse(await readFile(join(repo, path), 'utf8'));
const load = async path => JSON.parse(await readFile(join(repo, path), 'utf8'));
const inputs = JSON.stringify({
  resources,
  corpus: await load('docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json'),
  generation: (await load('docs/helix/04-build/evidence/rust-migration/r3/sol-generation-binding-module-boundary-review/frozen.json')).cases[0],
  accessDiff: (await load('docs/helix/04-build/evidence/rust-migration/r3/sol-final-access-diff-utf16-review/frozen.json')).cases[0],
});
const mime = path => path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (pathname === '/') { response.writeHead(200, {'content-type': 'text/html'}); response.end('<!doctype html>'); return; }
  if (pathname === '/inputs.json') { response.writeHead(200, {'content-type': 'application/json'}); response.end(inputs); return; }
  const local = pathname.startsWith('/repo/') ? resolve(repo, `.${decodeURIComponent(pathname.slice(5))}`)
    : pathname.startsWith('/wasm/') ? resolve(pkgDir, `.${decodeURIComponent(pathname.slice(5))}`) : '';
  const base = pathname.startsWith('/repo/') ? repo : pkgDir;
  if (local && (local === base || local.startsWith(`${base}${sep}`))) {
    try { response.writeHead(200, {'content-type': mime(local), 'cache-control': 'no-store'}); response.end(await readFile(local)); return; }
    catch { /* 404 below */ }
  }
  response.writeHead(404); response.end('not found');
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Browser server failed to start');
let browser;
try {
  browser = await chromium.launch({headless: true, timeout: 30_000, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`);
  const result = await page.evaluate(async () => {
    const wrapper = await import(new URL('/repo/bindings/core/wasm/index.js', location.href).href);
    const wasm = await import(new URL('/wasm/umf_core_wasm.js', location.href).href);
    await wasm.default();
    const data = await fetch('/inputs.json').then(response => response.json());
    const row = data.corpus.cases.find(item => item.operation === 'generatePythonClient' && item.expected.ok);
    const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
      : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
      : JSON.stringify(value);
    let defaultMode = 'observe', defaultCharged = 0, defaultStop = Infinity;
    const stateless = wrapper.createCodegenEngine(wasm, data.resources, {controls: {
      meter(amount) { defaultCharged += amount; if (defaultMode === 'meter' && defaultCharged > defaultStop) throw Error('late stateless meter'); },
      isCancelled() { return defaultMode === 'cancel' && defaultCharged > defaultStop; },
      now() { return defaultMode === 'deadline' && defaultCharged > defaultStop ? 2 : 0; }, deadlineMs: 1,
    }});
    const statelessSetupWork = defaultCharged;
    defaultCharged = 0;
    const statelessOutput = stateless.call(row.operation, row.request);
    const statelessCallWork = defaultCharged;
    let mode = 'observe', charged = 0, stop = Infinity, setupWork = 0;
    const engine = wrapper.createRetainedCodegenEngine(wasm, data.resources, {
      setupControls: {meter(amount) { setupWork += amount; }},
      controls: {
        meter(amount) { charged += amount; if (mode === 'meter' && charged > stop) throw new Error('late retained meter'); },
        isCancelled() { return mode === 'cancel' && charged > stop; },
        now() { return mode === 'deadline' && charged > stop ? 2 : 0; }, deadlineMs: 1,
      },
    });
    data.resources.tablesPackage.title = 'mutated after both factories';
    if (canonical(stateless.call(row.operation, row.request)) !== canonical(statelessOutput)) throw Error('stateless factory resource snapshot mismatch');
    const actual = engine.call(row.operation, row.request);
    if (canonical(actual) !== canonical(statelessOutput)) throw Error('retained/stateless WASM generatePythonClient output mismatch');
    const total = charged;
    charged = 0;
    actual.result.callerMutation = true;
    if (canonical(engine.call(row.operation, row.request)) !== canonical(statelessOutput)) throw Error('retained output copy isolation mismatch');
    charged = 0;
    if (total < 1000) throw Error('missing invocation accounting');
    if (setupWork <= statelessSetupWork || statelessCallWork <= total) throw Error('default/retained meter boundaries unexpectedly converged');
    const sharedThreshold = Math.floor((statelessCallWork + total) / 2);
    const policyDivergence = [];
    for (const [policy, code] of [['meter', 'METER_FAILURE'], ['cancel', 'CANCELLED'], ['deadline', 'DEADLINE']]) {
      defaultMode = policy; defaultCharged = 0; defaultStop = sharedThreshold;
      let statelessFailure = '';
      try { stateless.call(row.operation, row.request); } catch (error) { statelessFailure = error.code ?? ''; }
      if (statelessFailure !== code) throw Error(`stateless ${policy} threshold mismatch: ${statelessFailure}`);
      mode = policy; charged = 0; stop = sharedThreshold;
      let retainedFailure = '';
      try { engine.call(row.operation, row.request); } catch (error) { retainedFailure = error.code ?? ''; }
      if (retainedFailure) throw Error(`retained ${policy} unexpectedly refused at shared threshold: ${retainedFailure}`);
      policyDivergence.push(policy);
    }
    const statelessBudget = wrapper.createCodegenEngine(wasm, data.resources, {controls: {maxWork: sharedThreshold}});
    let budgetFailure = '';
    try { statelessBudget.call(row.operation, row.request); } catch (error) { budgetFailure = error.code ?? ''; }
    if (budgetFailure !== 'RESOURCE_LIMIT') throw Error(`stateless maxWork mismatch: ${budgetFailure}`);
    const retainedBudget = wrapper.createRetainedCodegenEngine(wasm, data.resources, {
      setupControls: {maxWork: 1_000_000_000}, controls: {maxWork: sharedThreshold},
    });
    try { retainedBudget.call(row.operation, row.request); }
    catch (error) { throw Error(`retained maxWork unexpectedly refused: ${error.code ?? ''}`); }
    retainedBudget.dispose();
    const invalidResources = structuredClone(data.resources);
    invalidResources.tablesPackage.schema = null;
    const deferredInvalid = wrapper.createCodegenEngine(wasm, invalidResources);
    let statelessInvalidCode = '';
    try { deferredInvalid.call('compileTableDeployment', {}); } catch (error) { statelessInvalidCode = error.code ?? ''; }
    if (statelessInvalidCode !== 'CODEGEN_RESOURCE_INVALID') throw Error(`stateless invalid resource timing mismatch: ${statelessInvalidCode}`);
    let retainedConstructionRefused = false;
    try { wrapper.createRetainedCodegenEngine(wasm, invalidResources); } catch { retainedConstructionRefused = true; }
    if (!retainedConstructionRefused) throw Error('retained invalid resource was not rejected during construction');
    defaultMode = 'observe'; mode = 'observe';
    if (canonical(engine.generateAccessPackage(data.generation.request.request, data.generation.request.profile)) !== canonical(data.generation.expected.result)) throw Error('frozen generateAccessPackage output mismatch');
    if (canonical(engine.diffAccessPackages(data.accessDiff.request.before, data.accessDiff.request.after)) !== canonical(data.accessDiff.expected.result)) throw Error('frozen diffAccessPackages output mismatch');
    for (const [policy, code] of [['meter', 'METER_FAILURE'], ['cancel', 'CANCELLED'], ['deadline', 'DEADLINE']]) {
      mode = policy; charged = 0; stop = Math.floor(total * 0.75);
      let observed = '';
      try { engine.call(row.operation, row.request); } catch (error) { observed = error.code ?? ''; }
      if (observed !== code || charged <= stop || charged >= total) throw Error(`${policy} second-call admission mismatch: ${observed}`);
    }
    engine.dispose(); engine.dispose();
    let disposed = '';
    try { engine.call(row.operation, row.request); } catch (error) { disposed = error.code ?? ''; }
    if (disposed !== 'RUST_CODEGEN_HANDLE_DISPOSED') throw Error('post-disposal refusal mismatch');
    return {status: 'pass', controlProbeCalls: 4, totalWork: total, statelessSetupWork, retainedSetupWork: setupWork, statelessCallWork, retainedCallWork: total, sharedThreshold, policyDivergence, maxWorkDivergence: 'stateless RESOURCE_LIMIT; retained succeeds', invalidResourceBoundary: 'stateless factory succeeds and first call refuses; retained factory refuses', parityCases: [row.operation, data.generation.operation, data.accessDiff.operation]};
  });
  const hash = createHash('sha256').update(await readFile(join(pkgDir, 'umf_core_wasm_bg.wasm'))).digest('hex');
  console.log(JSON.stringify({...result, browser: 'Chromium', wasmSha256: hash}, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
