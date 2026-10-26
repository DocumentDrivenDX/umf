// SPDX-License-Identifier: MIT OR Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {coreFacetsRouteEvidencePins as pins,validateCoreFacetsRouteEvidence,validateCoreFacetsRawReceipt,validateCoreFacetsOutcomeParity,recomputeCoreFacetsSourceClosure} from './core-facets-route-evidence.mjs';

const base=process.cwd();
const read=name=>JSON.parse(readFileSync(path.join(base,pins[name].path),'utf8'));

test('Core Facets route gate accepts the pinned current archive receipts and preserves scope limits',()=>{
 const result=validateCoreFacetsRouteEvidence();assert.equal(result.status,'pass');assert.equal(result.boundedOperations,4);assert.deepEqual(result.operationNames,['inspectCoreFacets','declareCoreFacets','verifyCoreFacetDeclaration','historicalCoreFacetPatch']);assert.equal(result.logicalRetirementGaps,922);assert.equal(result.unresolvedResourceAliases,17);assert.equal(result.resourceAuthorityUnresolved,true);assert.equal(result.completeParity,false);assert.equal(result.releaseQualified,false);
 assert.equal(result.archiveVerification.mode,'separate-preflight-attestation');assert.equal(result.archiveVerification.independentArchiveRead,false);assert.match(result.browserEvidenceLimit,/does not record wasmRequested or externalRequests/);
});

test('receipt pin and host identity failures close the gate',()=>{
 assert.throws(()=>validateCoreFacetsRouteEvidence({pins:{...pins,node:{...pins.node,sha256:'0'.repeat(64)}}}),/node raw receipt hash mismatch/);
 const node=read('node');assert.throws(()=>validateCoreFacetsRawReceipt('bun',node),/bun receipt host identity must equal bun/);
 const changedPacket=structuredClone(node);changedPacket.packetHashes['meaning-cases.json']='0'.repeat(64);assert.throws(()=>validateCoreFacetsRawReceipt('node',changedPacket),/frozen packet hashes differ/);
 const wrongOp=structuredClone(node);wrongOp.observation.results.extraOperation={};assert.throws(()=>validateCoreFacetsRawReceipt('node',wrongOp),/operation set differs/);
});

test('cross-host outcome divergence is rejected as bad parity',()=>{
 const receipts={node:read('node'),bun:read('bun'),chromium:read('chromium')};receipts.chromium.browser.results.verifyCoreFacetDeclaration.valid.ok=false;
 assert.throws(()=>validateCoreFacetsOutcomeParity(receipts),/outcome parity mismatch: chromium/);
});

test('live source drift is rejected during closure recomputation',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'umf-r8-core-facets-drift-'));
 try{await mkdir(path.join(root,'src'));const file='src/current.txt',content=Buffer.from('before\n'),digest=createHash('sha256').update(content).digest('hex');await writeFile(path.join(root,file),content);const input={[file]:digest};
  assert.equal(recomputeCoreFacetsSourceClosure(input,{root,expectedCount:1}),createHash('sha256').update(file).update('\0').update(content).update('\0').digest('hex'));
  await writeFile(path.join(root,file),'after\n');assert.throws(()=>recomputeCoreFacetsSourceClosure(input,{root,expectedCount:1}),/current source drift/);
 }finally{await rm(root,{recursive:true,force:true})}
});
