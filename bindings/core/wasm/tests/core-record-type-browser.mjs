// Real Chromium replay for the opt-in retained WASM Core Record Type route.
import assert from 'node:assert/strict';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {extname, join, normalize} from 'node:path';
import {chromium} from 'playwright';

const root = process.cwd();
const pkg = process.env.UMF_RECORD_TYPE_WASM_PKG;
if (!pkg) throw new Error('UMF_RECORD_TYPE_WASM_PKG is required');
const host = '/private/tmp/umf-record-type-retained-chromium';
await mkdir(join(host, 'wasm/src'), {recursive: true});
await mkdir(join(host, 'wasm/pkg'), {recursive: true});
await writeFile(join(host, 'wasm/index.js'), await readFile(join(root, 'bindings/core/wasm/index.js')));
for (const file of await readdir(join(root, 'bindings/core/wasm/src'))) {
  if (file.endsWith('.js')) await writeFile(join(host, 'wasm/src', file), await readFile(join(root, 'bindings/core/wasm/src', file)));
}
for (const file of ['umf_core_wasm.js', 'umf_core_wasm_bg.wasm', 'umf_core_wasm.d.ts']) {
  await writeFile(join(host, 'wasm/pkg', file), await readFile(join(pkg, file)));
}
await writeFile(join(host, 'wasm/package.json'), '{"type":"module"}');
const resourcePaths = {
  coreSchema: 'spec/core/schema.json',
  referenceSchema: 'spec/core/semantic-type-reference.schema.json',
  packageSchema: 'spec/core/extension-package.schema.json',
  constraints: 'spec/metamodel/generated/core-constraints.json',
  domainPolicy: 'spec/metamodel/generated/domain-policy.json',
};
const [resources, packet] = await Promise.all([
  Promise.all(Object.entries(resourcePaths).map(async ([key, path]) => [key, JSON.parse(await readFile(join(root, path), 'utf8'))])).then(Object.fromEntries),
  readFile(join(root, 'tests/rust-core/fixtures/r5-core-record-type/frozen-typescript.json'), 'utf8').then(JSON.parse),
]);
await writeFile(join(host, 'input.json'), JSON.stringify({resources, packet}));
const mime = {'.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.d.ts': 'text/plain'};
const server = createServer(async (req, res) => {
  try {
    const path = normalize(join(host, decodeURIComponent(new URL(req.url, 'http://localhost').pathname)));
    if (!path.startsWith(host)) throw Error('path');
    res.writeHead(200, {'content-type': mime[extname(path)] ?? 'application/octet-stream'});
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/input.json`);
  const actual = await page.evaluate(async () => {
    const {resources, packet} = await (await fetch('/input.json')).json();
    const {createCoreRecordTypeEngine} = await import('/wasm/index.js');
    const {default: initialize} = await import('/wasm/pkg/umf_core_wasm.js');
    await initialize();
    const module = await import('/wasm/pkg/umf_core_wasm.js');
    const engine = createCoreRecordTypeEngine(module, resources);
    const success = {};
    for (const variant of ['nested', 'qualified', 'recursive']) {
      const declaration = packet.successes[`declare-${variant}`];
      const declared = engine.declareCoreRecordType(declaration.fieldAuthor, declaration.recordAuthor);
      success[`declare-${variant}`] = declared;
      success[`verify-${variant}`] = engine.verifyCoreRecordTypeDeclaration(declared, declared.target);
    }
    const before = engine.prepareCoreRecordTypeVerification(success['declare-nested']);
    const after = engine.finishCoreRecordTypeVerification(before, success['declare-nested'].target);
    let reuse;
    try { engine.finishCoreRecordTypeVerification(before, success['declare-nested'].target); } catch (error) { reuse = error.message; }
    let zero;
    try {
      const constrained = createCoreRecordTypeEngine(module, resources, {controls: {maxWork: 0}});
      constrained.declareCoreRecordType(packet.successes['declare-nested'].fieldAuthor, packet.successes['declare-nested'].recordAuthor);
    } catch (error) { zero = error.code; }
    let setupUnits = 0, callUnits = 0;
    const controlled = createCoreRecordTypeEngine(module, resources, {
      setupControls: {meter(work) { setupUnits += work; }},
      controls: {meter(work) { callUnits += work; }},
    });
    controlled.declareCoreRecordType(packet.successes['declare-nested'].fieldAuthor, packet.successes['declare-nested'].recordAuthor);
    controlled.dispose();
    let cancelled = false;
    const cancelEngine = createCoreRecordTypeEngine(module, resources, {controls: {isCancelled: () => cancelled}});
    const cancelStage = cancelEngine.prepareCoreRecordTypeVerification(packet.successes['declare-nested']);
    cancelled = true;
    let callTwoCancel;
    try { cancelEngine.finishCoreRecordTypeVerification(cancelStage, packet.successes['declare-nested'].target); } catch (error) { callTwoCancel = error.code; }
    cancelEngine.dispose();
    let now = 0;
    const deadlineEngine = createCoreRecordTypeEngine(module, resources, {controls: {deadlineMs: 5, now: () => now}});
    const deadlineStage = deadlineEngine.prepareCoreRecordTypeVerification(packet.successes['declare-nested']);
    now = 6;
    let callTwoDeadline;
    try { deadlineEngine.finishCoreRecordTypeVerification(deadlineStage, packet.successes['declare-nested'].target); } catch (error) { callTwoDeadline = error.code; }
    deadlineEngine.dispose();
    let prepareWork = 0;
    const workProbe = createCoreRecordTypeEngine(module, resources, {controls: {meter: amount => { prepareWork += amount; }}});
    workProbe.prepareCoreRecordTypeVerification(packet.successes['declare-nested']); workProbe.dispose();
    const budgetEngine = createCoreRecordTypeEngine(module, resources, {controls: {maxWork: prepareWork}});
    const budgetStage = budgetEngine.prepareCoreRecordTypeVerification(packet.successes['declare-nested']);
    let callTwoBudget;
    try { budgetEngine.finishCoreRecordTypeVerification(budgetStage, packet.successes['declare-nested'].target); } catch (error) { callTwoBudget = error.code; }
    budgetEngine.dispose();
    engine.dispose();
    return {success, after, reuse, zero, setupUnits, callUnits, callTwoCancel, callTwoDeadline, callTwoBudget, nodeGlobalsAbsent: !('process' in globalThis) && !('Buffer' in globalThis)};
  });
  for (const [key, value] of Object.entries(actual.success)) assert.deepEqual(JSON.parse(JSON.stringify(value)), packet.successes[key]);
  assert.deepEqual(JSON.parse(JSON.stringify(actual.after)), packet.successes['verify-nested']);
  assert.match(actual.reuse, /Invalid private Record Type verification handle/);
  assert.equal(actual.zero, 'RESOURCE_LIMIT');
  assert.ok(actual.setupUnits > 0 && actual.callUnits > 0);
  assert.equal(actual.callTwoCancel, 'CANCELLED');
  assert.equal(actual.callTwoDeadline, 'DEADLINE');
  assert.equal(actual.callTwoBudget, 'RESOURCE_LIMIT');
  assert.equal(actual.nodeGlobalsAbsent, true);
  console.log(JSON.stringify({status: 'pass', browser: browser.version(), nodeGlobalsAbsent: actual.nodeGlobalsAbsent}));
} finally { await browser?.close(); server.close(); }
