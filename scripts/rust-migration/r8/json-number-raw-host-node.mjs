import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {captureOutcome, makeRawHostCases} from './json-number-raw-host-cases.mjs';

const root = resolve(import.meta.dirname, '../../..');
const packageRoot = resolve(process.env.UMF_JSON_NUMBER_PACKAGE_ROOT ?? '/private/tmp/umf-r8-json-number-node/package');
const referencePath = resolve(process.env.UMF_JSON_NUMBER_REFERENCE ?? '/private/tmp/umf-r8-json-number-raw/reference.mjs');
const receiptPath = resolve(process.env.UMF_JSON_NUMBER_RAW_RECEIPT ?? `/private/tmp/umf-json-number-raw-${typeof Bun === 'undefined' ? 'node' : 'bun'}.json`);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePaths = [
  'src/index-node-v4.ts', 'src/index-browser-v4.ts', 'src/index.ts',
  'src/model/internal/json-number.ts', 'src/model/errors.ts', 'src/model/serialization.ts',
  'Cargo.lock',
  'bindings/core/node/src/lib.rs', 'bindings/core/wasm/src/lib.rs',
  'bindings/core/node/src/json-number.js', 'bindings/core/wasm/src/json-number.js',
  'crates/umf-core/src/json_number.rs', 'crates/umf-core-wire/src/lib.rs', 'crates/umf-core-wire/src/json_number_binding.rs',
  'scripts/rust-migration/r8/json-number-raw-host-cases.mjs',
  'scripts/rust-migration/r8/json-number-raw-host-cases.d.mts',
  'scripts/rust-migration/r8/json-number-raw-host-predecessor.ts',
  'scripts/rust-migration/r8/json-number-raw-host-node.mjs',
  'scripts/rust-migration/r8/json-number-raw-host-browser.mjs',
  'tests/rust-migration/json-number-raw-host.test.ts',
];
const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, digest(await readFile(resolve(root, path)))])));
const packageSources = {
  'index.js': 'bindings/core/node/index.js',
  'src/json-number.js': 'bindings/core/node/src/json-number.js',
  'src/wire.js': 'bindings/core/node/src/wire.js',
};
const packageSourceHashes = Object.fromEntries(await Promise.all(Object.entries(packageSources).map(async ([packaged, source]) => [packaged, {
  packagedSha256: digest(await readFile(resolve(packageRoot, packaged))),
  liveSha256: sourceHashes[source] ?? digest(await readFile(resolve(root, source))),
}])));
for (const [path, value] of Object.entries(packageSourceHashes)) assert.equal(value.packagedSha256, value.liveSha256, `private Node package ${path} must match the live source`);
const ref = await import(pathToFileURL(referencePath).href);
const facade = await import(pathToFileURL(resolve(packageRoot, 'index.js')).href);
const engine = facade.createJsonNumberEngine();
const reference = makeRawHostCases().map(item => captureOutcome(ref.assertExactJsonNumber, item));
const candidate = makeRawHostCases().map(item => captureOutcome(engine.assertExactJsonNumber.bind(engine), item));
const mismatches = reference.flatMap((expected, index) => JSON.stringify(expected) === JSON.stringify(candidate[index]) ? [] : [{id: expected.id, expected, actual: candidate[index]}]);
const expectedMismatchIds = reference.map(item => item.id);
assert.deepEqual(mismatches.map(item => item.id), expectedMismatchIds, 'raw-host mismatches changed; review before updating the known-blocker expectation');

const longToken = '0'.repeat(4_000_001);
function captureLong(operation) {
  try { return {outcome: operation(longToken) === undefined ? 'undefined' : 'value'}; }
  catch (error) { return {error: {name: error?.name ?? null, code: error?.code ?? null, message: error?.message ?? null}}; }
}
const longTokenComparison = {length: longToken.length, reference: captureLong(ref.assertExactJsonNumber), candidate: captureLong(engine.assertExactJsonNumber.bind(engine))};
assert.notDeepEqual(longTokenComparison.reference, longTokenComparison.candidate, 'expected the existing 4M Rust text ceiling to remain visible against the unbudgeted TypeScript predecessor');

const addonPath = resolve(packageRoot, 'umf_core_node.node');
const receipt = {
  format: 'umf.r8.json-number-raw-host-comparison/1',
  runtime: {name: typeof Bun === 'undefined' ? 'Node' : 'Bun', version: typeof Bun === 'undefined' ? process.version : Bun.version},
  status: 'known-default-cutover-blocker',
  sourceHashes,
  artifacts: {referenceSha256: digest(await readFile(referencePath)), nodeFacadeSha256: digest(await readFile(resolve(packageRoot, 'index.js'))), addonSha256: digest(await readFile(addonPath)), packageSourceHashes},
  caseCount: reference.length,
  exactMatchCount: reference.length - mismatches.length,
  mismatchCount: mismatches.length,
  mismatches,
  resourceBoundary: longTokenComparison,
};
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({status: receipt.status, runtime: receipt.runtime, caseCount: receipt.caseCount, mismatchCount: receipt.mismatchCount, mismatchedIds: mismatches.map(item => item.id), longToken: longTokenComparison, receiptPath}));
