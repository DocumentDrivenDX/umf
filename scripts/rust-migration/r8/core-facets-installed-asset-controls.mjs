// SPDX-License-Identifier: MIT OR Apache-2.0
// Prove the installed package refuses a missing or damaged native/WASM asset.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {cp, mkdir, mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {join, relative, resolve, sep} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {decodeCoreRequestOperation} from './core-nine-installed-support.mjs';
import {installCoreFacetsDispatchObserver} from './core-facets-dispatch-observer.mjs';

const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const nativeAsset='dist/umf_core_node.node',wasmAsset='dist/umf_core_wasm_bg.wasm';
const fixturePath=join(repo,'docs/helix/04-build/evidence/rust-migration/r5-core-facets/frozen-typescript.json');
const nativeProbe=`
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';let phase='import';
try {
 globalThis.__calls=[];globalThis.__decodeCoreRequestOperation=${decodeCoreRequestOperation.toString()};if(process.env.UMF_ASSET_CONTROL_STATE==='intact'){const addon=createRequire(import.meta.url)('./node_modules/@umf/core/dist/umf_core_node.node'),installObserver=${installCoreFacetsDispatchObserver.toString()};installObserver(addon,globalThis.__decodeCoreRequestOperation,op=>globalThis.__calls.push(op))}
 const api=await import('@umf/core');phase='operation';const p=JSON.parse(await readFile('./control.json','utf8'));
 const result=api.inspectCoreFacets(p.source,p.identity);assert.equal(result.meaning.state,'known');assert.equal(result.meaning.facets.integerWidth.bits,16);assert.equal(result.meaning.facets.integerWidth.signed,false);
 if(process.env.UMF_ASSET_CONTROL_STATE==='intact')assert(globalThis.__calls.includes('model/inspectCoreFacets'),'public operation dispatched to native addon');process.stdout.write(JSON.stringify({status:'returned',result,nativeOperations:globalThis.__calls})+'\\n');process.exit(0);
} catch(error) {
 process.stderr.write(JSON.stringify({phase,name:error?.name??'',code:error?.code??'',message:String(error?.message??error),stack:String(error?.stack??'')})+'\\n');process.exit(23);
}`;

function run(command,args,cwd){
 const result=spawnSync(command,args,{cwd,encoding:'utf8',timeout:60_000,env:{...process.env,UMF_ASSET_CONTROL_STATE:cwd.split('/').at(-1).split('-').at(-1)}});
 if(result.error)throw result.error;
 return {status:result.status,signal:result.signal,stdout:result.stdout.trim(),stderr:result.stderr.trim()};
}

async function isolatedConsumer(consumerRoot,packageRoot,destination){
 await mkdir(join(destination,'node_modules','@umf'),{recursive:true});
 await cp(packageRoot,join(destination,'node_modules/@umf/core'),{recursive:true});
 // Keep the consumer's exact dependency tree while ensuring the test package is
 // the isolated, mutated copy. Symlinks preserve bytes and avoid duplicate installs.
 const sourceModules=join(consumerRoot,'node_modules'),destModules=join(destination,'node_modules');
 for(const name of await (await import('node:fs/promises')).readdir(sourceModules)){
  if(name==='@umf'){
   const scoped=join(sourceModules,name);
   for(const scopedName of await (await import('node:fs/promises')).readdir(scoped)){
    if(scopedName!=='core')await import('node:fs/promises').then(fs=>fs.symlink(join(scoped,scopedName),join(destModules,'@umf',scopedName),'junction'));
   }
  }else await import('node:fs/promises').then(fs=>fs.symlink(join(sourceModules,name),join(destModules,name),'junction'));
 }
}

