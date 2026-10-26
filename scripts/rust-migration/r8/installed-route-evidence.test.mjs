// SPDX-License-Identifier: MIT OR Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pendingR8RouteNames,requiredR8RouteFamilies,validateR8InstalledRouteEvidence} from './installed-route-evidence.mjs';
import {adaptR8InstalledRouteReceipts,normalizeR8RouteHostReceipt} from './installed-route-receipt-adapter.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(){
 const root=await mkdtemp(path.join(os.tmpdir(),'umf-r8-route-evidence-'));
 const archiveSha='a'.repeat(64),families={},inputs={},sourceInputCount=7;
 await mkdir(path.join(root,'evidence'),{recursive:true});
 const sourceRoot=path.join(root,'live');await mkdir(sourceRoot,{recursive:true});
 const tree=createHash('sha256'),sourceBytes=Buffer.from('shared fixture source\n');
 await writeFile(path.join(root,'live/source.txt'),sourceBytes);
 for(let index=0;index<sourceInputCount;index++){
  const name=`live/${'/'.repeat(index)}source.txt`;
  inputs[name]=hash(sourceBytes);
 }
 for(const name of Object.keys(inputs).sort()){tree.update(name);tree.update('\0');tree.update(sourceBytes);tree.update('\0');}
 const closureSha=tree.digest('hex');
 const liveManifest={sourceClosure:{sha256:closureSha,capturedLiveSha256:closureSha,fileCount:sourceInputCount,inputs,transform:{status:'fixed-point',generatedInputs:[]}}};
 const liveManifestBytes=Buffer.from(JSON.stringify(liveManifest));await writeFile(path.join(root,'evidence/live-source.json'),liveManifestBytes);
 const members={
  'manifest.json':hash(Buffer.from('manifest')),
  'dist/umf-node.js':hash(Buffer.from('node-entry')),
  'dist/umf-browser.js':hash(Buffer.from('browser-entry')),
  'dist/umf_core_node.node':hash(Buffer.from('node-addon')),
  'dist/umf_core_wasm_bg.wasm':hash(Buffer.from('wasm')),
 };
 const packageManifestSha256=members['manifest.json'];
 const memberBytes=Buffer.from(JSON.stringify({members,packageManifestSha256}));await writeFile(path.join(root,'evidence/members.json'),memberBytes);
 const preflight={status:'pass',archiveSha256:archiveSha,sourceClosure:{sha256:closureSha,capturedLiveSha256:closureSha,currentSourceStatus:'current-source',liveSourceManifest:{path:'evidence/live-source.json',sha256:hash(liveManifestBytes)}},memberHashVerification:{status:'pass',algorithm:'sha256',archiveMemberCount:Object.keys(members).length,verifiedMemberCount:Object.keys(members).length,packageManifestSha256,manifest:{path:'evidence/members.json',sha256:hash(memberBytes)}}};
 const preflightBytes=Buffer.from(JSON.stringify(preflight));await writeFile(path.join(root,'evidence/preflight.json'),preflightBytes);
 for(const [family,operations] of Object.entries(requiredR8RouteFamilies)){
  families[family]={status:'pass',operations:[...operations],receipts:[]};
  for(const runtime of ['node','bun','chromium']){
   const common={archive:{sha256:archiveSha,manifestSha256:members['manifest.json']},sourceClosure:{sha256:closureSha,capturedLiveSha256:closureSha,fileCount:sourceInputCount,transform:{status:'fixed-point',generatedInputs:[]}},status:'pass'};
   let raw={...common};
   if(family==='csvBoolean')raw=runtime==='chromium'?{...raw,chromium:{version:'153.0.8010.12',userAgent:'HeadlessChrome',cases:14,wasmRequested:true,malformedReceiptExpectedSourceReads:0}}:{...raw,[runtime]:JSON.stringify({node:runtime==='node'?'v26 test':'v1 test',cases:14,root:'file:///node_modules/@umf/core/dist/umf-node.js',reference:'file:///node_modules/@umf/core/dist/umf.js'})};
   if(family==='coreInspectors')raw={...raw,runtime:{node:{runtime:'Node test',referenceEntry:'/tmp/node_modules/@umf/core/dist/umf.js',operations:{scalarType:8,recordMembers:9,referenceLinks:9},hostShapes:{scalarType:{},recordMembers:{},referenceLinks:{}}},bun:{runtime:'Bun test',referenceEntry:'/tmp/node_modules/@umf/core/dist/umf.js',operations:{scalarType:8,recordMembers:9,referenceLinks:9},hostShapes:{scalarType:{},recordMembers:{},referenceLinks:{}}}},chromium:{version:'153.0.8010.12',userAgent:'HeadlessChrome',referenceEntry:'@umf/core/reference',wasmRequested:true,operations:{scalarType:8,recordMembers:9,referenceLinks:9}},memberHashes:members};
   if(family==='coreRelationships')raw=runtime==='chromium'?{status:'pass',browser:'153.0.8010.12',userAgent:'HeadlessChrome',caseCount:11,nodeGlobalsAbsent:true,browserEntrySha256:members['dist/umf-browser.js'],wasmSha256:members['dist/umf_core_wasm_bg.wasm'],exactPacketParity:true,sourceHashes:{'live/source.txt':inputs['live/source.txt']}}:{status:'pass',runtime:runtime==='node'?'Node test':'Bun test',caseCount:11,exactOutcomeParity:true,artifactHashes:{nodeEntry:members['dist/umf-node.js'],nativeAddon:members['dist/umf_core_node.node']},sourceHashes:{'live/source.txt':inputs['live/source.txt']}};
   if(family==='bit128Uuid')raw=runtime==='chromium'?{status:'pass',browser:'Chromium test',archiveEntrySha256:members['dist/umf-browser.js'],wasmSha256:members['dist/umf_core_wasm_bg.wasm'],wasmRequested:true,exactFrozenPacketParity:true,sourceClosure:{'live/source.txt':inputs['live/source.txt']}}:{status:'pass',runtime:runtime==='node'?'Node test':'Bun test',entrySha256:members['dist/umf-node.js'],nativeAddonSha256:members['dist/umf_core_node.node'],exactFrozenPacketParity:true,sourceClosure:{'live/source.txt':inputs['live/source.txt']}};
   if(family==='coreKeys')raw={...raw,currentSourceStatus:'current-source',hosts:{[runtime]:runtime==='chromium'?{status:'pass',caseCount:4,operations:['inspect','lookup','declareMembers','declareKey'],referenceParity:true,wasmRequested:true}:{runtime:runtime==='node'?'Node test':'Bun test',status:'pass',caseCount:4,operations:['inspect','lookup','declareMembers','declareKey'],frozenOutcomes:true,referenceParity:true,prototypeAndKeyOrder:true,hostAdmission:{lookupIdentityBeforeSource:true,keyRequestBeforeSource:true}}}};
   const bytes=Buffer.from(JSON.stringify(raw));const name=`evidence/${family}-${runtime}.json`;
   await writeFile(path.join(root,name),bytes);
   const normalized=normalizeR8RouteHostReceipt({family,runtime,raw,rawPath:name,rawSha256:hash(bytes),archive:{sha256:archiveSha,sourceClosureSha256:closureSha,sourceInputCount,packageManifestSha256},memberHashes:members,liveInputs:inputs});
   families[family].receipts.push(normalized);
  }
 }
 const manifest={format:'umf.r8.installed-route-evidence/1',status:'pass',archive:{sha256:archiveSha,sourceClosureSha256:closureSha,sourceInputCount,generatedTransformCount:0},preflight:{path:'evidence/preflight.json',sha256:hash(preflightBytes),memberHashesVerified:true},families,logicalRetirementGaps:922};
 return {root,manifest,packageManifestSha256,cleanup:()=>rm(root,{recursive:true,force:true})};
}

