// SPDX-License-Identifier: MIT OR Apache-2.0
// Installed archive replay for the frozen V4 securityAnd/securityOr cohort.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve,extname} from 'node:path';
import {chromium} from 'playwright';

const args=process.argv.slice(2);
if(args.length!==4||args.some(value=>!value))throw new Error('usage: security-and-or-installed-replay.mjs <installed-package-root> <archive.tgz> <predecessor.json> <receipt.json>');
const [installArg,archiveArg,packetArg,receiptArg]=args;
const install=resolve(installArg),archive=resolve(archiveArg),packetPath=resolve(packetArg),receiptPath=resolve(receiptArg);
const repoRoot=resolve(import.meta.dirname,'../../..');
const expectedPacketPath=join(repoRoot,'docs/helix/04-build/evidence/rust-migration/r8-security-and-or-v4-source-replay/predecessor.json');
assert.equal(packetPath,expectedPacketPath,'security replay must use the pinned predecessor packet');
const packetBytes=await readFile(packetPath);
const packetSha256=createHash('sha256').update(packetBytes).digest('hex');
const expectedPacketSha256='d5dddb6766cadd5f9e3c45ef40f7d9fc8d5d486d59d3163b236477ef6966308d';
assert.equal(packetSha256,expectedPacketSha256,'frozen 68-case predecessor packet changed');
const packet=JSON.parse(packetBytes);
assert.equal(packet.format,'umf-r8-security-and-or-predecessor/1');
assert.equal(packet.cases.length,68);
const packageBuildManifest=JSON.parse(await readFile(join(install,'dist/rust-default-manifest.json'),'utf8'));
const sourceInputs=packageBuildManifest.sourceClosure?.inputs;
assert(sourceInputs&&typeof sourceInputs==='object','installed archive lacks its source input hash map');
for(const inputPath of ['scripts/rust-migration/r8/security-and-or-installed-replay.mjs','docs/helix/04-build/evidence/rust-migration/r8-security-and-or-v4-source-replay/predecessor.json']){
 const expected=sourceInputs[inputPath];assert(typeof expected==='string',`installed archive source closure omits ${inputPath}`);
 const actual=createHash('sha256').update(await readFile(join(repoRoot,inputPath))).digest('hex');assert.equal(actual,expected,`installed archive source closure differs for ${inputPath}`);
}
const archiveSha256=createHash('sha256').update(await readFile(archive)).digest('hex');
const expectedArchiveSha256=process.env.UMF_EXPECTED_SECURITY_ARCHIVE_SHA256;
if(expectedArchiveSha256)assert.equal(archiveSha256,expectedArchiveSha256,'installed security replay archive differs from selected cohort');
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);

function input(spec,trace){
 switch(spec.kind){
  case'values':return spec.values;case'null':return null;case'number':return 1;case'boolean':return true;case'string':return'T';case'object':return{};case'null-prototype':return Object.create(null);
  case'accessor-index':{const value=[];Object.defineProperty(value,'0',{enumerable:true,get(){trace.push('getter:index');return'T'}});value.length=1;return value;}
  case'accessor-child':{const child=Object.defineProperty({},'member',{enumerable:true,get(){trace.push('getter:member');return'T'}});return['X',child];}
  case'sparse':{const value=[];value.length=1;return value;}
  case'extra-array-key':return Object.assign(['T'],{extra:'F'});
  case'custom-array-prototype':{const value=['T'];Object.setPrototypeOf(value,{});return value;}
  case'symbol-array-key':{const value=['T'];value[Symbol('extra')]='F';return value;}
  case'number-nan':return['T',Number.NaN];case'number-negative-zero':return['T',-0];
  case'proxy-ownKeys':return new Proxy(['T'],{ownKeys(){trace.push('ownKeys');throw new Error('proxy ownKeys trap')}});
  case'proxy-getPrototype':return new Proxy(['T'],{getPrototypeOf(){trace.push('getPrototypeOf');throw new Error('proxy getPrototypeOf trap')}});
  case'proxy-descriptor':return new Proxy(['T'],{ownKeys(target){trace.push('ownKeys');return Reflect.ownKeys(target)},getOwnPropertyDescriptor(target,key){trace.push(`descriptor:${String(key)}`);return Reflect.getOwnPropertyDescriptor(target,key)}});
  case'proxy-get':return new Proxy(['T'],{get(target,key,receiver){trace.push(`get:${String(key)}`);return Reflect.get(target,key,receiver)}});
  default:throw new Error(`unknown input kind ${spec.kind}`);
 }
}
function outcome(fn,value,trace){try{return{kind:'return',value:fn(value),trace}}catch(error){return{kind:'throw',name:error.name,constructor:error.constructor?.name??null,code:error.code??null,message:String(error.message),path:error.path??null,trace}}}

