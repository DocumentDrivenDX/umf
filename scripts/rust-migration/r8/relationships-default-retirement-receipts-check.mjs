// SPDX-License-Identifier: MIT OR Apache-2.0
// Verify the replay receipts and prove the current-source retirement gate fails closed.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {validateDefaultRouteRetirementEvidence} from './default-route-retirement-evidence.mjs';

const root=process.cwd(),dir='docs/helix/04-build/evidence/rust-migration/r8-relationships-default-retirement-replay';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const canonical=value=>JSON.stringify(stable(value));
const cohort=JSON.parse(await readFile(join(dir,'cohort-pins.json'),'utf8'));
const members=JSON.parse(await readFile(join(dir,'archive-members.json'),'utf8'));
assert.equal(cohort.status,'historical-replay-only');
assert.equal(cohort.archive.sha256,'5513efdca5ddb98fce9c5f8d9e105b07205bed1ebd8cd7cf87354e912da0a02e');
assert.equal(cohort.sourceClosure.currentCheckoutMatches,false);
assert.equal(cohort.packetsAbsentFromArchiveSourceClosure.length,4);
for(const name of ['inspectCoreRelationships','lookupCoreRelationship','declareCoreRelationship','verifyCoreRelationshipOperation']){
 const packetBytes=await readFile(join(dir,`${name}.packet.json`)),packet=JSON.parse(packetBytes);
 assert.equal(hash(packetBytes),cohort.packetPins[`${name}.packet.json`]);
 assert.equal(packet.format,'umf.r8.default-route-retirement-packet/1');
 assert.equal(packet.contractId,'CONTRACT-041');
 for(const runtime of ['bun','node','chromium']){
  const receipt=JSON.parse(await readFile(join(dir,`${name}-${runtime}.json`),'utf8'));
  assert.equal(receipt.status,'pass');
  assert.equal(receipt.archiveSha256,cohort.archive.sha256);
  assert.equal(receipt.sourceClosureSha256,cohort.sourceClosure.sha256);
  assert.equal(receipt.packetSha256,hash(packetBytes));
  assert.equal(receipt.cases.length,packet.cases.length);
  for(const result of receipt.cases){
   const expected=packet.cases.find(item=>item.id===result.id);
   assert.ok(expected,`${name}/${runtime} unexpected case`);
   assert.equal(canonical(result.defaultOutcome),canonical(expected.expectedOutcome));
   assert.equal(canonical(result.defaultTrace),canonical(expected.expectedTrace));
   assert.equal(canonical(result.referenceOutcome),canonical(expected.expectedOutcome));
   assert.equal(canonical(result.referenceTrace),canonical(expected.expectedTrace));
   assert.equal(expected.expectsRust?result.defaultRustCalls>0:result.defaultRustCalls===0,true);
   assert.equal(result.referenceRustCalls,0);
  }
  const rootRoute=receipt.defaultRoute;
  assert.equal(members.members[rootRoute.entryMember],rootRoute.entrySha256);
  for(const artifact of rootRoute.artifactMembers)assert.equal(members.members[artifact.path],artifact.sha256);
 }
}
const sourceDocBytes=await readFile(join(dir,'archive-source-cohort.json'));
const memberDocBytes=await readFile(join(dir,'archive-members.json'));
const packageDocBytes=await readFile(join(dir,'archive-package.json'));
const pin=(path,bytes)=>({path:`${dir}/${path}`,sha256:hash(bytes)});
const manifest={format:'umf.r8.default-route-retirement-evidence/1',status:'pass',archive:{path:cohort.archive.path,sha256:cohort.archive.sha256,sourceClosureSha256:cohort.sourceClosure.sha256,sourceInputCount:cohort.sourceClosure.sourceInputCount,generatedTransformCount:0,packageManifestSha256:cohort.archive.packageManifestSha256},liveSourceManifest:pin('archive-source-cohort.json',sourceDocBytes),memberManifest:pin('archive-members.json',memberDocBytes),archivePackageManifest:pin('archive-package.json',packageDocBytes),operations:[]};
let refused='';
try{validateDefaultRouteRetirementEvidence(manifest,[],{root});}catch(error){refused=String(error?.message??error);}
assert.match(refused,/live source .* hash mismatch/,'the current-source validator must refuse this historical archive before row retirement');
console.log(JSON.stringify({status:'historical-replay-receipts-pass',operations:4,runtimes:3,casesPerOperation:2,currentSourceRetirement:'blocked-as-expected',validatorRefusal:refused}));
