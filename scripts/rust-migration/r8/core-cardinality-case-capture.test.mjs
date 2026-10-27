// SPDX-License-Identifier: MIT OR Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildHostReceipt, makeArgs, resolvePackageRoutes, validatePacket, verifyLiveSourceClosure} from './core-cardinality-case-capture.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'cardinality-retirement-packets');
const operations=['inspectCoreCardinality','declareCoreCardinality','verifyCoreCardinalityDeclaration'];

test('package conditional export paths are required and pinned',()=>{
 const routes=resolvePackageRoutes({exports:{'.':{node:'./dist/node.js',browser:'./dist/browser.js'},'./reference':{import:'./dist/reference.js'}}});
 assert.deepEqual(routes,{node:'dist/node.js',browser:'dist/browser.js',reference:'dist/reference.js'});
 assert.throws(()=>resolvePackageRoutes({exports:{'.':{node:'./dist/node.js'},'./reference':{import:'../reference.js'}}}),/safe Node, browser/);
});

test('frozen Cardinality packet sources have exact all-Rust inventories and complete expectations',()=>{
 for(const operation of operations){
  const packet=JSON.parse(fs.readFileSync(path.join(root,`${operation}.packet.json`),'utf8'));
  assert.equal(validatePacket(packet,operation),packet);
  assert(packet.cases.length>=3);
  assert(packet.cases.every(item=>item.expectedDefaultRustCalls===1&&Array.isArray(item.expectedTrace)&&item.expectedOutcome&&item.input));
 }
});

test('capture packet validation rejects zero calls, mixed claims and duplicate case ids',()=>{
 const source=JSON.parse(fs.readFileSync(path.join(root,'inspectCoreCardinality.packet.json'),'utf8'));
 for(const mutate of [p=>p.cases[0].expectedDefaultRustCalls=0,p=>p.cases[0].expectsRust=true,p=>p.cases[1].id=p.cases[0].id,p=>p.profile='mixed']){
  const packet=structuredClone(source);mutate(packet);assert.throws(()=>validatePacket(packet,'inspectCoreCardinality'));
 }
});

test('throwing input control reconstructs ordered traceable host proxy',()=>{
 const packet=JSON.parse(fs.readFileSync(path.join(root,'inspectCoreCardinality.packet.json'),'utf8'));
 const item=packet.cases.find(item=>item.id==='host-trap-negative-control');assert(item);
 const trace=[];const [source]=makeArgs(item,trace,'inspectCoreCardinality');
 assert.throws(()=>Reflect.ownKeys(source),/fixture source trap/);assert.deepEqual(trace,['source:ownKeys']);
});

test('Chromium host receipt uses the real WASM route and exact v2 receipt fields',async()=>{
 const {buildHostReceipt}=await import('./core-cardinality-case-capture.mjs');
 const packet=Buffer.from('{"format":"packet"}'),entry=Buffer.from('browser-entry'),wasm=Buffer.from('wasm'),reference=Buffer.from('reference');
 const receipt=buildHostReceipt({runtime:'chromium',hostVersion:'fixture-chromium',cohortId:'darwin-arm64',hostPlatform:{os:'darwin',arch:'arm64'},
  archiveSha256:'a'.repeat(64),sourceClosureSha256:'b'.repeat(64),packetBytes:packet,operation:'inspectCoreCardinality',
  cases:[{id:'x',defaultOutcome:{status:'returned'},defaultTrace:[],defaultRustCalls:1,referenceOutcome:{status:'returned'},referenceTrace:[],referenceRustCalls:0}],
  defaultFiles:{entry,artifact:wasm},referenceFile:reference,packageRoutes:{node:'dist/node.js',browser:'dist/browser.js',reference:'dist/reference.js'}});
 assert.deepEqual(Object.keys(receipt).sort(),['format','status','runtime','hostVersion','cohortId','hostPlatform','archiveSha256','sourceClosureSha256','packetSha256','defaultRoute','referenceRoute','cases'].sort());
 assert.equal(receipt.defaultRoute.routeId,'package-root-browser');assert.equal(receipt.defaultRoute.artifactMembers[0].path,'dist/umf_core_wasm_bg.wasm');
 assert.equal(receipt.cases[0].defaultRustCalls,1);assert.equal(receipt.cases[0].referenceRustCalls,0);
});

