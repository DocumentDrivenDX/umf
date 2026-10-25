#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createCodegenEngine, createRetainedCodegenEngine as createRetainedNodeCodegenEngine} from '../../../bindings/core/node/index.js';
import {createRetainedCodegenEngine} from '../../../bindings/core/wasm/index.js';

const repo = resolve(new URL('../../../', import.meta.url).pathname);
const pkgDir = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('usage: node scripts/rust-migration/r7/test-retained-codegen-wasm-node.mjs <wasm-bindgen-node-pkg-dir>');
const pins = {
  'docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json': '40c05901135a90b4d9777b88a1f62aa0ade6aa47dcf85f054db01dad04560c78',
  'docs/helix/04-build/evidence/rust-migration/r3/sol-generation-binding-module-boundary-review/frozen.json': '574607790d9c91f72b4b0213facbf6f80ad8ea68c9bdaa953e3215e81dfc9120',
  'docs/helix/04-build/evidence/rust-migration/r3/sol-final-access-diff-utf16-review/frozen.json': 'db359e559fd320c3ea28487e594b31b5438e8bcef51c2a73f23e664e787f2820',
};
for (const [path, expected] of Object.entries(pins)) {
  const actual = createHash('sha256').update(await readFile(join(repo, path))).digest('hex');
  assert.equal(actual, expected, `frozen fixture hash: ${path}`);
}
const resourcePaths = {
  coreSchema: 'spec/core/schema.json',
  referenceSchema: 'spec/core/semantic-type-reference.schema.json',
  packageSchema: 'spec/core/extension-package.schema.json',
  constraints: 'spec/metamodel/generated/core-constraints.json',
  domainPolicy: 'spec/metamodel/generated/domain-policy.json',
  tablesPackage: 'spec/extensions/tables/package.json',
  actionsPackage: 'spec/extensions/actions/package.json',
  bindingPackage: 'spec/extensions/binding/package.json',
  stableBindingPackage: 'spec/extensions/binding-stable/package.json',
};
const resources = {};
for (const [name, path] of Object.entries(resourcePaths)) resources[name] = JSON.parse(await readFile(join(repo, path), 'utf8'));
const corpus = JSON.parse(await readFile(join(repo, 'docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json'), 'utf8'));
const generation = JSON.parse(await readFile(join(repo, 'docs/helix/04-build/evidence/rust-migration/r3/sol-generation-binding-module-boundary-review/frozen.json'), 'utf8')).cases[0];
const accessDiff = JSON.parse(await readFile(join(repo, 'docs/helix/04-build/evidence/rust-migration/r3/sol-final-access-diff-utf16-review/frozen.json'), 'utf8')).cases[0];
const parity = corpus.cases.find(row => row.operation === 'generatePythonClient' && row.expected.ok);
assert.ok(parity, 'frozen successful generatePythonClient case is present');

