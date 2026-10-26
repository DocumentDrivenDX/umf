// SPDX-License-Identifier: MIT OR Apache-2.0
// Derive per-host attestations from pinned installed replay receipts. The
// aggregate gate repeats this derivation; these normalized values are never
// trusted without reopening the hash-pinned raw receipt.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const dig=/^[a-f0-9]{64}$/;
function repoPath(root,name,label){
  if(typeof name!=='string'||!name||path.isAbsolute(name)||name.split(/[\\/]/).includes('..'))throw new Error(`${label} must be a safe repository-relative path`);
  const full=path.resolve(root,name),relative=path.relative(root,full);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error(`${label} escapes repository root`);
  return full;
}

function hostValue(raw,family,runtime){
  if(family==='csvBoolean')return raw[runtime];
  if(family==='coreInspectors')return runtime==='chromium'?raw.chromium:raw.runtime?.[runtime];
  if(family==='coreKeys')return raw.hosts?.[runtime];
  if(family==='bit128Uuid'&&raw.format==='umf.r8.bit128-installed-process-bound/1')return raw.hosts?.find(host=>host.runtime===runtime);
  return raw;
}

function archiveClaims(raw){
  const archive=raw.archive??{};
  return {
    sha256:archive.sha256??raw.archiveSha256??null,
    manifestSha256:archive.manifestSha256??archive.packageManifestSha256??raw.manifestSha256??null,
    closureSha256:raw.sourceClosure?.sha256??archive.closureSha256??raw.sourceClosureSha256??null,
    capturedLiveSha256:raw.sourceClosure?.capturedLiveSha256??archive.capturedLiveSourceTreeSha256??null,
    transformStatus:raw.sourceClosure?.transform?.status??raw.sourceClosure?.transformStatus??raw.sourceTransformStatus??null,
    transformCount:raw.sourceClosure?.transform?.generatedInputs?.length??raw.sourceClosure?.generatedInputTransformCount??raw.sourceTransformCount??null,
    sourceInputCount:raw.sourceClosure?.fileCount??raw.sourceInputCount??null,
  };
}

function artifactHashes(raw,family,runtime){
  if(family==='coreRelationships'){
    return runtime==='chromium'
      ? {'dist/umf-browser.js':raw.browserEntrySha256,'dist/umf_core_wasm_bg.wasm':raw.wasmSha256}
      : {'dist/umf-node.js':raw.artifactHashes?.nodeEntry,'dist/umf_core_node.node':raw.artifactHashes?.nativeAddon};
  }
  if(family==='bit128Uuid'){
    if(raw.format==='umf.r8.bit128-installed-process-bound/1'){
      const host=hostValue(raw,family,runtime);
      return runtime==='chromium'?{}:{'dist/umf-node.js':host?.entrySha256,'dist/umf_core_node.node':host?.nativeAddonSha256};
    }
    return runtime==='chromium'
      ? {'dist/umf-browser.js':raw.archiveEntrySha256,'dist/umf_core_wasm_bg.wasm':raw.wasmSha256}
      : {'dist/umf-node.js':raw.entrySha256,'dist/umf_core_node.node':raw.nativeAddonSha256};
  }
  if(family==='coreInspectors'){
    const entries=raw.memberHashes??{};
    return {'dist/umf-node.js':entries['dist/umf-node.js'],'dist/umf-browser.js':entries['dist/umf-browser.js'],'dist/umf_core_node.node':entries['dist/umf_core_node.node'],'dist/umf_core_wasm_bg.wasm':entries['dist/umf_core_wasm_bg.wasm']};
  }
  if(family==='csvBoolean')return raw.memberHashes??{};
  if(family==='coreKeys'){
    const members=raw.memberHashes??{};
    return members;
  }
  return {};
}

