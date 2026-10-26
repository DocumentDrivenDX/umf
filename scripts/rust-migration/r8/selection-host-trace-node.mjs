// Same-host TypeScript versus opt-in Rust Selection trace, using a private
// built Node addon. This never changes package-root routing.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runSelectionHostSuite} from './selection-host-suite.mjs';

const root = resolve(import.meta.dirname, '../../..');
const addonPath = resolve(process.env.UMF_SELECTION_ADDON ?? 'dist/umf_core_node.node');
const receiptPath = resolve(process.argv[2] ?? 'docs/helix/04-build/evidence/rust-migration/r8-selection-host-trace/node.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => readFile(resolve(root, path));
const json = async path => JSON.parse(await read(path));

const manifest = await json('dist/rust-default-manifest.json');
assert.equal(manifest.sourceClosure?.transform?.status, 'fixed-point', 'private package source closure is not fixed-point');
assert.equal(sha(await read('dist/umf.js')), manifest.assets?.['dist/umf.js']);
assert.equal(sha(await read('dist/umf-node.js')), manifest.assets?.['dist/umf-node.js']);
assert.equal(sha(await read('dist/umf_core_node.node')), manifest.assets?.['dist/umf_core_node.node']);

const [{Registry, UmfError, selectCoreElements}, hostJson] = await Promise.all([
  import(pathToFileURL(resolve(root, 'dist/umf.js'))),
  import(pathToFileURL(resolve(root, 'bindings/core/node/src/host-json.js'))),
]);
const require = createRequire(import.meta.url);
const addon = require(addonPath);
const resources = {
  coreSchema: await json('spec/core/schema.json'),
  referenceSchema: await json('spec/core/semantic-type-reference.schema.json'),
  packageSchema: await json('spec/core/extension-package.schema.json'),
  constraints: await json('spec/metamodel/generated/core-constraints.json'),
  domainPolicy: await json('spec/metamodel/generated/domain-policy.json'),
};
const candidateEngine = hostJson.createCoreElementSelectionHostInputEngine(addon, resources, UmfError);
const candidate = (source, query, registry) => candidateEngine.selectCoreElements(source, query, registry);
const result = runSelectionHostSuite({Registry, selectCoreElements, createCandidate: candidate, candidateLabel: 'private-node-host-json'});

const files = [
  'src/model/selection.ts', 'src/model/json.ts', 'src/validation/document.ts',
  'src/validation/constraint-kernel.ts', 'src/registry/registry.ts',
  'bindings/core/node/src/host-json.js', 'bindings/core/node/src/lib.rs',
  'crates/umf-core/src/selection.rs', 'crates/umf-core/src/selection_host_json.rs',
  'crates/umf-core-wire/src/lib.rs',
  'scripts/rust-migration/r8/selection-host-suite.mjs',
  'scripts/rust-migration/r8/selection-host-trace-node.mjs',
  'scripts/rust-migration/r5/selection/input.json',
  'scripts/rust-migration/r5/selection/frozen-typescript.json',
  'scripts/rust-migration/r5/selection/frozen-refusals.json',
  'spec/core/schema.json', 'spec/core/semantic-type-reference.schema.json',
  'spec/core/extension-package.schema.json', 'spec/metamodel/generated/core-constraints.json',
  'spec/metamodel/generated/domain-policy.json',
];
const sources = Object.fromEntries(await Promise.all(files.map(async path => [path, sha(await read(path))])));
const pinnedPaths = files.filter(path => !path.startsWith('scripts/rust-migration/r8/selection-host-')
  && !path.startsWith('scripts/rust-migration/r5/selection/'));
const sourceDrift = pinnedPaths.flatMap(path => {
  const expected = manifest.sourceClosure.inputs?.[path];
  return expected === undefined || expected !== sources[path] ? [{path, expected: expected ?? null, actual: sources[path]}] : [];
});
const comparisons = Object.fromEntries(Object.entries(result.cases).map(([name, item]) => [name, item.comparison]));
const receipt = {
  format: 'umf.r8.selection-host-trace.node/1',
  status: sourceDrift.length === 0 ? 'diagnostic-source-pinned-opt-in-comparison' : 'diagnostic-source-drift-non-authoritative',
  runtime: {node: process.version, bun: typeof Bun === 'undefined' ? null : Bun.version},
  candidate: 'executeCoreElementSelectionHostJson through private Node binding helper; package default root not changed',
  package: {manifestSourceClosureSha256: sha(Buffer.from(JSON.stringify(manifest.sourceClosure))), referenceBundleSha256: sha(await read('dist/umf.js')), nodeBundleSha256: sha(await read('dist/umf-node.js')), addonSha256: sha(await read('dist/umf_core_node.node'))},
  inputs: sources,
  sourceClosureVerification: {selectedInputs: pinnedPaths.length, driftCount: sourceDrift.length, drift: sourceDrift},
  caseCount: Object.keys(result.cases).length,
  cases: result.cases,
  summary: {
    exactValueAndErrorMatches: Object.values(comparisons).filter(value => value.valueOrErrorEqual).length,
    exactOutputShapeMatches: Object.values(comparisons).filter(value => value.outputShapeEqual).length,
    exactHostTraceMatches: Object.values(comparisons).filter(value => value.hostTraceEqual).length,
    mismatches: Object.entries(comparisons).filter(([, value]) => !value.valueOrErrorEqual || !value.outputShapeEqual || !value.hostTraceEqual).map(([name, value]) => ({name, ...value})),
  },
  limits: ['Node host only in this receipt. Does not cut over the default route.', 'Small frozen probes expose callback/Registry order, raw source/query copy effects, thrown-value identity and diagnostic projection; this is not a complete predecessor parity packet.', 'KindRuntime is tested as a distinct TS delegation boundary; the current Rust candidate does not promise equivalent Registry.kindRuntime delegation.', 'Output comparison uses JSON value, bounded own-key/order/descriptor summaries, and prototypes; it does not prove every accessor/proxy trap across all possible inputs.'],
};
await mkdir(resolve(receiptPath, '..'), {recursive: true});
await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({receiptPath, runtime: receipt.runtime, caseCount: receipt.caseCount, summary: receipt.summary}, null, 2));
