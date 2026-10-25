import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const packetPath = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r5-json-schema-tree-operations/predecessor.json');
const packetBytes = await readFile(packetPath);
const packet = JSON.parse(packetBytes);
const packageRoot = process.env.UMF_R5_NODE_PACKAGE_ROOT;
if (!packageRoot) throw new Error('UMF_R5_NODE_PACKAGE_ROOT is required');
const require = createRequire(import.meta.url);
const {createJsonSchemaEngine} = require(resolve(packageRoot, 'index.js'));
const api = createJsonSchemaEngine();

const baseUri = 'https://schemas.example.test/tree.json';
const defaultSchema = '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"amount":{"type":"number","minimum":0},"text":{"type":"string","minLength":1}},"$defs":{"nested":{"type":"string"}}}';
function doc(schema, id = 'urn:umf:r5:tree') {
  return {
    umf: '0.10.0', id,
    vocabularies: {'umf.json-schema': {version: '0.1.0'}},
    modules: [{id: 'schema', namespace: baseUri, elements: [{id: 'schema', extensions: {
      'umf.json-schema': {dialect: 'https://json-schema.org/draft/2020-12/schema', baseUri, root: api.parseNativeJson(schema), resources: {}},
    }}]}],
  };
}
const normalize = value => JSON.parse(JSON.stringify(value));
function actualFor(test) {
  const input = test.input ?? {};
  if (test.id.startsWith('parse.')) {
    const text = input.text ?? (input.depth ? '['.repeat(input.depth) + '0' + ']'.repeat(input.depth) : input.utf16Units ? ' '.repeat(input.utf16Units) : '[' + Array(input.arrayItems).fill('null').join(',') + ']');
    try { return {status: 'returned', value: normalize(api.parseNativeJson(text))}; }
    catch (error) { return {status: 'threw', name: error.name, code: error.code ?? null, path: error.path ?? null, message: error.message}; }
  }
  let source = input.schema ?? (test.id === 'edit.incomplete-schema-refused'
    ? '{"$schema":"https://example.test/custom","type":"object"}'
    : defaultSchema);
  let identity = test.id.includes('array-pointer') ? 'urn:umf:r5:tree-array' : test.id.includes('escaped-pointer') ? 'urn:umf:r5:tree-escaped' : test.id.includes('lone-surrogate') ? 'urn:umf:r5:tree-surrogate' : test.id.includes('incomplete-schema') ? 'urn:umf:r5:tree-unknown' : 'urn:umf:r5:tree';
  const original = doc(source, identity);
  if (test.id === 'edit.invalid-source-before-target-lookup') original.id = '';
  const before = JSON.stringify(original);
  try {
    if (test.id === 'edit.escaped-pointer-and-astral-key-success') {
      const slash = api.editJsonSchemaNode(original, input.pointers[0], input.replacement);
      const astral = api.editJsonSchemaNode(original, input.pointers[1], '"integer"');
      return {status: 'returned', value: {slashEditedSource: api.exportJsonSchema(slash), astralEditedSource: api.exportJsonSchema(astral), sourceUnchanged: JSON.stringify(original) === before}};
    }
    const edited = api.editJsonSchemaNode(original, input.pointer, input.replacement);
    if (test.id === 'edit.success.changed-number-and-source-unchanged') {
      return {status: 'returned', value: {edited: normalize(edited), editedSource: api.exportJsonSchema(edited), sourceUnchanged: JSON.stringify(original) === before}};
    }
    if (test.id === 'edit.lone-surrogate-schema-refused-atomically') {
      return {status: 'returned', value: {edited: normalize(edited), sourceUnchanged: JSON.stringify(original) === before}};
    }
    return {status: 'returned', value: normalize(edited)};
  } catch (error) {
    const thrown = {status: 'threw', name: error.name, code: error.code ?? null, path: error.path ?? null, message: error.message};
    if (test.id === 'edit.lone-surrogate-schema-refused-atomically') return {status: 'returned', value: {refusal: {name: thrown.name, code: thrown.code, path: thrown.path, message: thrown.message}, sourceUnchanged: JSON.stringify(original) === before}};
    return thrown;
  }
}
const actual = Object.fromEntries(packet.cases.map(test => [test.id, actualFor(test)]));
const mismatches = [];
for (const test of packet.cases) {
  const expected = JSON.stringify(test.outcome);
  const got = JSON.stringify(actual[test.id]);
  if (expected !== got) mismatches.push({id: test.id, expected: test.outcome, actual: actual[test.id]});
}
const receipt = {
  format: 'umf-r5-json-schema-tree-operations-installed-replay/1',
  host: process.versions.bun ? `bun-${process.versions.bun}` : `node-${process.versions.node}`,
  packetSha256: createHash('sha256').update(packetBytes).digest('hex'),
  cases: packet.cases.length,
  matched: packet.cases.length - mismatches.length,
  mismatchCount: mismatches.length,
  mismatches,
  actual,
};
const output = process.env.UMF_R5_RECEIPT;
if (output) await writeFile(output, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({...receipt, actual: undefined}));
if (mismatches.length) process.exitCode = 1;