const hostProbe=`import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const install=${JSON.stringify(install)},packet=${JSON.stringify(packet)};
const expectedDefault=pathToFileURL(join(install,'dist/umf-node.js')).href,expectedReference=pathToFileURL(join(install,'dist/umf.js')).href;
const defaultResolved=import.meta.resolve('@umf/core'),referenceResolved=import.meta.resolve('@umf/core/reference');
assert.equal(defaultResolved,expectedDefault,'package root did not resolve to the extracted Node default export');
assert.equal(referenceResolved,expectedReference,'package reference did not resolve to the extracted TypeScript export');
const require=createRequire(defaultResolved),addon=require('./umf_core_node.node');
assert.equal(typeof addon.executeSecurityLogicWire,'function');let rustCalls=0;const original=addon.executeSecurityLogicWire;
addon.executeSecurityLogicWire=function(...args){rustCalls++;return Reflect.apply(original,this,args)};
const root=await import('@umf/core'),reference=await import('@umf/core/reference');
function input(spec,trace){switch(spec.kind){case'values':return spec.values;case'null':return null;case'number':return 1;case'boolean':return true;case'string':return'T';case'object':return{};case'null-prototype':return Object.create(null);case'accessor-index':{const value=[];Object.defineProperty(value,'0',{enumerable:true,get(){trace.push('getter:index');return'T'}});value.length=1;return value}case'accessor-child':{const child=Object.defineProperty({},'member',{enumerable:true,get(){trace.push('getter:member');return'T'}});return['X',child]}case'sparse':{const value=[];value.length=1;return value}case'extra-array-key':return Object.assign(['T'],{extra:'F'});case'custom-array-prototype':{const value=['T'];Object.setPrototypeOf(value,{});return value}case'symbol-array-key':{const value=['T'];value[Symbol('extra')]='F';return value}case'number-nan':return['T',Number.NaN];case'number-negative-zero':return['T',-0];case'proxy-ownKeys':return new Proxy(['T'],{ownKeys(){trace.push('ownKeys');throw new Error('proxy ownKeys trap')}});case'proxy-getPrototype':return new Proxy(['T'],{getPrototypeOf(){trace.push('getPrototypeOf');throw new Error('proxy getPrototypeOf trap')}});case'proxy-descriptor':return new Proxy(['T'],{ownKeys(target){trace.push('ownKeys');return Reflect.ownKeys(target)},getOwnPropertyDescriptor(target,key){trace.push('descriptor:'+String(key));return Reflect.getOwnPropertyDescriptor(target,key)}});case'proxy-get':return new Proxy(['T'],{get(target,key,receiver){trace.push('get:'+String(key));return Reflect.get(target,key,receiver)}});default:throw Error(spec.kind)}}
function outcome(fn,value,trace){try{return{kind:'return',value:fn(value),trace}}catch(error){return{kind:'throw',name:error.name,constructor:error.constructor?.name??null,code:error.code??null,message:String(error.message),path:error.path??null,trace}}}
const callsBeforeCases=rustCalls,rows=[];for(const spec of packet.cases){const rt=[],dt=[],beforeReference=rustCalls,ref=outcome(value=>reference[spec.operation](value),input(spec,rt),rt),referenceCallDelta=rustCalls-beforeReference,beforeDefault=rustCalls,actual=outcome(value=>root[spec.operation](value),input(spec,dt),dt),defaultCallDelta=rustCalls-beforeDefault;assert.deepEqual(ref,spec.expected,'installed reference changed '+spec.id);assert.deepEqual(actual,spec.expected,'installed Node default differs '+spec.id);assert.equal(referenceCallDelta,0,'installed TypeScript reference unexpectedly dispatched Rust for '+spec.id);assert.equal(defaultCallDelta,spec.expected.kind==='return'?1:0,'installed Node Rust dispatch mismatch '+spec.id);rows.push({id:spec.id,expected:spec.expected,reference:ref,referenceRustCallDelta:referenceCallDelta,default:actual,defaultRustCallDelta:defaultCallDelta})}
const validCalls=rows.reduce((n,row)=>n+row.defaultRustCallDelta,0),refusedCaseCount=rows.filter(row=>row.expected.kind==='throw').length,refusedRustCalls=rows.filter(row=>row.expected.kind==='throw').reduce((n,row)=>n+row.defaultRustCallDelta,0),referenceRustCalls=rows.reduce((n,row)=>n+row.referenceRustCallDelta,0),unattributedRustCalls=rustCalls-callsBeforeCases-validCalls-referenceRustCalls;assert.equal(validCalls,30);assert.equal(refusedRustCalls,0);assert.equal(referenceRustCalls,0);assert.equal(unattributedRustCalls,0);
console.log(JSON.stringify({host:process.env.UMF_SECURITY_HOST,runtime:process.env.UMF_SECURITY_RUNTIME,defaultResolved,referenceResolved,cases:rows.length,validCalls,refusedRustCalls,refusedCaseCount,referenceRustCalls,unattributedRustCalls,rows}));
`;

