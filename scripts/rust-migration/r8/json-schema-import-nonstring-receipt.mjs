// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';

const evidence = 'docs/helix/04-build/evidence/rust-migration/r8-json-schema-eight-operations/import-host-nonstring-observation.json';
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const sha = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const [bun, node, chromium] = await Promise.all([
  readJson('/private/tmp/umf-json-schema-nonstring-bun.json'),
  readJson('/private/tmp/umf-json-schema-nonstring-node.json'),
  readJson('/private/tmp/umf-json-schema-nonstring-chromium.json'),
]);
assert.equal(bun.profile, 'direct-typescript');
assert.equal(node.profile, 'direct-typescript');
assert.equal(bun.cases.length, 9);
assert.deepEqual(node.cases, bun.cases);
assert.deepEqual(chromium.cases, bun.cases);
const sourcePaths = {
  entry: 'src/adapters/json-schema/index.ts',
  parser: 'src/model/native-json.ts',
  cases: 'scripts/rust-migration/r8/json-schema-import-nonstring-cases.mjs',
  runner: 'scripts/rust-migration/r8/json-schema-import-nonstring-runner.mjs',
  nodeLoader: 'scripts/rust-migration/r8/json-schema-ts-node-loader.mjs',
  browserEntry: 'scripts/rust-migration/r8/json-schema-import-nonstring-browser-entry.ts',
  browserRunner: 'scripts/rust-migration/r8/json-schema-import-nonstring-browser.mjs',
  receiptGenerator: 'scripts/rust-migration/r8/json-schema-import-nonstring-receipt.mjs',
};
const source = {};
for (const [role, path] of Object.entries(sourcePaths)) {
  source[role] = {path, sha256: await sha(path)};
}
source.entry.scope = 'entry file only';
const receipt = {
  format: 'umf.r8-json-schema-import-nonstring-observation/1',
  status: 'observed',
  scope: 'Nine direct-current-TypeScript non-string root/resource probes; this is not staged Node/WASM parity.',
  source,
  runtimes: {
    bun: `Bun ${execFileSync('bun', ['--version'], {encoding: 'utf8'}).trim()}, macOS arm64, direct TypeScript source`,
    node: `Node.js ${process.versions.node}, macOS arm64, source graph bundled by Bun then executed by Node`,
    chromium: `${chromium.runtime.chromium}, real Playwright Chromium, browser-targeted source bundle`,
  },
  parity: {bunCases: 9, nodeCases: 9, chromiumCases: 9, caseArraysIdentical: true},
  cases: bun.cases,
  observations: [
    'For object inputs with a length getter and a successful JSON.parse string coercion, direct source reads length, performs ToPrimitive with the string hint through JSON.parse, then reads length again in the YAML parser before TypeError(source is not a string).',
    'The first root length getter exception escapes unchanged and prevents coercion.',
    'JSON.parse coercion failures, including thrown toString or Symbol.toPrimitive values and a Symbol input, are caught by parseNativeJson and mapped to UmfError(JSON_SCHEMA_SYNTAX, Invalid native JSON); the thrown coercion object does not escape by identity.',
    'Resource source non-string parse failure stops before root parsing.',
  ],
  commands: [
    'bun scripts/rust-migration/r8/json-schema-import-nonstring-runner.mjs /private/tmp/umf-json-schema-nonstring-bun.json',
    'bun build scripts/rust-migration/r8/json-schema-import-nonstring-runner.mjs --target=node --format=esm --packages=bundle --outfile=/private/tmp/umf-json-schema-nonstring-node.mjs',
    'node /private/tmp/umf-json-schema-nonstring-node.mjs /private/tmp/umf-json-schema-nonstring-node.json',
    'bun scripts/rust-migration/r8/json-schema-import-nonstring-browser.mjs > /private/tmp/umf-json-schema-nonstring-chromium.json',
    'node scripts/rust-migration/r8/json-schema-import-nonstring-receipt.mjs',
  ],
  limits: [
    'Node executed a Bun-bundled graph derived from the pinned direct TypeScript entry and parser source; it did not use Node\'s native TypeScript loader.',
    'The browser runner checks zero page errors; the receipt stores the nine returned cases and browser version, not a full network/request trace.',
    'This receipt does not run the staged Rust facade against non-string cases or qualify every coercion primitive, exotic value, or length-comparison coercion.',
  ],
};
await writeFile(evidence, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({status: receipt.status, parity: receipt.parity, chromium: chromium.runtime.chromium}));