function validateRuntimeShape(raw,family,runtime){
  if(raw.status!=='pass')throw new Error(`${family}/${runtime} raw receipt is not pass`);
  if(raw.currentSourceStatus&&raw.currentSourceStatus!=='current-source')throw new Error(`${family}/${runtime} raw receipt is historical or ambiguous`);
  if(family==='csvBoolean'){
    if(runtime==='chromium'){
      if(!raw.chromium||raw.chromium.wasmRequested!==true||raw.chromium.cases!==14||typeof raw.chromium.version!=='string'||!raw.chromium.version||typeof raw.chromium.userAgent!=='string'||!raw.chromium.userAgent)throw new Error(`${family}/${runtime} raw host result is missing or incomplete`);
    }else{
      let host;try{host=JSON.parse(raw[runtime])}catch{}
      if(!host||host.cases!==14||typeof host.node!=='string'||!host.node||!String(host.root).includes('dist/umf-node.js')||!String(host.reference).includes('dist/umf.js'))throw new Error(`${family}/${runtime} raw host result is missing or incomplete`);
    }
  }else if(family==='coreInspectors'){
    const h=hostValue(raw,family,runtime);
    if(!h)throw new Error(`${family}/${runtime} raw host result is missing`);
    const expected={scalarType:8,recordMembers:9,referenceLinks:9};
    if(!h.operations||JSON.stringify(Object.keys(h.operations).sort())!==JSON.stringify(Object.keys(expected).sort())||Object.entries(expected).some(([name,count])=>h.operations[name]!==count))throw new Error(`${family}/${runtime} raw operation evidence differs from the frozen case inventory`);
    if(runtime==='chromium'){
      if(typeof h.version!=='string'||!h.version||typeof h.userAgent!=='string'||!h.userAgent||h.referenceEntry!=='@umf/core/reference'||h.wasmRequested!==true)throw new Error(`${family}/${runtime} raw browser identity, reference, or WASM evidence is incomplete`);
    }else{
      const expectedRuntime=runtime==='node'?'Node ':'Bun ';
      if(typeof h.runtime!=='string'||!h.runtime.startsWith(expectedRuntime)||typeof h.referenceEntry!=='string'||!h.referenceEntry.includes('/dist/umf.js'))throw new Error(`${family}/${runtime} raw host identity or reference evidence is incomplete`);
      if(!h.hostShapes||JSON.stringify(Object.keys(h.hostShapes).sort())!==JSON.stringify(Object.keys(expected).sort()))throw new Error(`${family}/${runtime} raw host-shape evidence is incomplete`);
    }
  }else if(family==='coreKeys'){
    const h=hostValue(raw,family,runtime);
    if(!h||h.status==='fail')throw new Error(`${family}/${runtime} raw host result is missing or failed`);
    const operations=['inspect','lookup','declareMembers','declareKey'];
    if(JSON.stringify(h.operations)!==JSON.stringify(operations))throw new Error(`${family}/${runtime} raw operation inventory is incomplete or changed`);
    if(h.caseCount!==4)throw new Error(`${family}/${runtime} raw case count is not four`);
    if(runtime==='chromium'){
      if(h.status!=='pass'||h.referenceParity!==true||h.wasmRequested!==true)throw new Error(`${family}/${runtime} raw browser parity or WASM evidence is incomplete`);
    }else{
      if(h.frozenOutcomes!==true||h.referenceParity!==true||h.prototypeAndKeyOrder!==true)throw new Error(`${family}/${runtime} raw outcome, reference, or shape parity is incomplete`);
      if(h.hostAdmission?.lookupIdentityBeforeSource!==true||h.hostAdmission?.keyRequestBeforeSource!==true)throw new Error(`${family}/${runtime} raw host admission evidence is incomplete`);
    }
  }else{
    if(family==='coreRelationships'){
      if(raw.caseCount!==11)throw new Error(`${family}/${runtime} raw case count is not eleven`);
      if(runtime==='chromium'&&(typeof raw.browser!=='string'||!raw.browser||typeof raw.userAgent!=='string'||!raw.userAgent||raw.exactPacketParity!==true||raw.nodeGlobalsAbsent!==true))throw new Error(`${family}/${runtime} raw browser identity or packet evidence is incomplete`);
    }
    if(family==='bit128Uuid'&&runtime==='chromium'&&raw.wasmRequested!==true)throw new Error(`${family}/${runtime} receipt did not load WASM`);
  }
  if(family==='csvBoolean'&&runtime==='chromium'&&raw.chromium.malformedReceiptExpectedSourceReads!==0)throw new Error('csvBoolean/chromium malformed receipt admission control failed');
  if((family==='coreRelationships'||family==='bit128Uuid')&&runtime!=='chromium'){
    const boundHost=family==='bit128Uuid'&&raw.format==='umf.r8.bit128-installed-process-bound/1'?hostValue(raw,family,runtime):null;
    const actual=String(boundHost?.runtime??raw.runtime??'');
    if(runtime==='node'&&!(actual==='node'||actual.startsWith('Node ')))throw new Error(`${family}/${runtime} raw host runtime identity is missing`);
    if(runtime==='bun'&&!(actual==='bun'||actual.startsWith('Bun ')))throw new Error(`${family}/${runtime} raw host runtime identity is missing`);
  }
  if(family==='coreRelationships'&&runtime==='chromium'&&raw.exactPacketParity!==true)throw new Error('coreRelationships/chromium raw packet parity is not pass');
  if(family==='coreRelationships'&&runtime!=='chromium'&&raw.exactOutcomeParity!==true)throw new Error(`${family}/${runtime} raw outcome parity is not pass`);
  if(family==='bit128Uuid'){
    const host=hostValue(raw,family,runtime);
    if(raw.format==='umf.r8.bit128-installed-process-bound/1'){
      if(!host||host.rawReplayPass!=='pass'||host.rawCaseCount!==11||host.nativeAddonLoadedInProcess!==true)throw new Error(`${family}/${runtime} process-bound replay evidence is incomplete`);
    }else if(raw.exactFrozenPacketParity!==true)throw new Error(`${family}/${runtime} frozen packet parity is not pass`);
  }
}

