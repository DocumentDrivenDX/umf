import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const packetPath = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r5-json-schema-tree-operations/qualified-edit-subset.json');
const packetBytes = await readFile(packetPath);
const packet = JSON.parse(packetBytes);
const packageRoot = process.env.UMF_R5_NODE_PACKAGE_ROOT;
if (!packageRoot) throw new Error('UMF_R5_NODE_PACKAGE_ROOT is required');
const hashFile = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const packageJson = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
const sourceHashes = Object.fromEntries(await Promise.all([
  'Cargo.lock', 'bindings/core/node/Cargo.toml', 'bindings/core/node/src/lib.rs',
  'crates/umf-core-wire/src/lib.rs', 'crates/umf-core/src/serialization.rs',
  'crates/umf-core/src/json_schema_adapter.rs', 'crates/umf-core/src/json_schema_inspect.rs',
].map(async path => [path, await hashFile(resolve(root, path))])));
const packageAssets = {
  packageName: packageJson.name,
  packageVersion: packageJson.version,
  packageRoot: resolve(packageRoot),
  addonSha256: await hashFile(resolve(packageRoot, 'umf_core_node.node')),
  indexSha256: await hashFile(resolve(packageRoot, 'index.js')),
  jsonSchemaFacadeSha256: await hashFile(resolve(packageRoot, 'src/json-schema.js')),
  packageJsonSha256: await hashFile(resolve(packageRoot, 'package.json')),
};
const require = createRequire(resolve(packageRoot, 'package.json'));
const {createJsonSchemaEngine} = require(packageJson.name);
const api = createJsonSchemaEngine();
const baseUri = 'https://schemas.example.test/qualified-edit.json';
const makeDocument = (schema, id) => ({
  umf: '0.10.0', id,
  vocabularies: {'umf.json-schema': {version: '0.1.0'}},
  modules: [{id: 'schema', namespace: baseUri, elements: [{id: 'schema', extensions: {
    'umf.json-schema': {dialect: 'https://json-schema.org/draft/2020-12/schema', baseUri, root: api.parseNativeJson(schema), resources: {}},
  }}]}],
});

const cases = [];
for (const test of packet.cases) {
  const source = makeDocument(test.schema, `urn:umf:r5:qualified:${test.id}`);
  const before = JSON.stringify(source);
  if (test.expectedSource) {
    const beforeInspection = api.inspectJsonSchema(source);
    assert.equal(beforeInspection.valid, true, test.id);
    assert.equal(beforeInspection.complete, true, test.id);
    const edited = api.editJsonSchemaNode(source, test.pointer, test.replacement);
    assert.equal(JSON.stringify(source), before, `${test.id}: source mutation`);
    assert.equal(api.exportJsonSchema(edited), test.expectedSource, `${test.id}: edited source`);
    const afterInspection = api.inspectJsonSchema(edited);
    assert.equal(afterInspection.valid, true, test.id);
    assert.equal(afterInspection.complete, true, test.id);
    cases.push({id: test.id, status: 'matched', sourceUnchanged: true, editedSource: api.exportJsonSchema(edited), completeBefore: true, completeAfter: true});
  } else {
    let actual;
    try {
      api.editJsonSchemaNode(source, test.pointer, test.replacement);
      actual = {status: 'returned'};
    } catch (error) {
      actual = {status: 'threw', name: error.name, code: error.code ?? null, path: error.path ?? null, message: error.message};
    }
    assert.deepEqual(actual, {status: 'threw', ...test.expectedError}, test.id);
    assert.equal(JSON.stringify(source), before, `${test.id}: source mutation`);
    cases.push({id: test.id, status: 'matched', refusal: actual, sourceUnchanged: true});
  }
}
const receipt = {
  format: 'umf-r5-json-schema-qualified-edit-subset-replay/1',
  runtime: process.versions.bun ? `bun-${process.versions.bun}` : `node-${process.versions.node}`,
  packetSha256: createHash('sha256').update(packetBytes).digest('hex'),
  build: {
    command: 'PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/opt/homebrew/bin:/usr/bin:/bin CARGO_TARGET_DIR=/private/tmp/umf-r5-json-schema-tree-target CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 cargo build --locked --offline --release --manifest-path bindings/core/node/Cargo.toml',
    isolatedTarget: '/private/tmp/umf-r5-json-schema-tree-target',
    sourceHashes,
  },
  installedPackage: packageAssets,
  caseCount: cases.length,
  matched: cases.filter((test) => test.status === 'matched').length,
  cases,
};
if (process.env.UMF_R5_RECEIPT) await writeFile(process.env.UMF_R5_RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt));
