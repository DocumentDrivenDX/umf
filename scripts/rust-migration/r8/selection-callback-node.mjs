// SPDX-License-Identifier: MIT OR Apache-2.0
// Private semantic callback route comparison against the same-host TypeScript
// selection implementation. This does not select the package default route.
import assert from 'node:assert/strict';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runSelectionCallbackSuite} from './selection-callback-suite.mjs';

const root = resolve(import.meta.dirname, '../../..');
const addonPath = process.env.UMF_SELECTION_ADDON ?? '/private/tmp/umf-selection-callback-target/release/umf_core_node.node';
const require = createRequire(import.meta.url);
const addon = require(addonPath);
const [{Registry, UmfError, selectCoreElements}, hostJson] = await Promise.all([
  import(pathToFileURL(resolve(root, 'dist/umf-node.js'))),
  import(pathToFileURL(resolve(root, 'bindings/core/node/src/host-json.js'))),
]);
const carrierReceiver = {};
const carrierArgument = {};
const carrierResult = Object.freeze({valid: false, diagnostics: []});
function validateDocument(document) {
  assert.equal(this, carrierReceiver);
  assert.equal(document, carrierArgument);
  return carrierResult;
}
assert.equal(hostJson.coreOpaqueReturnHostInput(addon, validateDocument, carrierReceiver, carrierArgument, UmfError), carrierResult);
const carrierThrown = Object.freeze({kind: 'opaque-return-thrown'});
assert.throws(() => hostJson.coreOpaqueReturnHostInput(addon, function() { throw carrierThrown; }, {}, {}, UmfError), error => error === carrierThrown);
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const resources = {
  coreSchema: read('spec/core/schema.json'),
  referenceSchema: read('spec/core/semantic-type-reference.schema.json'),
  packageSchema: read('spec/core/extension-package.schema.json'),
  constraints: read('spec/metamodel/generated/core-constraints.json'),
  domainPolicy: read('spec/metamodel/generated/domain-policy.json'),
};
const candidateEngine = hostJson.createCoreElementSelectionHostInputEngine(addon, resources, UmfError);
const candidate = (source, query, registry) => candidateEngine.selectCoreElements(source, query, registry);
const result = runSelectionCallbackSuite({Registry, selectCoreElements, candidate});
assert.equal(result.caseCount, 24);
assert.equal(result.summary.exactOutcomeMatches, result.caseCount, JSON.stringify(result.summary.mismatches));
assert.equal(result.summary.exactHostTraceMatches, result.caseCount, JSON.stringify(result.summary.mismatches));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pinned = [
  'src/validation/constraint-kernel.ts', 'src/model/selection.ts', 'src/model/json.ts',
  'crates/umf-core/src/constraints.rs', 'crates/umf-core/src/engine.rs',
  'crates/umf-core/src/host_json.rs', 'crates/umf-core/src/registry.rs',
  'crates/umf-core/src/selection_diagnostics.rs', 'crates/umf-core/src/selection_host_json.rs',
  'bindings/core/node/src/host-json.js', 'bindings/core/node/src/host_json.rs', 'src/access/rust-selection-default.ts',
  'bindings/core/wasm/src/host-json.js', 'bindings/core/wasm/src/host_json.rs',
  'bindings/core/node/tests/selection-host-json.test.js',
  'scripts/rust-migration/r8/selection-callback-suite.mjs',
  'scripts/rust-migration/r8/selection-callback-node.mjs',
  'scripts/rust-migration/r8/selection-callback-browser-entry.ts',
  'scripts/rust-migration/r8/selection-callback-browser.mjs',
  'dist/umf.js', 'dist/umf-node.js',
  'scripts/rust-migration/r5/selection/input.json',
  'scripts/rust-migration/r5/selection/frozen-typescript.json',
  'spec/core/schema.json', 'spec/core/semantic-type-reference.schema.json',
  'spec/core/extension-package.schema.json', 'spec/metamodel/generated/core-constraints.json',
  'spec/metamodel/generated/domain-policy.json',
];
const sourceHashes = Object.fromEntries(pinned.map(path => [path, sha(readFileSync(resolve(root, path)))]));
const record = {profile: 'umf.r8.selection-semantic-callback.private.node/1',
  status: 'pass-private-24-case-exact-outcomes-and-host-traces', runtime: process.version,
  caseCount: result.caseCount, summary: result.summary,
  candidateAddon: {path: addonPath, sha256: sha(readFileSync(addonPath))}, sourceHashes,
  opaqueReturnCarrier: {objectIdentity: true, thrownIdentity: true, scope: 'private invocation-local object/function handle return; primitive returns refused'},
  limits: ['Private opt-in host route; no package default/root selection change or release qualification.',
    'Pins same-host bundled TS reference, route sources, resources and fixtures.',
    'Spread coverage includes undefined return, non-callable Symbol.iterator, a throwing Symbol.iterator getter, number/null/undefined iterator-method returns, and next/done/value abrupt completions; other native spread failures, kindRuntime and default routing remain unqualified.']};
const defaultReceipt = typeof Bun === 'undefined' ? 'node.json' : 'bun.json';
const receiptPath = resolve(process.env.UMF_SELECTION_RECEIPT ?? `docs/helix/04-build/evidence/rust-migration/r8-selection-callback-trace/${defaultReceipt}`);
mkdirSync(dirname(receiptPath), {recursive: true});
writeFileSync(receiptPath, JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({status: record.status, runtime: process.version,
  caseCount: result.caseCount, summary: result.summary, receiptPath}, null, 2));