async function exerciseNode(consumerRoot,packageRoot,scratch,runtime,assetState,fixture){
 const caseRoot=join(scratch,`${runtime}-${assetState}`);
 await mkdir(caseRoot,{recursive:true});await isolatedConsumer(consumerRoot,packageRoot,caseRoot);
 const copiedAsset=join(caseRoot,'node_modules/@umf/core',nativeAsset);
 if(assetState==='missing')await rm(copiedAsset);
 else if(assetState==='corrupt')await writeFile(copiedAsset,Buffer.from('not a native addon: Core Facets refusal control\n'));
 const probe=join(caseRoot,'probe.mjs');await writeFile(probe,nativeProbe);
 await writeFile(join(caseRoot,'control.json'),JSON.stringify({source:fixture.receipt.target,identity:fixture.identity}));
 const result=run(runtime,[probe],caseRoot);
 if(assetState==='intact'){
  assert.equal(result.status,0,`${runtime} installed package must pass intact positive control: ${result.stderr}`);
  const success=JSON.parse(result.stdout.split('\n').find(line=>line.startsWith('{')));assert.equal(success.status,'returned');
  return {runtime,version:run(runtime,['--version'],caseRoot).stdout,asset:nativeAsset,state:assetState,exitCode:result.status,nativeOperations:success.nativeOperations};
 }
 assert.notEqual(result.status,0,`${runtime} unexpectedly imported and executed Core Facets with ${assetState} native addon`);
 assert.match(result.stderr,/"phase":"(?:import|operation)"/,'native error receipt identifies failure phase');
 assert.doesNotMatch(result.stdout,/"status":"returned"/,'native operation did not return through fallback');
 const error=JSON.parse(result.stderr.split('\n').find(line=>line.startsWith('{')));
 assert(/\.node|native|shared librar|dlopen|module_not_found/i.test(`${error.code} ${error.message}`),`${runtime} failed for a reason unrelated to the ${assetState} native asset: ${JSON.stringify(error)}`);
 return {runtime,version:run(runtime,['--version'],caseRoot).stdout,asset:nativeAsset,state:assetState,mutatedAssetSha256:assetState==='corrupt'?sha(await readFile(copiedAsset)):null,exitCode:result.status,error:{phase:error.phase,name:error.name,code:error.code,message:error.message},stdout:result.stdout};
}

