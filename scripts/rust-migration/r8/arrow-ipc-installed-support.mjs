// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {resolve} from 'node:path';

import {createHash} from 'node:crypto';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function assertArrowIpcSourceClosure(manifest,currentInputs){
 const closure=manifest?.sourceClosure;
 assert.equal(closure?.transform?.status,'fixed-point','source closure is not fixed point');
 assert.equal(closure?.transform?.generatedInputs?.length,0,'source closure has generated transforms');
 assert.equal(closure?.sha256,closure?.capturedLiveSha256,'closure does not bind captured live source');
 const paths=Object.keys(closure?.inputs??{}).sort();assert(paths.length>0,'source closure is empty');
 const tree=createHash('sha256');
 for(const path of paths){assert(!path.startsWith('/')&&!path.split(/[\\/]/).includes('..'),`unsafe source path ${path}`);const bytes=currentInputs[path];assert(bytes!==undefined,`missing current source: ${path}`);assert.equal(sha(bytes),closure.inputs[path],`stale source closure: ${path}`);tree.update(path);tree.update('\0');tree.update(bytes);tree.update('\0');}
 const recomputed=tree.digest('hex');assert.equal(recomputed,closure.sha256,'source closure ordered tree digest mismatch');
 const external=Object.entries(closure.externalInputs??{});
 for(const [path,expected] of external){assert(!path.startsWith('/')&&!path.split(/[\\/]/).includes('..'),`unsafe external input path ${path}`);const bytes=currentInputs[path];assert(bytes!==undefined,`missing external build input: ${path}`);assert.equal(sha(bytes),expected,`external build input drift: ${path}`);}
 return {sourceClosureSha256:recomputed,sourceInputCount:paths.length,externalInputCount:external.length};
}
export function assertArrowIpcInstalledIdentity({lockEntry,installedManifest,archiveManifest,archivePath,consumerPath,integrity}){
 assert(lockEntry&&typeof lockEntry==='object','consumer lock lacks installed package');
 assert.equal(lockEntry.resolved?.startsWith('file:'),true,'package lock does not identify a local archive');
 assert.equal(resolve(consumerPath,decodeURIComponent(lockEntry.resolved.slice(5))),resolve(archivePath),'package lock points at a different archive');
 assert.equal(lockEntry.integrity,integrity,'package lock integrity differs from tested archive');
 assert.equal(lockEntry.version,archiveManifest.version,'package lock version mismatch');
 assert.equal(archiveManifest.name,'@umf/core','archive package name mismatch');assert.equal(installedManifest.name,'@umf/core','installed package name mismatch');
 assert.equal(installedManifest.version,archiveManifest.version,'installed package version mismatch');
 return {name:installedManifest.name,version:installedManifest.version,integrity};
}
export function assertArrowIpcLockIntegrity(lock){
 assert.equal(lock?.lockfileVersion,3,'npm lockfile version must be 3');
 const packages=lock.packages;assert(packages&&typeof packages==='object','lockfile packages map missing');
 for(const [name,entry] of Object.entries(packages)){if(name===''||entry.link===true)continue;assert.equal(typeof entry.resolved,'string',`lock package lacks resolved source: ${name}`);assert.equal(typeof entry.integrity,'string',`lock package lacks integrity: ${name}`);}
 return Object.keys(packages).length;
}
export function assertArrowIpcArchiveMembers({archiveMembers,installedMembers,manifestMembers,actualHashes,installedHashes,metadataMembers}){
 const expected=new Set([...Object.keys(manifestMembers??{}),...metadataMembers]);
 assert.equal(archiveMembers.length,expected.size,'archive member set size differs from SDK manifest');
 assert(archiveMembers.every(name=>expected.has(name)),`archive contains unlisted member: ${archiveMembers.find(name=>!expected.has(name))}`);
 assert([...expected].every(name=>archiveMembers.includes(name)),`archive is missing member: ${[...expected].find(name=>!archiveMembers.includes(name))}`);
 const installedPackageMembers=installedMembers.filter(name=>!name.startsWith('node_modules/'));
 assert(installedPackageMembers.every(name=>expected.has(name)),`installed package contains unlisted package-owned member: ${installedPackageMembers.find(name=>!expected.has(name))}`);
 assert.equal(installedPackageMembers.length,expected.size,'installed package-owned member set size differs from SDK manifest');
 assert([...expected].every(name=>installedPackageMembers.includes(name)),`installed package is missing member: ${[...expected].find(name=>!installedPackageMembers.includes(name))}`);
 for(const [label,hashes] of [['archive',actualHashes],['installed',installedHashes]])for(const [name,digest] of Object.entries(manifestMembers??{}))assert.equal(hashes[name],digest,`${label} member digest mismatch: ${name}`);
 return expected.size;
}
export function assertArrowIpcRefusalControls(native,wasm){
 assert.deepEqual(native.map(x=>[x.runtime,x.mode,x.refused,x.referenceAvailable]),[['node','missing',true,true],['bun','missing',true,true],['node','corrupt',true,true],['bun','corrupt',true,true]],'native missing/corrupt controls incomplete');
 assert.deepEqual(wasm,['missing','corrupt'],'browser WASM missing/corrupt controls incomplete');return true;
}
