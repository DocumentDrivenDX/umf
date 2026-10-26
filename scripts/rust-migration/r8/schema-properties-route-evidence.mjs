// SPDX-License-Identifier: MIT OR Apache-2.0
// Fail-closed evidence gate for the bounded Schema Properties installed routes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const preflightPath='docs/helix/04-build/evidence/rust-migration/r8-installed-route-evidence/current-61cbaf0a/preflight.json';
const receiptPath='docs/helix/04-build/evidence/rust-migration/r8-installed-route-evidence/current-61cbaf0a/raw/schema-properties.json';
const typeErrorIds=Object.freeze([
 'string-null','string-carrier-length-positive-array','string-carrier-length-fraction',
 'string-carrier-length-string-one','string-carrier-length-true','string-carrier-length-array-one',
 'string-carrier-length-object','string-carrier-hex-string','string-carrier-binary-string',
 'string-carrier-octal-string','string-carrier-subnormal-number-array',
]);
const hostVersions=Object.freeze({node:'Node v26.12.1',bun:'Bun 1.4.3',chromium:'153.0.8010.12'});
export const schemaPropertiesRouteEvidencePins=Object.freeze({
 preflight:{path:preflightPath,sha256:'ac310d6f1564b217f4a914de0cd530a9bf1ad41bee073a6ae043b8d17af3f70a'},
 receipt:{path:receiptPath,sha256:'cb8aaca2f462776002ef92f0d9b7bb0da5860bc454f92549926b61a7a2cdf66a'},
 archiveSha256:'c1ecf9cea81c3767e281820a93294b85a45ab052862a9fcd8b0b493057302263',
 packageManifestSha256:'93bb2abb80a43545477e6e85bc6b7112f1819b38f8794297a9c9b801e8f41efa',
 sourceClosureSha256:'61cbaf0ae7a0359e9ae49d2aa4c436727f2122e4174d84999efb20f42d2c3b01',
 sourceInputCount:3435,archiveMemberCount:1788,logicalRetirementGaps:922,
});
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

function repoFile(name,root){
 if(typeof name!=='string'||!name||path.isAbsolute(name)||name.split(/[\\/]/).includes('..'))throw new Error(`unsafe repository-relative evidence path: ${String(name)}`);
 const full=path.resolve(root,name),relative=path.relative(root,full);
 if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error(`evidence path escapes repository: ${name}`);
 return full;
}
function readPinned(spec,label,root){
 if(!spec||!/^([a-f0-9]{64})$/.test(spec.sha256??''))throw new Error(`${label} lacks a pinned SHA-256`);
 const bytes=fs.readFileSync(repoFile(spec.path,root)),actual=sha(bytes);
 if(actual!==spec.sha256)throw new Error(`${label} hash mismatch: ${spec.path}`);
 return {path:spec.path,sha256:actual,json:JSON.parse(bytes.toString('utf8'))};
}
function recomputeSourceClosure(inputs,root){
 if(!inputs||typeof inputs!=='object'||Array.isArray(inputs))throw new Error('live source input hash map is missing');
 const names=Object.keys(inputs).sort();if(!names.length)throw new Error('live source input hash map is empty');
 const tree=crypto.createHash('sha256');
 for(const name of names){
  const expected=inputs[name];if(!/^[a-f0-9]{64}$/.test(expected??''))throw new Error(`invalid live source hash: ${name}`);
  const bytes=fs.readFileSync(repoFile(name,root)),actual=sha(bytes);
  if(actual!==expected)throw new Error(`current source drift: ${name}`);
  tree.update(name);tree.update('\0');tree.update(bytes);tree.update('\0');
 }
 return tree.digest('hex');
}
function exact(value,expected,label){if(value!==expected)throw new Error(`${label} must equal ${String(expected)}`)}

function validateHost(name,host){
 if(!host||typeof host!=='object')throw new Error(`${name} host evidence is missing`);
 if(name==='chromium')exact(host.host,'Chromium','chromium host identity');
 else exact(host.host,hostVersions[name],`${name} runtime version`);
 for(const [field,value] of Object.entries({routeCount:4,schemaPropertySuccesses:6,schemaPropertyRefusals:3,fieldCaseCount:50,fieldFixedOutputCaseCount:39,fieldHostSpecificThrownCaseCount:11,fieldHostTypeErrorParityCount:11,defaultCaseCount:24,fixedOutputFrozenOutcomeCount:72,hostSpecificThrownOutcomeCount:11,frozenOutcomeCount:83,callerProxyControls:5,crossedAdmissionCaseCount:8,callerThrownIdentityStageCount:11}))exact(host[field],value,`${name}.${field}`);
 exact(host.rootReferenceParity,true,`${name}.rootReferenceParity`);
 exact(host.fieldHostTypeErrorParity,true,`${name}.fieldHostTypeErrorParity`);
 const cases=host.fieldHostTypeErrorParityCases;
 if(!Array.isArray(cases)||cases.length!==typeErrorIds.length)throw new Error(`${name} TypeError parity cases must contain exactly ${typeErrorIds.length} entries`);
 for(let i=0;i<typeErrorIds.length;i++){
  const item=cases[i];
  if(item?.id!==typeErrorIds[i]||item.referenceName!=='TypeError'||item.rootName!=='TypeError'||item.parity!==true)throw new Error(`${name} TypeError identity/parity mismatch at case ${typeErrorIds[i]}`);
 }
 const isolation=host.copyIsolation;
 if(isolation?.inputUnchanged!==true||isolation.resultIsIndependent!==true||isolation.callerMutationDoesNotChangeSource!==true)throw new Error(`${name} copy isolation evidence is incomplete`);
 if(name==='chromium'){
  exact(host.version,hostVersions.chromium,'Chromium version');
  if(host.wasmRequested!==true||typeof host.userAgent!=='string'||!host.userAgent.includes(`HeadlessChrome/${hostVersions.chromium}`))throw new Error('Chromium must identify the pinned WASM route and browser version');
 }
 return {host:host.host,routeCount:host.routeCount,fieldCaseCount:host.fieldCaseCount,defaultCaseCount:host.defaultCaseCount,typeErrorParityCases:cases.length,wasmRequested:name==='chromium'};
}

