// SPDX-License-Identifier: MIT OR Apache-2.0
// Ajv 8.20.0 Draft 2020-12 replay against the actual Rust compact JSON output.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';

const json=path=>JSON.parse(readFileSync(path,'utf8'));
const ajv=new Ajv2020({strict:false,allErrors:true});
for(const path of ['spec/core/schema.json','spec/core/semantic-type-reference.schema.json','spec/core/extension-package.schema.json','spec/core/key-tuple-operation-v4.schema.json']) ajv.addSchema(json(path));
const validate=ajv.compile(json('spec/core/dataset-value-compact-operation.schema.json'));
const output=process.env.UMF_R5_DATASET_VALUES_COMPACT_CAPTURE;
assert.ok(output,'UMF_R5_DATASET_VALUES_COMPACT_CAPTURE is required');
const bytes=readFileSync(output),actual=JSON.parse(bytes.toString('utf8'));
assert.equal(validate(actual),true,JSON.stringify(validate.errors));
process.stdout.write(`Ajv 8.20.0 Draft 2020-12 Rust compact receipt schema check passed; ${output} sha256=${createHash('sha256').update(bytes).digest('hex')}\n`);
