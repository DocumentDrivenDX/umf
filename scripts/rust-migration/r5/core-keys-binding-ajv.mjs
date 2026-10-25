// SPDX-License-Identifier: MIT OR Apache-2.0
// Independent Draft 2020-12 replay over actual opt-in Node/Rust receipts.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';

const capture=JSON.parse(await readFile(process.argv[2]??'/private/tmp/umf-r5-core-keys-node-capture.json','utf8'));
const ajv=new Ajv2020({strict:false,allErrors:true,validateFormats:false});
for(const path of ['spec/core/semantic-type-reference.schema.json','spec/core/schema.json']) ajv.addSchema(JSON.parse(await readFile(path,'utf8')));
const schemas={
  inspect_known:'spec/core/key-operation-v4.schema.json',inspect_absent:'spec/core/key-operation-v4.schema.json',inspect_inapplicable:'spec/core/key-operation-v4.schema.json',
  lookup_by_stable_id:'spec/core/key-operation-v4.schema.json',
  declare_members_ordered:'spec/core/key-operation-v2.schema.json',declare_key_explicit_primary:'spec/core/key-operation-v2.schema.json',
  preserve_unknown_qualifiers:'spec/core/key-operation-v2.schema.json',
};
const validators=new Map();
for(const [name,path] of Object.entries(schemas)){
  if(!validators.has(path)) validators.set(path,ajv.compile(JSON.parse(await readFile(path,'utf8'))));
  const outcome=capture.actual[name];
  assert.equal(outcome?.ok,true,`${name} did not produce a receipt`);
  const validate=validators.get(path);
  assert.equal(validate(outcome.value),true,`${name}: ${JSON.stringify(validate.errors)}`);
}
const invalid=structuredClone(capture.actual.declare_key_explicit_primary.value);invalid.version='forged';
assert.equal(validators.get('spec/core/key-operation-v2.schema.json')(invalid),false,'forged declaration version passed schema');
console.log(`Ajv 2020-12 accepted ${Object.keys(schemas).length} actual Node/Rust Key receipts and rejected the forged-version mutation.`);
