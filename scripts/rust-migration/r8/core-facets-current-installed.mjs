// SPDX-License-Identifier: MIT OR Apache-2.0
// Require current fixed-point pins, then reuse the frozen Core Facets replay.
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, rename, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const [archiveArg,receiptDirArg,archiveSha,closureSha,cohort]=process.argv.slice(2);
if(!archiveArg||!receiptDirArg||!/^[a-f0-9]{64}$/.test(archiveSha??'')||!/^[a-f0-9]{64}$/.test(closureSha??'')||!/^current-[a-z0-9-]+$/.test(cohort??'')){
 throw new Error('Usage: bun scripts/rust-migration/r8/core-facets-current-installed.mjs <fixed-point-umf-sdk.tgz> <receipt-directory> <archive-sha256> <source-closure-sha256> <current-cohort-id>');
}
const replay=resolve(repo,'docs/helix/04-build/evidence/rust-migration/r8-core-facets-installed/replay-installed.mjs');
const receiptDir=resolve(receiptDirArg),replayDir=resolve(receiptDir,`.${cohort}-replay`);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function archivedManifest(){
 const child=spawn('tar',['-xOzf',resolve(archiveArg),'package/dist/rust-default-manifest.json'],{cwd:repo});
 const chunks=[];for await(const chunk of child.stdout)chunks.push(chunk);
 const errorChunks=[];for await(const chunk of child.stderr)errorChunks.push(chunk);
 const code=await new Promise((done,reject)=>{child.on('error',reject);child.on('close',done)});
 assert.equal(code,0,Buffer.concat(errorChunks).toString());
 return JSON.parse(Buffer.concat(chunks).toString()).sourceClosure;
}
async function verifyCurrentSource(){
 assert.equal(sha(await readFile(resolve(archiveArg))),archiveSha,'Core Facets archive changed during replay');
 const closure=await archivedManifest();
 assert.equal(closure.sha256,closureSha,'Core Facets source closure pin');
 assert.equal(closure.capturedLiveSha256,closureSha,'Core Facets captured source closure pin');
 assert.equal(closure.transform?.status,'fixed-point','Core Facets source transform status');
 assert.deepEqual(closure.transform?.generatedInputs,[],'Core Facets generated source inputs');
 assert.equal(Object.keys(closure.liveInputs??{}).length,closure.fileCount,'Core Facets source input count');
 for(const [path,digest] of Object.entries({...closure.liveInputs,...closure.externalInputs})){
  const absolute=resolve(repo,path);
  assert.ok(absolute.startsWith(`${repo}/`),`Core Facets source path escapes repository: ${path}`);
  assert.equal(sha(await readFile(absolute)),digest,`Core Facets current source drift: ${path}`);
 }
}
await mkdir(receiptDir,{recursive:true});
await verifyCurrentSource();
const code=await new Promise((done,reject)=>{
 const child=spawn('bun',[replay,resolve(archiveArg),replayDir,archiveSha,closureSha,cohort],{cwd:repo,stdio:'inherit'});
 child.on('error',reject);
 child.on('exit',(status,signal)=>signal?reject(new Error(`Core Facets replay terminated by ${signal}`)):done(status??1));
});
if(code!==0){process.exitCode=code;}
else{
 await verifyCurrentSource();
 const hosts=['node','bun','chromium'];
 const receipts=Object.fromEntries(await Promise.all(hosts.map(async host=>
  [host,JSON.parse(await readFile(resolve(replayDir,`current-${host}-20261026.json`),'utf8'))])));
 for(const host of hosts){
  assert.equal(receipts[host].status,'pass',`Core Facets ${host} receipt status`);
  assert.equal(receipts[host].cohort,cohort,`Core Facets ${host} receipt cohort`);
 }
 const browser=receipts.chromium;
 assert.equal(browser.browser?.wasmNetworkRequest,true,'Core Facets Chromium did not fetch installed WASM');
 await verifyCurrentSource();
 for(const host of hosts)await rename(resolve(replayDir,`current-${host}-20261026.json`),resolve(receiptDir,`current-${cohort}-${host}.json`));
 await rm(replayDir,{recursive:true,force:true});
}
