import {describe,expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {assertArrowIpcArchiveMembers,assertArrowIpcInstalledIdentity,assertArrowIpcLockIntegrity,assertArrowIpcRefusalControls,assertArrowIpcSourceClosure} from '../../scripts/rust-migration/r8/arrow-ipc-installed-support.mjs';

describe('Arrow IPC installed-package qualification gates',()=>{
 test('binds the installed package to the local archive and lock integrity',()=>{
  const args={lockEntry:{resolved:'file:../candidate.tgz',integrity:'sha512-proof',version:'1.2.3'},installedManifest:{name:'@umf/core',version:'1.2.3'},archiveManifest:{name:'@umf/core',version:'1.2.3'},archivePath:'/tmp/candidate.tgz',consumerPath:'/tmp/consumer',integrity:'sha512-proof'};
  expect(assertArrowIpcInstalledIdentity(args).version).toBe('1.2.3');
  expect(()=>assertArrowIpcInstalledIdentity({...args,lockEntry:{...args.lockEntry,integrity:'sha512-other'}})).toThrow('integrity');
  expect(()=>assertArrowIpcInstalledIdentity({...args,installedManifest:{...args.installedManifest,version:'1.2.4'}})).toThrow();
 });
 test('rejects source drift and any non fixed-point source closure',()=>{
  const bytes=Buffer.from('abc'),tree=createHash('sha256').update('src/a.ts').update('\0').update(bytes).update('\0').digest('hex');
  const external=Buffer.from('wasm dependency');
  const manifest={sourceClosure:{transform:{status:'fixed-point',generatedInputs:[]},sha256:tree,capturedLiveSha256:tree,inputs:{'src/a.ts':createHash('sha256').update(bytes).digest('hex')},externalInputs:{'node_modules/parser/parser.wasm':createHash('sha256').update(external).digest('hex')}}};
  expect(assertArrowIpcSourceClosure(manifest,{'src/a.ts':bytes,'node_modules/parser/parser.wasm':external})).toMatchObject({sourceInputCount:1,externalInputCount:1});
  expect(()=>assertArrowIpcSourceClosure(manifest,{'src/a.ts':Buffer.from('changed')})).toThrow('stale source closure');
  expect(()=>assertArrowIpcSourceClosure(manifest,{'src/a.ts':bytes,'node_modules/parser/parser.wasm':Buffer.from('drifted')})).toThrow('external build input drift');
  expect(()=>assertArrowIpcSourceClosure({...manifest,sourceClosure:{...manifest.sourceClosure,sha256:'wrong',capturedLiveSha256:'wrong'}},{'src/a.ts':Buffer.from('abc')})).toThrow('tree digest');
  expect(()=>assertArrowIpcSourceClosure({...manifest,sourceClosure:{...manifest.sourceClosure,transform:{status:'generated',generatedInputs:['src/a.ts']}}},{'src/a.ts':Buffer.from('abc')})).toThrow('fixed point');
 });
 test('requires lockfile v3, integrity pins, and the complete archive/install member set',()=>{
  expect(assertArrowIpcLockIntegrity({lockfileVersion:3,packages:{'':{},'node_modules/a':{resolved:'https://registry.example/a.tgz',integrity:'sha512-pin'}}})).toBe(2);
  expect(()=>assertArrowIpcLockIntegrity({lockfileVersion:2,packages:{}})).toThrow('version must be 3');
  expect(()=>assertArrowIpcLockIntegrity({lockfileVersion:3,packages:{'node_modules/a':{resolved:'https://registry.example/a.tgz'}}})).toThrow('lacks integrity');
  const args={archiveMembers:['dist/a.js','package.json'],installedMembers:['dist/a.js','package.json'],manifestMembers:{'dist/a.js':'a'.repeat(64)},actualHashes:{'dist/a.js':'a'.repeat(64)},installedHashes:{'dist/a.js':'a'.repeat(64)},metadataMembers:['package.json']};
  expect(assertArrowIpcArchiveMembers(args)).toBe(2);
  expect(assertArrowIpcArchiveMembers({...args,installedMembers:[...args.installedMembers,'node_modules/a/index.js']})).toBe(2);
  expect(()=>assertArrowIpcArchiveMembers({...args,installedHashes:{'dist/a.js':'b'.repeat(64)}})).toThrow('installed member digest');
  expect(()=>assertArrowIpcArchiveMembers({...args,archiveMembers:['dist/a.js']})).toThrow('size differs');
  expect(()=>assertArrowIpcArchiveMembers({...args,installedMembers:['dist/a.js']})).toThrow('installed package-owned member set size');
  expect(()=>assertArrowIpcArchiveMembers({...args,installedMembers:[...args.installedMembers,'extra.js']})).toThrow('unlisted package-owned');
 });
 test('requires both missing and corrupt native/WASM refusal outcomes',()=>{
  const native=['missing','corrupt'].flatMap(mode=>['node','bun'].map(runtime=>({runtime,mode,refused:true,referenceAvailable:true})));
  expect(assertArrowIpcRefusalControls(native,['missing','corrupt'])).toBe(true);
  expect(()=>assertArrowIpcRefusalControls(native.slice(1),['missing','corrupt'])).toThrow('native');
  expect(()=>assertArrowIpcRefusalControls(native,['missing'])).toThrow('WASM');
 });
});
