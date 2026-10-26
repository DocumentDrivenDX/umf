// SPDX-License-Identifier: MIT OR Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validateSchemaPropertiesRouteEvidence} from './schema-properties-route-evidence.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const ids=['string-null','string-carrier-length-positive-array','string-carrier-length-fraction','string-carrier-length-string-one','string-carrier-length-true','string-carrier-length-array-one','string-carrier-length-object','string-carrier-hex-string','string-carrier-binary-string','string-carrier-octal-string','string-carrier-subnormal-number-array'];
const host=(name)=>({
 host:name==='node'?'Node v26.12.1':name==='bun'?'Bun 1.4.3':'Chromium',
 ...(name==='chromium'?{version:'153.0.8010.12',userAgent:'Mozilla/5.0 HeadlessChrome/153.0.8010.12',wasmRequested:true}:{}),
 routeCount:4,schemaPropertySuccesses:6,schemaPropertyRefusals:3,fieldCaseCount:50,
 fieldFixedOutputCaseCount:39,fieldHostSpecificThrownCaseCount:11,fieldHostTypeErrorParityCount:11,
 fieldHostTypeErrorParityCases:ids.map(id=>({id,referenceName:'TypeError',rootName:'TypeError',parity:true})),
 defaultCaseCount:24,fixedOutputFrozenOutcomeCount:72,hostSpecificThrownOutcomeCount:11,frozenOutcomeCount:83,
 callerProxyControls:5,crossedAdmissionCaseCount:8,callerThrownIdentityStageCount:11,
 copyIsolation:{inputUnchanged:true,resultIsIndependent:true,callerMutationDoesNotChangeSource:true},
 rootReferenceParity:true,fieldHostTypeErrorParity:true,
});

async function fixture(){
 const root=await mkdtemp(path.join(os.tmpdir(),'umf-r8-schema-route-'));await mkdir(path.join(root,'evidence'),{recursive:true});
 const archiveSha='a'.repeat(64),manifestSha='b'.repeat(64),sourceName='live/source.txt',sourceBytes=Buffer.from('current source\n');
 await mkdir(path.join(root,'live'),{recursive:true});await writeFile(path.join(root,sourceName),sourceBytes);
 const tree=createHash('sha256');tree.update(sourceName);tree.update('\0');tree.update(sourceBytes);tree.update('\0');const closureSha=tree.digest('hex');
 const live={sourceClosure:{sha256:closureSha,capturedLiveSha256:closureSha,fileCount:1,transform:{status:'fixed-point',generatedInputs:[]},inputs:{[sourceName]:hash(sourceBytes)}}};
 const memberMap={members:{'manifest.json':manifestSha},packageManifestSha256:manifestSha};
 const liveBytes=Buffer.from(JSON.stringify(live)),memberBytes=Buffer.from(JSON.stringify(memberMap));
 await writeFile(path.join(root,'evidence/live.json'),liveBytes);await writeFile(path.join(root,'evidence/members.json'),memberBytes);
 const preflight={status:'pass',archiveSha256:archiveSha,sourceClosure:{sha256:closureSha,capturedLiveSha256:closureSha,currentSourceStatus:'current-source',liveSourceManifest:{path:'evidence/live.json',sha256:hash(liveBytes)}},memberHashVerification:{status:'pass',algorithm:'sha256',archiveMemberCount:1,verifiedMemberCount:1,packageManifestSha256:manifestSha,manifest:{path:'evidence/members.json',sha256:hash(memberBytes)}}};
 const receipt={format:'umf.r8.schema-properties-installed/1',status:'pass',archive:{sha256:archiveSha,manifestSha256:manifestSha,verifiedMemberCount:1},sourceClosure:{expectedSha256:closureSha,sha256:closureSha,capturedLiveSha256:closureSha,fileCount:1,transform:{status:'fixed-point',generatedInputs:[]}},packageRoutes:{node:'./dist/umf-node.js',browser:'./dist/umf-browser.js',import:'./dist/umf-browser.js',reference:'./dist/umf.js'},node:host('node'),bun:host('bun'),chromium:host('chromium')};
 const writeJson=async(name,value)=>{const bytes=Buffer.from(JSON.stringify(value));await writeFile(path.join(root,name),bytes);return {path:name,sha256:hash(bytes)}};
 const preflightRef=await writeJson('evidence/preflight.json',preflight),receiptRef=await writeJson('evidence/receipt.json',receipt);
 const pins={preflight:preflightRef,receipt:receiptRef,archiveSha256:archiveSha,packageManifestSha256:manifestSha,sourceClosureSha256:closureSha,sourceInputCount:1,archiveMemberCount:1,logicalRetirementGaps:922};
 return {root,pins,receipt,writeJson,cleanup:()=>rm(root,{recursive:true,force:true})};
}

