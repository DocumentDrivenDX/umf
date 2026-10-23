// SPDX-License-Identifier: MIT OR Apache-2.0
// Run the retained TypeScript and Rust implementations, compare full outputs,
// then validate the actual Rust envelopes independently with Ajv 8 Draft 2020-12.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
const base=new URL('../../../../../../',import.meta.url);
const root=new URL('../../../../../../',import.meta.url);
const read=(path)=>JSON.parse(readFileSync(new URL(path,base),'utf8'));
const run=(command,args)=>{const r=spawnSync(command,args,{cwd:new URL(root).pathname,encoding:'utf8',env:{...process.env,CARGO_TARGET_DIR:'/private/tmp/umf-r5-cardinality-target'}});assert.equal(r.status,0,`${command} failed\n${r.stderr}`);return JSON.parse(r.stdout)};
const ts=run('bun',['run','docs/helix/04-build/evidence/rust-migration/r5-cardinality/capture-vectors.ts']);
const rust=run('/opt/homebrew/opt/rustup/bin/cargo',['run','--locked','-q','-p','umf-core','--example','r5_cardinality_capture']);
assert.deepEqual(rust.inspection,ts.inspections.missing.value,'full inspection result');
assert.deepEqual(rust.surrogateInspection,ts.inspections.surrogate.value,'lone-surrogate unknown cardinality');
assert.deepEqual(rust.declaration,ts.declaration,'full declaration result');
assert.equal(ts.surrogateItemDeclaration.ok,true,'TypeScript surrogate itemType ID acceptance');
assert.deepEqual(rust.surrogateItemDeclaration,ts.surrogateItemDeclaration.value,'lone-surrogate itemType ID declaration');
assert.deepEqual(rust.surrogateIdentityInspection,ts.refusals.surrogateIdentity.value,'lone-surrogate module/element identity');
assert.deepEqual(rust.verified,ts.verified.value,'full verification result');
assert.deepEqual(rust.refusals.unknownOverwrite,ts.refusals.unknownOverwrite,'unknown overwrite refusal');
assert.deepEqual(rust.refusals.missingIdentity,ts.refusals.missingIdentity,'missing identity refusal');
assert.deepEqual(rust.refusals.invalidRequest,ts.refusals.invalidRequest,'full invalid-request diagnostics');
assert.deepEqual(rust.refusals.malformedSourceReceipt,ts.refusals.malformedSourceReceipt,'malformed receipt source');
assert.deepEqual(rust.refusals.malformedTargetReceipt,ts.refusals.malformedTargetReceipt,'malformed receipt target');

const core=read('spec/core/schema.json');
const semantic=read('spec/core/semantic-type-reference.schema.json');
const inspection=read('spec/core/cardinality-operation-v6.schema.json');
const declaration=read('spec/core/cardinality-operation-v4.schema.json');
const ajv=new Ajv2020({strict:false,allErrors:true});
ajv.addSchema(semantic);ajv.addSchema(core);
const checkInspection=ajv.compile(inspection),checkDeclaration=ajv.compile(declaration);
assert.equal(checkInspection(rust.inspection),true,JSON.stringify(checkInspection.errors));
assert.equal(checkInspection(rust.surrogateInspection),true,JSON.stringify(checkInspection.errors));
assert.equal(checkDeclaration(rust.declaration),true,JSON.stringify(checkDeclaration.errors));
assert.equal(checkDeclaration(rust.surrogateItemDeclaration),true,JSON.stringify(checkDeclaration.errors));
assert.equal(checkInspection(rust.surrogateIdentityInspection),true,JSON.stringify(checkInspection.errors));
assert.equal(checkDeclaration(rust.malformedSourceReceipt),false,'malformed source receipt must fail schema');
assert.equal(checkDeclaration(rust.malformedTargetReceipt),false,'malformed target receipt must fail schema');
assert.equal(checkDeclaration(rust.verified),true,JSON.stringify(checkDeclaration.errors));

// Refusal controls are captured from retained TypeScript and Rust module tests.
for(const key of ['unknownOverwrite','invalidRequest','missingIdentity']) assert.equal(ts.refusals[key].ok,false,key);
console.log('Full Rust inspection/declaration/verification outputs, lone-surrogate cardinality and itemType ID cases, and three refusal envelopes match retained TypeScript; Ajv 8 Draft 2020-12 accepts all actual Rust envelopes.');
