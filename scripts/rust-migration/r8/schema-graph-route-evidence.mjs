// SPDX-License-Identifier: MIT OR Apache-2.0
// Fail-closed validator for the five-schema default-route packet.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import fs from 'node:fs';
import {join,relative,resolve,sep} from 'node:path';

export const FORMAT='umf.r8.schema-graph-route-evidence/1';
export const HARNESS_NAMES=Object.freeze([
  'schema-graph-route-common.mjs','schema-graph-route-host.mjs',
  'schema-graph-route-host-child.mjs','schema-graph-route-chromium.mjs',
  'schema-graph-route-build-packet.mjs','schema-graph-route-evidence.mjs',
  'schema-graph-route-evidence.test.mjs',
]);
export const OPERATION_NAMES=Object.freeze([
  'generateDomainPackSchema','generateDatasetSourceSchema','generateArtifactCollectionSchema',
  'generateDomainPackLoaderSchema','generateLoaderInventorySchema',
]);
const PROVIDERS=Object.freeze({
  generateDomainPackSchema:'domainPackSchemaGraphJson',
  generateDatasetSourceSchema:'datasetSourceSchemaGraphJson',
  generateArtifactCollectionSchema:'artifactCollectionSchemaGraphJson',
  generateDomainPackLoaderSchema:'domainPackLoaderSchemaGraphJson',
  generateLoaderInventorySchema:'loaderInventorySchemaGraphJson',
});
const HEX=/^[a-f0-9]{64}$/;
const fail=message=>{throw new Error(String(message).slice(0,600));};
const ensure=(condition,message)=>{if(!condition)fail(message);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
function safeRelative(value){return typeof value==='string'&&value.length>0&&!value.includes('\\')&&!value.startsWith('/')&&!/^[A-Za-z]:/.test(value)&&!value.split('/').includes('..')&&value.split('/').every(part=>part&&part!=='.');}
function inside(root,path){const target=resolve(root,path);return target===root||target.startsWith(root+sep);}
function pass(){return {status:'pass'};}
function failResult(reason){return {status:'fail',reason:String(reason).slice(0,600)};}
export function verifyDigest(bytes,expected,label){ensure(HEX.test(expected)&&sha(bytes)===expected,`packet checksum mismatch: ${label}`);return true;}
function operationSet(operations,label,{direct}){
  ensure(operations&&typeof operations==='object'&&!Array.isArray(operations),`${label} operation map missing`);
  ensure(canonical(Object.keys(operations).sort())===canonical([...OPERATION_NAMES].sort()),`${label} operation set differs`);
  for(const name of OPERATION_NAMES){
    const op=operations[name];
    ensure(op&&op.exactJsonParity===true,`${label} ${name} exact output parity missing`);
    ensure(op.provider===PROVIDERS[name],`${label} ${name} provider identity differs`);
    ensure(op.name===name&&op.arity===0,`${label} ${name} export identity differs`);
    ensure(Array.isArray(op.aliasGroupPointers),`${label} ${name} alias map missing`);
    ensure(op.freshInstance===true&&op.mutationPropagation===true,`${label} ${name} identity behavior missing`);
    if(direct){
      ensure(Number.isSafeInteger(op.providerCalls)&&op.providerCalls===2,`${label} ${name} must directly observe two native provider calls`);
      ensure(HEX.test(op.providerOutputSha256),`${label} ${name} provider output digest missing`);
    }else{
      ensure(op.providerCalls===null&&op.wasmExport===null,`${label} ${name} falsely claims direct WASM provider observation`);
    }
  }
}
export function validateClaims(receipt,claims){try{
  ensure(receipt?.format===FORMAT&&receipt.status==='pass','schema graph receipt format/status invalid');
  ensure(receipt.operations?.length===5&&canonical(receipt.operations)===canonical(OPERATION_NAMES),'receipt operation list differs');
  ensure(receipt.archive?.memberManifest?.path==='archiveMembers.json','archive member map pin missing');
  for(const key of ['archiveSha256','packageManifestSha256','archiveMemberCount']){
    if(key==='archiveMemberCount')ensure(Number.isSafeInteger(receipt.archive[key])&&receipt.archive[key]>0,'archive member count invalid');
    else ensure(HEX.test(receipt.archive[key]),`archive ${key} invalid`);
  }
  ensure(receipt.sourceClosure?.sha256===receipt.sourceClosure?.capturedLiveSha256&&HEX.test(receipt.sourceClosure.sha256),'source closure is not a current fixed point');
  ensure(receipt.sourceClosure.transform?.status==='fixed-point'&&receipt.sourceClosure.transform.generatedInputs?.length===0,'source transform is not a zero-change fixed point');
  const {node,bun,chromium,hostOutcome,liveSource,archiveMembers,packageManifest,sdkManifest,packageJson,harnesses}=claims;
  ensure(node?.status==='pass'&&bun?.status==='pass','Node/Bun route receipt missing');
  ensure(hostOutcome?.status==='pass'&&hostOutcome.nodeBunExactReceiptParity===true,'shared Node/Bun host replay did not assert exact receipt parity');
  ensure(hostOutcome.hosts?.node?.operations===5&&hostOutcome.hosts?.bun?.operations===5,'shared Node/Bun receipt lacks five-operation host counts');
  ensure(canonical(hostOutcome.operations)===canonical(node.operations)&&canonical(hostOutcome.operations)===canonical(bun.operations),'derived Node/Bun views are not tied to shared host operations');
  ensure(hostOutcome.hosts.node.runtime===node.runtime&&hostOutcome.hosts.bun.runtime===bun.runtime,'derived runtime labels differ from shared host receipt');
  ensure(typeof node.runtime==='string'&&node.runtime.length>0&&typeof bun.runtime==='string'&&bun.runtime.length>0,'Node/Bun runtime versions missing');
  ensure(node.artifact?.manifestSha256===bun.artifact?.manifestSha256&&node.artifact?.packageJsonSha256===bun.artifact?.packageJsonSha256&&node.artifact?.packageManifestSha256===bun.artifact?.packageManifestSha256&&node.artifact?.sourceClosureSha256===bun.artifact?.sourceClosureSha256,'Node/Bun artifact identity differs');
  ensure(receipt.archive.packageManifestSha256===node.artifact.packageManifestSha256,'route and archive package manifest differ');
  ensure(receipt.sourceClosure.sha256===node.artifact.sourceClosureSha256,'route and source closure differ');
  operationSet(node.operations,'Node', {direct:true});operationSet(bun.operations,'Bun',{direct:true});
  ensure(canonical(node.operations)===canonical(bun.operations),'Node/Bun operation receipts differ');
  ensure(chromium?.status==='pass'&&chromium.chromium?.wasmCounters==='unobserved','Chromium outcome must record WASM provider counters as unobserved');
  ensure(chromium.chromium?.wasmRequested===true&&chromium.chromium?.nodeGlobalsAbsent===true&&chromium.chromium?.requireAbsent===true,'Chromium browser isolation/adjacent WASM request missing');
  ensure(chromium.chromium?.externalRequests===0&&chromium.chromium?.pageErrors===0,'Chromium had external requests or page errors');
  ensure(chromium.artifact?.sourceClosureSha256===receipt.sourceClosure.sha256,'Chromium source closure differs');
  ensure(chromium.artifact?.manifestSha256===node.artifact?.manifestSha256&&chromium.artifact?.packageJsonSha256===node.artifact?.packageJsonSha256&&chromium.artifact?.packageManifestSha256===node.artifact?.packageManifestSha256,'Chromium package identity differs from Node/Bun');
  ensure(receipt.routes?.node?.path==='node.json'&&receipt.routes?.bun?.path==='bun.json'&&receipt.routes?.hostOutcome?.path==='host-outcome.json'&&receipt.routes?.chromium?.path==='chromium.json','route receipt paths missing');
  operationSet(chromium.chromium?.operations,'Chromium',{direct:false});
  ensure(liveSource?.sourceClosure?.sha256===receipt.sourceClosure.sha256&&liveSource.sourceClosure.capturedLiveSha256===receipt.sourceClosure.capturedLiveSha256,'live source manifest identity differs');
  ensure(liveSource.sourceClosure.fileCount===Object.keys(liveSource.sourceClosure.inputs??{}).length,'live source manifest is incomplete');
  ensure(sdkManifest?.sourceClosure?.sha256===receipt.sourceClosure.sha256,'SDK source manifest differs');
  ensure(packageJson?.name==='@umf/core'&&packageManifest?.sha256&&typeof packageManifest.sha256==='object','captured package metadata malformed');
  ensure(archiveMembers?.status==='pass'&&archiveMembers.archiveSha256===receipt.archive.archiveSha256,'archive member map status/hash differs');
  ensure(archiveMembers.archiveMemberCount===receipt.archive.archiveMemberCount&&archiveMembers.verifiedMemberCount===archiveMembers.archiveMemberCount,'archive member inventory incomplete');
  ensure(archiveMembers.packageManifestSha256===receipt.archive.packageManifestSha256,'archive package manifest digest differs');
  const archiveMap=archiveMembers.members;
  ensure(archiveMap&&typeof archiveMap==='object'&&!Array.isArray(archiveMap),'archive members map missing');
  for(const [name,digest] of Object.entries(archiveMap))ensure(safeRelative(name)&&HEX.test(digest),`invalid archive member entry: ${name}`);
  ensure(canonical(Object.fromEntries(Object.entries(archiveMap).filter(([name])=>name!=='manifest.json')))===canonical(packageManifest.sha256),'complete archive map differs from embedded package manifest');
  ensure(archiveMap['manifest.json']===receipt.archive.packageManifestSha256,'archive manifest member hash differs');
  ensure(canonical(Object.keys(harnesses??{}).sort())===canonical([...HARNESS_NAMES].sort()),'harness pin set differs');
  for(const name of HARNESS_NAMES)ensure(HEX.test(harnesses[name])&&HEX.test(receipt.harnesses?.[name]?.sha256)&&harnesses[name]===receipt.harnesses[name].sha256,`harness hash missing: ${name}`);
  return pass();
}catch(error){return failResult(error.message);}}

export function validateNegativeControls(doc){
  const required=['source closure mutation','archive member omission','Node dispatch undercount','Bun dispatch undercount','shared Node/Bun parity missing','Chromium counter overclaim','browser isolation failure','checksum tamper'];
  ensure(doc?.format==='umf.r8.schema-graph-negative-controls/1'&&doc.status==='pass'&&doc.baseline?.status==='pass','negative-control baseline missing');
  ensure(canonical(doc.controls?.map(item=>item.name))===canonical(required),'negative-control set differs');
  ensure(doc.controls.every(item=>item.rejected===true&&typeof item.reason==='string'&&item.reason.length>0),'negative control was not rejected');
}

function verifySourceSync(sourceClosure,repositoryRoot){
  ensure(sourceClosure?.sha256===sourceClosure?.capturedLiveSha256&&sourceClosure.transform?.status==='fixed-point'&&sourceClosure.transform.generatedInputs?.length===0,'source closure is not fixed point');
  const names=Object.keys(sourceClosure.inputs??{}).sort();ensure(names.length===sourceClosure.fileCount,'source closure file count mismatch');
  const tree=createHash('sha256');
  for(const name of names){ensure(safeRelative(name)&&inside(repositoryRoot,name),`unsafe source path ${name}`);const bytes=fs.readFileSync(resolve(repositoryRoot,name));ensure(sha(bytes)===sourceClosure.inputs[name],`current source changed: ${name}`);tree.update(name);tree.update('\0');tree.update(bytes);tree.update('\0');}
  ensure(tree.digest('hex')===sourceClosure.sha256,'live source tree digest mismatch');
}
export async function validatePacket(packetDir,{repositoryRoot=process.cwd(),archivePath}={}){try{
  const root=resolve(packetDir),receipt=JSON.parse(await readFile(join(root,'receipt.json'),'utf8'));
  const rows=(await readFile(join(root,'SHA256SUMS'),'utf8')).trim().split(/\r?\n/),pins=new Map();
  for(const line of rows){const m=/^([a-f0-9]{64})  (.+)$/.exec(line);ensure(m&&safeRelative(m[2]),'bad checksum row');ensure(!pins.has(m[2]),'duplicate checksum row');verifyDigest(await readFile(join(root,m[2])),m[1],m[2]);pins.set(m[2],m[1]);}
  const entries=await (await import('node:fs/promises')).readdir(root,{withFileTypes:true});for(const entry of entries){ensure(entry.isFile(),`packet contains non-file entry: ${entry.name}`);if(entry.name!=='SHA256SUMS')ensure(pins.has(entry.name),`packet file is not checksummed: ${entry.name}`);}
  for(const name of ['README.md','receipt.json','negative-controls.json','node.json','bun.json','host-outcome.json','chromium.json','liveSource.json','archiveMembers.json','archive-package-manifest.json','archive-sdk-manifest.json','archive-package.json'])ensure(pins.has(name),`packet file not pinned: ${name}`);
  const neg=JSON.parse(await readFile(join(root,'negative-controls.json'),'utf8'));validateNegativeControls(neg);
  const json=async name=>JSON.parse(await readFile(join(root,name),'utf8'));
  const [node,bun,chromium,liveSource,archiveMembers,packageManifest,sdkManifest,packageJson,hostOutcome]=await Promise.all(['node.json','bun.json','chromium.json','liveSource.json','archiveMembers.json','archive-package-manifest.json','archive-sdk-manifest.json','archive-package.json','host-outcome.json'].map(json));
  const harnesses={};for(const name of HARNESS_NAMES){const current=sha(fs.readFileSync(resolve(repositoryRoot,'scripts/rust-migration/r8',name)));ensure(pins.get(name)===current&&receipt.harnesses?.[name]?.sha256===current,`current harness changed: ${name}`);harnesses[name]=current;}
  verifySourceSync(liveSource.sourceClosure,repositoryRoot);
  ensure(receipt.sourceClosure.liveSourceManifest?.sha256===pins.get('liveSource.json'),'live source manifest hash mismatch');
  ensure(receipt.archive.memberManifest?.sha256===pins.get('archiveMembers.json'),'archive member map hash mismatch');
  ensure(receipt.archive.packageManifestFile?.sha256===pins.get('archive-package-manifest.json'),'package manifest hash mismatch');
  ensure(receipt.archive.sdkManifestFile?.sha256===pins.get('archive-sdk-manifest.json'),'SDK manifest hash mismatch');
  ensure(receipt.archive.packageJsonFile?.sha256===pins.get('archive-package.json'),'package JSON hash mismatch');
  for(const name of ['node','bun','chromium'])ensure(pins.get(receipt.routes[name].path)===receipt.routes[name].sha256,`${name} receipt pin mismatch`);
  ensure(pins.get('host-outcome.json')===receipt.routes.hostOutcome.sha256,'shared host receipt pin mismatch');
  const result=validateClaims(receipt,{node,bun,chromium,hostOutcome,liveSource,archiveMembers,packageManifest,sdkManifest,packageJson,harnesses});ensure(result.status==='pass',result.reason);
  if(archivePath)ensure(sha(fs.readFileSync(archivePath))===receipt.archive.archiveSha256,'SDK archive changed');
  return pass();
}catch(error){return failResult(error.message);}}

export function validatePacketSync(packetDir,{repositoryRoot=process.cwd(),archivePath}={}){
  try{const root=resolve(packetDir),receipt=JSON.parse(fs.readFileSync(join(root,'receipt.json'),'utf8')),pins=new Map();for(const line of fs.readFileSync(join(root,'SHA256SUMS'),'utf8').trim().split(/\r?\n/)){const m=/^([a-f0-9]{64})  (.+)$/.exec(line);ensure(m&&safeRelative(m[2])&&!pins.has(m[2]),'bad/duplicate checksum row');ensure(inside(root,m[2]),'checksum path escaped packet');verifyDigest(fs.readFileSync(resolve(root,m[2])),m[1],m[2]);pins.set(m[2],m[1]);}
    for(const entry of fs.readdirSync(root,{withFileTypes:true})){ensure(entry.isFile(),`packet contains non-file entry: ${entry.name}`);if(entry.name!=='SHA256SUMS')ensure(pins.has(entry.name),`packet file is not checksummed: ${entry.name}`);}
    const read=name=>{ensure(pins.has(name),`packet file not pinned: ${name}`);return JSON.parse(fs.readFileSync(join(root,name),'utf8'));};
    validateNegativeControls(read('negative-controls.json'));
    const [node,bun,chromium,liveSource,archiveMembers,packageManifest,sdkManifest,packageJson,hostOutcome]=['node.json','bun.json','chromium.json','liveSource.json','archiveMembers.json','archive-package-manifest.json','archive-sdk-manifest.json','archive-package.json','host-outcome.json'].map(read);
    verifySourceSync(liveSource.sourceClosure,repositoryRoot);const harnesses={};for(const name of HARNESS_NAMES){const hash=sha(fs.readFileSync(resolve(repositoryRoot,'scripts/rust-migration/r8',name)));ensure(hash===pins.get(name)&&hash===receipt.harnesses?.[name]?.sha256,`current harness changed: ${name}`);harnesses[name]=hash;}
    ensure(pins.get('liveSource.json')===receipt.sourceClosure.liveSourceManifest.sha256&&pins.get('archiveMembers.json')===receipt.archive.memberManifest.sha256,'source/member manifest pin mismatch');
    ensure(pins.get('archive-package-manifest.json')===receipt.archive.packageManifestFile.sha256&&pins.get('archive-sdk-manifest.json')===receipt.archive.sdkManifestFile.sha256&&pins.get('archive-package.json')===receipt.archive.packageJsonFile.sha256,'captured package file pin mismatch');
    for(const name of ['node','bun','chromium'])ensure(pins.get(receipt.routes[name].path)===receipt.routes[name].sha256,`${name} receipt pin mismatch`);
    ensure(pins.get('host-outcome.json')===receipt.routes.hostOutcome.sha256,'shared host receipt pin mismatch');
    const result=validateClaims(receipt,{node,bun,chromium,hostOutcome,liveSource,archiveMembers,packageManifest,sdkManifest,packageJson,harnesses});ensure(result.status==='pass',result.reason);if(archivePath)ensure(sha(fs.readFileSync(archivePath))===receipt.archive.archiveSha256,'SDK archive changed');return pass();
  }catch(error){return failResult(error.message);}
}
