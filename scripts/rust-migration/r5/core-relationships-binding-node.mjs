// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay the frozen relationship predecessor through a packed Node/Bun binding.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {relative, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(process.env.UMF_R5_REPO_ROOT ?? new URL('../../../', import.meta.url).pathname);
const entry = process.env.UMF_R5_BINDING_ENTRY ?? resolve(root, 'bindings/core/node/index.js');
const packageSpecifier = process.env.UMF_R5_NODE_PACKAGE_SPECIFIER;
if (packageSpecifier) {
  const installRoot = process.env.UMF_R5_INSTALLED_PACKAGE_ROOT;
  assert.ok(installRoot, 'installed package-name replay requires UMF_R5_INSTALLED_PACKAGE_ROOT');
  const fromInstallRoot = relative(resolve(installRoot), fileURLToPath(import.meta.url));
  assert.ok(fromInstallRoot && !fromInstallRoot.startsWith(`..${sep}`), 'copy this harness inside the extracted install root for bare package resolution');
}
const {createCoreModelEngine} = await import(packageSpecifier ?? pathToFileURL(entry).href);
const read = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const resourcePaths = {
  coreSchema: 'spec/core/schema.json',
  referenceSchema: 'spec/core/semantic-type-reference.schema.json',
  packageSchema: 'spec/core/extension-package.schema.json',
  constraints: 'spec/metamodel/generated/core-constraints.json',
  domainPolicy: 'spec/metamodel/generated/domain-policy.json',
};
const [resources, frozen] = await Promise.all([
  Promise.all(Object.entries(resourcePaths).map(async ([key, path]) => [key, await read(path)])).then(Object.fromEntries),
  read('docs/helix/04-build/evidence/rust-migration/r5-core-relationships/frozen-typescript.json'),
]);
const hashFile = async path => createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');
const api = createCoreModelEngine(resources);
const capture = fn => {
  try { return {ok: true, value: fn()}; }
  catch (error) { return {ok: false, error: {code: error.code ?? '', message: error.message ?? String(error), path: error.path ?? ''}}; }
};
const names = {
  inspect_known: c => api.inspectCoreRelationships(c.source, c.identity),
  inspect_missing: c => api.inspectCoreRelationships(c.source, c.identity),
  lookup_stable_id: c => api.lookupCoreRelationship(c.source, c.identity),
  inspect_unknown_meaning: c => api.inspectCoreRelationships(c.source, c.identity),
  lookup_unknown_meaning: c => api.lookupCoreRelationship(c.source, c.identity),
  author_new_relationship: c => api.declareCoreRelationship(c.source, c.identity, c.request),
  aggregate_output_limit_refusal: c => api.declareCoreRelationship(c.source, c.identity, c.request),
  presentation_edit_preserves_unknowns: c => api.declareCoreRelationship(c.source, c.identity, c.request),
  unknown_meaning_edit_refused: c => api.declareCoreRelationship(c.source, c.identity, c.request),
  stable_id_endpoint_change_refused: c => api.declareCoreRelationship(c.source, c.identity, c.request),
  lookup_absent_id: c => api.lookupCoreRelationship(c.source, c.identity),
  invalid_identity_before_invalid_source: c => api.inspectCoreRelationships(c.source, c.identity),
  invalid_lookup_identity_before_invalid_source: c => api.lookupCoreRelationship(c.source, c.identity),
  invalid_request_before_invalid_source: c => api.declareCoreRelationship(c.source, c.identity, c.request),
  old_core_version_refused: c => api.inspectCoreRelationships(c.source, c.identity),
  future_lifecycle_edit_refused: c => api.declareCoreRelationship(c.source, c.identity, c.request),
  unknown_path_utf16_and_pointer_escape: c => ({
    view: api.lookupCoreRelationship(c.source, c.identity),
    expectedPath: c.expectedPath,
  }),
};
const canonical = value => Array.isArray(value)
  ? `[${value.map(canonical).join(',')}]`
  : value !== null && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const equal = (name, actual, expected) => assert.equal(canonical(actual), canonical(expected), name);
const actual = {};
for (const [name, operation] of Object.entries(names)) actual[name] = capture(() => operation(frozen.cases[name]));
for (const name of Object.keys(names)) equal(name, actual[name], frozen.outcomes[name]);

const authorCase = frozen.cases.author_new_relationship;
const receipt = api.declareCoreRelationship(authorCase.source, authorCase.identity, authorCase.request);
const jsonReceipt = api.readValue(api.writeValue(receipt, 'json'), 'json');
actual.verify_roundtrip_json = capture(() => api.verifyCoreRelationshipOperation(jsonReceipt, receipt.target));
const yamlReceipt = api.readValue(api.writeValue(receipt, 'yaml'), 'yaml');
actual.verify_roundtrip_yaml = capture(() => api.verifyCoreRelationshipOperation(yamlReceipt, receipt.target));
equal('verify_roundtrip_json', actual.verify_roundtrip_json, frozen.outcomes.verify_roundtrip_json);
equal('verify_roundtrip_yaml', actual.verify_roundtrip_yaml, frozen.outcomes.verify_roundtrip_yaml);

