// SPDX-License-Identifier: MIT OR Apache-2.0
// Validate actual Rust-emitted complete envelopes against the production schema.
import {createValidator} from '../../../../src/validation/schema';
import schema from '../../../../spec/core/element-selection.schema.json';
import coreSchema from '../../../../spec/core/schema.json';
import frozen from '../../../../fixtures/validation/core-selection.json';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

const cargo=spawnSync('cargo',['run','--quiet','-p','umf-core','--example','r5_selection_output'],{
 cwd:process.cwd(),encoding:'utf8',env:process.env,
});
assert.equal(cargo.status,0,cargo.stderr);
const emitted=JSON.parse(cargo.stdout);
const ajv=createValidator();
ajv.addSchema(coreSchema);
const validate=ajv.compile(schema);
for(const name of ['result','closure','graphBoundaries','graphTraversal','cardinalityResult'] as const){
 assert.equal(validate(emitted[name]),true,JSON.stringify(validate.errors));
 if(name==='result'||name==='closure')assert.deepEqual(emitted[name],frozen[name]);
}
console.log(JSON.stringify({validated:['result','closure','graphBoundaries','graphTraversal','cardinalityResult'],schemaValid:true,predecessorEqual:true}));
