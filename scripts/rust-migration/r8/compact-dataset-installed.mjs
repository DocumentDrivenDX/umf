// SPDX-License-Identifier: MIT OR Apache-2.0
// Installed-package replay for the Rust-selected compact Dataset validator.
// verifyCoreDatasetValuesCompact is deliberately excluded.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {extname,join,resolve,posix} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const archive=resolve(process.argv[2]??'');
const expectedClosure=process.argv[3]??'';
const output=process.argv[4]?resolve(process.argv[4]):null;
if(!process.argv[2]||!expectedClosure)throw new Error('Usage: bun scripts/rust-migration/r8/compact-dataset-installed.mjs <fixed-point-sdk.tgz> <expected-source-closure-sha256> [receipt.json]');
assert.match(expectedClosure,/^[0-9a-f]{64}$/);
const packet=join(repo,'docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact-default-cutover');
const indexBytes=await readFile(join(packet,'index.json'));
const index=JSON.parse(indexBytes);
const names=['frozen-commerce.json','frozen-supply-chain.json','frozen-archaeology.json','frozen-ecology.json','frozen-invalid-source-only.json','frozen-invalid-input-only.json','frozen-crossed-invalid-source-input.json','frozen-unknown-and-residual.json','frozen-absent-state.json','frozen-parallel-links.json','frozen-duplicate-key.json','frozen-missing-links.json','frozen-duplicate-locator.json','frozen-structural-limit.json','frozen-work-limit.json','frozen-near-threshold-accepted.json','frozen-near-threshold-first-refused.json'];
assert.deepEqual(index.files.slice(0,17),names,'frozen 17-case validation cohort');
const files={};for(const name of names)files[name]=JSON.parse(await readFile(join(packet,name),'utf8'));
const sha256=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(y=>[y,x[y]])):x);
const probe=(root,reference,files)=>{
 const canonical=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(y=>[y,x[y]])):x);
 const capture=fn=>{try{return {ok:true,value:fn()};}catch(e){return {ok:false,error:{name:e?.name??'',code:e?.code??'',message:e?.message??String(e),path:e?.path??''}};}};
 const run=api=>Object.fromEntries(Object.entries(files).map(([file,c])=>[file,capture(()=>api.validateCoreDatasetValuesCompact(c.source,c.input))]));
 const spoof=api=>{const reads=[],events=[],base=new Error('caller-provided failure');Object.defineProperties(base,{name:{value:'UmfCoreError'},code:{value:'CORE_DATASET_INPUT'},path:{value:'/input'}});const thrown=new Proxy(base,{get(t,k,r){if(['name','code','message','path'].includes(String(k)))reads.push(String(k));return Reflect.get(t,k,r);}});const input=new Proxy(structuredClone(files['frozen-commerce.json'].input),{ownKeys(){events.push('input-ownKeys');throw thrown;},getPrototypeOf(t){events.push('input-getPrototypeOf');return Reflect.getPrototypeOf(t);}});let caught;try{api.validateCoreDatasetValuesCompact(files['frozen-commerce.json'].source,input);}catch(e){caught=e;}return {sameThrownIdentity:caught===thrown,thrownPropertyReads:reads,events};};
 const trace=api=>{const events=[];const input=new Proxy(structuredClone(files['frozen-commerce.json'].input),{getPrototypeOf(t){events.push('getPrototypeOf');return Reflect.getPrototypeOf(t);},ownKeys(t){events.push('ownKeys');return Reflect.ownKeys(t);},getOwnPropertyDescriptor(t,k){events.push('descriptor:'+String(k));return Reflect.getOwnPropertyDescriptor(t,k);},get(t,k,r){events.push('get:'+String(k));return Reflect.get(t,k,r);}});const result=capture(()=>api.validateCoreDatasetValuesCompact(files['frozen-commerce.json'].source,input));return {result,events};};
 const copy=api=>{const source=structuredClone(files['frozen-commerce.json'].source),input=structuredClone(files['frozen-commerce.json'].input),result=api.validateCoreDatasetValuesCompact(source,input);const sourceBefore=canonical(source),inputBefore=canonical(input);result.source.copyProbe=true;result.input.context='mutated-result-copy';const resultCopyIsolation={source:canonical(source)===sourceBefore,input:canonical(input)===inputBefore};source.umf='mutated-original';input.context='mutated-original';return {resultCopyIsolation,originalCopyIsolation:canonical(result.source)!==canonical(source)&&canonical(result.input)!==canonical(input)};};
 return {installed:run(root),reference:run(reference),installedSpoof:spoof(root),referenceSpoof:spoof(reference),installedTrace:trace(root),referenceTrace:trace(reference),installedCopy:copy(root),referenceCopy:copy(reference),exports:{validate:typeof root.validateCoreDatasetValuesCompact,verify:typeof root.verifyCoreDatasetValuesCompact}};
};
const temp=join(tmpdir(),'umf-r8-compact-dataset-'+process.pid+'-'+Date.now());let browser,server;
const stage=name=>console.error(`[compact-dataset-installed] ${name}`);
const bounded=async(promise,label,ms)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out after ${ms}ms`)),ms);})]);}finally{clearTimeout(timer);}};
const run=async(command,args,cwd=temp)=>{
 const p=Bun.spawn([command,...args],{cwd,stdout:'pipe',stderr:'pipe'});
 const output=Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text()]);
 let timer;try{
  const [code,[stdout,stderr]]=await Promise.race([
   Promise.all([p.exited,output]),
   new Promise((_,reject)=>{timer=setTimeout(()=>{p.kill();reject(new Error(`${command} ${args.join(' ')} timed out after 300000ms`));},300_000);})
  ]);
  return {code,stdout:stdout.trim(),stderr:stderr.trim()};
 }catch(error){
  p.kill();
  await Promise.race([p.exited,new Promise(resolve=>setTimeout(resolve,5_000))]);
  throw error;
 }finally{clearTimeout(timer);}
};
const pass=(r,label)=>assert.equal(r.code,0,`${label} failed (${r.code})\n${r.stdout}\n${r.stderr}`);
try{
 const archiveBytes=await readFile(archive);assert.ok(archiveBytes.length);stage(`archive checked (${archiveBytes.length} bytes)`);
 await mkdir(temp,{recursive:true});const listing=await run('tar',['-tzf',archive]);pass(listing,'archive listing');
 for(const member of listing.stdout.split('\n').filter(Boolean)){const n=posix.normalize(member);assert.ok(!member.startsWith('/')&&!n.startsWith('../')&&!n.split('/').includes('..'),`unsafe member ${member}`);}
 const packageRoot=join(temp,'node_modules/@umf/core');await mkdir(packageRoot,{recursive:true});pass(await run('tar',['-xzf',archive,'--strip-components=1','-C',packageRoot]),'archive extraction');stage('archive extracted');
 const manifest=JSON.parse(await readFile(join(packageRoot,'manifest.json'))),sdk=JSON.parse(await readFile(join(packageRoot,'dist/rust-default-manifest.json'))),pkg=JSON.parse(await readFile(join(packageRoot,'package.json')));
 assert.equal(manifest.profile,'umf.sdk.distribution.rust-default/1');assert.match(manifest.releaseStatus,/private.*qualification/i);assert.equal(manifest.sourceTransformStatus,'fixed-point');assert.equal(manifest.sourceTreeSha256,expectedClosure);assert.equal(manifest.sourceTreeSha256,sdk.sourceClosure.sha256);assert.equal(manifest.sourceTreeSha256,manifest.capturedLiveSourceTreeSha256);
 assert.equal(pkg.exports['.'].node,'./dist/umf-node.js');assert.equal(pkg.exports['.'].browser,'./dist/umf-browser.js');assert.equal(pkg.exports['./reference'].import,'./dist/umf.js');
 for(const [member,digest] of Object.entries(manifest.sha256))assert.equal(sha256(await readFile(join(packageRoot,member))),digest,`archive member hash ${member}`);
 stage(`archive members verified (${Object.keys(manifest.sha256).length})`);
 const probeSource=`import * as root from '@umf/core';import * as reference from '@umf/core/reference';import {readFile} from 'node:fs/promises';const files=JSON.parse(await readFile('./frozen.json','utf8'));const probe=${probe.toString()};const result=probe(root,reference,files);console.log(JSON.stringify({runtime:typeof Bun==='undefined'?'Node '+process.version:'Bun '+Bun.version,...result}));`;
 await writeFile(join(temp,'probe.mjs'),probeSource);await writeFile(join(temp,'frozen.json'),JSON.stringify(files));
 const node=await run('node',['probe.mjs']);pass(node,'Node replay');stage('Node replay passed');const bun=await run('bun',['probe.mjs']);pass(bun,'Bun replay');stage('Bun replay passed');const nr=JSON.parse(node.stdout),br=JSON.parse(bun.stdout);
 const expected={};for(const [file,c] of Object.entries(files))expected[file]=c.result!==undefined?{ok:true,value:c.result}:{ok:false,error:{name:'UmfError',code:c.thrown.code,message:c.thrown.message,path:c.thrown.path??''}};
 for(const [label,r] of [['Node',nr],['Bun',br]]){assert.equal(r.exports.validate,'function');assert.equal(canonical(r.installed),canonical(expected),`${label} frozen predecessor cases`);assert.equal(canonical(r.reference),canonical(expected),`${label} installed reference control`);assert.deepEqual(r.installedSpoof,r.referenceSpoof);assert.equal(r.installedSpoof.sameThrownIdentity,true,`${label} caller failure identity`);assert.deepEqual(r.installedSpoof.thrownPropertyReads,[],`${label} no caller error field inspection`);assert.deepEqual(r.installedTrace,r.referenceTrace);assert.deepEqual(r.installedCopy,{resultCopyIsolation:{source:true,input:true},originalCopyIsolation:true});assert.deepEqual(r.installedCopy,r.referenceCopy);}
 assert.equal(canonical(nr.installed),canonical(br.installed),'Node/Bun outcome parity');assert.deepEqual(nr.installedSpoof,br.installedSpoof);assert.deepEqual(nr.installedTrace,br.installedTrace);assert.deepEqual(nr.installedCopy,br.installedCopy);
 const browserProbe=`import * as root from '@umf/core';import * as reference from '@umf/core/reference';const files=await(await fetch('/frozen.json')).json();const probe=${probe.toString()};window.replay=probe(root,reference,files);if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw Error('Node global leaked into browser');`;
 const html=`<!doctype html><meta charset="utf-8"><script type="importmap">${JSON.stringify({imports:{'@umf/core':'/node_modules/@umf/core/dist/umf-browser.js','@umf/core/reference':'/node_modules/@umf/core/dist/umf.js'}})}</script><script type="module" src="/probe-browser.js"></script>`;
 const errors=[],requests=[];let rejectBrowserFailure;const browserFailure=new Promise((_,reject)=>{rejectBrowserFailure=reject;});void browserFailure.catch(()=>{});server=createServer(async(req,res)=>{const u=new URL(req.url??'/','http://localhost');requests.push(u.pathname);if(u.pathname==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return;}if(u.pathname==='/probe-browser.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(browserProbe);return;}if(u.pathname==='/frozen.json'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(files));return;}try{const b=await readFile(join(temp,u.pathname.slice(1)));res.writeHead(200,{'content-type':extname(u.pathname)==='.wasm'?'application/wasm':extname(u.pathname)==='.js'?'text/javascript':'application/octet-stream'});res.end(b);}catch{res.writeHead(404);res.end();}});
 await bounded(new Promise((ok,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',ok);}), 'loopback server startup',10_000);const addr=server.address();assert(addr&&typeof addr!=='string');stage('browser phase starting');
 browser=await chromium.launch({headless:true,timeout:30_000,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();page.on('pageerror',e=>{const message=String(e);errors.push(message);rejectBrowserFailure(new Error(`Chromium pageerror: ${message}`));});page.on('requestfailed',request=>{const url=request.url();if(url.startsWith(`http://127.0.0.1:${addr.port}/`)){const message=`${url}: ${request.failure()?.errorText??'request failed'}`;errors.push(message);rejectBrowserFailure(new Error(`Chromium local resource request failed: ${message}`));}});page.on('response',response=>{const url=response.url();if(url.startsWith(`http://127.0.0.1:${addr.port}/`)&&response.status()>=400){const message=`${url}: HTTP ${response.status()}`;errors.push(message);rejectBrowserFailure(new Error(`Chromium local resource request failed: ${message}`));}});
 await Promise.race([bounded(page.goto(`http://127.0.0.1:${addr.port}/`,{timeout:30_000}), 'Chromium page navigation',30_000),browserFailure]);
 await Promise.race([page.waitForFunction(()=>Boolean(window.replay),undefined,{timeout:300_000}),browserFailure]);
 const cr=await Promise.race([bounded(page.evaluate(()=>({replay:window.replay,userAgent:navigator.userAgent})), 'Chromium result evaluation',10_000),browserFailure]);stage('browser phase completed');assert.deepEqual(errors,[]);assert.equal(canonical(cr.replay.installed),canonical(nr.installed),'Chromium/Node result parity');assert.deepEqual(cr.replay.installedSpoof,nr.installedSpoof);assert.deepEqual(cr.replay.installedTrace,nr.installedTrace);assert.equal(canonical(cr.replay.reference),canonical(nr.reference));assert(requests.includes('/node_modules/@umf/core/dist/umf_core_wasm_bg.wasm'),'real browser loaded WASM');
 const receipt={format:'umf.r8.compact-dataset-installed/1',status:'pass',qualification:'Private archive qualification for validateCoreDatasetValuesCompact only. verifyCoreDatasetValuesCompact was not exercised.',archive:{sha256:sha256(archiveBytes),bytes:archiveBytes.length,closureSha256:manifest.sourceTreeSha256,manifestSha256:sha256(await readFile(join(packageRoot,'manifest.json'))),verifiedMembers:Object.keys(manifest.sha256).length},predecessor:{format:index.format,indexSha256:sha256(indexBytes),sourceRouting:index.publicRouting,caseCount:names.length,cases:names},runtimes:{node:nr.runtime,bun:br.runtime,chromium:{version:browser.version(),userAgent:cr.userAgent}},observations:{frozenCases:'passed',sourceAndInputAdmission:'passed',sourceAndInputCopies:'passed',callerProxyThrownIdentity:'passed',callerErrorPropertiesRead:0,hostProxyTrapSequence:'compared with reference',structuralAndWorkLimits:'passed',nearThreshold349350:'passed through frozen accepted/refused pair',nodeBunChromiumParity:'passed',verifyCoreDatasetValuesCompact:'out-of-scope'}};
 if(output){await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(receipt,null,2)+'\n');}console.log(JSON.stringify(receipt,null,2));
}finally{
 if(browser)await bounded(browser.close(),'Chromium shutdown',10_000).catch(error=>stage(`cleanup warning: ${error.message}`));
 if(server){server.closeAllConnections();await bounded(new Promise(done=>server.close(done)),'loopback server shutdown',5_000).catch(error=>stage(`cleanup warning: ${error.message}`));}
 await bounded(rm(temp,{recursive:true,force:true}),'temporary directory cleanup',10_000).catch(error=>stage(`cleanup warning: ${error.message}`));
}
