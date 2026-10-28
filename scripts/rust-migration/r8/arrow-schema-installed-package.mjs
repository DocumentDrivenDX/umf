// SPDX-License-Identifier: MIT OR Apache-2.0
// Dependency-resolved, offline installed-package Arrow schema qualification.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cp,mkdir,mkdtemp,readFile,realpath,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertArrowInstalledPackageIdentity,assertArrowReplayReceipt,assertArrowRouteResolution,assertArrowWasmRefusalReceipt} from './arrow-schema-installed-package-support.mjs';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const archive=resolve(process.argv[2]??'');
if(!process.argv[2])throw new Error('Usage: bun scripts/rust-migration/r8/arrow-schema-installed-package.mjs <fixed-point-umf-sdk.tgz> [receipt.json]');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const shaFile=async path=>sha(await readFile(path));
const run=(command,args,options={})=>execFileSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],...options});
// npm 11 records package-lock keys outside node_modules when macOS presents
// the same temp directory through both /var and /private/var paths.
const temp=await realpath(await mkdtemp(join(tmpdir(),'umf-r8-arrow-installed-')));
let browserRun;
try{
 const archiveBytes=await readFile(archive),archiveSha256=sha(archiveBytes);
 const listing=run('tar',['-tzf',archive]).trim().split('\n');
 assert(listing.length>0&&listing.every(path=>path.startsWith('package/')&&!path.startsWith('/')&&!path.split('/').includes('..')),'unsafe SDK archive members');
 const extracted=join(temp,'archive');await mkdir(extracted,{recursive:true});run('tar',['-xzf',archive,'-C',extracted]);
 const sdk=join(extracted,'package');
 const packageJson=JSON.parse(await readFile(join(sdk,'package.json'),'utf8'));
 const manifest=JSON.parse(await readFile(join(sdk,'dist/rust-default-manifest.json'),'utf8'));
 assert.equal(manifest.sourceClosure.transform.status,'fixed-point','archive is not a fixed-point source build');
 assert.equal(manifest.sourceClosure.transform.generatedInputs.length,0,'archive contains generated source transforms');
 const sourceEntries=Object.entries(manifest.sourceClosure.inputs);
 assert(sourceEntries.length>0,'archive source closure is empty');
 for(const [path,expected] of sourceEntries){
  assert(!path.startsWith('/')&&!path.split('/').includes('..'),`unsafe source closure member: ${path}`);
  assert.equal(await shaFile(join(repo,path)),expected,`archive does not contain the current source: ${path}`);
 }
 const arrowSources=['src/adapters/arrow/rust-default.ts','src/index-node-v4.ts','src/index-browser-v4.ts','bindings/core/node/index.js','bindings/core/wasm/index.js'];
 const sourceHashes={};
 for(const path of arrowSources){
  const current=await shaFile(join(repo,path));
  assert.equal(manifest.sourceClosure.inputs[path],current,`archive does not contain the current Arrow route source: ${path}`);
  sourceHashes[path]=current;
 }
 for(const path of ['dist/umf-node.js','dist/umf-browser.js','dist/umf.js','dist/umf_core_node.node','dist/umf_core_wasm_bg.wasm']){
  assert(manifest.assets[path],`archive manifest omits ${path}`);
  assert.equal(await shaFile(join(sdk,path)),manifest.assets[path],`archive asset mismatch: ${path}`);
 }
 assert.equal(packageJson.name,'@umf/core');
 assert.equal(packageJson.version,manifest.packageVersion);
 assert.equal(packageJson.dependencies?.['apache-arrow'],'21.2.0','archive package dependency profile changed');

 // npm's strict offline mode is the network boundary. All package scripts are
 // disabled; the consumer gets a private lockfile and a real dependency tree.
 const consumer=join(temp,'consumer');await mkdir(consumer,{recursive:true});
 const npmVersion=run('npm',['--version']).trim();
 run('npm',['--offline','--ignore-scripts','--no-audit','--no-fund','--prefix',consumer,'install',archive]);
 const install=join(consumer,'node_modules/@umf/core');
 const lockBytes=await readFile(join(consumer,'package-lock.json'));
 const lock=JSON.parse(lockBytes);
 const installedManifest=JSON.parse(await readFile(join(install,'package.json'),'utf8'));
 const archiveIntegrity=`sha512-${createHash('sha512').update(archiveBytes).digest('base64')}`;
 const packageIdentity=assertArrowInstalledPackageIdentity({lockEntry:lock.packages?.['node_modules/@umf/core'],installedManifest,archiveManifest:packageJson,archivePath:archive,consumerPath:consumer,archiveIntegrity});
 const dependencyVersions={};
 for(const [name,wanted] of Object.entries(packageJson.dependencies??{})){
  // Package exports may forbid require.resolve even when the dependency is
  // installed. npm places a direct dependency either below this package or
  // at the consumer root; prefer the package-local copy when both exist.
  let resolved;
  for(const candidate of [join(install,'node_modules',name,'package.json'),join(consumer,'node_modules',name,'package.json')]){
   try{resolved=JSON.parse(await readFile(candidate,'utf8'));break;}
   catch(error){if(error?.code!=='ENOENT')throw error;}
  }
  assert(resolved,`Could not locate installed dependency manifest: ${name}`);
  assert.equal(resolved.name,name,`installed dependency identity mismatch: ${name}`);
  assert.equal(resolved.version,wanted,`installed dependency version mismatch: ${name}`);
  dependencyVersions[name]=resolved.version;
 }
 const resolveExports=async runtime=>{
  const probe=join(consumer,`${runtime}-resolve.mjs`);
  await writeFile(probe,`for(const [name,suffix] of [['@umf/core','dist/umf-node.js'],['@umf/core/reference','dist/umf.js']]){const url=import.meta.resolve(name);if(!url.endsWith('/'+suffix))throw new Error(name+' resolved to '+url);await import(name)}console.log(JSON.stringify({runtime:process.version,root:import.meta.resolve('@umf/core'),reference:import.meta.resolve('@umf/core/reference')}));`);
  return JSON.parse(run(runtime==='node'?'node':'bun',[probe],{cwd:consumer}));
 };
 const nodeResolution=assertArrowRouteResolution(await resolveExports('node'),'Node'),bunResolution=assertArrowRouteResolution(await resolveExports('bun'),'Bun');
 const replay=resolve(repo,'scripts/rust-migration/r8/arrow-schema-v4-route-replay.mjs');
 const nodeRoot=new URL(nodeResolution.root).pathname,bunRoot=new URL(bunResolution.root).pathname;
 const nodeReference=new URL(nodeResolution.reference).pathname,bunReference=new URL(bunResolution.reference).pathname;
 const nodeRust=JSON.parse(run('node',[replay,nodeRoot],{cwd:consumer}));
 const nodeReferenceReceipt=JSON.parse(run('node',[replay,nodeReference],{cwd:consumer}));
 const bunRust=JSON.parse(run('bun',[replay,bunRoot],{cwd:consumer}));
 const bunReferenceReceipt=JSON.parse(run('bun',[replay,bunReference],{cwd:consumer}));
 for(const [label,item] of [['Node default',nodeRust],['Node reference',nodeReferenceReceipt],['Bun default',bunRust],['Bun reference',bunReferenceReceipt]]){
  assertArrowReplayReceipt(item,label);
  assert.equal(item.packetSha256,nodeRust.packetSha256,`${label} used a different frozen packet`);
 }

 const nativePath=join(install,'dist/umf_core_node.node');
 const originalNative=await readFile(nativePath);
 const refusalRuns=[];
 try{
  for(const mode of ['missing','corrupt']){
   if(mode==='missing')await rm(nativePath);else await writeFile(nativePath,new Uint8Array([0,1,2,3]));
   for(const runtime of ['node','bun']){
    const probe=join(consumer,`${runtime}-${mode}.mjs`);
    await writeFile(probe,`const resolved=import.meta.resolve('@umf/core');if(!resolved.endsWith('/dist/umf-node.js'))throw new Error('default route escaped package');let error;try{await import('@umf/core')}catch(e){error=String(e?.message??e)}if(!error||!error.includes('umf_core_node.node'))throw new Error('native ${mode} asset did not refuse at the load boundary: '+error);const ref=await import('@umf/core/reference');if(typeof ref.importArrowSchema!=='function')throw new Error('reference route unavailable after native refusal');console.log(JSON.stringify({runtime:${JSON.stringify(runtime)},mode:${JSON.stringify(mode)},refused:true,referenceAvailable:true,error}));`);
    const result=JSON.parse(run(runtime==='node'?'node':'bun',[probe],{cwd:consumer}));
    refusalRuns.push(result);
   }
  }
 }finally{await writeFile(nativePath,originalNative);}
 for(const receipt of refusalRuns)assert(receipt.refused&&receipt.referenceAvailable,'native refusal controls did not pass');

 const chromium=resolve(repo,'scripts/rust-migration/r8/arrow-schema-v4-chromium-replay.mjs');
 const port=String(41760+Math.floor(Math.random()*1000));
 browserRun=JSON.parse(run('bun',[chromium,join(repo,'bindings/core/wasm/pkg'),'--installed',install],{cwd:repo,env:{...process.env,UMF_CHROMIUM_PORT:port}}));
 assert(browserRun.status==='pass'&&browserRun.packagedBrowserOperations===260&&browserRun.packagedReferenceOperations===260,'installed browser route replay did not pass');
 assertArrowWasmRefusalReceipt(browserRun);
 const receipt={format:'umf.r8.arrow-schema-installed-package/1',status:'passed',scope:'current fixed-point @umf/core Arrow schema JSON package routes only; no Arrow IPC, Apache Arrow native data, Python, CLI, or release claim',archive:{path:archive,sha256:archiveSha256,manifestSha256:await shaFile(join(sdk,'manifest.json')),sourceClosureSha256:manifest.sourceClosure.sha256,sourceInputCount:sourceEntries.length,sourceTransform:manifest.sourceClosure.transform,arrowSourceHashes:sourceHashes},installation:{method:'npm install --offline --ignore-scripts --no-audit --no-fund <local-archive>',npmVersion,lockfileSha256:sha(lockBytes),lockfileVersion:lock.lockfileVersion,packageIdentity,dependencies:dependencyVersions},node:{resolution:nodeResolution,rustRoute:nodeRust,referenceRoute:nodeReferenceReceipt},bun:{resolution:bunResolution,rustRoute:bunRust,referenceRoute:bunReferenceReceipt},chromium:browserRun,nativeRefusal:refusalRuns,packetSha256:nodeRust.packetSha256,harnessSha256:await shaFile(fileURLToPath(import.meta.url))};
 const output=process.argv[3]?resolve(process.argv[3]):null;
 if(output){await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(receipt,null,2)+'\n');}
 console.log(JSON.stringify(receipt));
}finally{await rm(temp,{recursive:true,force:true});}
