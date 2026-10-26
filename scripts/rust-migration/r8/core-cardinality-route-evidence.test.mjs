// SPDX-License-Identifier: MIT OR Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {coreCardinalityRouteEvidencePins as pins,recomputeCurrentInputs,validateCoreCardinalityReceipt,validateCoreCardinalityRouteEvidence} from './core-cardinality-route-evidence.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const receipt=JSON.parse(fs.readFileSync(path.join(repo,pins.receipt.path),'utf8'));
const clone=value=>JSON.parse(JSON.stringify(value));

test('current Core Cardinality installed-route packet passes the bounded gate',()=>{
 const out=validateCoreCardinalityRouteEvidence();
 assert.equal(out.status,'pass');assert.equal(out.boundedOperations,3);assert.equal(out.logicalRetirementGaps,922);assert.equal(out.unresolvedResourceAliases,17);assert.equal(out.resourceAuthorityUnresolved,true);assert.equal(out.completeParity,false);assert.equal(out.releaseQualified,false);assert.equal(out.archive.sourceInputCount,3435);
});
test('receipt SHA drift fails closed',()=>assert.throws(()=>validateCoreCardinalityRouteEvidence({pins:{...pins,receipt:{...pins.receipt,sha256:'0'.repeat(64)}}}),/hash/));
test('runtime identity drift fails closed',()=>{const r=clone(receipt);r.runtimes.node='Node v27.0.0';r.details.node.runtime='Node v27.0.0';assert.throws(()=>validateCoreCardinalityReceipt(r),/pinned runtime/)});
test('cross-host parity drift fails closed',()=>{const r=clone(receipt);r.details.chromium.frozenResults.inspectCases.missing.value.meaning.state='unknown';assert.throws(()=>validateCoreCardinalityReceipt(r),/frozen installed\/reference envelopes|Node\/Chromium frozenResults/)});
test('current source closure drift fails closed',()=>assert.throws(()=>validateCoreCardinalityRouteEvidence({pins:{...pins,sourceClosureSha256:'f'.repeat(64)}}),/source closure|closure/));
test('changed current file fails against its pinned input hash',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'core-cardinality-drift-'));
 try{fs.mkdirSync(path.join(root,'src'),{recursive:true});fs.writeFileSync(path.join(root,'src','pinned.txt'),'before');const inputs={'src/pinned.txt':crypto.createHash('sha256').update('before').digest('hex')};fs.writeFileSync(path.join(root,'src','pinned.txt'),'after');assert.throws(()=>recomputeCurrentInputs(inputs,{root,expectedCount:1}),/current source drift: src\/pinned.txt/)}finally{fs.rmSync(root,{recursive:true,force:true})}
});
