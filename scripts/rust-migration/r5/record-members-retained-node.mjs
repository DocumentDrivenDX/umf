// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay the retained Node Record Members runtime against its frozen packet.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(new URL('../../../',import.meta.url).pathname);
const packageRoot=resolve(process.env.UMF_R5_RECORD_MEMBERS_NODE_PACKAGE??resolve(root,'bindings/core/node'));
const readJson=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const packet=await readJson('docs/helix/04-build/evidence/rust-migration/r5-record-members-inspection/frozen-typescript.json');
const resources=Object.fromEntries(await Promise.all([
  ['coreSchema','spec/core/schema.json'],['referenceSchema','spec/core/semantic-type-reference.schema.json'],
  ['packageSchema','spec/core/extension-package.schema.json'],['constraints','spec/metamodel/generated/core-constraints.json'],
  ['domainPolicy','spec/metamodel/generated/domain-policy.json'],
].map(async([key,path])=>[key,await readJson(path)])));
const {createCoreRecordMembersEngine}=await import(pathToFileURL(resolve(packageRoot,'index.js')).href);
const engine=createCoreRecordMembersEngine(resources);
const actual={};
for(const [name,{source,identity}] of Object.entries(packet.cases)){
  let outcome;
  try{outcome={ok:true,value:engine.inspectCoreRecordMembers(source,identity)};}
  catch(error){outcome={ok:false,error:{code:error.code??'',message:error.message??String(error),path:error.path??''}};}
  assert.equal(JSON.stringify(outcome),JSON.stringify(packet.outcomes[name]),name);
  actual[name]=outcome;
}
engine.dispose();

const {source,identity}=packet.cases.known;
let setupWork=0,operationWork=0;
const controlled=createCoreRecordMembersEngine(resources,{setupControls:{meter:amount=>{setupWork+=amount;}},controls:{meter:amount=>{operationWork+=amount;}}});
assert(setupWork>0,'setup controls must meter retained resource preparation');
assert.equal(operationWork,0,'operation controls must be fresh after setup');
controlled.inspectCoreRecordMembers(source,identity);
assert(operationWork>0,'per-call controls must meter inspection');
controlled.dispose();

let getterReads=0;
const accessor={};
Object.defineProperty(accessor,'id',{enumerable:true,get(){getterReads++;return 'nested';}});
const rawHost=createCoreRecordMembersEngine(resources);
assert.throws(()=>rawHost.inspectCoreRecordMembers(accessor,{module:'sales',element:'slot'}));
assert.equal(getterReads,0,'accessor input must be refused without invoking getters');
rawHost.dispose();

const cancelled=createCoreRecordMembersEngine(resources,{controls:{isCancelled:()=>true}});
assert.throws(()=>cancelled.inspectCoreRecordMembers(source,identity),error=>error.code==='CANCELLED');
cancelled.dispose();
const disposed=createCoreRecordMembersEngine(resources);disposed.dispose();
assert.throws(()=>disposed.inspectCoreRecordMembers(source,identity),error=>error.code==='CORE_RECORD_MEMBERS_DISPOSED');

const hash=async path=>createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
const hashPkg=async path=>createHash('sha256').update(await readFile(resolve(packageRoot,path))).digest('hex');
const packageGlue={index:await hashPkg('index.js'),wire:await hashPkg('src/wire.js'),coreModel:await hashPkg('src/core-model.js'),recordMembers:await hashPkg('src/record-members-inspection.js')};
const repoGlue={index:await hash('bindings/core/node/index.js'),wire:await hash('bindings/core/node/src/wire.js'),coreModel:await hash('bindings/core/node/src/core-model.js'),recordMembers:await hash('bindings/core/node/src/record-members-inspection.js')};
assert.deepEqual(packageGlue,repoGlue,'staged package glue differs from the reviewed repository source cohort');
const addon=resolve(packageRoot,'umf_core_node.node');
const receipt={format:'umf-r5-record-members-retained-node/1',status:'pass',cohort:'opt-in retained Node source slice; package JS asserted equal to repository glue; not a full transitive build closure',runtime:process.versions.bun?{kind:'bun',version:process.versions.bun,nodeVersion:process.versions.node}:{kind:'node',version:process.versions.node,nodeVersion:process.versions.node},cases:Object.keys(actual).length,
  packetSha256:createHash('sha256').update(await readFile(resolve(root,'docs/helix/04-build/evidence/rust-migration/r5-record-members-inspection/frozen-typescript.json'))).digest('hex'),
  sourceSha256:{core:await hash('crates/umf-core/src/record_members_inspection.rs'),runtime:await hash('crates/umf-core-wire/src/record_members_inspection_binding.rs'),nodeBinding:await hash('bindings/core/node/src/record_members_inspection.rs'),nodeRegistration:await hash('bindings/core/node/src/lib.rs'),nodeIndex:repoGlue.index,facade:repoGlue.recordMembers,wireGlue:repoGlue.wire,runner:await hash('scripts/rust-migration/r5/record-members-retained-node.mjs')},
  packageGlue,nodeAddonSha256:createHash('sha256').update(await readFile(addon)).digest('hex'),controls:{setupWork,operationWork,accessorGetterReads:getterReads,cancellation:'CANCELLED',disposed:'CORE_RECORD_MEMBERS_DISPOSED'},actual};
console.log(JSON.stringify(receipt,null,2));
if(process.env.UMF_R5_RECORD_MEMBERS_NODE_RECEIPT)await writeFile(resolve(process.env.UMF_R5_RECORD_MEMBERS_NODE_RECEIPT),JSON.stringify(receipt,null,2)+'\n');
