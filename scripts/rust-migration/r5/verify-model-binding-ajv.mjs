// SPDX-License-Identifier: MIT OR Apache-2.0
// Independently validate actual Node/Bun binding receipts with Ajv 2020.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const outputs = await read('/private/tmp/umf-r5-model-bindings-node-result.json');
const ajv = new Ajv2020({strict:false, allErrors:true, validateFormats:false});
for (const path of ['spec/core/semantic-type-reference.schema.json','spec/core/schema.json']) ajv.addSchema(await read(path));
const specs = [
  ['kind_inspect_known','spec/core/kind-operation-v8.schema.json'], ['kind_inspect_unspecified','spec/core/kind-operation-v8.schema.json'],
  ['kind_declare','spec/core/kind-operation-v6.schema.json'], ['kind_verify','spec/core/kind-operation-v6.schema.json'],
  ['kind_surrogate_identity_inspect','spec/core/kind-operation-v8.schema.json'],
  ['nullability_inspect_missing','spec/core/nullability-operation-v7.schema.json'], ['nullability_inspect_known','spec/core/nullability-operation-v7.schema.json'],
  ['nullability_inspect_inapplicable','spec/core/nullability-operation-v7.schema.json'], ['nullability_declare','spec/core/nullability-operation-v5.schema.json'],
  ['nullability_verify','spec/core/nullability-operation-v5.schema.json'], ['nullability_surrogate_identity_inspect','spec/core/nullability-operation-v7.schema.json'],
];
const validators = new Map();
for (const [name,path] of specs) {
  if (!validators.has(path)) validators.set(path, ajv.compile(await read(path)));
  const validate = validators.get(path);
  assert.equal(validate(outputs.actual[name].value), true, `${name}: ${JSON.stringify(validate.errors)}`);
}
const cardInspect = ajv.compile(await read('spec/core/cardinality-operation-v6.schema.json'));
const cardDeclare = ajv.compile(await read('spec/core/cardinality-operation-v4.schema.json'));
for (const key of ['inspection','surrogateIdentity']) assert.equal(cardInspect(outputs.cardinality[key]), true, `${key}: ${JSON.stringify(cardInspect.errors)}`);
for (const key of ['declaration','verification']) assert.equal(cardDeclare(outputs.cardinality[key]), true, `${key}: ${JSON.stringify(cardDeclare.errors)}`);
for (const [name,key] of [['kind','kind_declare'],['nullability','nullability_declare']]) {
  const validate = validators.get(name === 'kind' ? 'spec/core/kind-operation-v6.schema.json' : 'spec/core/nullability-operation-v5.schema.json');
  const receipt = structuredClone(outputs.actual[key].value);
  receipt.source = {};
  assert.equal(validate(receipt), false, `${name} invalid-source control was accepted`);
}
const selectionSchema = ajv.compile(await read('spec/core/element-selection.schema.json'));
for (const [name, value] of Object.entries(outputs.selection)) assert.equal(selectionSchema(value), true, `selection ${name}: ${JSON.stringify(selectionSchema.errors)}`);
const invalidSelectionScope = structuredClone(outputs.selection.all); invalidSelectionScope.scope = 'unknown-selection-scope';
assert.equal(selectionSchema(invalidSelectionScope), false, 'invalid selection scope was accepted');
const invalidSelectionPath = structuredClone(outputs.selection.all); invalidSelectionPath.selection[0].path = 17;
assert.equal(selectionSchema(invalidSelectionPath), false, 'non-text selection path was accepted');
console.log(`Ajv 2020 accepted 15 actual Rust model receipts and ${Object.keys(outputs.selection).length} actual selection results, and rejected four mutations (two receipt sources and two selection fields).`);
