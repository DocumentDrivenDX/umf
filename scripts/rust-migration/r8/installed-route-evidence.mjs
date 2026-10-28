// SPDX-License-Identifier: MIT OR Apache-2.0
// Fail-closed aggregate gate for bounded R8 installed default-route receipts.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {normalizeR8RouteHostReceipt} from './installed-route-receipt-adapter.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export const requiredR8RouteFamilies=Object.freeze({
  csvBoolean:['validateCsvBooleanLexical','verifyCsvBooleanLexical'],
  coreInspectors:['inspectCoreScalarType','inspectCoreRecordMembers','inspectCoreReferenceLinks'],
  coreRelationships:['inspectCoreRelationships','lookupCoreRelationship','declareCoreRelationship','verifyCoreRelationshipOperation'],
  bit128Uuid:['parseBits128','parseUuid','bits128FromBytes','bits128ToBytes','uuidFromBits128','uuidToBits128','compareBits128','bits128ToWords','bits128FromWords','bits128ToInteger','bits128FromInteger'],
  coreKeys:['inspectCoreKeys','lookupCoreKey','declareCoreRecordMembers','declareCoreKey'],
});
export const pendingR8RouteNames=Object.freeze(['verifyCoreKeyOperation','inspectCoreFacets','declareCoreFacets','verifyCoreFacetDeclaration','historicalCoreFacetPatch','inspectCoreCardinality','declareCoreCardinality','verifyCoreCardinalityDeclaration','validateCoreDatasetValuesCompact','verifyCoreDatasetValuesCompact']);

function resolveEvidencePath(file,root){
  if(typeof file!=='string'||!file||path.isAbsolute(file))throw new Error(`receipt path must be repository-relative: ${String(file)}`);
  const full=path.resolve(root,file),relative=path.relative(root,full);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error(`receipt path escapes repository: ${file}`);
  return full;
}
function readHashed(spec,label,root){
  if(!spec||typeof spec!=='object')throw new Error(`${label} is missing`);
  const full=resolveEvidencePath(spec.path,root),bytes=fs.readFileSync(full),actual=sha(bytes);
  if(!/^[a-f0-9]{64}$/.test(spec.sha256??''))throw new Error(`${label} has no pinned SHA-256`);
  if(actual!==spec.sha256)throw new Error(`${label} hash mismatch: ${spec.path}`);
  return {path:spec.path,sha256:actual,json:JSON.parse(bytes.toString('utf8'))};
}
function sha256TreeFromCurrentInputs(inputs,root,label){
  if(!inputs||typeof inputs!=='object'||Array.isArray(inputs))throw new Error(`${label} source input hash map is missing`);
  const names=Object.keys(inputs).sort();
  if(names.length<1)throw new Error(`${label} must pin at least one live source input`);
  const tree=crypto.createHash('sha256');
  for(const name of names){
    if(path.isAbsolute(name)||name.split(/[\\/]/).includes('..'))throw new Error(`${label} contains an unsafe source path: ${name}`);
    const expected=inputs[name];
    if(!/^[a-f0-9]{64}$/.test(expected??''))throw new Error(`${label} has an invalid input SHA-256: ${name}`);
    const full=path.resolve(root,name),relative=path.relative(root,full);
    if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error(`${label} source path escapes repository: ${name}`);
    const bytes=fs.readFileSync(full),actual=sha(bytes);
    if(actual!==expected)throw new Error(`current live source drift: ${name}`);
    tree.update(name);tree.update('\0');tree.update(bytes);tree.update('\0');
  }
  return tree.digest('hex');
}
function receiptClaimsArchive(receipt){
  const archiveSha=receipt.archive?.sha256??receipt.archiveSha256??null;
  const closureSha=receipt.sourceClosure?.sha256??receipt.sourceClosureSha256??null;
  return {archiveSha,closureSha};
}