/** Re-derive normalized claims using pinned raw bytes and archive preflight maps. */
export function normalizeR8RouteHostReceipt({family,runtime,raw,rawPath,rawSha256,archive,memberHashes,liveInputs,root=repo}){
  if(!['node','bun','chromium'].includes(runtime))throw new Error(`unknown R8 host runtime: ${runtime}`);
  if(!dig.test(rawSha256??''))throw new Error(`${family}/${runtime} raw receipt needs a pinned SHA-256`);
  validateRuntimeShape(raw,family,runtime);
  if(family==='bit128Uuid'&&raw.format==='umf.r8.bit128-installed-process-bound/1'&&runtime!=='chromium'){
    const host=hostValue(raw,family,runtime),spec=host?.rawReceipt;
    if(!spec||!dig.test(spec.sha256??''))throw new Error(`${family}/${runtime} process-bound receipt omits raw replay bytes`);
    const bytes=fs.readFileSync(repoPath(root,spec.path,`${family}/${runtime} child replay receipt`));
    if(sha(bytes)!==spec.sha256)throw new Error(`${family}/${runtime} child replay receipt hash mismatch`);
    const child=JSON.parse(bytes.toString('utf8'));
    const expectedRuntime=runtime==='node'?'Node ':'Bun ';
    if(child.status!=='pass'||child.exactFrozenPacketParity!==true||child.caseCount!==11||!String(child.runtime).startsWith(expectedRuntime)||child.entrySha256!==host.entrySha256)throw new Error(`${family}/${runtime} child replay receipt does not match process-bound attestation`);
  }
  const claims=archiveClaims(raw), artifacts=artifactHashes(raw,family,runtime);
  let archiveSha=claims.sha256;
  if(archiveSha){
    if(archiveSha!==archive.sha256)throw new Error(`${family}/${runtime} raw archive claim differs from selected archive`);
    if(!claims.manifestSha256||claims.manifestSha256!==archive.packageManifestSha256)throw new Error(`${family}/${runtime} raw manifest hash is absent or differs from pinned package manifest`);
    if(!claims.closureSha256||claims.closureSha256!==archive.sourceClosureSha256)throw new Error(`${family}/${runtime} raw closure claim is absent or differs from selected closure`);
    if(!claims.capturedLiveSha256||claims.capturedLiveSha256!==archive.sourceClosureSha256)throw new Error(`${family}/${runtime} raw captured-live closure is absent or differs from selected closure`);
    if(claims.transformStatus!=='fixed-point'||claims.transformCount!==0||claims.sourceInputCount!==archive.sourceInputCount)throw new Error(`${family}/${runtime} raw source closure lacks fixed-point current-source details`);
  }else{
    const bound=Object.entries(artifacts).filter(([,h])=>h!==undefined);
    if(family==='coreRelationships'&&runtime!=='chromium'&&bound.length!==2)throw new Error(`${family}/${runtime} raw receipt lacks the Node entry/addon artifact pair`);
    if(family==='bit128Uuid'&&runtime!=='chromium'&&bound.length!==2)throw new Error(`${family}/${runtime} raw receipt lacks the native addon artifact hash`);
    if(bound.length===0)throw new Error(`${family}/${runtime} raw receipt has neither archive identity nor installed artifact hashes`);
    for(const [member,h] of bound){
      if(!dig.test(h??'')||memberHashes[member]!==h)throw new Error(`${family}/${runtime} installed artifact does not match archive member ${member}`);
    }
    archiveSha=archive.sha256;
  }
  if(Object.keys(artifacts).length&&Object.values(artifacts).some(h=>h!==undefined)){
    const used=Object.entries(artifacts).filter(([,h])=>h!==undefined);
    for(const [member,h] of used)if(!dig.test(h??'')||memberHashes[member]!==h)throw new Error(`${family}/${runtime} installed artifact does not match archive member ${member}`);
  }
  const sourceHashes=raw.sourceHashes??(raw.sourceClosure&&!raw.sourceClosure.sha256&&!('capturedLiveSha256'in raw.sourceClosure)&&!('fileCount'in raw.sourceClosure)&&!('transform'in raw.sourceClosure)?raw.sourceClosure:{});
  let archiveSourceCount=0,supplementalSourceCount=0;
  for(const [name,h] of Object.entries(sourceHashes)){
    if(!dig.test(h??''))throw new Error(`${family}/${runtime} source input hash is invalid: ${name}`);
    if(Object.hasOwn(liveInputs,name)){
      if(liveInputs[name]!==h)throw new Error(`${family}/${runtime} source input differs from selected closure: ${name}`);
      archiveSourceCount++;
    }else{
      const bytes=fs.readFileSync(repoPath(root,name,`${family}/${runtime} supplemental source input path`));
      if(sha(bytes)!==h)throw new Error(`${family}/${runtime} supplemental source input is not current: ${name}`);
      supplementalSourceCount++;
    }
  }
  if(claims.closureSha256&&claims.closureSha256!==archive.sourceClosureSha256)throw new Error(`${family}/${runtime} raw source closure differs from selected closure`);
  if(claims.transformStatus&&claims.transformStatus!=='fixed-point')throw new Error(`${family}/${runtime} raw source closure is not fixed-point`);
  if(claims.transformCount!==null&&claims.transformCount!==0)throw new Error(`${family}/${runtime} raw source closure contains generated transforms`);
  if(claims.sourceInputCount!==null&&claims.sourceInputCount!==archive.sourceInputCount)throw new Error(`${family}/${runtime} raw source input count differs from selected closure`);
  return {runtime,archiveSha256:archiveSha,sourceClosureSha256:archive.sourceClosureSha256,currentSourceStatus:'current-source',rawReceipt:{path:rawPath,sha256:rawSha256},hostEvidencePresent:true,archiveBinding:claims.sha256?'raw-aggregate-claim-and-manifest':'exact-installed-member-hashes',verifiedArtifacts:Object.fromEntries(Object.entries(artifacts).filter(([,h])=>h!==undefined)),verifiedSourceInputCount:archiveSourceCount,supplementalSourceCount};
}

