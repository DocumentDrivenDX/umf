// SPDX-License-Identifier: MIT OR Apache-2.0
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';

const archive=resolve(process.argv[2]??'');
if(!process.argv[2])throw new Error('Usage: bun scripts/test-sdk-rust-preview.ts <preview.tgz>');
const scratch=await mkdtemp(join(tmpdir(),'umf-rust-sdk-preview-test-'));
const testStarted=Date.now();
const install=join(scratch,'node_modules/@umf/core');
const original=await readFile('tests/unified/commerce.json','utf8');
const corpus=JSON.parse(await readFile('docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json','utf8')) as {cases:{id:string;operation:string;request:unknown;expected:unknown}[]};
const canonical=(value:unknown):string=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
function assert(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message)}
async function run(command:string[],cwd=scratch){
 const child=Bun.spawn(command,{cwd,stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);
 const code=await child.exited;
 if(code!==0)throw new Error(`${command.join(' ')} failed (${code})\n${stdout}\n${stderr}`);
 return stdout.trim();
}
try{
 await mkdir(install,{recursive:true});
 await run(['tar','-xzf',archive,'--strip-components=1','-C',install]);
 const manifest=JSON.parse(await readFile(join(install,'dist/rust-preview-manifest.json'),'utf8')) as {format:string;releaseStatus:string;defaultRouteSource:string;api:{entry:string};platform:{os:string;arch:string};resources:{count:number};sourceClosure:{sha256:string;fileCount:number;inputs:Record<string,string>};assets:Record<string,string>};
 assert(manifest.format==='umf.r7-rust-sdk-preview/1'&&manifest.releaseStatus==='preview-only-not-default','preview manifest identity/status mismatch');
 assert(manifest.api.entry==='.'&&manifest.defaultRouteSource.includes('root-entry review candidate'),'candidate archive root route mismatch');
 assert(manifest.resources.count===9,'fixed resource count mismatch');
 for(const path of ['scripts/test-sdk-rust-preview.ts','docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json','tests/unified/commerce.json']){
  const actual=await Bun.CryptoHasher.hash('sha256',await readFile(path),'hex');
  assert(actual===manifest.sourceClosure.inputs[path],`installed replay input differs from frozen source closure: ${path}`);
 }
 for(const [path,hash] of Object.entries(manifest.assets)){
  const bytes=await readFile(join(install,path));
  const actual=await Bun.CryptoHasher.hash('sha256',bytes,'hex');
  assert(actual===hash,`asset closure hash mismatch: ${path}`);
 }
 const archiveMembers=(await run(['tar','-tzf',archive])).split('\n').filter(Boolean).map(path=>path.replace(/^package\//,''));
 const expectedMembers=new Set([...Object.keys(manifest.assets),'dist/rust-preview-manifest.json','package.json']);
 assert(archiveMembers.length===expectedMembers.size&&archiveMembers.every(path=>expectedMembers.has(path)),`archive has an unmanifested or missing member: ${archiveMembers.filter(path=>!expectedMembers.has(path)).join(', ')}`);
 const fixture=join(scratch,'commerce.json');await writeFile(fixture,original);
 const corpusFile=join(scratch,'operations.json');await writeFile(corpusFile,JSON.stringify(corpus));
 const legacyEntry=`file://${join(install,'dist/umf.js')}`;
 const smoke=`import {readFile} from 'node:fs/promises';
import * as root from '@umf/core';
const legacy=await import(${JSON.stringify(legacyEntry)});
const canonical=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
if(JSON.stringify(Object.keys(root).sort())!==JSON.stringify(Object.keys(legacy).sort()))throw new Error('root export set changed');
const frozen=JSON.parse(await readFile(new URL('./operations.json',import.meta.url),'utf8'));
const cases=frozen.cases.filter(item=>item.operation==='generatePythonClient');
for(const item of cases){let observed;try{const result=root.generatePythonClient(item.request);if(result&&typeof result.then==='function')throw new Error('root generator is asynchronous');observed={ok:true,result}}catch(error){observed={ok:false,error:{code:error.code,message:error.message,path:error.path}}}if(canonical(observed)!==canonical(item.expected))throw new Error('R3 root replay mismatch: '+item.id)}
const request={text:await readFile(new URL('./commerce.json',import.meta.url),'utf8'),package:'shop'};
const expected=legacy.generatePythonClient(request),actual=root.generatePythonClient(request);
if(actual&&typeof actual.then==='function'||canonical(actual)!==canonical(expected))throw new Error('Node root-entry output mismatch or asynchronous API');
let touched=0,caught;try{root.generatePythonClient({...request,records:new Proxy(new Array(10001),{get(target,key,receiver){if(typeof key==='string'&&/^\\d+$/.test(key))touched++;return Reflect.get(target,key,receiver)}})})}catch(error){caught=error}
if(touched!==0||caught?.code!=='RESOURCE_LIMIT'||caught?.path!=='/records'||caught?.message!=='V4 host-read resource limit exceeded')throw new Error('Node root raw-position control failed');
let single;try{root.generatePythonClient({...request,records:[{module:'x'.repeat(4_000_000),element:''}]})}catch(error){single=error}
if(single?.code!=='RESOURCE_LIMIT'||single?.path!=='/records'||single?.message!=='V4 host-read resource limit exceeded')throw new Error('Node root single-identity budget control failed');
console.log(JSON.stringify({files:actual.files.length,synchronous:true,r3Cases:cases.length,exports:Object.keys(root).length,rawLimit:caught.code,singleIdentityLimit:single.path,node:process.version,bun:typeof Bun==='undefined'?undefined:Bun.version}));`;
 const smokeFile=join(scratch,'smoke.mjs');await writeFile(smokeFile,smoke);
 const node=await run(['node',smokeFile]);
 console.log(JSON.stringify({stage:'node-r3-replay',elapsedMs:Date.now()-testStarted}));
 const bun=await run(['bun',smokeFile]);
 console.log(JSON.stringify({stage:'bun-r3-replay',elapsedMs:Date.now()-testStarted}));
 const nodeEntry=JSON.parse(node) as {files:number;synchronous:boolean;node?:string;bun?:string};
 const bunEntry=JSON.parse(bun) as {files:number;synchronous:boolean;node?:string;bun?:string};
 assert(nodeEntry.synchronous&&bunEntry.synchronous&&nodeEntry.files===7&&bunEntry.files===7,'Node/Bun generated output mismatch');

 const missing=join(scratch,'missing');const missingPackage=join(missing,'node_modules/@umf/core');await mkdir(missingPackage,{recursive:true});
 await run(['tar','-xzf',archive,'--strip-components=1','-C',missingPackage]);
 await rm(join(missingPackage,'dist/umf_core_node.node'));
 for(const runtime of ['node','bun']){
  const probe=join(missing,`${runtime}-missing.mjs`);
  await writeFile(probe,`let failed=false;try{await import('@umf/core')}catch{failed=true}if(!failed)throw new Error('missing native addon silently loaded');const legacy=await import(${JSON.stringify(`file://${join(missingPackage,'dist/umf.js')}`)});if(typeof legacy.generatePythonClient!=='function')throw new Error('preserved TypeScript entry disappeared');`);
  await run([runtime,probe],missing);
 }

 const server=Bun.serve({port:0,async fetch(request){
  const url=new URL(request.url);let path=url.pathname;
  const corrupt=path.startsWith('/corrupt/'),missingAsset=path.startsWith('/missing/');
  if(corrupt)path=path.slice('/corrupt'.length);else if(missingAsset)path=path.slice('/missing'.length);
  const relativePath=path==='/'?'index.html':path.slice(1);
  if(relativePath==='index.html')return new Response('<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"@umf/core":"/dist/umf-rust-codegen-preview-v4-browser.js"}}</script><script type="module" src="/browser-check.js"></script>',{headers:{'content-type':'text/html'}});
  if(relativePath==='browser-check.js')return new Response(browserCheck,{headers:{'content-type':'text/javascript'}});
  if(relativePath==='commerce.json')return new Response(original,{headers:{'content-type':'application/json'}});
  if(relativePath==='operations.json')return new Response(JSON.stringify(corpus),{headers:{'content-type':'application/json'}});
  const target=join(install,relativePath);
  try{
   if(missingAsset&&relativePath.endsWith('.wasm'))return new Response('not found',{status:404});
   const bytes=await readFile(target);
   if(corrupt&&relativePath.endsWith('.wasm'))return new Response(new Uint8Array([0,1,2,3]),{headers:{'content-type':'application/wasm'}});
   const type=relativePath.endsWith('.wasm')?'application/wasm':relativePath.endsWith('.js')?'text/javascript':'application/octet-stream';
   return new Response(bytes,{headers:{'content-type':type}});
  }catch{return new Response('not found',{status:404})}
 }});
 const browserCheck=`import * as root from '@umf/core';
import * as legacy from '/dist/umf.js';
const canonical=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
if(JSON.stringify(Object.keys(root).sort())!==JSON.stringify(Object.keys(legacy).sort()))throw new Error('browser root export set changed');
const corpus=await(await fetch('/operations.json')).json();const cases=corpus.cases.filter(item=>item.operation==='generatePythonClient');
for(const item of cases){let observed;try{const result=root.generatePythonClient(item.request);if(result&&typeof result.then==='function')throw new Error('root generator is asynchronous');observed={ok:true,result}}catch(error){observed={ok:false,error:{code:error.code,message:error.message,path:error.path}}}if(canonical(observed)!==canonical(item.expected))throw new Error('browser R3 root replay mismatch: '+item.id)}
const text=await(await fetch('/commerce.json')).text();const request={text,package:'shop'};const out=root.generatePythonClient(request);
if(out&&typeof out.then==='function'||canonical(out)!==canonical(legacy.generatePythonClient(request)))throw new Error('browser root-entry output mismatch');
let touched=0,caught;try{root.generatePythonClient({...request,actions:new Proxy(new Array(1001),{get(target,key,receiver){if(typeof key==='string'&&/^\\d+$/.test(key))touched++;return Reflect.get(target,key,receiver)}})})}catch(error){caught=error}
if(touched!==0||caught?.code!=='RESOURCE_LIMIT'||caught?.path!=='/actions')throw new Error('browser root action raw-limit control failed');
let single;try{root.generatePythonClient({...request,records:[{module:'x'.repeat(4_000_000),element:''}]})}catch(error){single=error}
if(single?.code!=='RESOURCE_LIMIT'||single?.path!=='/records'||single?.message!=='V4 host-read resource limit exceeded')throw new Error('browser root single-identity budget control failed');
window.browserRootResult={files:out.files.length,synchronous:true,r3Cases:cases.length,exports:Object.keys(root).length,rawLimit:caught.code,singleIdentityLimit:single.path};`;
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();const external:string[]=[];const pageErrors:string[]=[];const browserLogs:string[]=[];const requests:string[]=[];const badResponses:string[]=[];page.on('request',request=>{requests.push(request.url());if(!request.url().startsWith(server.url.href))external.push(request.url())});page.on('response',response=>{if(response.status()>=400)badResponses.push(`${response.status()} ${response.url()}`)});page.on('pageerror',error=>pageErrors.push(error.stack??error.message));page.on('console',message=>{if(message.type()==='error')browserLogs.push(message.text())});
  await page.goto(server.url.href);try{await page.waitForFunction(()=>Boolean((window as unknown as {browserRootResult?:unknown}).browserRootResult),undefined,{timeout:600000})}catch{throw new Error(`Browser root import failed: ${pageErrors.join('\n')} ${browserLogs.join('\n')} bad=${badResponses.join(',')} requests=${requests.join(',')}`)}
  const result=await page.evaluate(()=> (window as unknown as {browserRootResult:{files:number;synchronous:boolean;r3Cases:number;exports:number;rawLimit:string;singleIdentityLimit:string}}).browserRootResult);
  assert(result.files===7&&result.synchronous&&result.r3Cases===31&&result.exports>0&&result.rawLimit==='RESOURCE_LIMIT'&&result.singleIdentityLimit==='/records'&&external.length===0,'browser root parity, frozen replay, sync, resource limit, or network boundary failed');
  const corrupt=await page.evaluate(async()=>{
   const modulePath='/corrupt/dist/umf-rust-codegen-preview-v4-browser.js';
   try{await import(modulePath);return false}catch{return true}
  });
  assert(corrupt,'corrupt browser WASM did not reject module initialization');
  const missingWasm=await page.evaluate(async()=>{
   const missingPath:string='/missing/dist/umf-rust-codegen-preview-v4-browser.js';
   try{await import(missingPath);return false}catch{return true}
  });
  assert(missingWasm,'missing browser WASM did not reject module initialization');
  console.log(JSON.stringify({archive:archive.split('/').at(-1),platform:manifest.platform,node:nodeEntry.node,bun:bunEntry.bun,browser:`Chromium ${browser.version()}`,files:result.files,missingNativeRefused:true,corruptWasmRefused:true,assetCount:Object.keys(manifest.assets).length,archiveMemberCount:archiveMembers.length,totalElapsedMs:Date.now()-testStarted}));
 }finally{await browser.close();server.stop(true)}
}finally{await rm(scratch,{recursive:true,force:true});}
