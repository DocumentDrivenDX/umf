// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay the compact Dataset-values packet through the opt-in Node/Rust API.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const evidence = 'docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact';
const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const cases = [
  'commerce', 'supply-chain', 'archaeology', 'ecology', 'unknown-and-residual',
  'absent-state', 'present-null', 'exact-decimal-token', 'duplicate-key',
  'duplicate-locator', 'missing-links', 'parallel-links', 'structural-limit', 'work-limit',
];
const load = async name => JSON.parse(await readFile(`${evidence}/${name}`, 'utf8'));
const loadResource = async name => JSON.parse(await readFile(resolve(root, name), 'utf8'));
const jsonData = value => JSON.parse(JSON.stringify(value));
const packagePath = process.env.UMF_R5_NODE_PACKAGE_PATH;
const entry = packagePath
  ? pathToFileURL(resolve(packagePath, 'index.js')).href
  : pathToFileURL(resolve('bindings/core/node/index.js')).href;
const {createCoreModelEngine} = await import(entry);
const resources = {
  coreSchema: await loadResource('spec/core/schema.json'),
  referenceSchema: await loadResource('spec/core/semantic-type-reference.schema.json'),
  packageSchema: await loadResource('spec/core/extension-package.schema.json'),
  constraints: await loadResource('spec/metamodel/generated/core-constraints.json'),
  domainPolicy: await loadResource('spec/metamodel/generated/domain-policy.json'),
};
const api = createCoreModelEngine(resources);
const actual = {};
for (const name of cases) {
  const frozen = await load(`frozen-${name}.json`);
  try {
    const value = api.validateCoreDatasetValuesCompact(frozen.source, frozen.input);
    actual[name] = {ok: true, value: jsonData(value)};
    assert.equal('thrown' in frozen, false, `${name}: expected refusal`);
    assert.deepStrictEqual(actual[name].value, frozen.result, `${name}: complete compact receipt`);
    if (name === 'commerce' && process.env.UMF_R5_DATASET_VALUES_COMPACT_CAPTURE) {
      await writeFile(process.env.UMF_R5_DATASET_VALUES_COMPACT_CAPTURE, `${JSON.stringify(value)}\n`);
    }
    if (frozen.verify) {
      const verified = jsonData(api.verifyCoreDatasetValuesCompact(value, frozen.source, frozen.input));
      assert.deepStrictEqual(verified, frozen.verify, `${name}: verify receipt`);
    }
  } catch (error) {
    if (!frozen.thrown) throw error;
    actual[name] = {ok: false, error: {code: error?.code ?? '', message: error?.message ?? String(error), path: error?.path ?? ''}};
    assert.deepStrictEqual(actual[name], {ok: false, error: frozen.thrown}, `${name}: refusal`);
  }
}

const forged = await load('frozen-forged-receipt.json');
try {
  api.verifyCoreDatasetValuesCompact(forged.receipt, forged.source, forged.input);
  assert.fail('forged compact receipt should be refused');
} catch (error) {
  actual['forged-receipt'] = {ok: false, error: {code: error?.code ?? '', message: error?.message ?? String(error), path: error?.path ?? ''}};
  assert.deepStrictEqual(actual['forged-receipt'], {ok: false, error: forged.thrown});
}

for (const [name, file] of [
  ['near-threshold-accepted', 'frozen-near-threshold-accepted.json'],
  ['near-threshold-first-refused', 'frozen-near-threshold-first-refused.json'],
]) {
  const frozen = await load(file);
  try {
    const value = jsonData(api.validateCoreDatasetValuesCompact(frozen.source, frozen.input));
    actual[name] = {ok: true, value};
    assert.equal('thrown' in frozen, false, `${name}: expected refusal`);
    assert.deepStrictEqual(value, frozen.result, `${name}: complete receipt`);
  } catch (error) {
    if (!frozen.thrown) throw error;
    actual[name] = {ok: false, error: {code: error?.code ?? '', message: error?.message ?? String(error), path: error?.path ?? ''}};
    assert.deepStrictEqual(actual[name], {ok: false, error: frozen.thrown}, `${name}: refusal`);
  }
}

let cancelled = false;
const controlled = createCoreModelEngine(resources, {controls: {isCancelled: () => cancelled}});
cancelled = true;
const commerceControl = await load('frozen-commerce.json');
assert.throws(() => controlled.validateCoreDatasetValuesCompact(commerceControl.source, commerceControl.input), error => error?.code === 'CANCELLED');

console.log(JSON.stringify({status: 'pass', cases: Object.keys(actual).length, binding: packagePath ? 'installed-package-path' : 'local-binding', runtime: process.versions.bun ? `Bun ${Bun.version}` : `Node ${process.version}`, capturePath: process.env.UMF_R5_DATASET_VALUES_COMPACT_CAPTURE ?? null}));