export function adaptR8InstalledRouteReceipts(input,{root=repo}={}){
  if(!input||input.format!=='umf.r8.route-receipt-adapter-input/1')throw new Error('unsupported R8 receipt adapter input format');
  const archive=input.archive;if(!archive||!dig.test(archive.sha256??'')||!dig.test(archive.sourceClosureSha256??'')||!dig.test(archive.packageManifestSha256??'')||!Number.isSafeInteger(archive.sourceInputCount))throw new Error('adapter input archive identity is incomplete');
  if(!input.preflight||typeof input.preflight.path!=='string'||!dig.test(input.preflight.sha256??''))throw new Error('adapter input must pin archive preflight');
  const preflightPath=repoPath(root,input.preflight.path,'adapter preflight path'),preflightBytes=fs.readFileSync(preflightPath);
  if(sha(preflightBytes)!==input.preflight.sha256)throw new Error('adapter preflight hash mismatch');
  const preflight=JSON.parse(preflightBytes.toString('utf8')),memberProof=preflight.memberHashVerification,closure=preflight.sourceClosure;
  if(preflight.status!=='pass'||(preflight.archiveSha256??preflight.archive?.sha256)!==archive.sha256||closure?.sha256!==archive.sourceClosureSha256||closure?.capturedLiveSha256!==archive.sourceClosureSha256||closure?.currentSourceStatus!=='current-source')throw new Error('adapter preflight archive/closure claims mismatch');
  if(!memberProof||memberProof.status!=='pass'||memberProof.algorithm!=='sha256'||memberProof.verifiedMemberCount!==memberProof.archiveMemberCount||memberProof.packageManifestSha256!==archive.packageManifestSha256)throw new Error('adapter preflight does not pin complete archive members and package manifest');
  const memberPath=repoPath(root,memberProof.manifest.path,'adapter member manifest path'),memberBytes=fs.readFileSync(memberPath);
  if(sha(memberBytes)!==memberProof.manifest.sha256)throw new Error('adapter member manifest hash mismatch');
  const memberDoc=JSON.parse(memberBytes.toString('utf8')),memberHashes=memberDoc.members;
  if(memberDoc.packageManifestSha256!==archive.packageManifestSha256||Object.keys(memberHashes??{}).length!==memberProof.archiveMemberCount||Object.values(memberHashes??{}).some(h=>!dig.test(h)))throw new Error('adapter member map is incomplete or mismatched');
  const liveRef=closure.liveSourceManifest,livePath=repoPath(root,liveRef.path,'adapter live-source manifest path'),liveBytes=fs.readFileSync(livePath);
  if(sha(liveBytes)!==liveRef.sha256)throw new Error('adapter live-source manifest hash mismatch');
  const liveManifest=JSON.parse(liveBytes.toString('utf8')).sourceClosure,liveInputs=liveManifest?.inputs;
  if(liveManifest?.sha256!==archive.sourceClosureSha256||liveManifest?.capturedLiveSha256!==archive.sourceClosureSha256||liveManifest?.fileCount!==archive.sourceInputCount||liveManifest?.transform?.status!=='fixed-point'||liveManifest?.transform?.generatedInputs?.length!==0||Object.keys(liveInputs??{}).length!==archive.sourceInputCount)throw new Error('adapter live-source manifest is not a matching fixed point');
  const tree=crypto.createHash('sha256');
  for(const name of Object.keys(liveInputs).sort()){
    if(path.isAbsolute(name)||name.split(/[\\/]/).includes('..'))throw new Error(`unsafe live source path: ${name}`);
    const bytes=fs.readFileSync(repoPath(root,name,'live source input path'));if(sha(bytes)!==liveInputs[name])throw new Error(`adapter current source drift: ${name}`);
    tree.update(name);tree.update('\0');tree.update(bytes);tree.update('\0');
  }
  if(tree.digest('hex')!==archive.sourceClosureSha256)throw new Error('adapter recomputed live-source closure differs from archive');
  const families={};
  for(const [family,byRuntime] of Object.entries(input.families??{})){
    families[family]={status:'pass',receipts:[]};
    for(const runtime of ['node','bun','chromium']){
      const spec=byRuntime[runtime];if(!spec)throw new Error(`${family} is missing raw ${runtime} receipt`);
      const full=repoPath(root,spec.path,`${family}/${runtime} raw receipt path`),bytes=fs.readFileSync(full),actual=sha(bytes);
      if(actual!==spec.sha256)throw new Error(`${family}/${runtime} raw receipt hash mismatch: ${spec.path}`);
      const raw=JSON.parse(bytes.toString('utf8'));
      families[family].receipts.push(normalizeR8RouteHostReceipt({family,runtime,raw,rawPath:spec.path,rawSha256:actual,archive,memberHashes,liveInputs,root}));
    }
  }
  return {format:'umf.r8.route-receipt-adapter-output/1',archive,families};
}

function main(){
  if(!process.argv[2])throw new Error('Usage: bun scripts/rust-migration/r8/installed-route-receipt-adapter.mjs <adapter-input.json>');
  const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  process.stdout.write(`${JSON.stringify(adaptR8InstalledRouteReceipts(input),null,2)}\n`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
