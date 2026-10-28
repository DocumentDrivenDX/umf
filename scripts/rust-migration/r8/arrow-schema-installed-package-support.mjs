// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {resolve} from 'node:path';

export function assertArrowInstalledPackageIdentity({lockEntry,installedManifest,archiveManifest,archivePath,consumerPath,archiveIntegrity}){
 if(!lockEntry||typeof lockEntry!=='object')throw new Error('consumer lock does not contain the tested @umf/core archive');
 if(typeof lockEntry.resolved!=='string'||!lockEntry.resolved.startsWith('file:'))throw new Error('consumer lock does not resolve @umf/core to a local archive');
 const resolvedPath=resolve(consumerPath,decodeURIComponent(lockEntry.resolved.slice('file:'.length)));
 assert.equal(resolvedPath,resolve(archivePath),'consumer lock resolves a different @umf/core archive');
 assert.equal(lockEntry.integrity,archiveIntegrity,'consumer lock does not pin the tested archive integrity');
 if(lockEntry.version!==undefined)assert.equal(lockEntry.version,archiveManifest.version,'consumer lock package version mismatch');
 assert.equal(installedManifest.name,archiveManifest.name,'installed @umf/core package identity mismatch');
 assert.equal(installedManifest.version,archiveManifest.version,'installed @umf/core package version mismatch');
 return {name:installedManifest.name,version:installedManifest.version,archiveIntegrity,lockVersion:lockEntry.version??null};
}

export function assertArrowReplayReceipt(receipt,label){
 if(receipt.status!=='pass'||receipt.corpusOperations!==260||receipt.focusedImports!==16||receipt.focusedOperations!==26){
  throw new Error(`${label} Arrow replay count/status mismatch: ${JSON.stringify(receipt)}`);
 }
 return receipt;
}

export function assertArrowRouteResolution(resolution,label){
 if(!resolution.root?.endsWith('/dist/umf-node.js')||!resolution.reference?.endsWith('/dist/umf.js')){
  throw new Error(`${label} package export resolution mismatch: ${JSON.stringify(resolution)}`);
 }
 return resolution;
}

export function assertArrowWasmRefusalReceipt(receipt){
 const required=['/missing/dist/umf_core_wasm_bg.wasm','/corrupt/dist/umf_core_wasm_bg.wasm'];
 const requests=receipt.variantRequests??[];
 const responses=receipt.variantResponses??[];
 const refusals=receipt.wasmRefusals??[];
 if(!required.every(path=>requests.includes(path))
  ||!responses.some(item=>item.variant==='missing'&&item.status===404)
  ||!responses.some(item=>item.variant==='corrupt'&&item.status===200&&item.bytes===4)
  ||!['missing','corrupt'].every(variant=>refusals.some(item=>item.variant===variant&&item.refused===true&&typeof item.error==='string'&&item.error.length>0))){
  throw new Error(`Arrow browser WASM refusal controls incomplete: ${JSON.stringify(receipt)}`);
 }
 return receipt;
}
