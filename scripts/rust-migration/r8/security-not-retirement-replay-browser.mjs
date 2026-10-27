// SPDX-License-Identifier: MIT OR Apache-2.0
// Capture the exact CONTRACT-062 securityNot packet through the installed browser route.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {extname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';

const archive=resolve(process.argv[2]??''),out=resolve(process.argv[3]??'');
if(!process.argv[2]||!process.argv[3])throw new Error('Usage: bun scripts/rust-migration/r8/security-not-retirement-replay-browser.mjs <umf-sdk.tgz> <receipt.json>');
const cohortId=process.platform==='darwin'&&process.arch==='arm64'?'darwin-arm64':process.platform==='linux'&&process.arch==='x64'?'linux-x86_64':null;
if(!cohortId)throw new Error(`Unsupported retirement host cohort: ${process.platform}/${process.arch}`);
const hostPlatform={os:process.platform,arch:process.arch},hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const canonical=value=>JSON.stringify(stable(value));
const packetBytes=await readFile(resolve('scripts/rust-migration/r8/security-not-retirement-packet.json')),packet=JSON.parse(packetBytes);
assert.equal(packet.format,'umf.r8.default-route-retirement-packet/3');assert.equal(packet.cases.length,14);
const temp=await mkdtemp(join(tmpdir(),'umf-r8-security-not-retirement-browser-')),pkg=join(temp,'node_modules/@umf/core');
const run=(command,args)=>{const child=spawnSync(command,args,{cwd:temp,encoding:'utf8'});if(child.error)throw child.error;if(child.status!==0)throw new Error(`${command} failed (${child.status}): ${child.stdout}\n${child.stderr}`);};
try{
 await mkdir(pkg,{recursive:true});await run('tar',['-xzf',archive,'--strip-components=1','-C',pkg]);
 const manifest=JSON.parse(await readFile(join(pkg,'manifest.json'),'utf8'));for(const [name,digest] of Object.entries(manifest.sha256))assert.equal(hash(await readFile(join(pkg,name))),digest,`archive member ${name}`);
 const sourceManifest=JSON.parse(await readFile(join(pkg,'dist/rust-default-manifest.json'),'utf8')),closure=sourceManifest.sourceClosure;
 assert.equal(closure.transform.status,'fixed-point');assert.deepEqual(closure.transform.generatedInputs,[]);assert.equal(closure.sha256,closure.capturedLiveSha256);
 const browserBytes=await readFile(join(pkg,'dist/umf-browser.js')),referenceBytes=await readFile(join(pkg,'dist/umf.js')),wasmBytes=await readFile(join(pkg,'dist/umf_core_wasm_bg.wasm'));
 await writeFile(join(temp,'umf-browser.js'),browserBytes);await writeFile(join(temp,'umf.js'),referenceBytes);await writeFile(join(temp,'umf_core_wasm_bg.wasm'),wasmBytes);await writeFile(join(temp,'packet.json'),packetBytes);await writeFile(join(temp,'index.html'),'<!doctype html><meta charset="utf-8"><title>securityNot installed replay</title>');
 const allowed=new Set(['index.html','umf-browser.js','umf.js','umf_core_wasm_bg.wasm','packet.json']),mime={'.js':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html'};
 const requests=[],server=createServer(async(req,res)=>{try{const name=new URL(req.url??'/', 'http://127.0.0.1').pathname.slice(1)||'index.html';if(!allowed.has(name))throw Error('not found');requests.push(name);res.writeHead(200,{'content-type':mime[extname(name)]??'application/octet-stream'});res.end(await readFile(join(temp,name)));}catch{res.writeHead(404);res.end('not found');}});
 await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));let browser;
 try{
  browser=await chromium.launch({headless:true,timeout:30000,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();const pageErrors=[];page.on('pageerror',error=>pageErrors.push(String(error)));
  await page.addInitScript(()=>{
   globalThis.__umfSecurityNotRustCalls=0;
   const wrap=result=>{const instance=result?.instance??result;if(!instance?.exports)return result;const exports=Object.create(null);for(const key of Reflect.ownKeys(instance.exports)){const value=Reflect.get(instance.exports,key);exports[key]=key==='securityNotScalar'&&typeof value==='function'?function(...args){globalThis.__umfSecurityNotRustCalls++;return value.apply(instance.exports,args);}:value;}const proxied={exports};return result?.instance?{...result,instance:proxied}:proxied;};
   const instantiate=WebAssembly.instantiate.bind(WebAssembly);WebAssembly.instantiate=(...args)=>Promise.resolve(instantiate(...args)).then(wrap);
   if(typeof WebAssembly.instantiateStreaming==='function'){const streaming=WebAssembly.instantiateStreaming.bind(WebAssembly);WebAssembly.instantiateStreaming=(...args)=>Promise.resolve(streaming(...args)).then(wrap);}
  });
  const address=server.address();assert(address&&typeof address!=='string');await page.goto(`http://127.0.0.1:${address.port}/`);
  const result=await page.evaluate(async()=>{
   const defaults=await import('/umf-browser.js'),reference=await import('/umf.js'),packet=await(await fetch('/packet.json')).json();
   const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value,canonical=value=>JSON.stringify(stable(value));
   const input=(id,trace)=>{switch(id){case'T':return'T';case'F':return'F';case'U':return'U';case'null':return null;case'number':return 1;case'boolean':return true;case'unknown-string':return'X';case'array':return[];case'object':return{};case'null-prototype':return Object.create(null);case'accessor':return Object.defineProperty({},'member',{enumerable:true,get(){trace.push('getter');return'T';}});case'proxy-ownKeys':return new Proxy({}, {ownKeys(){trace.push('ownKeys');throw Error('ownKeys trap');}});case'proxy-getPrototype':return new Proxy({}, {getPrototypeOf(){trace.push('getPrototypeOf');throw Error('prototype trap');}});case'proxy-get':return new Proxy({}, {get(){trace.push('get');return'T';}});default:throw Error(`unknown case ${id}`);}};
   const outcome=(fn,value,trace)=>{try{return{kind:'return',value:fn(value),trace};}catch(error){return{kind:'throw',name:error.name,constructor:error.constructor?.name??null,code:error.code??null,message:String(error.message),path:error.path??null,trace};}};
   const cases=[];for(const item of packet.cases){const trace=[];globalThis.__umfSecurityNotRustCalls=0;const defaultOutcome=outcome(defaults.securityNot,input(item.id,trace),trace),defaultCalls=globalThis.__umfSecurityNotRustCalls;if(canonical(defaultOutcome)!==canonical(item.expectedOutcome)||canonical(trace)!==canonical(item.expectedTrace)||defaultCalls!==item.expectedDefaultRustCalls)throw Error(`${item.id} default outcome/trace/dispatch mismatch ${JSON.stringify({defaultOutcome,trace,defaultCalls})}`);const referenceTrace=[];globalThis.__umfSecurityNotRustCalls=0;const referenceOutcome=outcome(reference.securityNot,input(item.id,referenceTrace),referenceTrace),referenceCalls=globalThis.__umfSecurityNotRustCalls;if(canonical(referenceOutcome)!==canonical(item.expectedOutcome)||canonical(referenceTrace)!==canonical(item.expectedTrace)||referenceCalls!==0)throw Error(`${item.id} reference outcome/trace/dispatch mismatch`);cases.push({id:item.id,defaultOutcome,defaultTrace:trace,defaultRustCalls:defaultCalls,referenceOutcome,referenceTrace,referenceRustCalls:referenceCalls});}
   return{cases,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis),userAgent:navigator.userAgent};
  });
  assert.deepEqual(pageErrors,[]);assert.equal(result.nodeGlobalsAbsent,true);assert(requests.includes('umf_core_wasm_bg.wasm'),'browser route did not load the packaged WASM member');
  const archiveBytes=await readFile(archive),receipt={format:'umf.r8.default-route-retirement-host-receipt/3',status:'pass',runtime:'chromium',hostVersion:browser.version(),cohortId,hostPlatform,archiveSha256:hash(archiveBytes),sourceClosureSha256:closure.sha256,packetSha256:hash(packetBytes),defaultRoute:{routeId:'package-root-browser',entryMember:'dist/umf-browser.js',entrySha256:hash(browserBytes),artifactMembers:[{path:'dist/umf_core_wasm_bg.wasm',sha256:hash(wasmBytes)}]},referenceRoute:{routeId:'package-reference',entryMember:'dist/umf.js',entrySha256:hash(referenceBytes),artifactMembers:[]},cases:result.cases};
  await mkdir(resolve(out,'..'),{recursive:true});await writeFile(out,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:'pass',runtime:'chromium',hostVersion:receipt.hostVersion,cohortId,cases:receipt.cases.length,rustCalls:receipt.cases.map(c=>c.defaultRustCalls),nodeGlobalsAbsent:result.nodeGlobalsAbsent}));
 }finally{await browser?.close();server.close();}
}finally{await rm(temp,{recursive:true,force:true});}
