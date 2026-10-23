// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay the frozen opt-in Avro metadata packet against the native Node addon.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = process.cwd();
const bindingDirectory = process.env.UMF_NODE_BINDING_DIR ?? resolve(root, 'bindings/core/node');
const {createAvroFieldsEngine, AVRO_FIELDS_PROFILE} = await import(pathToFileURL(resolve(bindingDirectory, 'index.js')).href);
const packet = JSON.parse(readFileSync(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r5-avro-fields/predecessor.json'), 'utf8'));
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
assert.equal(AVRO_FIELDS_PROFILE, 'umf-r5-avro-fields/0.1.0');
let fields = 0;
const engine = createAvroFieldsEngine();
for (const row of packet.cases) {
  assert.equal(row.status, 'ok', row.label);
  const actual = engine.deriveAvroFields(row.payload.root, row.payload.dependencies ?? []);
  assert.equal(canonical(actual), canonical(row.fields), row.label);
  fields += actual.length;
}
assert.equal(fields, 294);
const rootTree = packet.cases[0].payload.root;
assert.throws(() => createAvroFieldsEngine({controls: {maxWork: 0}}).deriveAvroFields(rootTree), error => error.code === 'RESOURCE_LIMIT');
assert.throws(() => createAvroFieldsEngine({controls: {isCancelled: () => true}}).deriveAvroFields(rootTree), error => error.code === 'CANCELLED');
const result = {status: 'pass', node: process.version, profile: AVRO_FIELDS_PROFILE, cases: packet.cases.length, fields, controls: ['RESOURCE_LIMIT', 'CANCELLED']};
if (process.env.UMF_AVRO_FIELDS_NODE_RESULT) writeFileSync(process.env.UMF_AVRO_FIELDS_NODE_RESULT, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result)}\n`);