test('archive extraction gate checks actual extracted member bytes',async t=>{
 const os=await import('node:os'),{mkdtemp,rm,mkdir,writeFile}=await import('node:fs/promises');
 const {verifyExtractedMembers}=await import('./core-cardinality-case-capture.mjs');
 const root=await mkdtemp(path.join(os.tmpdir(),'umf-cardinality-members-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(path.join(root,'dist'));const bytes=Buffer.from('archive member');await writeFile(path.join(root,'dist','member.js'),bytes);
 const digest=(await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
 assert.equal((await verifyExtractedMembers({'dist/member.js':digest},root))['dist/member.js'],digest);
 await assert.rejects(()=>verifyExtractedMembers({'dist/member.js':'0'.repeat(64)},root),/extracted archive member/);
});

test('archive extraction gate rejects extra files, symlinked members and symlinked parents',async t=>{
 const os=await import('node:os'),{mkdtemp,rm,mkdir,writeFile,symlink}=await import('node:fs/promises');
 const {verifyExtractedMembers}=await import('./core-cardinality-case-capture.mjs');
 const crypto=await import('node:crypto'),root=await mkdtemp(path.join(os.tmpdir(),'umf-cardinality-exact-members-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),bytes=Buffer.from('archive member'),members={'dist/member.js':digest(bytes)};
 const packageRoot=path.join(root,'package');await mkdir(path.join(packageRoot,'dist'),{recursive:true});
 await writeFile(path.join(packageRoot,'dist','member.js'),bytes);
 await writeFile(path.join(packageRoot,'dist','extra.js'),'extra');
 await assert.rejects(()=>verifyExtractedMembers(members,packageRoot),/file set differs/);
 await rm(path.join(packageRoot,'dist','extra.js'));
 await symlink(path.join(packageRoot,'dist','member.js'),path.join(packageRoot,'dist','extra-link.js'));
 await assert.rejects(()=>verifyExtractedMembers(members,packageRoot),/contains symlink/);
 await rm(path.join(packageRoot,'dist','extra-link.js'));
 await mkdir(path.join(packageRoot,'empty'));
 await assert.rejects(()=>verifyExtractedMembers(members,packageRoot),/directory set differs/);
 await rm(path.join(packageRoot,'empty'),{recursive:true});
 await rm(path.join(packageRoot,'dist','member.js'));
 const outside=path.join(root,'same-bytes.js');await writeFile(outside,bytes);
 await symlink(outside,path.join(packageRoot,'dist','member.js'));
 await assert.rejects(()=>verifyExtractedMembers(members,packageRoot),/contains symlink/);
 await rm(path.join(packageRoot,'dist','member.js'));
 await rm(path.join(packageRoot,'dist'),{recursive:true});
 const outsideDir=path.join(root,'outside-dir');await mkdir(outsideDir);await writeFile(path.join(outsideDir,'member.js'),bytes);
 await symlink(outsideDir,path.join(packageRoot,'dist'),'dir');
 await assert.rejects(()=>verifyExtractedMembers(members,packageRoot),/contains symlink/);
});

test('archive source closure recomputes current files and requires exact fixed-point input maps',async t=>{
 const {mkdtemp,rm,mkdir,writeFile}=await import('node:fs/promises');
 const crypto=await import('node:crypto'),os=await import('node:os');
 const root=await mkdtemp(path.join(os.tmpdir(),'umf-cardinality-closure-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(path.join(root,'src'));const bytes=Buffer.from('captured source');await writeFile(path.join(root,'src','input.ts'),bytes);
 const sha=value=>crypto.createHash('sha256').update(value).digest('hex'),name='src/input.ts',hash=sha(bytes),tree=crypto.createHash('sha256').update(name).update('\0').update(bytes).update('\0').digest('hex');
 const closure={sha256:tree,capturedLiveSha256:tree,fileCount:1,inputs:{[name]:hash},liveInputs:{[name]:hash}};
 assert.equal(await verifyLiveSourceClosure(closure,{root,expectedSha256:tree}),tree);
 await assert.rejects(()=>verifyLiveSourceClosure({...closure,fileCount:2},{root}),/fileCount/);
 await assert.rejects(()=>verifyLiveSourceClosure({...closure,inputs:{}},{root}),/inputs and liveInputs differ/);
 await writeFile(path.join(root,name),'changed');
 await assert.rejects(()=>verifyLiveSourceClosure(closure,{root}),/source closure input/);
});

test('source closure must pin the harness, packet inputs, validator and focused tests',async t=>{
 const {assertSourceClosurePins}=await import('./core-cardinality-case-capture.mjs');
 const {mkdtemp,rm,mkdir,writeFile}=await import('node:fs/promises');
 const crypto=await import('node:crypto'),os=await import('node:os');
 const root=await mkdtemp(path.join(os.tmpdir(),'umf-cardinality-source-pins-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(path.join(root,'scripts'),{recursive:true});const bytes=Buffer.from('captured source');await writeFile(path.join(root,'scripts','capture.mjs'),bytes);
 const digest=crypto.createHash('sha256').update(bytes).digest('hex');
 await assertSourceClosurePins({liveInputs:{'scripts/capture.mjs':digest}},{root,requiredFiles:['scripts/capture.mjs']});
 await assert.rejects(()=>assertSourceClosurePins({liveInputs:{}},{root,requiredFiles:['scripts/capture.mjs']}),/does not include capture source/);
 await assert.rejects(()=>assertSourceClosurePins({liveInputs:{'scripts/capture.mjs':'0'.repeat(64)}},{root,requiredFiles:['scripts/capture.mjs']}),/source closure pin/);
});

test('historical archive without new closure pins fails before output can be emitted',async t=>{
 const {archiveIdentity}=await import('./core-cardinality-case-capture.mjs');
 const {mkdtemp,rm,mkdir,writeFile,access}=await import('node:fs/promises');
 const {gzipSync}=await import('node:zlib'),crypto=await import('node:crypto'),os=await import('node:os');
 const root=await mkdtemp(path.join(os.tmpdir(),'umf-cardinality-old-archive-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const packageRoot=path.join(root,'package');await mkdir(path.join(packageRoot,'dist'),{recursive:true});
 const closure=crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex');
 const files={
  'package.json':Buffer.from(JSON.stringify({exports:{'.':{node:'./dist/node.js',browser:'./dist/browser.js'},'./reference':{import:'./dist/reference.js'}}})),
  'dist/rust-default-manifest.json':Buffer.from(JSON.stringify({platform:{os:'darwin',arch:'aarch64',nodeArch:'arm64',nativeTarget:'aarch64-apple-darwin'},sourceClosure:{sha256:closure,capturedLiveSha256:closure,fileCount:0,inputs:{},liveInputs:{},transform:{status:'fixed-point',generatedInputs:[]}}})),
 };
 for(const [name,bytes] of Object.entries(files)){const target=path.join(packageRoot,name);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);}
 const octal=(value,length)=>value.toString(8).padStart(length-1,'0')+'\\0';
 const chunks=[];
 for(const [name,bytes] of Object.entries(files)){
  const h=Buffer.alloc(512);h.write(`package/${name}`,0,100,'utf8');h.write(octal(0o644,8),100,8,'ascii');h.write(octal(0,8),108,8,'ascii');h.write(octal(0,8),116,8,'ascii');h.write(octal(bytes.length,12),124,12,'ascii');h.write(octal(0,12),136,12,'ascii');h.fill(32,148,156);h[156]=48;h.write('ustar\\0',257,6,'ascii');h.write('00',263,2,'ascii');let sum=0;for(const byte of h)sum+=byte;h.write(sum.toString(8).padStart(6,'0')+'\\0 ',148,8,'ascii');chunks.push(h,bytes,Buffer.alloc((512-bytes.length%512)%512));
 }
 chunks.push(Buffer.alloc(1024));const archiveBytes=gzipSync(Buffer.concat(chunks)),archivePath=path.join(root,'old.tgz');await writeFile(archivePath,archiveBytes);
 const output=path.join(root,'should-not-exist');
 await assert.rejects(()=>archiveIdentity({archivePath,archiveSha256:crypto.createHash('sha256').update(archiveBytes).digest('hex'),sourceClosureSha256:closure,packageRoot,cohortId:'darwin-arm64'}),/does not include capture source/);
 await assert.rejects(()=>access(output));
});
