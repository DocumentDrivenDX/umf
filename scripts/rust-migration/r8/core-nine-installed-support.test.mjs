// SPDX-License-Identifier: MIT OR Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {exerciseNegativeControls,validateIdentity,validateLock,validateRouteResolution,verifySourceClosure} from './core-nine-installed-support.mjs';

const archive='/private/tmp/umf-sdk.tgz',consumer='/private/tmp/consumer',installed=`${consumer}/node_modules/@umf/core`,integrity='sha512-YWJj';
const pkg={name:'@umf/core',version:'0.5.6',exports:{'.':{node:'./dist/umf-node.js',browser:'./dist/umf-browser.js'},'./reference':{import:'./dist/umf.js'}}};
const lock={lockfileVersion:3,packages:{'node_modules/@umf/core':{version:pkg.version,resolved:`file:${archive}`,integrity:'sha512-YWJj'},'node_modules/ajv':{version:'8.20.0',integrity:'sha512-ZGVm'}}};

test('accepts an offline lock with integrity for every resolved dependency',()=>assert.doesNotThrow(()=>validateLock(lock)));
test('rejects missing dependency integrity',()=>assert.throws(()=>validateLock({...lock,packages:{...lock.packages,'node_modules/unpinned':{version:'1.0.0'}}}),/missing\/invalid integrity/));
test('accepts package identity, archive integrity, location, and export map',()=>assert.doesNotThrow(()=>validateIdentity(pkg,lock,installed,consumer,archive,integrity)));
test('rejects a different installed package name',()=>assert.throws(()=>validateIdentity({...pkg,name:'@umf/other'},lock,installed,consumer,archive,integrity),/installed package name/));
test('rejects a different archive digest in the lock',()=>assert.throws(()=>validateIdentity(pkg,{packages:{...lock.packages,'node_modules/@umf/core':{...lock.packages['node_modules/@umf/core'],integrity:'sha512-bad'}}},installed,consumer,archive,integrity),/lock archive integrity/));
test('rejects package export-map drift',()=>assert.throws(()=>validateIdentity({...pkg,exports:{'.':{node:'./wrong.js'}}},lock,installed,consumer,archive,integrity),/Node default export route/));
test('accepts and rejects route resolution against installed package identity',()=>{
 const routes={Node:{root:`file://${installed}/dist/umf-node.js`,reference:`file://${installed}/dist/umf.js`}};
 assert.doesNotThrow(()=>validateRouteResolution(routes,installed));
 assert.throws(()=>validateRouteResolution({Node:{...routes.Node,root:'file:///tmp/unrelated/dist/umf-node.js'}},installed),/escaped installed package/);
});
test('executes dependency, installed identity, archive, and default-route refusal controls',()=>{
 const originalPackage=structuredClone(pkg),originalLock=structuredClone(lock),routes={node:{root:`file://${installed}/dist/umf-node.js`,reference:`file://${installed}/dist/umf.js`}};
 assert.deepEqual(exerciseNegativeControls({pkg,lock,installedRoot:installed,consumerRoot:consumer,archivePath:archive,archiveIntegrity:integrity,routes}),{
  lockWithoutIntegrityRejected:true,wrongInstalledIdentityRejected:true,wrongArchiveIdentityRejected:true,wrongDefaultRouteRejected:true,wrongResolvedDefaultRouteRejected:true
 });
 assert.deepEqual(pkg,originalPackage);assert.deepEqual(lock,originalLock);
});
test('does not count an unrelated validator exception as a negative-control pass',()=>{
 const validators={validateLock(){throw new TypeError('unexpected harness defect');}};
 assert.throws(()=>exerciseNegativeControls({pkg,lock,installedRoot:installed,consumerRoot:consumer,archivePath:archive,archiveIntegrity:integrity,routes:{node:{root:`file://${installed}/dist/umf-node.js`,reference:`file://${installed}/dist/umf.js`}},validators}),/unexpected refusal for missing dependency integrity: unexpected harness defect/);
});
test('final closure recheck detects live and external edits after the initial pass',async()=>{
 const root=await mkdtemp(join(tmpdir(),'core-nine-closure-'));
 try{
  await writeFile(join(root,'source.ts'),'original source');await writeFile(join(root,'external.bin'),'external build input');
  const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
  const sourceBytes=await readFile(join(root,'source.ts')),externalBytes=await readFile(join(root,'external.bin'));
  const sourceHash=createHash('sha256').update('source.ts').update('\0').update(sourceBytes).update('\0').digest('hex');
  const closure={sha256:sourceHash,capturedLiveSha256:sourceHash,liveInputs:{'source.ts':digest(sourceBytes)},externalInputs:{'external.bin':digest(externalBytes)}};
  const input={repoRoot:root,sourceClosure:closure,expectedSha256:sourceHash};
  assert.deepEqual(await verifySourceClosure(input),{sha256:sourceHash,fileCount:1,externalInputCount:1});
  await writeFile(join(root,'source.ts'),'edited during qualification');
  await assert.rejects(verifySourceClosure(input),/current source input source\.ts/);
  await writeFile(join(root,'source.ts'),sourceBytes);await writeFile(join(root,'external.bin'),'edited external dependency');
  await assert.rejects(verifySourceClosure(input),/external build input external\.bin/);
 }finally{await rm(root,{recursive:true,force:true});}
});