export function validateR8InstalledRouteEvidence(manifest,{root:repoRoot=repo}={}){
  if(!manifest||manifest.format!=='umf.r8.installed-route-evidence/1')throw new Error('unsupported R8 installed-route aggregate format');
  if(manifest.status!=='pass')throw new Error('aggregate evidence status must be pass');
  const archive=manifest.archive??{};
  for(const key of ['sha256','sourceClosureSha256'])if(!/^[a-f0-9]{64}$/.test(archive[key]??''))throw new Error(`aggregate archive.${key} is missing or malformed`);
  if(!Number.isSafeInteger(archive.sourceInputCount)||archive.sourceInputCount<1||archive.generatedTransformCount!==0)throw new Error('aggregate must identify a positive input count and zero-transform fixed-point source closure');
  const preflight=readHashed(manifest.preflight,'archive preflight',repoRoot);
  const preflightArchive=preflight.json.archiveSha256??preflight.json.archive?.sha256;
  const preflightClosure=preflight.json.sourceClosure?.sha256;
  if(preflight.json.status!=='pass'||preflightArchive!==archive.sha256||preflightClosure!==archive.sourceClosureSha256)throw new Error('archive preflight does not match aggregate archive/closure');
  const memberProof=preflight.json.memberHashVerification;
  if(!memberProof||memberProof.status!=='pass'||memberProof.algorithm!=='sha256'||!Number.isSafeInteger(memberProof.archiveMemberCount)||memberProof.archiveMemberCount<1||memberProof.verifiedMemberCount!==memberProof.archiveMemberCount||!/^[a-f0-9]{64}$/.test(memberProof.packageManifestSha256??''))throw new Error('archive preflight lacks complete verified member-hash counts and package manifest identity');
  const memberManifest=readHashed(memberProof.manifest,'archive member-hash manifest',repoRoot);
  const memberHashes=memberManifest.json.members;
  if(!memberHashes||typeof memberHashes!=='object'||Array.isArray(memberHashes)||Object.keys(memberHashes).length!==memberProof.archiveMemberCount||Object.values(memberHashes).some(value=>!/^[a-f0-9]{64}$/.test(value))||memberManifest.json.packageManifestSha256!==memberProof.packageManifestSha256)throw new Error('archive member-hash manifest does not pin every verified member and package manifest');
  const sourceClosure=preflight.json.sourceClosure??{};
  if(sourceClosure.capturedLiveSha256!==archive.sourceClosureSha256||sourceClosure.currentSourceStatus!=='current-source')throw new Error('archive preflight is not explicitly fixed-point against current live source');
  const liveSourceManifest=readHashed(sourceClosure.liveSourceManifest,'current live-source manifest',repoRoot);
  const liveClosure=liveSourceManifest.json.sourceClosure??{};
  if(liveClosure.sha256!==archive.sourceClosureSha256||liveClosure.capturedLiveSha256!==archive.sourceClosureSha256||liveClosure.fileCount!==archive.sourceInputCount||liveClosure.transform?.status!=='fixed-point'||liveClosure.transform?.generatedInputs?.length!==0||Object.keys(liveClosure.inputs??{}).length!==archive.sourceInputCount)throw new Error('pinned live-source manifest does not describe the aggregate fixed-point closure');
  const families=manifest.families??{};
  const expectedIds=Object.keys(requiredR8RouteFamilies).sort();
  if(Object.keys(families).sort().join('\0')!==expectedIds.join('\0'))throw new Error('aggregate must contain exactly the five required route families');
  const familyReceipts={};
  for(const [family,operations] of Object.entries(requiredR8RouteFamilies)){
    const entry=families[family];
    if(entry.status!=='pass')throw new Error(`${family} status must be pass`);
    if(JSON.stringify(entry.operations)!==JSON.stringify(operations))throw new Error(`${family} operation inventory mismatch`);
    if(entry.receipts?.length!==3)throw new Error(`${family} must provide exactly Node, Bun and Chromium receipts`);
    const runtimes=new Set();
    familyReceipts[family]=[];
    for(const receiptSpec of entry.receipts){
      if(!['node','bun','chromium'].includes(receiptSpec.runtime)||runtimes.has(receiptSpec.runtime))throw new Error(`${family} has missing, duplicate or unknown runtime receipt`);
      runtimes.add(receiptSpec.runtime);
      if(!receiptSpec.rawReceipt)throw new Error(`${family}/${receiptSpec.runtime} lacks hash-pinned raw host evidence`);
      const raw=readHashed(receiptSpec.rawReceipt,`${family}/${receiptSpec.runtime} raw receipt`,repoRoot);
      const derived=normalizeR8RouteHostReceipt({family,runtime:receiptSpec.runtime,raw:raw.json,rawPath:raw.path,rawSha256:raw.sha256,archive:{...archive,packageManifestSha256:memberProof.packageManifestSha256},memberHashes,liveInputs:liveClosure.inputs,root:repoRoot});
      if(receiptSpec.archiveSha256!==derived.archiveSha256||receiptSpec.sourceClosureSha256!==derived.sourceClosureSha256||receiptSpec.currentSourceStatus!==derived.currentSourceStatus)throw new Error(`${family}/${receiptSpec.runtime} normalized claims differ from raw evidence`);
      if(JSON.stringify(receiptSpec.verifiedArtifacts??{})!==JSON.stringify(derived.verifiedArtifacts)||receiptSpec.archiveBinding!==derived.archiveBinding||receiptSpec.hostEvidencePresent!==true)throw new Error(`${family}/${receiptSpec.runtime} normalized host/archive binding differs from raw evidence`);
      familyReceipts[family].push({runtime:receiptSpec.runtime,rawPath:raw.path,rawSha256:raw.sha256,archiveBinding:derived.archiveBinding,verifiedArtifacts:derived.verifiedArtifacts});
    }
    if(runtimes.size!==3)throw new Error(`${family} lacks a required runtime receipt`);
  }
  const recomputedClosure=sha256TreeFromCurrentInputs(liveClosure.inputs,repoRoot,'pinned live-source manifest');
  if(recomputedClosure!==archive.sourceClosureSha256)throw new Error('recomputed current live-source closure differs from aggregate archive');
  const operations=Object.values(requiredR8RouteFamilies).flat();
  if(operations.some(name=>pendingR8RouteNames.includes(name)))throw new Error('pending operation was incorrectly included in bounded route evidence');
  if(manifest.logicalRetirementGaps!==925)throw new Error('aggregate must preserve all 925 logical retirement gaps');
  return {status:'pass',qualificationScope:'Cross-checked pinned installed-route evidence with current-source recomputation; this gate does not independently reopen the SDK archive bytes.',archiveVerification:{mode:'pinned-preflight-attestation',independentArchiveRead:false,memberCount:memberProof.archiveMemberCount,memberHashManifestSha256:memberManifest.sha256},archive:{sha256:archive.sha256,sourceClosureSha256:archive.sourceClosureSha256,sourceInputCount:archive.sourceInputCount,generatedTransformCount:archive.generatedTransformCount},families:familyReceipts,boundedOperations:operations.length,operationNames:operations,logicalRetirementGaps:925,pendingOperations:pendingR8RouteNames};
}

function main(){
  const input=process.argv[2];if(!input)throw new Error('Usage: bun scripts/rust-migration/r8/installed-route-evidence.mjs <aggregate.json>');
  const absolute=path.resolve(input),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
  const result=validateR8InstalledRouteEvidence(JSON.parse(fs.readFileSync(absolute,'utf8')),{root});
  process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
