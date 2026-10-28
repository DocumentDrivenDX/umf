// SPDX-License-Identifier: MIT OR Apache-2.0
// Strict offline qualification of current-source installed Arrow IPC package routes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,readdir,readFile,realpath,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertArrowIpcArchiveMembers,assertArrowIpcInstalledIdentity,assertArrowIpcLockIntegrity,assertArrowIpcRefusalControls,assertArrowIpcSourceClosure} from './arrow-ipc-installed-support.mjs';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const archive=resolve(process.argv[2]??'');
if(!process.argv[2])throw new Error('Usage: bun scripts/rust-migration/r8/arrow-ipc-installed-package.mjs <current-fixed-point-umf-sdk.tgz> [receipt.json]');
const sha=b=>createHash('sha256').update(b).digest('hex'),run=(c,a,o={})=>execFileSync(c,a,{encoding:'utf8',stdio:['ignore','pipe','pipe'],...o});
const walkFiles=async root=>{const result=[];const walk=async dir=>{for(const item of await readdir(dir,{withFileTypes:true})){const full=join(dir,item.name);if(item.isDirectory())await walk(full);else if(item.isFile())result.push(relative(root,full).split(sep).join('/'));}};await walk(root);return result.sort();};
const temp=await realpath(await mkdtemp(join(tmpdir(),'umf-r8-arrow-ipc-installed-')));
try{
 const bytes=await readFile(archive),archiveSha256=sha(bytes),extract=join(temp,'archive');
 const members=run('tar',['-tzf',archive]).trim().split('\n');assert(members.length&&members.every(p=>p.startsWith('package/')&&!p.startsWith('/')&&!p.split('/').includes('..')),'unsafe archive member');
 await mkdir(extract,{recursive:true});run('tar',['-xzf',archive,'-C',extract]);
 const sdk=join(extract,'package'),pkg=JSON.parse(await readFile(join(sdk,'package.json'),'utf8')),sdkManifest=JSON.parse(await readFile(join(sdk,'dist/rust-default-manifest.json'),'utf8')),archiveManifest=JSON.parse(await readFile(join(sdk,'manifest.json'),'utf8'));
 assert.equal(pkg.name,'@umf/core');assert.equal(pkg.version,sdkManifest.packageVersion);assert.equal(archiveManifest.sourceTreeSha256,sdkManifest.sourceClosure.sha256);assert.equal(archiveManifest.capturedLiveSourceTreeSha256,sdkManifest.sourceClosure.capturedLiveSha256);assert.equal(archiveManifest.sourceTransformStatus,'fixed-point');assert.equal(archiveManifest.sourceTransformCount,0);
 const closure=sdkManifest.sourceClosure,currentInputs={};for(const path of Object.keys(closure.inputs))currentInputs[path]=await readFile(join(repo,path));for(const path of Object.keys(closure.externalInputs??{}))currentInputs[path]=await readFile(join(repo,path));const sourceReceipt=assertArrowIpcSourceClosure(sdkManifest,currentInputs);
 const metadataMembers=['dist/rust-default-manifest.json','package.json','manifest.json','README.md','LICENSE.md','LICENSE-MIT','LICENSE-APACHE'];
 const archiveMemberNames=members.map(path=>path.replace(/^package\//,'')),archiveHashes={};for(const path of Object.keys(archiveManifest.sha256))archiveHashes[path]=sha(await readFile(join(sdk,path)));
 const archiveMemberCount=assertArrowIpcArchiveMembers({archiveMembers:archiveMemberNames,installedMembers:archiveMemberNames,manifestMembers:archiveManifest.sha256,actualHashes:archiveHashes,installedHashes:archiveHashes,metadataMembers});
 for(const f of ['dist/umf-node.js','dist/umf-browser.js','dist/umf.js','dist/umf_core_node.node','dist/umf_core_wasm_bg.wasm'])assert.equal(sha(await readFile(join(sdk,f))),sdkManifest.assets[f],`asset mismatch ${f}`);
 const consumer=join(temp,'consumer');await mkdir(consumer);run('npm',['--offline','--ignore-scripts','--no-audit','--no-fund','--prefix',consumer,'install',archive]);
 const install=join(consumer,'node_modules/@umf/core'),lock=JSON.parse(await readFile(join(consumer,'package-lock.json'),'utf8')),installedManifest=JSON.parse(await readFile(join(install,'package.json'),'utf8'));
 const lockPackageCount=assertArrowIpcLockIntegrity(lock);
 const integrity=`sha512-${createHash('sha512').update(bytes).digest('base64')}`,identity=assertArrowIpcInstalledIdentity({lockEntry:lock.packages?.['node_modules/@umf/core'],installedManifest,archiveManifest:pkg,archivePath:archive,consumerPath:consumer,integrity});
 const installedHashes={};for(const path of Object.keys(archiveManifest.sha256))installedHashes[path]=sha(await readFile(join(install,path)));
 const installedMemberNames=await walkFiles(install);
 assertArrowIpcArchiveMembers({archiveMembers:archiveMemberNames,installedMembers:installedMemberNames,manifestMembers:archiveManifest.sha256,actualHashes:archiveHashes,installedHashes,metadataMembers});
 const resolveEntry=async runtime=>{const file=join(consumer,`${runtime}-resolve.mjs`);await writeFile(file,"console.log(JSON.stringify({root:import.meta.resolve('@umf/core'),reference:import.meta.resolve('@umf/core/reference')}))");return JSON.parse(run(runtime,[file],{cwd:consumer}));};
 const node=await resolveEntry('node'),bun=await resolveEntry('bun');
 for(const [r,x] of [['Node',node],['Bun',bun]]){assert(x.root.endsWith('/dist/umf-node.js'),`${r} default route`);assert(x.reference.endsWith('/dist/umf.js'),`${r} reference route`);}
 const replay=resolve(repo,'scripts/rust-migration/r8/arrow-ipc-installed-replay.mjs'),routes={};
 for(const [runtime,route] of [['node',node],['bun',bun]])for(const [name,url] of [['default',route.root],['reference',route.reference]])routes[`${runtime}_${name}`]=JSON.parse(run(runtime,[replay,new URL(url).pathname],{cwd:consumer}));
 for(const result of Object.values(routes)){assert.equal(result.status,'pass');assert.equal(result.cases,23);assert.equal(result.packetSha256,routes.node_default.packetSha256);}
 const chromium=JSON.parse(run('node',[resolve(repo,'scripts/rust-migration/r8/arrow-ipc-installed-chromium.mjs'),install],{cwd:repo}));assert.equal(chromium.status,'pass');assert.equal(chromium.operations,69);
 const native=join(install,'dist/umf_core_node.node'),nativeBytes=await readFile(native),refusals=[];
 try{for(const mode of ['missing','corrupt']){if(mode==='missing')await rm(native);else await writeFile(native,new Uint8Array([0,1,2,3]));for(const runtime of ['node','bun']){const probe=join(consumer,`${runtime}-${mode}.mjs`);await writeFile(probe,"let error;try{await import('@umf/core')}catch(e){error=String(e?.message??e)}if(!error||!error.includes('umf_core_node.node'))throw Error('native asset failed open: '+error);if(typeof (await import('@umf/core/reference')).captureArrowIpc!=='function')throw Error('reference route unavailable');console.log(JSON.stringify({runtime:"+JSON.stringify(runtime)+",mode:"+JSON.stringify(mode)+",refused:true,referenceAvailable:true}))");refusals.push(JSON.parse(run(runtime,[probe],{cwd:consumer})));}}}finally{await writeFile(native,nativeBytes);}
 assertArrowIpcRefusalControls(refusals,chromium.refusal);
 const finalInputs={};for(const path of Object.keys(closure.inputs))finalInputs[path]=await readFile(join(repo,path));for(const path of Object.keys(closure.externalInputs??{}))finalInputs[path]=await readFile(join(repo,path));assertArrowIpcSourceClosure(sdkManifest,finalInputs);
 const receipt={format:'umf.r8.arrow-ipc-installed-package/1',status:'passed',scope:'offline current-source @umf/core Arrow IPC V4 captureArrowIpc, inspectArrowIpcCapture, exportArrowIpcCapture; Node/Bun default and ./reference plus Chromium packaged browser; no other operations or release claim',archive:{path:archive,sha256:archiveSha256,manifestSha256:sha(await readFile(join(sdk,'manifest.json'))),verifiedMemberCount:archiveMemberCount,...sourceReceipt,identity},installation:{lockfileVersion:lock.lockfileVersion,lockPackageCount,packageDependencies:Object.keys(pkg.dependencies??{}).length},routes,chromium,nativeRefusal:refusals};
 if(process.argv[3]){const out=resolve(process.argv[3]);await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(receipt,null,2)+'\n');}console.log(JSON.stringify(receipt));
}finally{await rm(temp,{recursive:true,force:true});}