test('aggregate route evidence requires one fixed-point archive cohort and preserves open retirement gaps',async()=>{
 const f=await fixture();try{const result=validateR8InstalledRouteEvidence(f.manifest,{root:f.root});assert.equal(result.status,'pass');assert.equal(result.boundedOperations,24);assert.equal(result.logicalRetirementGaps,922);assert.deepEqual(result.pendingOperations,pendingR8RouteNames);assert.equal(result.archiveVerification.independentArchiveRead,false);}finally{await f.cleanup()}
});

test('Core Keys raw host verification fails closed for altered counts, flags, and operation inventories',async()=>{
 const f=await fixture();try{
  const {root,manifest,packageManifestSha256}=f;
  const specByHost=Object.fromEntries(manifest.families.coreKeys.receipts.map(r=>[r.runtime,r.rawReceipt]));
  const base={format:'umf.r8.route-receipt-adapter-input/1',archive:{...manifest.archive,packageManifestSha256},preflight:manifest.preflight,families:{coreKeys:Object.fromEntries(Object.entries(specByHost).map(([runtime,spec])=>[runtime,spec]))}};
  const mutations=[
   ['node',raw=>{raw.hosts.node.frozenOutcomes=false}],
   ['bun',raw=>{raw.hosts.bun.referenceParity=false}],
   ['node',raw=>{raw.hosts.node.prototypeAndKeyOrder=false}],
   ['bun',raw=>{raw.hosts.bun.hostAdmission.keyRequestBeforeSource=false}],
   ['node',raw=>{raw.hosts.node.caseCount=3}],
   ['bun',raw=>{raw.hosts.bun.operations[2]='otherOperation'}],
   ['chromium',raw=>{raw.hosts.chromium.status='fail'}],
   ['chromium',raw=>{raw.hosts.chromium.caseCount=5}],
   ['chromium',raw=>{raw.hosts.chromium.operations.pop()}],
   ['chromium',raw=>{raw.hosts.chromium.referenceParity=false}],
   ['chromium',raw=>{raw.hosts.chromium.wasmRequested=false}],
  ];
  for(const [runtime,mutate] of mutations){
   const spec=specByHost[runtime],full=path.join(root,spec.path),original=JSON.parse(await import('node:fs/promises').then(m=>m.readFile(full,'utf8'))),changed=structuredClone(original);
   mutate(changed);const bytes=Buffer.from(JSON.stringify(changed));await writeFile(full,bytes);
   const altered={...base,families:{coreKeys:{...base.families.coreKeys,[runtime]:{path:spec.path,sha256:hash(bytes)}}}};
   assert.throws(()=>adaptR8InstalledRouteReceipts(altered,{root}),/coreKeys\//,`${runtime} tampering should fail`);
   await writeFile(full,JSON.stringify(original));
  }
 }finally{await f.cleanup()}
});

test('Core Inspectors, CSV Boolean, and Core Relationships raw receipts enforce frozen case evidence',async()=>{
 const f=await fixture();try{
  const {root,manifest,packageManifestSha256}=f;
  const mutationCases=[
   ['coreInspectors','node',raw=>{raw.runtime.node.operations.extra=1}],
   ['coreInspectors','bun',raw=>{raw.runtime.bun.operations.recordMembers=8}],
   ['coreInspectors','node',raw=>{delete raw.runtime.node.referenceEntry}],
   ['coreInspectors','chromium',raw=>{raw.chromium.wasmRequested=false}],
   ['coreInspectors','chromium',raw=>{raw.chromium.referenceEntry='missing'}],
   ['csvBoolean','node',raw=>{const host=JSON.parse(raw.node);host.cases=13;raw.node=JSON.stringify(host)}],
   ['csvBoolean','chromium',raw=>{raw.chromium.cases=13}],
   ['coreRelationships','node',raw=>{raw.caseCount=10}],
   ['coreRelationships','bun',raw=>{raw.caseCount=12}],
   ['coreRelationships','chromium',raw=>{raw.caseCount=10}],
  ];
  for(const [family,runtime,mutate] of mutationCases){
   const specByHost=Object.fromEntries(manifest.families[family].receipts.map(r=>[r.runtime,r.rawReceipt]));
   const familySpecs={},originals={};
   for(const [host,spec] of Object.entries(specByHost)){
    const full=path.join(root,spec.path),raw=JSON.parse(await import('node:fs/promises').then(m=>m.readFile(full,'utf8')));
    originals[host]=JSON.stringify(raw);
    if(host===runtime)mutate(raw);
    const bytes=Buffer.from(JSON.stringify(raw));await writeFile(full,bytes);familySpecs[host]={path:spec.path,sha256:hash(bytes)};
   }
   const input={format:'umf.r8.route-receipt-adapter-input/1',archive:{...manifest.archive,packageManifestSha256},preflight:manifest.preflight,families:{[family]:familySpecs}};
   assert.throws(()=>adaptR8InstalledRouteReceipts(input,{root}),new RegExp(`${family}\\/`),`${family}/${runtime} tampering should fail`);
   for(const [host,spec] of Object.entries(specByHost))await writeFile(path.join(root,spec.path),originals[host]);
  }
 }finally{await f.cleanup()}
});

test('supplemental receipt source hashes are checked against current files outside the archive closure',async()=>{
 const f=await fixture();try{
  const supplemental=Buffer.from('supplemental harness source\n'),name='live/supplemental-harness.ts';
  await writeFile(path.join(f.root,name),supplemental);
  const original=JSON.parse(await import('node:fs/promises').then(m=>m.readFile(path.join(f.root,'evidence/coreRelationships-node.json'),'utf8')));
  const raw={...original,sourceHashes:{...original.sourceHashes,[name]:hash(supplemental)}};
  const args={family:'coreRelationships',runtime:'node',raw,rawPath:'evidence/coreRelationships-node.json',rawSha256:hash(Buffer.from(JSON.stringify(raw))),archive:{sha256:f.manifest.archive.sha256,sourceClosureSha256:f.manifest.archive.sourceClosureSha256,sourceInputCount:f.manifest.archive.sourceInputCount,packageManifestSha256:f.packageManifestSha256},memberHashes:JSON.parse(await import('node:fs/promises').then(m=>m.readFile(path.join(f.root,'evidence/members.json'),'utf8'))).members,liveInputs:JSON.parse(await import('node:fs/promises').then(m=>m.readFile(path.join(f.root,'evidence/live-source.json'),'utf8'))).sourceClosure.inputs,root:f.root};
  const normalized=normalizeR8RouteHostReceipt(args);
  assert.equal(normalized.verifiedSourceInputCount,1);assert.equal(normalized.supplementalSourceCount,1);
  await writeFile(path.join(f.root,name),'edited harness source\n');
  assert.throws(()=>normalizeR8RouteHostReceipt(args),/supplemental source input is not current/);
 }finally{await f.cleanup()}
});

test('aggregate route evidence fails closed for absent or hash-mismatched family receipts',async()=>{
 const f=await fixture();try{
  f.manifest.families.bit128Uuid.receipts.pop();assert.throws(()=>validateR8InstalledRouteEvidence(f.manifest,{root:f.root}),/exactly Node, Bun and Chromium/);
  const fresh=await fixture();try{fresh.manifest.families.coreKeys.receipts[1].rawReceipt.sha256='0'.repeat(64);assert.throws(()=>validateR8InstalledRouteEvidence(fresh.manifest,{root:fresh.root}),/hash mismatch/)}finally{await fresh.cleanup()}
 }finally{await f.cleanup()}
});

test('aggregate route evidence rejects mixed archive and closure cohorts and pending routes',async()=>{
 const f=await fixture();try{
  f.manifest.families.coreRelationships.receipts[2].archiveSha256='c'.repeat(64);assert.throws(()=>validateR8InstalledRouteEvidence(f.manifest,{root:f.root}),/normalized claims differ/);
  const fresh=await fixture();try{fresh.manifest.families.coreKeys.receipts[0].sourceClosureSha256='d'.repeat(64);assert.throws(()=>validateR8InstalledRouteEvidence(fresh.manifest,{root:fresh.root}),/normalized claims differ/)}finally{await fresh.cleanup()}
  const another=await fixture();try{another.manifest.families.verifyCoreKeyOperation={status:'pass',operations:['verifyCoreKeyOperation'],receipts:[]};assert.throws(()=>validateR8InstalledRouteEvidence(another.manifest,{root:another.root}),/exactly the five required route families/)}finally{await another.cleanup()}
 }finally{await f.cleanup()}
});

test('aggregate route evidence rejects a family receipt claiming a different archive internally',async()=>{
 const f=await fixture();try{
  const spec=f.manifest.families.csvBoolean.receipts[0],rawPath=path.join(f.root,spec.rawReceipt.path),raw=JSON.parse(await import('node:fs/promises').then(m=>m.readFile(rawPath,'utf8')));raw.archive.sha256='f'.repeat(64);const bytes=Buffer.from(JSON.stringify(raw));
  await writeFile(rawPath,bytes);spec.rawReceipt.sha256=hash(bytes);
  assert.throws(()=>validateR8InstalledRouteEvidence(f.manifest,{root:f.root}),/raw archive claim differs/);
 }finally{await f.cleanup()}
});

test('aggregate route evidence rejects historical or ambiguous receipt source status',async()=>{
 const f=await fixture();try{
  const spec=f.manifest.families.coreKeys.receipts[0],rawPath=path.join(f.root,spec.rawReceipt.path),raw=JSON.parse(await import('node:fs/promises').then(m=>m.readFile(rawPath,'utf8')));raw.currentSourceStatus='historical-after-subsequent-source-edit';const bytes=Buffer.from(JSON.stringify(raw));
  await writeFile(rawPath,bytes);spec.rawReceipt.sha256=hash(bytes);
  assert.throws(()=>validateR8InstalledRouteEvidence(f.manifest,{root:f.root}),/historical or ambiguous/);
 }finally{await f.cleanup()}
});

test('aggregate route evidence rejects a self-asserted member-hash flag without pinned preflight proof',async()=>{
 const f=await fixture();try{
  const spec=f.manifest.preflight,bytes=Buffer.from(JSON.stringify({status:'pass',archiveSha256:f.manifest.archive.sha256,sourceClosure:{sha256:f.manifest.archive.sourceClosureSha256,capturedLiveSha256:f.manifest.archive.sourceClosureSha256}}));
  await writeFile(path.join(f.root,spec.path),bytes);spec.sha256=hash(bytes);spec.memberHashesVerified=true;
  assert.throws(()=>validateR8InstalledRouteEvidence(f.manifest,{root:f.root}),/lacks complete verified member-hash counts and package manifest identity/);
 }finally{await f.cleanup()}
});

test('aggregate route evidence requires per-receipt archive and closure claims',async()=>{
 const f=await fixture();try{
  const spec=f.manifest.families.coreKeys.receipts[0],rawPath=path.join(f.root,spec.rawReceipt.path),raw=JSON.parse(await import('node:fs/promises').then(m=>m.readFile(rawPath,'utf8')));delete raw.sourceClosure.sha256;delete raw.archive.sha256;delete raw.archive.manifestSha256;const bytes=Buffer.from(JSON.stringify(raw));
  await writeFile(rawPath,bytes);spec.rawReceipt.sha256=hash(bytes);
  assert.throws(()=>validateR8InstalledRouteEvidence(f.manifest,{root:f.root}),/neither archive identity nor installed artifact hashes/);
 }finally{await f.cleanup()}
});

test('aggregate route evidence rechecks raw receipt host presence and archive member binding',async()=>{
 const f=await fixture();try{
  const spec=f.manifest.families.coreRelationships.receipts[0],rawPath=path.join(f.root,spec.rawReceipt.path),raw=JSON.parse(await import('node:fs/promises').then(m=>m.readFile(rawPath,'utf8')));delete raw.artifactHashes.nativeAddon;const bytes=Buffer.from(JSON.stringify(raw));
  await writeFile(rawPath,bytes);spec.rawReceipt.sha256=hash(bytes);
  assert.throws(()=>validateR8InstalledRouteEvidence(f.manifest,{root:f.root}),/lacks the Node entry\/addon artifact pair/);
  const fresh=await fixture();try{const receipt=fresh.manifest.families.csvBoolean.receipts[1],p=path.join(fresh.root,receipt.rawReceipt.path),host=JSON.parse(await import('node:fs/promises').then(m=>m.readFile(p,'utf8')));delete host.bun;const changed=Buffer.from(JSON.stringify(host));await writeFile(p,changed);receipt.rawReceipt.sha256=hash(changed);assert.throws(()=>validateR8InstalledRouteEvidence(fresh.manifest,{root:fresh.root}),/raw host result is missing/)}finally{await fresh.cleanup()}
 }finally{await f.cleanup()}
});

test('aggregate route evidence recomputes current source and rejects live source drift',async()=>{
 const f=await fixture();try{
  await writeFile(path.join(f.root,'live/source.txt'),'changed after archive\n');
  assert.throws(()=>validateR8InstalledRouteEvidence(f.manifest,{root:f.root}),/current live source drift: live\//);
 }finally{await f.cleanup()}
});

test('receipt adapter derives three hosts only from hash-pinned preflight and raw evidence',async()=>{
 const f=await fixture();try{
  const families=Object.fromEntries(Object.entries(f.manifest.families).map(([family,value])=>[family,Object.fromEntries(value.receipts.map(r=>[r.runtime,r.rawReceipt]))]));
  const input={format:'umf.r8.route-receipt-adapter-input/1',archive:{...f.manifest.archive,packageManifestSha256:f.packageManifestSha256},preflight:f.manifest.preflight,families};
  const adapted=adaptR8InstalledRouteReceipts(input,{root:f.root});
  assert.equal(adapted.format,'umf.r8.route-receipt-adapter-output/1');
  assert.equal(Object.keys(adapted.families).length,5);
  for(const family of Object.values(adapted.families))assert.deepEqual(family.receipts.map(r=>r.runtime).sort(),['bun','chromium','node']);
  const altered={...input,families:{...input.families,coreKeys:{...input.families.coreKeys,node:{...input.families.coreKeys.node,sha256:'0'.repeat(64)}}}};
  assert.throws(()=>adaptR8InstalledRouteReceipts(altered,{root:f.root}),/raw receipt hash mismatch/);
  assert.throws(()=>adaptR8InstalledRouteReceipts({...input,preflight:{...input.preflight,sha256:'0'.repeat(64)}},{root:f.root}),/preflight hash mismatch/);
 }finally{await f.cleanup()}
});

test('Bit128 process-bound host attestation reopens and hashes the exact child replay receipt',async()=>{
 const f=await fixture();try{
  const members=JSON.parse(await import('node:fs/promises').then(m=>m.readFile(path.join(f.root,'evidence/members.json'),'utf8'))).members;
  const child={status:'pass',runtime:'Node v26.12.1',caseCount:11,exactFrozenPacketParity:true,entrySha256:members['dist/umf-node.js']};
  const childBytes=Buffer.from(JSON.stringify(child));await writeFile(path.join(f.root,'evidence/bit-node-child.json'),childBytes);
  const liveInputs=JSON.parse(await import('node:fs/promises').then(m=>m.readFile(path.join(f.root,'evidence/live-source.json'),'utf8'))).sourceClosure.inputs;
  const raw={format:'umf.r8.bit128-installed-process-bound/1',status:'pass',archive:{sha256:f.manifest.archive.sha256,packageManifestSha256:f.packageManifestSha256},sourceClosure:{sha256:f.manifest.archive.sourceClosureSha256,capturedLiveSha256:f.manifest.archive.sourceClosureSha256,fileCount:f.manifest.archive.sourceInputCount,currentSourceStatus:'current-source',transform:{status:'fixed-point',generatedInputs:[]}},hosts:[{runtime:'node',rawReceipt:{path:'evidence/bit-node-child.json',sha256:hash(childBytes)},rawCaseCount:11,rawReplayPass:'pass',entrySha256:members['dist/umf-node.js'],nativeAddonSha256:members['dist/umf_core_node.node'],nativeAddonLoadedInProcess:true}]};
  const normalized=normalizeR8RouteHostReceipt({family:'bit128Uuid',runtime:'node',raw,rawPath:'evidence/bit-wrapper.json',rawSha256:hash(Buffer.from(JSON.stringify(raw))),archive:{...f.manifest.archive,packageManifestSha256:f.packageManifestSha256},memberHashes:members,liveInputs,root:f.root});
  assert.equal(normalized.verifiedArtifacts['dist/umf_core_node.node'],members['dist/umf_core_node.node']);
  await writeFile(path.join(f.root,'evidence/bit-node-child.json'),'{"status":"fail"}');
  assert.throws(()=>normalizeR8RouteHostReceipt({family:'bit128Uuid',runtime:'node',raw,rawPath:'evidence/bit-wrapper.json',rawSha256:hash(Buffer.from(JSON.stringify(raw))),archive:{...f.manifest.archive,packageManifestSha256:f.packageManifestSha256},memberHashes:members,liveInputs,root:f.root}),/child replay receipt hash mismatch/);
 }finally{await f.cleanup()}
});
