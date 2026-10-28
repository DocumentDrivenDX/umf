// SPDX-License-Identifier: MIT OR Apache-2.0
// Dependency-resolved installed-consumer qualification for the Core-nine packets.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {exerciseNegativeControls,validateIdentity,validateLock,validateRouteResolution,verifySourceClosure} from './core-nine-installed-support.mjs';

const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const [archiveArg,closure,outputArg]=process.argv.slice(2);
if(!archiveArg||! /^[a-f0-9]{64}$/.test(closure??'')||!outputArg)throw new Error('Usage: bun scripts/rust-migration/r8/core-nine-installed-consumer.mjs <fixed-point-sdk.tgz> <source-closure-sha256> <receipt-directory>');
const archive=resolve(archiveArg),output=resolve(outputArg),hash=b=>createHash('sha256').update(b).digest('hex');
const scratch=await realpath(await mkdtemp(join(tmpdir(),'umf-r8-core-nine-consumer-')));
const consumer=join(scratch,'consumer'),receipts=join(scratch,'receipts'),snapshot=join(scratch,'archive-package');
const run=(command,args,options={})=>execFileSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],...options});
let success=false;
try{
 await mkdir(consumer,{recursive:true});await mkdir(receipts,{recursive:true});
 const archiveBytes=await readFile(archive),archiveSha=hash(archiveBytes);
 await mkdir(snapshot,{recursive:true});run('tar',['-xzf',archive,'--strip-components=1','-C',snapshot]);
 const archiveManifest=JSON.parse(await readFile(join(snapshot,'manifest.json'),'utf8'));
 const sdkManifest=JSON.parse(await readFile(join(snapshot,'dist/rust-default-manifest.json'),'utf8'));
 assert.equal(archiveManifest.sourceTransformStatus,'fixed-point','archive transform fixed point');assert.equal(archiveManifest.sourceTreeSha256,closure,'archive source closure pin');assert.equal(sdkManifest.sourceClosure.sha256,closure,'SDK source closure pin');assert.equal(archiveManifest.capturedLiveSourceTreeSha256,closure,'captured archive live-source pin');
 for(const [member,digest] of Object.entries(archiveManifest.sha256))assert.equal(hash(await readFile(join(snapshot,member))),digest,`archive member ${member}`);
 const initialClosureCheck=await verifySourceClosure({repoRoot:repo,sourceClosure:sdkManifest.sourceClosure,expectedSha256:closure});
 const npmVersion=run('npm',['--version']).trim();
 run('npm',['--offline','--ignore-scripts','--no-audit','--no-fund','--prefix',consumer,'install',archive]);
 const packageRoot=join(consumer,'node_modules/@umf/core'),pkg=JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8'));
 for(const [member,digest] of Object.entries(archiveManifest.sha256))assert.equal(hash(await readFile(join(packageRoot,member))),digest,`installed archive member ${member}`);
 const lock=JSON.parse(await readFile(join(consumer,'package-lock.json'),'utf8'));
 validateLock(lock);const archiveIntegrity=`sha512-${createHash('sha512').update(archiveBytes).digest('base64')}`;validateIdentity(pkg,lock,packageRoot,consumer,archive,archiveIntegrity);
 const dependencyVersions={};for(const [name,wanted] of Object.entries(pkg.dependencies??{})){let found;for(const candidate of [join(packageRoot,'node_modules',name,'package.json'),join(consumer,'node_modules',name,'package.json')]){try{found=JSON.parse(await readFile(candidate,'utf8'));break;}catch(error){if(error?.code!=='ENOENT')throw error;}}assert(found,`missing installed dependency ${name}`);assert.equal(found.name,name,`dependency identity ${name}`);assert.equal(found.version,wanted,`dependency version ${name}`);dependencyVersions[name]=found.version;}
 const resolveEntry=async runtime=>{const probe=join(consumer,`${runtime}-resolve.mjs`);await writeFile(probe,"console.log(JSON.stringify({root:import.meta.resolve('@umf/core'),reference:import.meta.resolve('@umf/core/reference')}))");return JSON.parse(run(runtime,[probe],{cwd:consumer}));};
 const resolvedRoutes={node:await resolveEntry('node'),bun:await resolveEntry('bun')};
 validateRouteResolution(resolvedRoutes,packageRoot);
 const negativeControls=exerciseNegativeControls({pkg,lock,installedRoot:packageRoot,consumerRoot:consumer,archivePath:archive,archiveIntegrity,routes:resolvedRoutes});
 const names=['inspectors-default-retirement-replay-node.mjs','csv-boolean-default-retirement-replay-node.mjs'];for(const name of names)await cp(join(repo,'scripts/rust-migration/r8',name),join(consumer,name));
 const envFor=prefix=>({UMF_R8_INSTALLED_PACKAGE_SPECIFIER:'1',UMF_R8_REPO_ROOT:repo,[`${prefix}_ARCHIVE_ROOT`]:packageRoot,[`${prefix}_RECEIPT_DIR`]:receipts,[`${prefix}_ARCHIVE_SHA256`]:archiveSha,[`${prefix}_SOURCE_CLOSURE_SHA256`]:closure});
 for(const [prefix,name] of [['UMF_R8_INSPECTOR',names[0]],['UMF_R8_CSV',names[1]]]){const env=envFor(prefix);for(const runtime of ['node','bun'])run(runtime,[name],{cwd:consumer,env:{...process.env,...env}});}
 for(const [prefix,name] of [['UMF_R8_INSPECTOR','inspectors-default-retirement-replay-browser.mjs'],['UMF_R8_CSV','csv-boolean-default-retirement-replay-browser.mjs']])run('bun',[join(repo,'scripts/rust-migration/r8',name)],{cwd:repo,env:{...process.env,...envFor(prefix)}});
 run('bun',['scripts/rust-migration/r8/schema-properties-installed.mjs',archive,closure,join(receipts,'schema-properties.json')],{cwd:repo,env:{...process.env,UMF_R8_INSTALLED_CONSUMER_ROOT:consumer}});
 const {readdir}=await import('node:fs/promises');const receiptFiles=[];for(const name of await readdir(receipts)){const bytes=await readFile(join(receipts,name));receiptFiles.push({name,sha256:hash(bytes)});}assert(receiptFiles.length>=10,'expected retained host receipts');
 const lockBytes=await readFile(join(consumer,'package-lock.json'));
 const cohort={format:'umf.r8.core-nine-installed-consumer/1',status:'pass',scope:'exact fixed-point npm archive installed offline with dependency integrity; package-root and ./reference packet replay on Node, Bun and Chromium; retirement remains open pending independent required cohorts and review',archive:{path:archive,sha256:archiveSha,bytes:archiveBytes.length},sourceClosure:{sha256:closure},consumer:{manager:'npm',version:npmVersion,installFlags:['--offline','--ignore-scripts','--no-audit','--no-fund'],package:{name:pkg.name,version:pkg.version,location:'node_modules/@umf/core'},lock:{file:'package-lock.json',lockfileVersion:lock.lockfileVersion,archiveIntegrity,integrityDependencyCount:Object.keys(lock.packages).filter(k=>k&&k!=='node_modules/@umf/core').length,sha256:hash(lockBytes)},dependencies:dependencyVersions,resolvedRoutes},negativeControls,hostReceipts:receiptFiles.map(item=>({...item,path:`receipts/${item.name}`})),retirement:{eligibleNames:0,reason:'installed qualification is evidence only; explicit ledger review and independent required host cohorts remain open'}};
 await mkdir(output,{recursive:true});await cp(receipts,join(output,'receipts'),{recursive:true});await writeFile(join(output,'consumer-lock.json'),lockBytes);
 const finalClosureCheck=await verifySourceClosure({repoRoot:repo,sourceClosure:sdkManifest.sourceClosure,expectedSha256:closure});
 assert.equal(finalClosureCheck.sha256,initialClosureCheck.sha256,'live source closure changed during installed qualification');
 cohort.sourceClosure={...cohort.sourceClosure,initialCheck:initialClosureCheck,finalCheck:finalClosureCheck};
 await writeFile(join(output,'cohort.json'),JSON.stringify(cohort,null,2)+'\n');success=true;
 console.log(JSON.stringify({status:'pass',package:pkg.name,version:pkg.version,receipts:receiptFiles.length,lockIntegrityDependencies:cohort.consumer.lock.integrityDependencyCount,archiveSha256:archiveSha,sourceClosureSha256:closure,output:join(output,'cohort.json')},null,2));
}finally{await rm(scratch,{recursive:true,force:true});}
if(!success)process.exitCode=1;
