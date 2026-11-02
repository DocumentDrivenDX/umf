// SPDX-License-Identifier: MIT OR Apache-2.0
// Independent Ajv 8.20.0 validation of the dataset-value commerce fixture.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

const root='tests/rust-core/fixtures/r5-dataset-values';
const json=path=>JSON.parse(readFileSync(path,'utf8'));
const ajv=new Ajv2020({strict:false,allErrors:true});
for(const path of ['spec/core/schema.json','spec/core/semantic-type-reference.schema.json','spec/core/extension-package.schema.json','spec/core/key-tuple-operation-v4.schema.json']) ajv.addSchema(json(path));
const validate=ajv.compile(json('spec/core/dataset-value-operation.schema.json'));
const fixture=json(`${root}/frozen-commerce.json`);
assert.equal(fixture.outcome.ok,true);
assert.equal(validate(fixture.outcome.value),true,JSON.stringify(validate.errors));
process.stdout.write('Ajv 8.20.0 Draft 2020-12 dataset-value fixture schema check passed.\n');
