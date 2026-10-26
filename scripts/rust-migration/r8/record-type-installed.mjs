// SPDX-License-Identifier: MIT OR Apache-2.0
// Separate installed-package replay for the bounded Record Type v6 V4 route.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {extname, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const [archiveArg,expectedArchiveSha,expectedClosureSha,outputArg]=process.argv.slice(2);
if(!archiveArg||!expectedArchiveSha||!expectedClosureSha||!outputArg)throw new Error('Usage: bun scripts/rust-migration/r8/record-type-installed.mjs <archive.tgz> <archive-sha256> <source-closure-sha256> <receipt.json>');
const archive=resolve(archiveArg),output=resolve(outputArg),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
const temp=await mkdtemp(join(tmpdir(),'umf-r8-record-type-installed-'));
let browser,server;
try{
 const archiveBytes=await readFile(archive);assert.equal(sha(archiveBytes),expectedArchiveSha,'archive SHA-256');
 execFileSync('tar',['-xzf',archive,'-C',temp],{stdio:'ignore'});
 const packageRoot=join(temp,'package'),manifestBytes=await readFile(join(packageRoot,'manifest.json')),manifest=JSON.parse(manifestBytes);
 assert.equal(manifest.sourceTransformStatus,'fixed-point');assert.equal(manifest.sourceTransformCount,0);
 assert.equal(manifest.sourceTreeSha256,expectedClosureSha);assert.equal(manifest.capturedLiveSourceTreeSha256,expectedClosureSha);
 const expectedMembers=manifest.sha256;assert(expectedMembers&&typeof expectedMembers==='object');
 const memberNames=Object.keys(expectedMembers).sort();
 for(const name of memberNames){
  const bytes=await readFile(join(packageRoot,name));assert.equal(sha(bytes),expectedMembers[name],`archive member ${name}`);
 }
 const sdk=JSON.parse(await readFile(join(packageRoot,'dist/rust-default-manifest.json'),'utf8'));
 const closure=sdk.sourceClosure;assert.equal(closure.sha256,expectedClosureSha);assert.equal(closure.capturedLiveSha256,expectedClosureSha);
 assert.deepEqual(closure.transform,{status:'fixed-point',generatedInputs:[]});
 const tree=createHash('sha256');
 for(const name of Object.keys(closure.liveInputs).sort()){
  const bytes=await readFile(join(repo,name));assert.equal(sha(bytes),closure.liveInputs[name],`current source ${name}`);
  tree.update(name);tree.update('\0');tree.update(bytes);tree.update('\0');
 }
 assert.equal(tree.digest('hex'),expectedClosureSha,'current source closure');
 const packageJson=JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8'));
 assert.equal(packageJson.name,'@umf/core');assert.equal(packageJson.exports['.'].node,'./dist/umf-node.js');
 const referenceEntry=typeof packageJson.exports['./reference']==='string'?packageJson.exports['./reference']:packageJson.exports['./reference'].import;
 assert(referenceEntry,'explicit reference export');
 const frozenPath=join(repo,'docs/helix/04-build/evidence/rust-migration/r5-core-record-type/frozen-typescript.json');
 const frozenBytes=await readFile(frozenPath),frozen=JSON.parse(frozenBytes);
 const nodeModules=join(temp,'node_modules/@umf');await mkdir(nodeModules,{recursive:true});await symlink(packageRoot,join(nodeModules,'core'),'dir');
 const nodeProbe=`import {readFile} from 'node:fs/promises';import * as root from '@umf/core';import * as reference from '@umf/core/reference';const packet=JSON.parse(await readFile(${JSON.stringify(frozenPath)},'utf8'));const canonical=${canonical.toString()};const hosts={};for(const [label,api] of [['root',root],['reference',reference]]){const cases=[];for(const variant of ['nested','recursive','qualified']){const declaration=packet.successes['declare-'+variant],declared=api.declareCoreRecordType(declaration.fieldAuthor,declaration.recordAuthor);if(canonical(declared)!==canonical(declaration))throw new Error(label+' declare '+variant+' mismatch');const expected=packet.successes['verify-'+variant],verified=api.verifyCoreRecordTypeDeclaration(declared,declared.target);if(canonical(verified)!==canonical(expected))throw new Error(label+' verify '+variant+' mismatch');cases.push(variant)}let currentTrapReads=0;const current=new Proxy(Object.create(null),{getPrototypeOf(){currentTrapReads++;return null},ownKeys(){currentTrapReads++;return[]},getOwnPropertyDescriptor(){currentTrapReads++;return undefined},get(){currentTrapReads++;return undefined}});let malformed;try{api.verifyCoreRecordTypeDeclaration({},current);malformed={ok:true}}catch(error){malformed={ok:false,error:{code:error?.code??'',message:error?.message??String(error),path:error?.path??''}}}malformed.currentReads=currentTrapReads;if(canonical(malformed)!==canonical(packet.refusals.malformedReceiptBeforeCurrent))throw new Error(label+' malformed receipt/current order mismatch');hosts[label]={cases,malformed,currentTrapReads}}if(canonical(hosts.root)!==canonical(hosts.reference))throw new Error('root/reference route mismatch');console.log(JSON.stringify({runtime:process.versions.bun?'Bun '+process.versions.bun:'Node '+process.version,host:hosts.root,reference:hosts.reference}))`;
 const runHost=(runtime,name)=>{
  const result=spawnSync(runtime,['--input-type=module','-e',nodeProbe],{cwd:temp,encoding:'utf8',env:{...process.env,NODE_NO_WARNINGS:'1'}});
  if(result.status!==0)throw new Error(`${name} installed replay failed (${result.status}): ${result.stderr}`);
  const lines=result.stdout.trim().split('\n');return JSON.parse(lines.at(-1));
 };
 const node=runHost(process.env.UMF_NODE_PATH??'node','Node');
 const bun=runHost(process.env.UMF_BUN_PATH??'bun','Bun');
 assert.match(node.runtime,/^Node v26\./);assert.match(bun.runtime,/^Bun 1\.4\./);
 const dist=join(packageRoot,'dist'),browserBytes=await readFile(join(dist,'umf-browser.js')),wasmBytes=await readFile(join(dist,'umf_core_wasm_bg.wasm'));
 const pageHtml='<!doctype html><meta charset="utf-8"><script type="module">const canonical='+canonical.toString()+';try{const api=await import("/umf-browser.js"),packet=await(await fetch("/frozen.json")).json(),cases=[];for(const variant of ["nested","recursive","qualified"]){const declaration=packet.successes["declare-"+variant],declared=api.declareCoreRecordType(declaration.fieldAuthor,declaration.recordAuthor);if(canonical(declared)!==canonical(declaration))throw new Error("declare "+variant+" mismatch");const expected=packet.successes["verify-"+variant],verified=api.verifyCoreRecordTypeDeclaration(declared,declared.target);if(canonical(verified)!==canonical(expected))throw new Error("verify "+variant+" mismatch");cases.push(variant)}let currentTrapReads=0;const current=new Proxy(Object.create(null),{getPrototypeOf(){currentTrapReads++;return null},ownKeys(){currentTrapReads++;return[]},getOwnPropertyDescriptor(){currentTrapReads++;return undefined},get(){currentTrapReads++;return undefined}});let malformed;try{api.verifyCoreRecordTypeDeclaration({},current);malformed={ok:true}}catch(error){malformed={ok:false,error:{code:error?.code??"",message:error?.message??String(error),path:error?.path??""}}}malformed.currentReads=currentTrapReads;if(canonical(malformed)!==canonical(packet.refusals.malformedReceiptBeforeCurrent))throw new Error("malformed receipt/current order mismatch");if("process"in globalThis||"Buffer"in globalThis)throw new Error("Node globals present");window.result={cases,malformed,currentTrapReads,nodeGlobalsAbsent:true}}catch(error){window.failure=String(error?.stack??error)}</script>';
 const requests=[];server=createServer(async(req,res)=>{const name=new URL(req.url??'/','http://127.0.0.1').pathname.slice(1)||'index.html';requests.push(name);try{let bytes,type;if(name==='index.html'){bytes=Buffer.from(pageHtml);type='text/html'}else if(name==='frozen.json'){bytes=frozenBytes;type='application/json'}else{const file=resolve(dist,name);assert(file.startsWith(dist+'/'),'browser request escaped dist');bytes=await readFile(file);type=extname(name)==='.wasm'?'application/wasm':'text/javascript'}res.writeHead(200,{'content-type':type});res.end(bytes)}catch{res.writeHead(404);res.end('not found')}});
 await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));const address=server.address();assert(address&&typeof address!=='string');
 browser=await chromium.launch({headless:true,timeout:30000,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),errors=[],consoleErrors=[],pageRequests=[];page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())});page.on('request',request=>pageRequests.push(request.url()));
 await page.goto(`http://127.0.0.1:${address.port}/index.html`);await page.waitForFunction(()=>Boolean(window.result||window.failure),undefined,{timeout:30000});
 const chromiumResult=await page.evaluate(()=>({result:window.result??null,failure:window.failure??null,userAgent:navigator.userAgent}));assert.equal(chromiumResult.failure,null,chromiumResult.failure??'');assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
 assert.deepEqual(chromiumResult.result.cases,['nested','recursive','qualified']);assert.equal(chromiumResult.result.currentTrapReads,0);assert.equal(requests.includes('umf_core_wasm_bg.wasm'),true);
 const externalRequests=pageRequests.filter(url=>new URL(url).origin!==`http://127.0.0.1:${address.port}`);assert.deepEqual(externalRequests,[]);
 const receipt={format:'umf.r8.record-type-installed/1',status:'pass',qualification:'Installed private SDK archive Node/Bun/Chromium route evidence for Core Record Type v6 declare/verify only: three frozen cases per operation plus malformed-receipt-before-current Proxy admission. It does not establish full parity, retirement, other host routes, or release qualification.',archive:{path:archive,sha256:expectedArchiveSha,packageManifestSha256:sha(manifestBytes),verifiedMemberCount:memberNames.length,sourceClosureSha256:expectedClosureSha,sourceInputCount:Object.keys(closure.liveInputs).length,sourceTransformStatus:manifest.sourceTransformStatus,sourceTransformCount:manifest.sourceTransformCount},packageRoutes:{node:packageJson.exports['.'].node,browser:packageJson.exports['.'].browser,reference:referenceEntry},predecessor:{path:'docs/helix/04-build/evidence/rust-migration/r5-core-record-type/frozen-typescript.json',sha256:sha(frozenBytes),cases:['nested','recursive','qualified'],refusal:'malformedReceiptBeforeCurrent'},hosts:{node,bun,chromium:{version:browser.version(),userAgent:chromiumResult.userAgent,...chromiumResult.result,wasmRequested:requests.includes('umf_core_wasm_bg.wasm'),externalRequestCount:externalRequests.length,pageErrors:errors.length}},artifacts:{nodeEntrySha256:sha(await readFile(join(dist,'umf-node.js')),),browserEntrySha256:sha(browserBytes),wasmSha256:sha(wasmBytes),referenceEntrySha256:sha(await readFile(join(packageRoot,referenceEntry.replace('./',''))))}};
 await mkdir(join(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}finally{await browser?.close();server?.close();await rm(temp,{recursive:true,force:true});}
