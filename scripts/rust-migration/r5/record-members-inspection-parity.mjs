// SPDX-License-Identifier: MIT OR Apache-2.0
// Compare the opt-in Node/Rust record-members operation with frozen TypeScript.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import frozen from '../../../docs/helix/04-build/evidence/rust-migration/r5-record-members-inspection/frozen-typescript.json' with {type:'json'};
import coreSchema from '../../../spec/core/schema.json' with {type:'json'};
import referenceSchema from '../../../spec/core/semantic-type-reference.schema.json' with {type:'json'};
import packageSchema from '../../../spec/core/extension-package.schema.json' with {type:'json'};
import constraints from '../../../spec/metamodel/generated/core-constraints.json' with {type:'json'};
import domainPolicy from '../../../spec/metamodel/generated/domain-policy.json' with {type:'json'};

const root=resolve(new URL('../../../',import.meta.url).pathname);
const packageRoot=process.env.UMF_R5_RECORD_MEMBERS_NODE_PACKAGE
  ? resolve(process.env.UMF_R5_RECORD_MEMBERS_NODE_PACKAGE)
  : resolve(root,'bindings/core/node');
const {createCoreModelEngine}=await import(new URL('index.js',pathToFileURL(`${packageRoot}/`)).href);
const engine=createCoreModelEngine({coreSchema,referenceSchema,packageSchema,constraints,domainPolicy});
const outcomes={};
for(const [name,{source,identity}] of Object.entries(frozen.cases)){
  let outcome;
  try{outcome={ok:true,value:engine.inspectCoreRecordMembers(source,identity)};}
  catch(error){outcome={ok:false,error:{code:error.code??'',message:error.message??String(error),path:error.path??''}};}
  assert.equal(JSON.stringify(outcome),JSON.stringify(frozen.outcomes[name]),name);
  outcomes[name]=outcome;
  console.log(`${name}: exact match`);
}
if(process.env.UMF_R5_RECORD_MEMBERS_NODE_RECEIPT){
  const hash=async path=>createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
  const hashPackage=async path=>createHash('sha256').update(await readFile(resolve(packageRoot,path))).digest('hex');
  const packageGlue={nodeIndex:await hashPackage('index.js'),coreModelGlue:await hashPackage('src/core-model.js'),wireGlue:await hashPackage('src/wire.js')};
  const repoGlue={nodeIndex:await hash('bindings/core/node/index.js'),coreModelGlue:await hash('bindings/core/node/src/core-model.js'),wireGlue:await hash('bindings/core/node/src/wire.js')};
  assert.deepEqual(packageGlue,repoGlue,'staged Node package JavaScript differs from the reviewed source cohort');
  const addon=resolve(packageRoot,'umf_core_node.node');
  const runtime=process.versions.bun
    ? {kind:'bun',version:process.versions.bun,nodeVersion:process.versions.node}
    : {kind:'node',version:process.versions.node,nodeVersion:process.versions.node};
  const receipt={format:'umf-r5-record-members-node/1',status:'pass',cohort:'opt-in scoped source slice; JS package bytes asserted equal to repository glue (not a full transitive closure)',runtime,cases:Object.keys(frozen.cases).length,
    packetSha256:createHash('sha256').update(await readFile(resolve(root,'docs/helix/04-build/evidence/rust-migration/r5-record-members-inspection/frozen-typescript.json'))).digest('hex'),
    artifacts:{nodeAddonPath:addon,nodeAddonSha256:createHash('sha256').update(await readFile(addon)).digest('hex')},
    sourceSha256:{core:await hash('crates/umf-core/src/record_members_inspection.rs'),wire:await hash('crates/umf-core-wire/src/lib.rs'),nodeBinding:await hash('bindings/core/node/src/lib.rs'),test:await hash('crates/umf-core-wire/tests/r5_record_members_inspection.rs'),runner:await hash('scripts/rust-migration/r5/record-members-inspection-parity.mjs'),...packageGlue},actual:outcomes};
  await writeFile(resolve(process.env.UMF_R5_RECORD_MEMBERS_NODE_RECEIPT),JSON.stringify(receipt,null,2)+'\n');
}