const module = await import(pathToFileURL(join(pkgDir, 'umf_core_wasm.js')).href);
if (typeof module.default === 'function') await module.default();
assert.equal(typeof module.RetainedCodegenResourcesRuntime, 'function');
let defaultMode = 'observe';
let defaultCharged = 0;
let defaultStop = Infinity;
const stateless = createCodegenEngine(resources, {controls: {
  meter(amount) { defaultCharged += amount; if (defaultMode === 'meter' && defaultCharged > defaultStop) throw new Error('late stateless meter'); },
  isCancelled() { return defaultMode === 'cancel' && defaultCharged > defaultStop; },
  now() { return defaultMode === 'deadline' && defaultCharged > defaultStop ? 2 : 0; },
  deadlineMs: 1,
}});
const defaultSetupWork = defaultCharged;
defaultCharged = 0;
const expected = stateless.call(parity.operation, parity.request);
const defaultCallWork = defaultCharged;
let mode = 'observe';
let charged = 0;
let stop = Infinity;
let setupWork = 0;
const retained = createRetainedCodegenEngine(module, resources, {
  setupControls: {meter(amount) { setupWork += amount; }},
  controls: {
    meter(amount) { charged += amount; if (mode === 'meter' && charged > stop) throw new Error('late retained meter'); },
    isCancelled() { return mode === 'cancel' && charged > stop; },
    now() { return mode === 'deadline' && charged > stop ? 2 : 0; },
    deadlineMs: 1,
  },
});
resources.tablesPackage.title = 'mutated after both factories';
assert.equal(JSON.stringify(stateless.call(parity.operation, parity.request)), JSON.stringify(expected), 'stateless factory snapshots caller resources');
const actual = retained.call(parity.operation, parity.request);
assert.equal(JSON.stringify(actual), JSON.stringify(expected), 'retained WASM output matches stateless Node baseline');
const total = charged;
charged = 0;
actual.result.callerMutation = true;
assert.equal(JSON.stringify(retained.call(parity.operation, parity.request)), JSON.stringify(expected), 'retained outputs are copied between calls');
charged = 0;
assert.ok(total > 1_000, 'per-call work is metered');
assert.ok(setupWork > defaultSetupWork, 'retained setup meters native resource compilation in addition to host snapshots');
assert.ok(defaultCallWork > total, 'stateless call meters resource compilation on each call');
const sharedThreshold = Math.floor((defaultCallWork + total) / 2);
assert.ok(sharedThreshold > total && sharedThreshold < defaultCallWork);
const crossPolicy = [];
for (const [policy, code] of [['meter', 'METER_FAILURE'], ['cancel', 'CANCELLED'], ['deadline', 'DEADLINE']]) {
  defaultMode = policy; defaultCharged = 0; defaultStop = sharedThreshold;
  assert.throws(() => stateless.call(parity.operation, parity.request), {code}, `stateless ${policy} threshold`);
  mode = policy; charged = 0; stop = sharedThreshold;
  assert.doesNotThrow(() => retained.call(parity.operation, parity.request), `retained ${policy} at the same threshold`);
  crossPolicy.push(policy);
}
const statelessBudget = createCodegenEngine(resources, {controls: {maxWork: sharedThreshold}});
assert.throws(() => statelessBudget.call(parity.operation, parity.request), {code: 'RESOURCE_LIMIT'}, 'stateless maxWork includes per-call resource compilation');
const retainedBudget = createRetainedCodegenEngine(module, resources, {
  setupControls: {maxWork: 1_000_000_000}, controls: {maxWork: sharedThreshold},
});
assert.doesNotThrow(() => retainedBudget.call(parity.operation, parity.request), 'retained per-call maxWork excludes one-time compilation');
retainedBudget.dispose();
const invalidResources = structuredClone(resources);
invalidResources.tablesPackage.schema = null;
assert.doesNotThrow(() => createCodegenEngine(invalidResources), 'stateless factory defers semantic catalog compilation');
let statelessInvalidCode = '';
try { createCodegenEngine(invalidResources).call('compileTableDeployment', {}); }
catch (error) { statelessInvalidCode = error.code ?? ''; }
assert.equal(statelessInvalidCode, 'CODEGEN_RESOURCE_INVALID');
let retainedInvalidCode = '';
try { createRetainedNodeCodegenEngine(invalidResources); }
catch (error) { retainedInvalidCode = error.code ?? ''; }
assert.equal(retainedInvalidCode, 'GenericFailure', 'Node retained factory compiles and refuses the same invalid resource during construction');
let wasmRetainedConstructionRefused = false;
try { createRetainedCodegenEngine(module, invalidResources); }
catch { wasmRetainedConstructionRefused = true; }
assert.ok(wasmRetainedConstructionRefused, 'WASM retained factory also refuses invalid resources during construction');
defaultMode = 'observe'; mode = 'observe';
assert.equal(JSON.stringify(retained.generateAccessPackage(generation.request.request, generation.request.profile)), JSON.stringify(generation.expected.result));
assert.equal(JSON.stringify(retained.diffAccessPackages(accessDiff.request.before, accessDiff.request.after)), JSON.stringify(accessDiff.expected.result));
for (const [policy, code] of [['meter', 'METER_FAILURE'], ['cancel', 'CANCELLED'], ['deadline', 'DEADLINE']]) {
  mode = policy;
  charged = 0;
  stop = Math.floor(total * 0.75);
  assert.throws(() => retained.call(parity.operation, parity.request), {code}, `second-call ${policy} admission`);
  assert.ok(charged > stop && charged < total, `${policy} interrupts the current invocation`);
}
retained.dispose();
retained.dispose();
assert.throws(() => retained.call(parity.operation, parity.request), {code: 'RUST_CODEGEN_HANDLE_DISPOSED'});

const hashes = {};
for (const file of ['umf_core_wasm.js', 'umf_core_wasm.d.ts', 'umf_core_wasm_bg.wasm', 'umf_core_wasm_bg.wasm.d.ts']) {
  hashes[file] = createHash('sha256').update(await readFile(join(pkgDir, file))).digest('hex');
}
console.log(JSON.stringify({status: 'pass', wasmClass: typeof module.RetainedCodegenResourcesRuntime, controlProbeCalls: 4, totalWork: total, statelessSetupWork: defaultSetupWork, retainedSetupWork: setupWork, statelessCallWork: defaultCallWork, retainedCallWork: total, sharedThreshold, policyDivergence: crossPolicy, maxWorkDivergence: 'stateless RESOURCE_LIMIT; retained succeeds', invalidResourceBoundary: 'stateless first call refuses; Node retained factory refuses', parityCases: [parity.operation, generation.operation, accessDiff.operation], hashes}, null, 2));
