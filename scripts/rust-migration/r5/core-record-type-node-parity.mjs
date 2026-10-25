// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay the opt-in retained Node Record Type facade against its frozen v6 packet.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(new URL('../../../',import.meta.url).pathname);
const packageRoot=resolve(process.env.UMF_R5_RECORD_TYPE_NODE_PACKAGE??resolve(root,'bindings/core/node'));
const packet=JSON.parse(await readFile(resolve(root,'docs/helix/04-build/evidence/rust-migration/r5-core-record-type/frozen-typescript.json'),'utf8'));
const resources=Object.fromEntries(await Promise.all([
  ['coreSchema','spec/core/schema.json'],['referenceSchema','spec/core/semantic-type-reference.schema.json'],
  ['packageSchema','spec/core/extension-package.schema.json'],['constraints','spec/metamodel/generated/core-constraints.json'],
  ['domainPolicy','spec/metamodel/generated/domain-policy.json'],
].map(async([key,path])=>[key,JSON.parse(await readFile(resolve(root,path),'utf8'))])));
const {createCoreRecordTypeEngine}=await import(new URL('index.js',pathToFileURL(`${packageRoot}/`)).href);
const engine=createCoreRecordTypeEngine(resources);
const declared=engine.declareCoreRecordType(packet.successes['declare-nested'].fieldAuthor,packet.successes['declare-nested'].recordAuthor);
assert.deepEqual(JSON.parse(JSON.stringify(declared)),packet.successes['declare-nested'],'declare-nested');
for(const name of ['verify-nested','verify-recursive','verify-qualified']){
  const receipt=packet.successes[name];
  assert.deepEqual(JSON.parse(JSON.stringify(engine.verifyCoreRecordTypeDeclaration(receipt,receipt.target))),receipt,name);
}

let currentReads=0;
const current=new Proxy({}, {ownKeys(){currentReads++;return [];},getOwnPropertyDescriptor(){currentReads++;return undefined;}});
const malformed=structuredClone(packet.successes['declare-nested']);delete malformed.reference;
assert.throws(()=>engine.verifyCoreRecordTypeDeclaration(malformed,current));
assert.equal(currentReads,0,'malformed receipt must refuse before current access');

const other=createCoreRecordTypeEngine(resources);
const crossEngine=engine.prepareCoreRecordTypeVerification(packet.successes['declare-nested']);
assert.throws(()=>other.finishCoreRecordTypeVerification(crossEngine,current),/Invalid private Core Record Type verification handle/);
assert.equal(currentReads,0,'cross-engine handle must refuse before current access');
const oneUse=engine.prepareCoreRecordTypeVerification(packet.successes['declare-nested']);
assert.deepEqual(JSON.parse(JSON.stringify(engine.finishCoreRecordTypeVerification(oneUse,packet.successes['declare-nested'].target))),packet.successes['declare-nested']);
assert.throws(()=>engine.finishCoreRecordTypeVerification(oneUse,current),/Invalid private Core Record Type verification handle/);
assert.equal(currentReads,0,'reused handle must refuse before current access');

const stale=structuredClone(packet.successes['declare-nested'].target);stale.future={retained:true};
const failedFinish=engine.prepareCoreRecordTypeVerification(packet.successes['declare-nested']);
assert.throws(()=>engine.finishCoreRecordTypeVerification(failedFinish,stale));
assert.throws(()=>engine.finishCoreRecordTypeVerification(failedFinish,current),/Invalid private Core Record Type verification handle/);
assert.equal(currentReads,0,'failed finish must consume before later current access');

let total=0;
const baseline=createCoreRecordTypeEngine(resources,{controls:{meter:amount=>{total+=amount;}}});
total=0;
baseline.verifyCoreRecordTypeDeclaration(packet.successes['declare-nested'],packet.successes['declare-nested'].target);
const threshold=total-1;
let phase='prepare',prepareWork=0,finishWork=0;
const measured=createCoreRecordTypeEngine(resources,{controls:{meter:amount=>{if(phase==='prepare')prepareWork+=amount;else finishWork+=amount;}},setupControls:{}});
const staged=measured.prepareCoreRecordTypeVerification(packet.successes['declare-nested']);phase='finish';
measured.finishCoreRecordTypeVerification(staged,packet.successes['declare-nested'].target);
assert(prepareWork>0&&finishWork>0&&prepareWork<threshold&&finishWork<threshold,'both phases must fit individually under combined threshold');
const limited=createCoreRecordTypeEngine(resources,{controls:{maxWork:threshold},setupControls:{}});
const limitedStage=limited.prepareCoreRecordTypeVerification(packet.successes['declare-nested']);
assert.throws(()=>limited.finishCoreRecordTypeVerification(limitedStage,packet.successes['declare-nested'].target));
engine.dispose();other.dispose();baseline.dispose();measured.dispose();limited.dispose();

const hash=async path=>createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
const addon=resolve(packageRoot,'umf_core_node.node');
const result={format:'umf-r5-core-record-type-node/1',status:'pass',runtime:process.versions.bun?{kind:'bun',version:process.versions.bun,nodeVersion:process.versions.node}:{kind:'node',version:process.versions.node,nodeVersion:process.versions.node},cases:3,
  packetSha256:createHash('sha256').update(await readFile(resolve(root,'docs/helix/04-build/evidence/rust-migration/r5-core-record-type/frozen-typescript.json'))).digest('hex'),
  sourceSha256:{core:await hash('crates/umf-core/src/core_record_type.rs'),wireBinding:await hash('crates/umf-core-wire/src/core_record_type_verification_binding.rs'),nodeBinding:await hash('bindings/core/node/src/core_record_type_verification.rs'),nodeIndex:await hash('bindings/core/node/index.js'),facade:await hash('bindings/core/node/src/core-record-type.js'),runner:await hash('scripts/rust-migration/r5/core-record-type-node-parity.mjs')},
  nodeAddonSha256:createHash('sha256').update(await readFile(addon)).digest('hex'),verifiedCases:['declare-nested','verify-nested','verify-recursive','verify-qualified','malformed-receipt-before-current','cross-engine','reuse','finish-failure-consumption','cumulative-host-work']};
console.log(JSON.stringify(result,null,2));
if(process.env.UMF_R5_RECORD_TYPE_NODE_RECEIPT)await import('node:fs/promises').then(({writeFile})=>writeFile(resolve(process.env.UMF_R5_RECORD_TYPE_NODE_RECEIPT),JSON.stringify(result,null,2)+'\n'));
