// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,it} from 'bun:test';
import assert from 'node:assert/strict';
import {assertArrowInstalledPackageIdentity,assertArrowReplayReceipt,assertArrowRouteResolution,assertArrowWasmRefusalReceipt} from '../../scripts/rust-migration/r8/arrow-schema-installed-package-support.mjs';

describe('R8 installed Arrow schema package qualification gates',()=>{
 it('proves local archive identity when npm omits the lock package version',()=>{
  const options={
   lockEntry:{resolved:'file:../archive/umf-sdk.tgz',integrity:'sha512-archive-integrity'},
   installedManifest:{name:'@umf/core',version:'0.5.6'},
   archiveManifest:{name:'@umf/core',version:'0.5.6'},
   archivePath:'/tmp/archive/umf-sdk.tgz',consumerPath:'/tmp/consumer',archiveIntegrity:'sha512-archive-integrity',
  };
  assert.deepEqual(assertArrowInstalledPackageIdentity(options),{name:'@umf/core',version:'0.5.6',archiveIntegrity:'sha512-archive-integrity',lockVersion:null});
  assert.throws(()=>assertArrowInstalledPackageIdentity({...options,lockEntry:{...options.lockEntry,integrity:'sha512-other'}}),/archive integrity/);
  assert.throws(()=>assertArrowInstalledPackageIdentity({...options,lockEntry:{...options.lockEntry,resolved:'file:../archive/other.tgz'}}),/different @umf\/core archive/);
  assert.throws(()=>assertArrowInstalledPackageIdentity({...options,installedManifest:{...options.installedManifest,version:'0.5.5'}}),/installed @umf\/core package version mismatch/);
  assert.throws(()=>assertArrowInstalledPackageIdentity({...options,lockEntry:{...options.lockEntry,version:'0.5.5'}}),/consumer lock package version mismatch/);
 });

 it('accepts only complete installed-route corpus and focused replay counts',()=>{
  const receipt={status:'pass',corpusOperations:260,focusedImports:16,focusedOperations:26};
  assert.equal(assertArrowReplayReceipt(receipt,'Node'),receipt);
  for(const field of ['status','corpusOperations','focusedImports','focusedOperations']){
   const invalid={...receipt,[field]:field==='status'?'fail':receipt[field]-1};
   assert.throws(()=>assertArrowReplayReceipt(invalid,'Node'),/Arrow replay count\/status mismatch/);
  }
 });

 it('requires the default Node route and explicit TypeScript reference route',()=>{
  const resolution={root:'file:///tmp/consumer/node_modules/@umf/core/dist/umf-node.js',reference:'file:///tmp/consumer/node_modules/@umf/core/dist/umf.js'};
  assert.equal(assertArrowRouteResolution(resolution,'Node'),resolution);
  assert.throws(()=>assertArrowRouteResolution({...resolution,root:'file:///repo/dist/umf-browser.js'},'Node'),/package export resolution mismatch/);
  assert.throws(()=>assertArrowRouteResolution({...resolution,reference:'file:///tmp/reference.js'},'Bun'),/package export resolution mismatch/);
 });

 it('requires browser requests and refusals for missing and corrupt installed WASM',()=>{
  const receipt={
   variantRequests:['/missing/dist/umf_core_wasm_bg.wasm','/corrupt/dist/umf_core_wasm_bg.wasm'],
   variantResponses:[{variant:'missing',status:404},{variant:'corrupt',status:200,bytes:4}],
   wasmRefusals:[{variant:'missing',refused:true,error:'missing WASM rejected'},{variant:'corrupt',refused:true,error:'invalid WASM rejected'}],
  };
  assert.equal(assertArrowWasmRefusalReceipt(receipt),receipt);
  assert.throws(()=>assertArrowWasmRefusalReceipt({...receipt,wasmRefusals:[receipt.wasmRefusals[0]]}),/controls incomplete/);
  assert.throws(()=>assertArrowWasmRefusalReceipt({...receipt,variantResponses:[receipt.variantResponses[0]]}),/controls incomplete/);
 });
});