const isolationSource = structuredClone(frozen.cases.inspect_known.source);
const isolationResult = api.inspectCoreRelationships(isolationSource, frozen.cases.inspect_known.identity);
isolationResult.source.extensions.future.unknown[0] = 'mutated-result';
actual.copy_isolation = {sourceUnchanged: isolationSource.extensions.future.unknown[0] === '9007199254740993'};
equal('copy_isolation', actual.copy_isolation, frozen.outcomes.copy_isolation);
const aggregateSource = structuredClone(frozen.cases.aggregate_output_limit_refusal.source);
actual.aggregate_output_limit_refusal = capture(() => api.declareCoreRelationship(aggregateSource, frozen.cases.aggregate_output_limit_refusal.identity, frozen.cases.aggregate_output_limit_refusal.request));
actual.aggregate_output_source_unchanged = {sourceUnchanged: canonical(aggregateSource) === canonical(frozen.cases.aggregate_output_limit_refusal.source)};
equal('aggregate_output_limit_refusal', actual.aggregate_output_limit_refusal, frozen.outcomes.aggregate_output_limit_refusal);
equal('aggregate_output_source_unchanged', actual.aggregate_output_source_unchanged, frozen.outcomes.aggregate_output_source_unchanged);

const forged = structuredClone(receipt);
forged.provenance.idealPath = '/wrong';
actual.verify_forged_receipt = capture(() => api.verifyCoreRelationshipOperation(forged, receipt.target));
equal('verify_forged_receipt', actual.verify_forged_receipt, frozen.outcomes.verify_forged_receipt);

const overValues = structuredClone(frozen.cases.inspect_missing.source);
overValues.unknownPayload = Array.from({length: 100_001}, () => null);
actual.value_limit_refusal = capture(() => api.inspectCoreRelationships(overValues, frozen.cases.inspect_missing.identity));
equal('value_limit_refusal', actual.value_limit_refusal, frozen.outcomes.value_limit_refusal);
const overDepth = structuredClone(frozen.cases.inspect_missing.source);
let chain = null;
for (let index = 0; index < 129; index++) chain = {n: chain};
overDepth.n = chain;
actual.depth_limit_refusal = capture(() => api.inspectCoreRelationships(overDepth, frozen.cases.inspect_missing.identity));
equal('depth_limit_refusal', actual.depth_limit_refusal, frozen.outcomes.depth_limit_refusal);

const check = (name, callback) => capture(callback);
const zero = check('zeroWork', () => createCoreModelEngine(resources, {controls: {maxWork: 0}}).inspectCoreRelationships(frozen.cases.inspect_missing.source, frozen.cases.inspect_missing.identity));
const cancelled = check('cancelled', () => createCoreModelEngine(resources, {controls: {isCancelled: () => true}}).inspectCoreRelationships(frozen.cases.inspect_missing.source, frozen.cases.inspect_missing.identity));
const deadline = check('deadline', () => createCoreModelEngine(resources, {controls: {now: () => 2, deadlineMs: 1}}).inspectCoreRelationships(frozen.cases.inspect_missing.source, frozen.cases.inspect_missing.identity));
assert.equal(zero.error?.code, 'RESOURCE_LIMIT');
assert.equal(cancelled.error?.code, 'CANCELLED');
assert.equal(deadline.error?.code, 'DEADLINE');

const sourceFiles = [...new Set([
  ...Object.keys(frozen.sourceClosureSha256),
  'bindings/core/node/index.js',
  'bindings/core/node/index.d.ts',
  'bindings/core/node/package.json',
  'bindings/core/node/src/core-model.js',
  'bindings/core/node/src/core-relationships.js',
  'bindings/core/wasm/index.js',
  'bindings/core/wasm/index.d.ts',
  'bindings/core/wasm/src/core-relationships.js',
  'bindings/core/wasm/src/shared-sources.json',
  'crates/umf-core/src/core_relationships.rs',
  'crates/umf-core-wire/src/lib.rs',
  'crates/umf-core-wire/tests/r5_core_relationships_wire.rs',
  'scripts/rust-migration/r7/wasm-package-sources.ts',
  'scripts/rust-migration/r5/core-relationships-binding-node.mjs',
  'docs/helix/04-build/evidence/rust-migration/r5-core-relationships/frozen-typescript.json',
])];
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path, await hashFile(path)])));
const packageRoot = process.env.UMF_R5_INSTALLED_PACKAGE_ROOT;
const nativePath = process.env.UMF_R5_NATIVE_ARTIFACT ?? (packageRoot ? resolve(packageRoot, 'umf_core_node.node') : resolve(root, 'bindings/core/node/umf_core_node.node'));
const replayReceipt = {
  status: 'pass',
  runtime: process.versions.bun ? {host: 'Bun', version: Bun.version} : {host: 'Node', version: process.version},
  binding: packageSpecifier ? 'clean-installed-package-name-import-from-extracted-install-harness' : process.env.UMF_R5_BINDING_ENTRY ? 'installed-package-path-import' : 'local-binding',
  packetProfile: frozen.profile,
  frozenPacketSha256: await hashFile('docs/helix/04-build/evidence/rust-migration/r5-core-relationships/frozen-typescript.json'),
  sourceHashes,
  nativeArtifactSha256: createHash('sha256').update(await readFile(nativePath)).digest('hex'),
  packageArchiveSha256: process.env.UMF_R5_PACKAGE_ARCHIVE ? createHash('sha256').update(await readFile(process.env.UMF_R5_PACKAGE_ARCHIVE)).digest('hex') : null,
  operationCases: Object.keys(names).length,
  receiptVerifiers: 2,
  additionalControls: Object.keys(actual).length - Object.keys(names).length,
  zeroWork: zero.error.code,
  cancellation: cancelled.error.code,
  deadline: deadline.error.code,
};
const receiptPath = process.env.UMF_R5_RECEIPT_PATH ?? resolve(root, 'docs/helix/04-build/evidence/rust-migration/r5-core-relationships', `${replayReceipt.runtime.host.toLowerCase()}-binding-replay.json`);
await writeFile(receiptPath, `${JSON.stringify(replayReceipt, null, 2)}\n`);
process.stdout.write(JSON.stringify(replayReceipt));