export function validateSchemaPropertiesRouteEvidence({pins=schemaPropertiesRouteEvidencePins}={}, {root:repoRoot=repo}={}){
 const preflight=readPinned(pins.preflight,'archive preflight',repoRoot),receipt=readPinned(pins.receipt,'Schema Properties receipt',repoRoot);
 const p=preflight.json,r=receipt.json;
 exact(p.status,'pass','archive preflight status');exact(p.archiveSha256,pins.archiveSha256,'preflight archive SHA-256');
 const proof=p.memberHashVerification;
 if(proof?.status!=='pass'||proof.algorithm!=='sha256')throw new Error('preflight member-hash verification did not pass');
 exact(proof.archiveMemberCount,pins.archiveMemberCount,'archive member count');exact(proof.verifiedMemberCount,pins.archiveMemberCount,'verified member count');
 exact(proof.packageManifestSha256,pins.packageManifestSha256,'package manifest SHA-256');
 const members=readPinned(proof.manifest,'archive member-hash map',repoRoot),map=members.json.members;
 if(!map||typeof map!=='object'||Array.isArray(map)||Object.keys(map).length!==pins.archiveMemberCount||Object.values(map).some(x=>!/^[a-f0-9]{64}$/.test(x)))throw new Error('archive member-hash map is incomplete or malformed');
 exact(members.json.packageManifestSha256,pins.packageManifestSha256,'member-map package manifest SHA-256');
 const source=p.sourceClosure;
 exact(source?.sha256,pins.sourceClosureSha256,'preflight source closure SHA-256');
 exact(source?.capturedLiveSha256,pins.sourceClosureSha256,'captured source closure SHA-256');
 exact(source?.currentSourceStatus,'current-source','preflight source status');
 const live=readPinned(source.liveSourceManifest,'live-source map',repoRoot),closure=live.json.sourceClosure;
 exact(closure?.sha256,pins.sourceClosureSha256,'live source closure SHA-256');
 exact(closure?.capturedLiveSha256,pins.sourceClosureSha256,'live captured source closure SHA-256');
 exact(closure?.fileCount,pins.sourceInputCount,'live source file count');
 exact(Object.keys(closure?.inputs??{}).length,pins.sourceInputCount,'live source map entry count');
 if(closure?.transform?.status!=='fixed-point'||closure.transform.generatedInputs?.length!==0)throw new Error('live source map is not a zero-transform fixed point');
 const recomputed=recomputeSourceClosure(closure.inputs,repoRoot);
 exact(recomputed,pins.sourceClosureSha256,'recomputed current source closure');
 exact(r.format,'umf.r8.schema-properties-installed/1','receipt format');exact(r.status,'pass','receipt status');
 const packageRoutes={node:'./dist/umf-node.js',browser:'./dist/umf-browser.js',import:'./dist/umf-browser.js',reference:'./dist/umf.js'};
 if(JSON.stringify(r.packageRoutes)!==JSON.stringify(packageRoutes))throw new Error('Schema Properties package route map differs from the pinned installed routes');
 exact(r.archive?.sha256,pins.archiveSha256,'receipt archive SHA-256');
 exact(r.archive?.manifestSha256,pins.packageManifestSha256,'receipt package manifest SHA-256');
 exact(r.archive?.verifiedMemberCount,pins.archiveMemberCount,'receipt verified member count');
 exact(r.sourceClosure?.expectedSha256,pins.sourceClosureSha256,'receipt expected source closure');
 exact(r.sourceClosure?.sha256,pins.sourceClosureSha256,'receipt source closure');
 exact(r.sourceClosure?.capturedLiveSha256,pins.sourceClosureSha256,'receipt captured source closure');
 exact(r.sourceClosure?.fileCount,pins.sourceInputCount,'receipt source file count');
 if(r.sourceClosure?.transform?.status!=='fixed-point'||r.sourceClosure.transform.generatedInputs?.length!==0)throw new Error('receipt source transform must be fixed-point with zero generated inputs');
 const hosts={};for(const name of ['node','bun','chromium'])hosts[name]=validateHost(name,r[name]);
 const operations=['inspectCoreSchemaProperties','declareCoreSchemaProperties','validateCoreFieldValue','resolveCoreDefault'];
 return {status:'pass',qualificationScope:'Bounded Schema Properties installed-route receipt checked against pinned preflight, member map and recomputed current source closure.',archiveVerification:{mode:'separate-preflight-attestation',independentArchiveRead:false,limit:'Independent archive bytes were verified by the separate archive preflight; this gate does not reopen the archive.'},archive:{sha256:pins.archiveSha256,packageManifestSha256:pins.packageManifestSha256,sourceClosureSha256:pins.sourceClosureSha256,sourceInputCount:pins.sourceInputCount,archiveMemberCount:pins.archiveMemberCount,recomputedCurrentSourceClosure:recomputed},hosts,boundedOperations:4,operationNames:operations,logicalRetirementGaps:pins.logicalRetirementGaps,completeParity:false,releaseQualified:false};
}

function main(){
 const result=validateSchemaPropertiesRouteEvidence();process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
