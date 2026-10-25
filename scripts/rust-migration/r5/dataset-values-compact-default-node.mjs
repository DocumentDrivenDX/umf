// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay the frozen compact Dataset packet through a built package-root entry.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const evidence = 'docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact-default-cutover';
const caseNames = [
  'commerce', 'supply-chain', 'archaeology', 'ecology', 'unknown-and-residual',
  'absent-state', 'present-null', 'exact-decimal-token', 'duplicate-key',
  'duplicate-locator', 'missing-links', 'parallel-links', 'structural-limit',
  'work-limit', 'invalid-source-only', 'invalid-input-only',
  'crossed-invalid-source-input',
];
const entry = process.env.UMF_R5_DATASET_COMPACT_DEFAULT_ENTRY;
if (!entry) throw new Error('UMF_R5_DATASET_COMPACT_DEFAULT_ENTRY must name the built Node/browser root entry');
const api = await import(pathToFileURL(resolve(entry)).href);
if (typeof api.validateCoreDatasetValuesCompact !== 'function' || typeof api.verifyCoreDatasetValuesCompact !== 'function') {
  throw new Error('Built package root does not expose compact Dataset validation and the retained TypeScript verifier');
}
const readCase = async name => JSON.parse(await readFile(`${evidence}/frozen-${name}.json`, 'utf8'));
const sameShape = (actual, expected, path = '') => {
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${path}: expected array`);
    assert.equal(actual.length, expected.length, `${path}: array length`);
    for (let index = 0; index < expected.length; index++) sameShape(actual[index], expected[index], `${path}/${index}`);
    return;
  }
  if (expected !== null && typeof expected === 'object') {
    assert.ok(actual !== null && typeof actual === 'object' && !Array.isArray(actual), `${path}: expected object`);
    assert.equal(Object.getPrototypeOf(actual), Object.getPrototypeOf(expected), `${path}: object prototype`);
    assert.deepEqual(Object.keys(actual), Object.keys(expected), `${path}: observable key order`);
    for (const key of Object.keys(expected)) sameShape(actual[key], expected[key], `${path}/${key}`);
    return;
  }
  assert.deepEqual(actual, expected, path);
};
const errorShape = error => ({name: error?.name, code: error?.code ?? '', message: error?.message ?? String(error), path: error?.path ?? ''});
const publicErrorName = error => ['CORE_DATASET_SOURCE', 'CORE_DATASET_INPUT'].includes(error?.code) ? 'UmfError' : 'UmfCoreError';
let count = 0;
for (const name of caseNames) {
  const frozen = await readCase(name);
  try {
    const actual = api.validateCoreDatasetValuesCompact(frozen.source, frozen.input);
    assert.equal(frozen.thrown, undefined, `${name}: unexpected success`);
    sameShape(actual, frozen.result, name);
    if (frozen.verify) sameShape(api.verifyCoreDatasetValuesCompact(actual, frozen.source, frozen.input), frozen.verify, `${name}/verify`);
  } catch (error) {
    if (!frozen.thrown) throw error;
    assert.deepEqual(errorShape(error), {name: publicErrorName(frozen.thrown), ...frozen.thrown}, `${name}: public refusal envelope`);
  }
  count++;
}
const forged = await readCase('forged-receipt');
try {
  api.verifyCoreDatasetValuesCompact(forged.receipt, forged.source, forged.input);
  assert.fail('forged receipt should be refused');
} catch (error) {
  assert.deepEqual(errorShape(error), {name: 'UmfError', ...forged.thrown}, 'retained TypeScript verifier forged receipt refusal');
}
count++;
for (const name of ['near-threshold-accepted', 'near-threshold-first-refused']) {
  const frozen = await readCase(name);
  try {
    const actual = api.validateCoreDatasetValuesCompact(frozen.source, frozen.input);
    assert.equal(frozen.thrown, undefined, `${name}: unexpected success`);
    sameShape(actual, frozen.result, name);
  } catch (error) {
    if (!frozen.thrown) throw error;
    assert.deepEqual(errorShape(error), {name: publicErrorName(frozen.thrown), ...frozen.thrown}, `${name}: public refusal envelope`);
  }
  count++;
}
console.log(JSON.stringify({status: 'pass', cases: count, runtime: process.versions.bun ? `Bun ${Bun.version}` : `Node ${process.version}`, entry: resolve(entry)}));
