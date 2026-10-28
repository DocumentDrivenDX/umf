// SPDX-License-Identifier: MIT OR Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FORMAT,OPERATION_NAMES,validateClaims,validateNegativeControls,validatePacket,verifyDigest} from './schema-graph-route-evidence.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const hash='a'.repeat(64);
const providers={generateDomainPackSchema:'domainPackSchemaGraphJson',generateDatasetSourceSchema:'datasetSourceSchemaGraphJson',generateArtifactCollectionSchema:'artifactCollectionSchemaGraphJson',generateDomainPackLoaderSchema:'domainPackLoaderSchemaGraphJson',generateLoaderInventorySchema:'loaderInventorySchemaGraphJson'};
function operations({direct=true}={}){return Object.fromEntries(OPERATION_NAMES.map(name=>[name,{provider:providers[name],exactJsonParity:true,name,arity:0,providerCalls:direct?2:null,providerOutputSha256:direct?hash:undefined,wasmExport:direct?'provider':null,aliasGroupPointers:[],freshInstance:true,mutationPropagation:true} ]));}
function fixture(){
  const sourceClosure={sha256:hash,capturedLiveSha256:hash,fileCount:1,transform:{status:'fixed-point',generatedInputs:[]},inputs:{'src/example.ts':hash}};
  const packageManifest={sha256:{'dist/umf-node.js':hash}};
  const sdkManifest={sourceClosure};const packageJson={name:'@umf/core'};
  const node={status:'pass',runtime:'v26.12.1',artifact:{manifestSha256:hash,packageJsonSha256:hash,packageManifestSha256:hash,sourceClosureSha256:hash},operations:operations()};
  const bun={...node,runtime:'1.4.3',operations:structuredClone(node.operations)};
  const hostOutcome={status:'pass',artifact:node.artifact,nodeBunExactReceiptParity:true,operations:structuredClone(node.operations),hosts:{node:{runtime:node.runtime,operations:5},bun:{runtime:bun.runtime,operations:5}}};
  const chromium={status:'pass',artifact:{manifestSha256:hash,packageJsonSha256:hash,packageManifestSha256:hash,sourceClosureSha256:hash},chromium:{wasmCounters:'unobserved',wasmRequested:true,nodeGlobalsAbsent:true,requireAbsent:true,externalRequests:0,pageErrors:0,version:'153.0.0',operations:operations({direct:false})}};
  const members={format:'umf.r8.schema-graph-archive-members/1',status:'pass',archiveSha256:hash,packageManifestSha256:hash,archiveMemberCount:2,verifiedMemberCount:2,members:{'manifest.json':hash,'dist/umf-node.js':hash}};
  const liveSource={sourceClosure};const harnesses=Object.fromEntries(['schema-graph-route-common.mjs','schema-graph-route-host.mjs','schema-graph-route-host-child.mjs','schema-graph-route-chromium.mjs','schema-graph-route-build-packet.mjs','schema-graph-route-evidence.mjs','schema-graph-route-evidence.test.mjs'].map(name=>[name,hash]));
  const receipt={format:FORMAT,status:'pass',operations:OPERATION_NAMES,routes:{node:{path:'node.json',sha256:hash},bun:{path:'bun.json',sha256:hash},hostOutcome:{path:'host-outcome.json',sha256:hash},chromium:{path:'chromium.json',sha256:hash}},sourceClosure:{...sourceClosure,liveSourceManifest:{path:'liveSource.json',sha256:hash}},archive:{archiveSha256:hash,packageManifestSha256:hash,archiveMemberCount:2,memberManifest:{path:'archiveMembers.json'}},harnesses:Object.fromEntries(Object.entries(harnesses).map(([name,sha256])=>[name,{path:name,sha256}]))};
  return {receipt,claims:{node,bun,chromium,hostOutcome,liveSource,archiveMembers:members,packageManifest,sdkManifest,packageJson,harnesses}};
}

test('accepts five operations with direct Node/Bun observations and explicit unobserved WASM counters',()=>{
  const {receipt,claims}=fixture();assert.equal(claims.packageJson.name,'@umf/core');assert.deepEqual(validateClaims(receipt,claims),{status:'pass'});
});
test('rejects incomplete operation sets, dispatch undercounts and Chromium overclaims',()=>{
  for(const mutate of [
    c=>{delete c.node.operations[OPERATION_NAMES[0]];},
    c=>{c.node.operations[OPERATION_NAMES[0]].providerCalls=1;},
    c=>{c.bun.operations[OPERATION_NAMES[1]].providerCalls=1;},
    c=>{c.hostOutcome.nodeBunExactReceiptParity=false;},
    c=>{c.chromium.chromium.wasmCounters='directly-observed';},
    c=>{c.chromium.chromium.nodeGlobalsAbsent=false;},
  ]){const {receipt,claims}=fixture();mutate(claims);assert.equal(validateClaims(receipt,claims).status,'fail');}
});
test('rejects missing archive members and non-fixed source closure',()=>{
  {const {receipt,claims}=fixture();delete claims.archiveMembers.members['dist/umf-node.js'];assert.equal(validateClaims(receipt,claims).status,'fail');}
  {const {receipt,claims}=fixture();claims.liveSource.sourceClosure.capturedLiveSha256='b'.repeat(64);assert.equal(validateClaims(receipt,claims).status,'fail');}
  {const {receipt,claims}=fixture();claims.packageJson.name='umf';assert.equal(validateClaims(receipt,claims).status,'fail');}
});
test('rejects a tampered packet file by its SHA256SUMS pin',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'schema-graph-integrity-'));
  try{
    await writeFile(join(dir,'README.md'),'tampered');
    await writeFile(join(dir,'receipt.json'),'{}\n');
    await writeFile(join(dir,'SHA256SUMS'),`${sha(Buffer.from('original'))}  README.md\n${sha(Buffer.from('{}\n'))}  receipt.json\n`);
    const result=await validatePacket(dir);assert.equal(result.status,'fail');assert.match(result.reason,/packet checksum mismatch: README.md/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('negative-control record requires every rejection to be explicit',()=>{
  const names=['source closure mutation','archive member omission','Node dispatch undercount','Bun dispatch undercount','shared Node/Bun parity missing','Chromium counter overclaim','browser isolation failure','checksum tamper'];
  assert.throws(()=>validateNegativeControls({format:'umf.r8.schema-graph-negative-controls/1',status:'pass',baseline:{status:'pass'},controls:names.map(name=>({name,rejected:false,reason:''}))}));
  assert.throws(()=>verifyDigest(Buffer.from('tampered'),sha(Buffer.from('pinned')),'sample'));
});