async function exerciseBrowser(consumerRoot,packageRoot,scratch,assetState,fixture){
 const caseRoot=join(scratch,`chromium-${assetState}`);await mkdir(caseRoot,{recursive:true});await isolatedConsumer(consumerRoot,packageRoot,caseRoot);
 const browserPackage=join(caseRoot,'node_modules/@umf/core');
 if(assetState==='missing')await rm(join(browserPackage,wasmAsset));
 else if(assetState==='corrupt')await writeFile(join(browserPackage,wasmAsset),Buffer.from('not a WebAssembly module: Core Facets refusal control\n'));
 const paths=[],external=[],pageErrors=[];let browser,server;
 const pageHtml=`<!doctype html><script type="importmap">{"imports":{"@umf/core":"/node_modules/@umf/core/dist/umf-browser.js"}}</script><script type="module">
let phase='import';try{const api=await import('@umf/core');phase='operation';const result=api.inspectCoreFacets(${JSON.stringify(fixture.receipt.target)},${JSON.stringify(fixture.identity)});if(result?.meaning?.state!=='known'||result?.meaning?.facets?.integerWidth?.bits!==16)throw Error('intact-operation-parity-failed');window.__assetControl={status:'returned',result}}catch(error){window.__assetControl={status:'threw',phase,name:error?.name??'',message:String(error?.message??error),stack:String(error?.stack??'')}}
</script>`;
 server=createServer(async(req,res)=>{
  try{
   const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);paths.push(pathname);
   const file=resolve(caseRoot,`.${pathname}`);assert(file===caseRoot||file.startsWith(caseRoot+sep),'browser request escapes consumer');
   const info=await stat(file);if(info.isDirectory()){res.writeHead(200,{'content-type':'text/html'});res.end(pageHtml);return}
   const body=await readFile(file);res.writeHead(200,{'content-type':pathname.endsWith('.wasm')?'application/wasm':pathname.endsWith('.js')||pathname.endsWith('.mjs')?'text/javascript':pathname.endsWith('.json')?'application/json':'application/octet-stream'});res.end(body);
  }catch{res.writeHead(404);res.end('not found')}
 });
 await new Promise((resolveListen,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolveListen)});
 const address=server.address();assert(address&&typeof address!=='string');
 try{
  process.stderr.write(`asset control: launching Chromium ${assetState}\n`);
  browser=await chromium.launch({headless:true,timeout:30_000,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
  const page=await browser.newPage();page.on('pageerror',error=>pageErrors.push(String(error)));page.on('request',request=>{if(!request.url().startsWith(`http://127.0.0.1:${address.port}/`))external.push(request.url())});
  await page.route('**/*',route=>route.request().url().startsWith(`http://127.0.0.1:${address.port}/`)?route.continue():route.abort());
  process.stderr.write(`asset control: Chromium launched ${assetState}\n`);
  await page.goto(`http://127.0.0.1:${address.port}/`,{waitUntil:'domcontentloaded',timeout:15_000});process.stderr.write(`asset control: Chromium document loaded ${assetState}\n`);await page.waitForFunction(()=>Boolean(window.__assetControl),undefined,{timeout:30_000});
  const outcome=await page.evaluate(()=>window.__assetControl);
  if(assetState==='intact'){
   assert.equal(outcome.status,'returned',`Chromium installed package must pass intact positive control: ${JSON.stringify(outcome)}`);assert(paths.includes('/node_modules/@umf/core/'+wasmAsset));assert.equal(external.length,0);
   return {runtime:'Chromium',version:browser.version(),asset:wasmAsset,state:assetState,outcome,localRequests:paths.length,wasmRequested:true,externalRequests:0};
  }
  assert.equal(outcome.status,'threw',`Chromium unexpectedly imported and executed Core Facets with ${assetState} WASM`);
  assert(/wasm|webassembly|fetch|compile|instantiate|module/i.test(`${outcome.name} ${outcome.message} ${outcome.stack}`),`Chromium failed for a reason unrelated to the ${assetState} WASM asset: ${JSON.stringify(outcome)}`);
  assert(paths.includes('/node_modules/@umf/core/'+wasmAsset),'browser exercised the installed package WASM asset');
  assert.equal(external.length,0,'browser made no external requests');
  return {runtime:'Chromium',version:browser.version(),asset:wasmAsset,state:assetState,mutatedAssetSha256:assetState==='corrupt'?sha(await readFile(join(browserPackage,wasmAsset))):null,outcome,pageErrors,localRequests:paths.length,wasmRequested:true,externalRequests:external.length};
 }finally{if(browser)await browser.close();await new Promise(resolveClose=>server.close(resolveClose))}
}

/** Run installed-root failure controls on isolated copies of the exact npm package. */
export async function runInstalledAssetControls({consumerRoot,packageRoot,archiveSha256,outputPath}){
 consumerRoot=resolve(consumerRoot);packageRoot=resolve(packageRoot);outputPath=resolve(outputPath);
 assert(/^[a-f0-9]{64}$/.test(archiveSha256??''),'archive SHA-256 pin is required');
 const pkg=JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8'));assert.equal(pkg.name,'@umf/core');
 const nativeBytes=await readFile(join(packageRoot,nativeAsset)),wasmBytes=await readFile(join(packageRoot,wasmAsset));
 const fixture=JSON.parse(await readFile(fixturePath,'utf8'));
 const pinned={native:{path:nativeAsset,sha256:sha(nativeBytes),bytes:nativeBytes.length},wasm:{path:wasmAsset,sha256:sha(wasmBytes),bytes:wasmBytes.length}};
 const scratch=await mkdtemp(join(tmpdir(),'umf-r8-facets-asset-controls-'));
 try{
  const results=[];
  for(const runtime of ['node','bun'])for(const state of ['intact','missing','corrupt']){process.stderr.write(`asset control: ${runtime} ${state}\n`);results.push(await exerciseNode(consumerRoot,packageRoot,scratch,runtime,state,fixture))}
  for(const state of ['intact','missing','corrupt']){process.stderr.write(`asset control: Chromium ${state}\n`);results.push(await exerciseBrowser(consumerRoot,packageRoot,scratch,state,fixture))}
  const receipt={format:'umf.r8.core-facets-installed-asset-controls/1',status:'pass',scope:'exact installed npm archive package copied to scratch; missing/corrupt public-root asset refusal on Node, Bun and Chromium',archiveSha256,package:{name:pkg.name,version:pkg.version},originalAssets:pinned,cases:results};
  await mkdir(resolve(outputPath,'..'),{recursive:true});await writeFile(outputPath,JSON.stringify(receipt,null,2)+'\n');return receipt;
 }finally{await rm(scratch,{recursive:true,force:true})}
}
