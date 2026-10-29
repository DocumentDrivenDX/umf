// SPDX-License-Identifier: MIT OR Apache-2.0
// Dependency-resolved installed Core Facets replay; archive and closure pins are mandatory.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {tarMembers} from './default-route-retirement-evidence.mjs';
import {validateLock,validateIdentity,validateRouteResolution,verifySourceClosure,exerciseNegativeControls,coreFacetsCohortForHost,assessLinuxX64NativeFormat} from './core-nine-installed-support.mjs';
import {runInstalledAssetControls} from './core-facets-installed-asset-controls.mjs';
import {validateCoreFacetResourceEvidence} from './core-facets-resource-suite.mjs';

const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const [archiveArg,closureSha,outputArg]=process.argv.slice(2);
if(!archiveArg||! /^[a-f0-9]{64}$/.test(closureSha??'')||!outputArg)throw new Error('Usage: bun scripts/rust-migration/r8/core-facets-dependency-installed.mjs <fixed-point-sdk.tgz> <source-closure-sha256> <output-directory>');
const archive=resolve(archiveArg),output=resolve(outputArg),hash=b=>createHash('sha256').update(b).digest('hex');
const hostCohort=coreFacetsCohortForHost(process.platform,process.arch);
const scratch=await realpath(await mkdtemp(join(tmpdir(),'umf-r8-facets-consumer-'))),consumer=join(scratch,'consumer'),receipts=join(scratch,'receipts');
const run=(command,args,options={})=>execFileSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],...options});
try{
 await mkdir(consumer,{recursive:true});await mkdir(receipts,{recursive:true});
 const archiveBytes=await readFile(archive),archiveSha=hash(archiveBytes);
 const tar=tarMembers(archiveBytes);
 const snapshot=join(scratch,'archive');await mkdir(snapshot);run('tar',['-xzf',archive,'--strip-components=1','-C',snapshot]);
 const manifest=JSON.parse(await readFile(join(snapshot,'manifest.json'),'utf8'));
 const sdk=JSON.parse(await readFile(join(snapshot,'dist/rust-default-manifest.json'),'utf8'));
 assert.equal(manifest.sourceTransformStatus,'fixed-point');assert.equal(manifest.sourceTransformCount,0);
 assert.equal(manifest.sourceTreeSha256,closureSha);assert.equal(manifest.capturedLiveSourceTreeSha256,closureSha);
 assert.equal(sdk.sourceClosure.sha256,closureSha);assert.equal(sdk.sourceClosure.capturedLiveSha256,closureSha);
 const expectedMembers=[...Object.keys(manifest.sha256),'manifest.json'].sort();
 assert.deepEqual(Object.keys(tar.members).sort(),expectedMembers,'archive tar members exactly match the manifest plus its single outer manifest');
 assert.equal(tar.members['manifest.json'],hash(await readFile(join(snapshot,'manifest.json'))),'outer archive manifest bytes');
 for(const [member,digest] of Object.entries(manifest.sha256)){assert.equal(tar.members[member],digest,`archive tar member ${member}`);assert.equal(hash(await readFile(join(snapshot,member))),digest,`archive member ${member}`)}
 const initial=await verifySourceClosure({repoRoot:repo,sourceClosure:sdk.sourceClosure,expectedSha256:closureSha});
 const npmVersion=run('npm',['--version']).trim();
 run('npm',['--offline','--ignore-scripts','--no-audit','--no-fund','--prefix',consumer,'install',archive]);
 const packageRoot=join(consumer,'node_modules/@umf/core'),pkg=JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8'));
 for(const [member,digest] of Object.entries(manifest.sha256))assert.equal(hash(await readFile(join(packageRoot,member))),digest,`installed archive member ${member}`);
 const lock=JSON.parse(await readFile(join(consumer,'package-lock.json'),'utf8'));validateLock(lock);
 const archiveIntegrity=`sha512-${createHash('sha512').update(archiveBytes).digest('base64')}`;validateIdentity(pkg,lock,packageRoot,consumer,archive,archiveIntegrity);
 const dependencies={};for(const [name,wanted] of Object.entries(pkg.dependencies??{})){let found;for(const candidate of [join(packageRoot,'node_modules',name,'package.json'),join(consumer,'node_modules',name,'package.json')]){try{found=JSON.parse(await readFile(candidate,'utf8'));break}catch(e){if(e?.code!=='ENOENT')throw e}}assert(found,`missing dependency ${name}`);assert.equal(found.name,name);assert.equal(found.version,wanted);dependencies[name]=found.version}
 const resolvedRoutes={};for(const runtime of ['node','bun']){const probe=join(consumer,`${runtime}-routes.mjs`);await writeFile(probe,"console.log(JSON.stringify({root:import.meta.resolve('@umf/core'),reference:import.meta.resolve('@umf/core/reference')}))");resolvedRoutes[runtime]=JSON.parse(run(runtime,[probe],{cwd:consumer}));}validateRouteResolution(resolvedRoutes,packageRoot);
 const negativeControls=exerciseNegativeControls({pkg,lock,installedRoot:packageRoot,consumerRoot:consumer,archivePath:archive,archiveIntegrity,routes:resolvedRoutes});
 const replay=resolve(repo,'scripts/rust-migration/r8/core-facets-dependency-installed-replay.mjs');
 const env={...process.env,UMF_R8_FACETS_CONSUMER_ROOT:consumer};
 run('bun',[replay,archive,join(receipts,'replay'),archiveSha,closureSha,hostCohort],{cwd:repo,env});
 const receiptFiles=[];for(const name of await (await import('node:fs/promises')).readdir(join(receipts,'replay'))){const bytes=await readFile(join(receipts,'replay',name));receiptFiles.push({name,sha256:hash(bytes)});}assert.equal(receiptFiles.length,3);
 const retirementHosts=[],resourceHosts=[];for(const runtime of ['node','bun','chromium']){
  const raw=JSON.parse(await readFile(join(receipts,'replay',`${hostCohort}-${runtime}.json`),'utf8'));
  validateCoreFacetResourceEvidence(raw.observation.resourceEvidence,assert);
  resourceHosts.push({runtime,path:`receipts/${hostCohort}-${runtime}.json`,sha256:hash(await readFile(join(receipts,'replay',`${hostCohort}-${runtime}.json`))),cases:raw.observation.resourceEvidence});
  const entryMember=(runtime==='chromium'?pkg.exports['.'].browser:pkg.exports['.'].node).replace(/^\.\//,''),referenceMember=pkg.exports['./reference'].import.replace(/^\.\//,''),artifact=runtime==='chromium'?'dist/umf_core_wasm_bg.wasm':'dist/umf_core_node.node';
  for(const operation of ['inspectCoreFacets','declareCoreFacets','verifyCoreFacetDeclaration','historicalCoreFacetPatch']){
   const packetBytes=await readFile(join(repo,'scripts/rust-migration/r8/facets-retirement-packets',`${operation}.packet.json`)),packet=JSON.parse(packetBytes),cases=[];
   for(const item of packet.cases){const d=raw.observation.packetEvidence.default[operation].find(row=>row.id===item.id),r=raw.observation.packetEvidence.reference[operation].find(row=>row.id===item.id);assert(d&&r,`${runtime} missing case ${operation}/${item.id}`);assert.deepEqual(d.rustOperations,item.expectedDefaultRustOperations,`${runtime} default Rust op trace ${operation}/${item.id}`);assert.deepEqual(r.rustOperations,[],`${runtime} reference Rust trace ${operation}/${item.id}`);cases.push({id:item.id,defaultOutcome:d.outcome,defaultTrace:d.trace,defaultRustCalls:d.rustOperations.length,defaultRustOperations:d.rustOperations,referenceOutcome:r.outcome,referenceTrace:r.trace,referenceRustCalls:0});}
   const route=(routeId,member,artifactMembers=[])=>({routeId,entryMember:member,entrySha256:manifest.sha256[member],artifactMembers});
   const receipt={format:'umf.r8.default-route-retirement-host-receipt/4',status:'pass',runtime,hostVersion:runtime==='chromium'?raw.browser.version:raw.observation.runtime.replace(/^(Node|Bun)\s+/,'').replace(/^v/,''),cohortId:hostCohort,hostPlatform:{os:process.platform,arch:process.arch},archiveSha256:archiveSha,sourceClosureSha256:closureSha,packetSha256:hash(packetBytes),defaultRoute:route(runtime==='chromium'?'package-root-browser':'package-root-node',entryMember,[{path:artifact,sha256:manifest.sha256[artifact]}]),referenceRoute:route('package-reference',referenceMember),cases};
   const filename=`host-receipt-${runtime}-${operation}.json`,bytes=Buffer.from(JSON.stringify(receipt,null,2)+'\n');await writeFile(join(receipts,'replay',filename),bytes);retirementHosts.push({runtime,operation,path:`receipts/${filename}`,sha256:hash(bytes),caseCount:cases.length});
  }
 }
 const assetControlReceiptPath=join(receipts,'installed-asset-controls.json');
 const assetControlReceipt=await runInstalledAssetControls({consumerRoot:consumer,packageRoot,archiveSha256:archiveSha,outputPath:assetControlReceiptPath});
 const assetControlBytes=await readFile(assetControlReceiptPath);
 const final=await verifySourceClosure({repoRoot:repo,sourceClosure:sdk.sourceClosure,expectedSha256:closureSha});assert.deepEqual(final,initial,'source closure changed during replay');
 const nativeMembers=Object.keys(manifest.sha256).filter(name=>name.endsWith('.node'));
 assert.deepEqual(nativeMembers,['dist/umf_core_node.node'],'archive has exactly the expected native addon member');
 const nativeFormat=run('file',['-b',join(snapshot,nativeMembers[0])]).trim();
 const linuxX64=assessLinuxX64NativeFormat({platform:process.platform,arch:process.arch,nativeMembers,nativeFormat});
 const cohort={format:'umf.r8.core-facets-dependency-installed/1',status:'pass',scope:'offline npm dependency-resolved exact archive; Core Facets frozen and bounded resource/stress cases on Node, Bun and Chromium; retirement and release remain unqualified',archive:{sha256:archiveSha,bytes:archiveBytes.length},sourceClosure:{sha256:closureSha,fileCount:initial.fileCount,initialCheck:initial,finalCheck:final},consumer:{manager:'npm',version:npmVersion,offline:true,installFlags:['--offline','--ignore-scripts','--no-audit','--no-fund'],package:{name:pkg.name,version:pkg.version,path:'node_modules/@umf/core'},lock:{file:'package-lock.json',lockfileVersion:lock.lockfileVersion,integrityDependencyCount:Object.keys(lock.packages).filter(k=>k&&k!=='node_modules/@umf/core').length,sha256:hash(await readFile(join(consumer,'package-lock.json'))),archiveIntegrity},dependencies,resolvedRoutes},negativeControls,hosts:receiptFiles.map(x=>({...x,path:`receipts/${x.name}`})),resourceSuite:{format:'umf.r8.core-facets-resource-suite/1',caseCount:14,harnessSha256:hash(await readFile(join(repo,'scripts/rust-migration/r8/core-facets-resource-suite.mjs'))),hosts:resourceHosts,apiControls:'The installed public operations expose no caller-configurable maxWork or cancellation controls.'},installedAssetControls:{path:'receipts/installed-asset-controls.json',sha256:hash(assetControlBytes),archiveSha256:assetControlReceipt.archiveSha256,caseCount:assetControlReceipt.cases.length,status:assetControlReceipt.status},linuxX64};
 await mkdir(output,{recursive:true});await mkdir(join(output,'receipts'),{recursive:true});await writeFile(join(output,'consumer-lock.json'),await readFile(join(consumer,'package-lock.json')));await (await import('node:fs/promises')).cp(join(receipts,'replay'),join(output,'receipts'),{recursive:true});await writeFile(join(output,'receipts','installed-asset-controls.json'),await readFile(assetControlReceiptPath));cohort.retirementHostReceipts=retirementHosts;await writeFile(join(output,'cohort.json'),JSON.stringify(cohort,null,2)+'\n');
 console.log(JSON.stringify({status:'pass',archiveSha256:archiveSha,sourceClosureSha256:closureSha,dependencies:Object.keys(dependencies).length,receipts:receiptFiles.length,output:join(output,'cohort.json')},null,2));
}finally{await rm(scratch,{recursive:true,force:true})}
