// SPDX-License-Identifier: MIT OR Apache-2.0
// Independent Ajv 8.20.0 validation of the frozen full receipt. Rust's focused
// differential test proves parsed-value equality with this receipt.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';

const root='docs/helix/04-build/evidence/rust-migration/r5-dataset-values/';
const json=path=>JSON.parse(readFileSync(path,'utf8'));
const ajv=new Ajv2020({strict:false,allErrors:true});
for(const path of ['spec/core/schema.json','spec/core/semantic-type-reference.schema.json','spec/core/extension-package.schema.json','spec/core/key-tuple-operation-v4.schema.json']) ajv.addSchema(json(path));
const validate=ajv.compile(json('spec/core/dataset-value-operation.schema.json'));
const frozen=json(`${root}frozen-commerce.json`);
assert.equal(frozen.outcome.ok,true);
assert.equal(validate(frozen.outcome.value),true,JSON.stringify(validate.errors));
const rustOutput=process.env.UMF_R5_DATASET_VALUES_CAPTURE;
if(rustOutput){
 const bytes=readFileSync(rustOutput),actual=JSON.parse(bytes.toString('utf8'));
 assert.equal(validate(actual),true,JSON.stringify(validate.errors));
 process.stdout.write(`Ajv 8.20.0 Draft 2020-12 Rust receipt check passed; ${rustOutput} sha256=${createHash('sha256').update(bytes).digest('hex')}\n`);
}else process.stdout.write('Ajv 8.20.0 Draft 2020-12 frozen full receipt schema check passed. Set UMF_R5_DATASET_VALUES_CAPTURE to replay a Rust output.\n');
