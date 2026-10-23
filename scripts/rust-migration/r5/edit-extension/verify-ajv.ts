// SPDX-License-Identifier: MIT OR Apache-2.0
// Validate a complete document emitted by the actual Rust transaction.
import { readFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createValidator } from '../../../../src/validation/schema';
import coreSchema from '../../../../spec/core/schema.json';
import frozen from './frozen.json';

const output = '/private/tmp/umf-r5-edit-rust-output.json';
try { unlinkSync(output); } catch { /* fresh capture path */ }
const cargo = spawnSync('cargo', ['test', '-p', 'umf-core', '--test', 'r5_edit_extension', 'updater_runs_once_on_isolated_payload_and_commits_a_valid_candidate', '--', '--exact'], {
  cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, UMF_R5_EDIT_CAPTURE: output },
});
assert.equal(cargo.status, 0, cargo.stderr);
type EditedDocument = { modules: Array<{ elements: Array<{ extensions: Record<string, { label: string | number }> }> }> };
const actual = JSON.parse(readFileSync(output, 'utf8')) as EditedDocument;
const ajv = createValidator();
const validate = ajv.compile(coreSchema);
assert.equal(validate(actual), true, JSON.stringify(validate.errors));
assert.deepEqual(actual, frozen.success);
const negative: EditedDocument = structuredClone(actual);
negative.modules[0]!.elements[0]!.extensions['urn:test:note']!.label = 3;
const validatePayload = ajv.compile(frozen.extensionSchema);
const getPayload = (document: EditedDocument) => document.modules[0]!.elements[0]!.extensions['urn:test:note'];
assert.equal(validatePayload(getPayload(actual)), true, JSON.stringify(validatePayload.errors));
assert.equal(validatePayload(getPayload(negative)), false, 'Ajv must reject an invalid typed extension payload');
console.log(JSON.stringify({ actualRustOutput: true, coreSchemaValid: true, extensionSchemaValid: true, predecessorEqual: true, negativeControlRejected: true }));