async function run(command,args,env={}){
 const child=Bun.spawn([command,...args],{env:{...process.env,...env},stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);
 const code=await child.exited;if(code!==0)throw new Error(`${command} ${args.join(' ')} failed (${code})\n${stdout}\n${stderr}`);
 return JSON.parse(stdout.trim().split('\n').at(-1));
}

try{
 const nodeProbe=join(install,'.security-and-or-node-probe.mjs'),bunProbe=join(install,'.security-and-or-bun-probe.mjs');
 await writeFile(nodeProbe,hostProbe);await writeFile(bunProbe,hostProbe);
 const node=await run('node',[nodeProbe],{UMF_SECURITY_HOST:'node',UMF_SECURITY_RUNTIME:process.version});
 const bun=await run('bun',[bunProbe],{UMF_SECURITY_HOST:'bun',UMF_SECURITY_RUNTIME:`Bun ${Bun.version}`});
 assert.equal(node.cases,68);assert.equal(bun.cases,68);assert.equal(node.validCalls,30);assert.equal(bun.validCalls,30);assert.equal(node.refusedRustCalls,0);assert.equal(bun.refusedRustCalls,0);assert.equal(node.referenceRustCalls,0);assert.equal(bun.referenceRustCalls,0);assert.equal(node.unattributedRustCalls,0);assert.equal(bun.unattributedRustCalls,0);

 const requests=[],external=[],pageErrors=[],consoleErrors=[];
const browserScript=`const packet=await(await fetch('/predecessor.json')).json();const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);const expectedRoot=new URL('/dist/umf-browser.js',location.href).href,expectedReference=new URL('/dist/umf.js',location.href).href;if(import.meta.resolve('@umf/core')!==expectedRoot||import.meta.resolve('@umf/core/reference')!==expectedReference)throw Error('browser import map/export condition mismatch');const root=await import('@umf/core'),reference=await import('@umf/core/reference');if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw Error('Node globals present in Chromium');function input(spec,trace){switch(spec.kind){case'values':return spec.values;case'null':return null;case'number':return 1;case'boolean':return true;case'string':return'T';case'object':return{};case'null-prototype':return Object.create(null);case'accessor-index':{const value=[];Object.defineProperty(value,'0',{enumerable:true,get(){trace.push('getter:index');return'T'}});value.length=1;return value}case'accessor-child':{const child=Object.defineProperty({},'member',{enumerable:true,get(){trace.push('getter:member');return'T'}});return['X',child]}case'sparse':{const value=[];value.length=1;return value}case'extra-array-key':return Object.assign(['T'],{extra:'F'});case'custom-array-prototype':{const value=['T'];Object.setPrototypeOf(value,{});return value}case'symbol-array-key':{const value=['T'];value[Symbol('extra')]='F';return value}case'number-nan':return['T',Number.NaN];case'number-negative-zero':return['T',-0];case'proxy-ownKeys':return new Proxy(['T'],{ownKeys(){trace.push('ownKeys');throw new Error('proxy ownKeys trap') }});case'proxy-getPrototype':return new Proxy(['T'],{getPrototypeOf(){trace.push('getPrototypeOf');throw new Error('proxy getPrototypeOf trap')}});case'proxy-descriptor':return new Proxy(['T'],{ownKeys(target){trace.push('ownKeys');return Reflect.ownKeys(target)},getOwnPropertyDescriptor(target,key){trace.push('descriptor:'+String(key));return Reflect.getOwnPropertyDescriptor(target,key)}});case'proxy-get':return new Proxy(['T'],{get(target,key,receiver){trace.push('get:'+String(key));return Reflect.get(target,key,receiver)}});default:throw Error(spec.kind)}}function outcome(fn,value,trace){try{return{kind:'return',value:fn(value),trace}}catch(error){return{kind:'throw',name:error.name,constructor:error.constructor?.name??null,code:error.code??null,message:String(error.message),path:error.path??null,trace}}}const rustCount=()=>window.__rustCalls.filter(name=>name==='executeSecurityLogicWire').length,callsBeforeCases=rustCount(),rows=[];for(const spec of packet.cases){const rt=[],dt=[],beforeReference=rustCount(),ref=outcome(value=>reference[spec.operation](value),input(spec,rt),rt),referenceRustCallDelta=rustCount()-beforeReference,beforeDefault=rustCount(),actual=outcome(value=>root[spec.operation](value),input(spec,dt),dt),defaultRustCallDelta=rustCount()-beforeDefault;if(canonical(ref)!==canonical(spec.expected))throw Error('Chromium reference drift '+spec.id);if(canonical(actual)!==canonical(spec.expected))throw Error('Chromium default mismatch '+spec.id+': '+canonical(actual));if(referenceRustCallDelta!==0)throw Error('Chromium reference unexpectedly dispatched WASM '+spec.id);if(defaultRustCallDelta!==(spec.expected.kind==='return'?1:0))throw Error('Chromium WASM dispatch mismatch '+spec.id);rows.push({id:spec.id,expected:spec.expected,reference:ref,referenceRustCallDelta,default:actual,defaultRustCallDelta})}const validCalls=rows.reduce((n,row)=>n+row.defaultRustCallDelta,0),refusedCaseCount=rows.filter(row=>row.expected.kind==='throw').length,refusedRustCalls=rows.filter(row=>row.expected.kind==='throw').reduce((n,row)=>n+row.defaultRustCallDelta,0),referenceRustCalls=rows.reduce((n,row)=>n+row.referenceRustCallDelta,0),unattributedRustCalls=rustCount()-callsBeforeCases-validCalls-referenceRustCalls;if(validCalls!==30||refusedRustCalls!==0||referenceRustCalls!==0||unattributedRustCalls!==0)throw Error('Chromium aggregate WASM dispatch mismatch');window.securityInstalledResult={rows,cases:rows.length,validCalls,refusedRustCalls,refusedCaseCount,referenceRustCalls,unattributedRustCalls,wasmCalls:window.__rustCalls,nodeGlobalsAbsent:typeof process==='undefined'&&typeof Buffer==='undefined'};`;
 const bootstrap=`window.__rustCalls=[];for(const method of ['instantiate','instantiateStreaming']){const original=WebAssembly[method];if(typeof original!=='function')continue;WebAssembly[method]=async function(...args){const value=await Reflect.apply(original,this,args);const wrap=instance=>({exports:Object.fromEntries(Object.entries(instance.exports).map(([name,fn])=>[name,typeof fn==='function'?function(...callArgs){window.__rustCalls.push(String(name));return Reflect.apply(fn,instance.exports,callArgs)}:fn]))});return value&&value.instance?{...value,instance:wrap(value.instance)}:wrap(value)}};`;
 const html=`<!doctype html><meta charset="utf-8"><script>${bootstrap}</script><script type="importmap">${JSON.stringify({imports:{'@umf/core':'/dist/umf-browser.js','@umf/core/reference':'/dist/umf.js'}})}</script><script type="module" src="/security-probe.js"></script>`;
 let server,lastBindError;
 for(let attempt=0;attempt<20;attempt++){
  const candidatePort=41000+((Date.now()+attempt*7919)%18000);
  try{server=Bun.serve({hostname:'127.0.0.1',port:candidatePort,async fetch(request){const url=new URL(request.url);if(url.pathname==='/')return new Response(html,{headers:{'content-type':'text/html'}});if(url.pathname==='/security-probe.js')return new Response(browserScript,{headers:{'content-type':'text/javascript'}});if(url.pathname==='/predecessor.json')return new Response(packetBytes,{headers:{'content-type':'application/json'}});const relative=url.pathname.slice(1);requests.push(relative);try{return new Response(await readFile(join(install,relative)),{headers:{'content-type':extname(relative)==='.wasm'?'application/wasm':relative.endsWith('.js')?'text/javascript':'application/octet-stream'}})}catch{return new Response('not found',{status:404})}}});break}catch(error){lastBindError=error;if(error?.code!=='EADDRINUSE'&&!String(error).includes('EADDRINUSE'))throw error}
 }
 if(!server)throw new Error(`Could not bind installed security replay server after 20 loopback ports: ${String(lastBindError)}`);
 const browserUrl=server.url.href;
 let browser;
 try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage();page.on('request',request=>{if(new URL(request.url()).origin!==new URL(browserUrl).origin)external.push(request.url())});page.on('pageerror',error=>pageErrors.push(error.stack??error.message));page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())});
  await page.goto(browserUrl);await page.waitForFunction(()=>Boolean(window.securityInstalledResult),undefined,{timeout:120000});const browserResult=await page.evaluate(()=>window.securityInstalledResult);
  assert.equal(browserResult.cases,68);assert.equal(browserResult.validCalls,30);assert.equal(browserResult.refusedRustCalls,0);assert.equal(browserResult.referenceRustCalls,0);assert.equal(browserResult.unattributedRustCalls,0);assert.equal(browserResult.nodeGlobalsAbsent,true);assert.deepEqual(pageErrors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(external,[]);assert(requests.includes('dist/umf_core_wasm_bg.wasm'),'installed Chromium package did not request its WASM asset');
  const receipt={format:'umf-r8-security-and-or-installed-replay/1',status:'passed',archive:{path:archive,sha256:archiveSha256},fixture:{path:packetPath,sha256:packetSha256,cases:packet.cases.length},runtimes:{node:{version:node.runtime,cases:node.cases,validRustCalls:node.validCalls,refusedRustCalls:node.refusedRustCalls,refusedCaseCount:node.refusedCaseCount,referenceRustCalls:node.referenceRustCalls,defaultResolved:node.defaultResolved,referenceResolved:node.referenceResolved},bun:{version:bun.runtime,cases:bun.cases,validRustCalls:bun.validCalls,refusedRustCalls:bun.refusedRustCalls,refusedCaseCount:bun.refusedCaseCount,referenceRustCalls:bun.referenceRustCalls,defaultResolved:bun.defaultResolved,referenceResolved:bun.referenceResolved},chromium:{version:browser.version(),cases:browserResult.cases,validWasmCalls:browserResult.validCalls,refusedWasmCalls:browserResult.refusedRustCalls,refusedCaseCount:browserResult.refusedCaseCount,referenceWasmCalls:browserResult.referenceRustCalls,wasmAssetRequested:requests.includes('dist/umf_core_wasm_bg.wasm'),nodeGlobalsAbsent:browserResult.nodeGlobalsAbsent,externalRequests:external.length}},records:{node:node.rows,bun:bun.rows,chromium:browserResult.rows},network:{requests,externalRequests:external,pageErrors,consoleErrors}};
  await mkdir(resolve(receiptPath,'..'),{recursive:true});await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,receipt:receiptPath,archiveSha256,fixtureSha256:packetSha256,cases:68,nodeCalls:node.validCalls,bunCalls:bun.validCalls,chromiumCalls:browserResult.validCalls,refusedRustCalls:0,referenceRustCalls:0,browser:receipt.runtimes.chromium.version,wasmAssetRequested:receipt.runtimes.chromium.wasmAssetRequested,externalRequests:external.length}));
 }finally{await browser?.close();server.stop(true)}
}finally{await (await import('node:fs/promises')).rm(join(install,'.security-and-or-node-probe.mjs'),{force:true});await (await import('node:fs/promises')).rm(join(install,'.security-and-or-bun-probe.mjs'),{force:true})}