test('Schema Properties route evidence accepts the pinned three-host bounded cohort',async()=>{
 const f=await fixture();try{
  const result=validateSchemaPropertiesRouteEvidence({pins:f.pins},{root:f.root});
  assert.equal(result.status,'pass');assert.equal(result.boundedOperations,4);assert.equal(result.logicalRetirementGaps,922);
  assert.equal(result.completeParity,false);assert.equal(result.releaseQualified,false);
  assert.equal(result.archiveVerification.independentArchiveRead,false);assert.equal(result.hosts.chromium.wasmRequested,true);
 }finally{await f.cleanup()}
});

test('Schema Properties route gate rejects absent hosts and changed route-case counts',async()=>{
 const f=await fixture();try{
  const missing={...f.receipt};delete missing.bun;const ref=await f.writeJson('evidence/receipt.json',missing);
  assert.throws(()=>validateSchemaPropertiesRouteEvidence({pins:{...f.pins,receipt:ref}},{root:f.root}),/bun host evidence is missing/);
  const changed=structuredClone(f.receipt);changed.node.fieldCaseCount=49;const changedRef=await f.writeJson('evidence/receipt.json',changed);
  assert.throws(()=>validateSchemaPropertiesRouteEvidence({pins:{...f.pins,receipt:changedRef}},{root:f.root}),/node.fieldCaseCount/);
 }finally{await f.cleanup()}
});

test('Schema Properties route gate rejects receipt archive, closure and pinned-hash mismatches',async()=>{
 const f=await fixture();try{
  const archiveChanged=structuredClone(f.receipt);archiveChanged.archive.sha256='c'.repeat(64);let ref=await f.writeJson('evidence/receipt.json',archiveChanged);
  assert.throws(()=>validateSchemaPropertiesRouteEvidence({pins:{...f.pins,receipt:ref}},{root:f.root}),/receipt archive SHA-256/);
  const closureChanged=structuredClone(f.receipt);closureChanged.sourceClosure.sha256='d'.repeat(64);ref=await f.writeJson('evidence/receipt.json',closureChanged);
  assert.throws(()=>validateSchemaPropertiesRouteEvidence({pins:{...f.pins,receipt:ref}},{root:f.root}),/receipt source closure must equal/);
  assert.throws(()=>validateSchemaPropertiesRouteEvidence({pins:{...f.pins,receipt:{...ref,sha256:'0'.repeat(64)}}},{root:f.root}),/Schema Properties receipt hash mismatch/);
 }finally{await f.cleanup()}
});

test('Schema Properties route gate rejects a TypeError identity/parity mismatch and live source drift',async()=>{
 const f=await fixture();try{
  const badParity=structuredClone(f.receipt);badParity.chromium.fieldHostTypeErrorParityCases[0].parity=false;let ref=await f.writeJson('evidence/receipt.json',badParity);
  assert.throws(()=>validateSchemaPropertiesRouteEvidence({pins:{...f.pins,receipt:ref}},{root:f.root}),/chromium TypeError identity\/parity mismatch/);
  ref=await f.writeJson('evidence/receipt.json',f.receipt);
  await writeFile(path.join(f.root,'live/source.txt'),'edited source\n');
  assert.throws(()=>validateSchemaPropertiesRouteEvidence({pins:{...f.pins,receipt:ref}},{root:f.root}),/current source drift/);
 }finally{await f.cleanup()}
});

test('Schema Properties route gate rejects an unpinned Chromium version',async()=>{
 const f=await fixture();try{
  const changed=structuredClone(f.receipt);changed.chromium.version='154.0.0.0';
  const ref=await f.writeJson('evidence/receipt.json',changed);
  assert.throws(()=>validateSchemaPropertiesRouteEvidence({pins:{...f.pins,receipt:ref}},{root:f.root}),/Chromium version must equal 153\.0\.8010\.12/);
 }finally{await f.cleanup()}
});
