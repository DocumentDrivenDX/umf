// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay the current 0.10 frozen evolution predecessor through an installed Rust binding.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(process.env.UMF_R5_REPO_ROOT ?? new URL('../../../', import.meta.url).pathname);
const packageSpecifier = process.env.UMF_R5_NODE_PACKAGE_SPECIFIER;
const entry = process.env.UMF_R5_BINDING_ENTRY ?? resolve(root, 'bindings/core/node/index.js');
if (packageSpecifier) {
  const installRoot = process.env.UMF_R5_INSTALLED_PACKAGE_ROOT;
  assert.ok(installRoot, 'installed package-name replay requires UMF_R5_INSTALLED_PACKAGE_ROOT');
  const here = fileURLToPath(import.meta.url);
  assert.ok(here.startsWith(resolve(installRoot)), 'copy this harness inside the extracted install root for package-name resolution');
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
  read('docs/helix/04-build/evidence/rust-migration/r5-core-evolution/frozen-typescript-0.10.json'),
]);
const api = createCoreModelEngine(resources);
const capture = fn => {
  try { return {ok: true, value: fn()}; }
  catch (error) { return {ok: false, error: {code: error.code ?? '', message: error.message ?? String(error), path: error.path ?? ''}}; }
};
const canonical = value => Array.isArray(value)
  ? `[${value.map(canonical).join(',')}]`
  : value !== null && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const cases = Object.keys(frozen.cases);
const actual = {};
for (const name of cases) {
  const c = frozen.cases[name];
  actual[name] = capture(() => api.inspectCoreEvolution(c.before, c.after, c.policy));
  assert.equal(canonical(actual[name]), canonical(frozen.outcomes[name]), `${name} frozen outcome`);
}

const accepted = frozen.cases.accepted_absent_string_addition;
const receipt = api.inspectCoreEvolution(accepted.before, accepted.after, accepted.policy);
actual.verify_current = capture(() => api.verifyCoreEvolution(receipt, accepted.before, accepted.after, accepted.policy));
assert.deepEqual(actual.verify_current, {ok: true, value: receipt});
const forged = structuredClone(receipt);
forged.complete = !forged.complete;
actual.verify_forged = capture(() => api.verifyCoreEvolution(forged, accepted.before, accepted.after, accepted.policy));
assert.equal(actual.verify_forged.ok, false);
assert.equal(actual.verify_forged.error.code, 'CORE_EVOLUTION_RECEIPT');

actual.zero_work = capture(() => createCoreModelEngine(resources, {controls: {maxWork: 0}}).inspectCoreEvolution(accepted.before, accepted.after, accepted.policy));
actual.cancelled = capture(() => createCoreModelEngine(resources, {controls: {isCancelled: () => true}}).inspectCoreEvolution(accepted.before, accepted.after, accepted.policy));
actual.deadline = capture(() => createCoreModelEngine(resources, {controls: {now: () => 2, deadlineMs: 1}}).inspectCoreEvolution(accepted.before, accepted.after, accepted.policy));
assert.equal(actual.zero_work.error?.code, 'RESOURCE_LIMIT');
assert.equal(actual.cancelled.error?.code, 'CANCELLED');
assert.equal(actual.deadline.error?.code, 'DEADLINE');

const hashFile = async path => createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');
const sourceFiles = [
  ...Object.values(resourcePaths),
  'docs/helix/04-build/evidence/rust-migration/r5-core-evolution/frozen-typescript-0.10.json',
  'src/model/evolution.ts',
  'crates/umf-core/src/core_evolution.rs',
  'crates/umf-core-wire/src/lib.rs',
  'bindings/core/node/index.js', 'bindings/core/node/index.d.ts', 'bindings/core/node/package.json',
  'bindings/core/node/src/core-evolution.js', 'bindings/core/node/src/wire.js',
  'bindings/core/wasm/index.js', 'bindings/core/wasm/index.d.ts',
  'bindings/core/wasm/src/core-evolution.js', 'bindings/core/wasm/src/shared-sources.json',
  'scripts/rust-migration/r7/wasm-package-sources.ts',
  'scripts/rust-migration/r5/core-evolution-binding-node.mjs',
];
const sourceHashes = process.env.UMF_R5_BUILD_SOURCE_MANIFEST
  ? JSON.parse(await readFile(resolve(process.env.UMF_R5_BUILD_SOURCE_MANIFEST), 'utf8'))
  : Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path, await hashFile(path)])));
const installedPackageRoot = packageSpecifier
  ? resolve(process.env.UMF_R5_INSTALLED_PACKAGE_ROOT, 'node_modules/@umf/core-rust-native')
  : resolve(root, 'bindings/core/node');
const packageAssetHashes = Object.fromEntries(await Promise.all([
  'index.js', 'index.d.ts', 'package.json', 'src/core-evolution.js', 'src/wire.js', 'umf_core_node.node',
].map(async path => [path, createHash('sha256').update(await readFile(resolve(installedPackageRoot, path))).digest('hex')])));
const receiptOut = {
  status: 'passed', runtime: {host: process.platform, arch: process.arch, node: process.version, bun: process.versions.bun ?? null},
  route: packageSpecifier ? 'installed-package-name' : 'local-binding',
  profile: frozen.profile,
  frozenSha256: await hashFile('docs/helix/04-build/evidence/rust-migration/r5-core-evolution/frozen-typescript-0.10.json'),
  sourceHashes,
  buildSourceManifestSha256: process.env.UMF_R5_BUILD_SOURCE_MANIFEST
    ? createHash('sha256').update(await readFile(resolve(process.env.UMF_R5_BUILD_SOURCE_MANIFEST))).digest('hex')
    : null,
  testHarnessSha256: await hashFile('scripts/rust-migration/r5/core-evolution-binding-node.mjs'),
  packageAssetHashes,
  nativeArtifactSha256: packageAssetHashes['umf_core_node.node'],
  packageArchiveSha256: process.env.UMF_R5_PACKAGE_ARCHIVE ? createHash('sha256').update(await readFile(process.env.UMF_R5_PACKAGE_ARCHIVE)).digest('hex') : null,
  frozenInspectionCases: cases.length,
  currentReceiptVerifier: actual.verify_current.ok,
  forgedReceiptRefused: actual.verify_forged.error.code,
  controls: {zeroWork: actual.zero_work.error.code, cancellation: actual.cancelled.error.code, deadline: actual.deadline.error.code},
};
const receiptPath = process.env.UMF_R5_RECEIPT_PATH ?? resolve(root, 'docs/helix/04-build/evidence/rust-migration/r5-core-evolution/node-binding-replay.json');
await writeFile(receiptPath, `${JSON.stringify(receiptOut, null, 2)}\n`);
process.stdout.write(JSON.stringify(receiptOut));
