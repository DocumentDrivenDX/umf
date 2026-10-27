// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay the operation packets in Chromium and count actual exported WASM calls.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {extname,join,resolve} from 'node:path';
import {chromium} from 'playwright';

const root=process.cwd(),archive=resolve(process.env.UMF_R8_RETIREMENT_ARCHIVE_ROOT??''),out=resolve(process.env.UMF_R8_RETIREMENT_RECEIPT_DIR??'');
const archiveSha256=process.env.UMF_R8_RETIREMENT_ARCHIVE_SHA256,sourceClosureSha256=process.env.UMF_R8_RETIREMENT_SOURCE_CLOSURE_SHA256;
if(!process.env.UMF_R8_RETIREMENT_ARCHIVE_ROOT||!process.env.UMF_R8_RETIREMENT_RECEIPT_DIR||!archiveSha256||!sourceClosureSha256)throw new Error('Archive, receipt directory and source pins are required');
const cohortId=process.platform==='darwin'&&process.arch==='arm64'?'darwin-arm64':process.platform==='linux'&&process.arch==='x64'?'linux-x86_64':null;
if(!cohortId)throw new Error(`Unsupported retirement host cohort: ${process.platform}/${process.arch}`);
const hostPlatform={os:process.platform,arch:process.arch};
const evidence='docs/helix/04-build/evidence/rust-migration/r8-relationships-default-retirement-replay';
const packets={};for(const name of ['inspectCoreRelationships','lookupCoreRelationship','declareCoreRelationship','verifyCoreRelationshipOperation'])packets[name]=JSON.parse(await readFile(join(root,evidence,`${name}.packet.json`),'utf8'));
const files={browser:await readFile(join(archive,'dist/umf-browser.js')),reference:await readFile(join(archive,'dist/umf.js')),wasm:await readFile(join(archive,'dist/umf_core_wasm_bg.wasm'))};
const temp=await import('node:os').then(m=>m.tmpdir());const {mkdtemp,rm}=await import('node:fs/promises');
const dir=await mkdtemp(join(temp,'umf-r8-retirement-browser-'));
for(const [name,bytes] of [['umf-browser.js',files.browser],['umf.js',files.reference],['umf_core_wasm_bg.wasm',files.wasm]])await writeFile(join(dir,name),bytes);
await writeFile(join(dir,'packets.json'),JSON.stringify(packets));
await writeFile(join(dir,'index.html'),'<!doctype html><meta charset="utf-8"><title>R8 installed replay</title>');
const mime={'.js':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html'};
const server=createServer(async(req,res)=>{try{const name=new URL(req.url??'/', 'http://127.0.0.1').pathname==='/'?'index.html':new URL(req.url??'/', 'http://127.0.0.1').pathname.slice(1);if(!['index.html','umf-browser.js','umf.js','umf_core_wasm_bg.wasm','packets.json'].includes(name))throw Error('not found');res.writeHead(200,{'content-type':mime[extname(name)]??'application/octet-stream'});res.end(await readFile(join(dir,name)));}catch{res.writeHead(404);res.end('not found');}});
await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));
let browser;
try{
 browser=await chromium.launch({headless:true,timeout:30000,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();page.on('pageerror',error=>{throw error;});
 await page.addInitScript(()=>{
  globalThis.__umfRustCalls=0;
  const wrap=result=>{
   const instance=result?.instance??result;
   if(!instance?.exports)return result;
   const exports=Object.create(null);
   for(const key of Reflect.ownKeys(instance.exports)){
    const value=Reflect.get(instance.exports,key);
    exports[key]=key==='executeRequestWire'&&typeof value==='function'?function(...args){globalThis.__umfRustCalls++;return value.apply(instance.exports,args);}:value;
   }
   const proxied={exports};
   return result?.instance?{...result,instance:proxied}:proxied;
  };
  const instantiate=WebAssembly.instantiate.bind(WebAssembly);
  WebAssembly.instantiate=(...args)=>Promise.resolve(instantiate(...args)).then(wrap);
  if(typeof WebAssembly.instantiateStreaming==='function'){
   const streaming=WebAssembly.instantiateStreaming.bind(WebAssembly);
   WebAssembly.instantiateStreaming=(...args)=>Promise.resolve(streaming(...args)).then(wrap);
  }
 });
 const address=server.address();await page.goto(`http://127.0.0.1:${address.port}/`);
 const result=await page.evaluate(async()=>{
  const defaults=await import('/umf-browser.js'),reference=await import('/umf.js'),packets=await(await fetch('/packets.json')).json();
  const operations={inspectCoreRelationships:defaults.inspectCoreRelationships,lookupCoreRelationship:defaults.lookupCoreRelationship,declareCoreRelationship:defaults.declareCoreRelationship,verifyCoreRelationshipOperation:defaults.verifyCoreRelationshipOperation};
  const referenceOperations={inspectCoreRelationships:reference.inspectCoreRelationships,lookupCoreRelationship:reference.lookupCoreRelationship,declareCoreRelationship:reference.declareCoreRelationship,verifyCoreRelationshipOperation:reference.verifyCoreRelationshipOperation};
  const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
  const canonical=value=>JSON.stringify(stable(value));
  const watched=(value,label,trace)=>new Proxy(value,{getPrototypeOf(t){trace.push(`${label}:getPrototypeOf`);return Reflect.getPrototypeOf(t);},ownKeys(t){trace.push(`${label}:ownKeys`);return Reflect.ownKeys(t);},getOwnPropertyDescriptor(t,k){trace.push(`${label}:descriptor:${String(k)}`);return Reflect.getOwnPropertyDescriptor(t,k);},get(t,k,r){trace.push(`${label}:get:${String(k)}`);return Reflect.get(t,k,r);}});
  const accessor=(value,key,trace)=>{const cloned=structuredClone(value);Object.defineProperty(cloned,key,{enumerable:true,get(){trace.push(`accessor:${key}`);return null;}});return cloned;};
  const argsFor=(input,trace)=>{switch(input.profile){case 'source-accessor':return[accessor(input.source,'umf',trace),watched(input.identity,'identity',trace)];case 'identity-accessor':return[watched(input.source,'source',trace),accessor(input.identity,'id',trace)];case 'request-accessor':return[watched(input.source,'source',trace),watched(input.identity,'identity',trace),accessor(input.request,'name',trace)];case 'receipt-accessor':return[accessor(input.receipt,'version',trace),watched(input.current,'current',trace)];default:return input.receipt?[input.receipt,input.current]:input.request?[input.source,input.identity,input.request]:[input.source,input.identity];}};
  const outcome=run=>{try{return stable({status:'returned',value:run()});}catch(e){return{status:'threw',name:String(e?.name??''),code:typeof e?.code==='string'?e.code:null,path:typeof e?.path==='string'?e.path:null,message:String(e?.message??'')};}};
  const receipts={};
  for(const name of Object.keys(packets)){
   const packet=packets[name],cases=[];
   for(const item of packet.cases){
    const trace=[];globalThis.__umfRustCalls=0;const defaultOutcome=outcome(()=>operations[name](...argsFor(item.input,trace))),defaultCalls=globalThis.__umfRustCalls;
    if(canonical(defaultOutcome)!==canonical(item.expectedOutcome)||canonical(trace)!==canonical(item.expectedTrace))throw Error(`${name}/${item.id} default packet mismatch: ${JSON.stringify({defaultOutcome,expected:item.expectedOutcome,trace,expectedTrace:item.expectedTrace})}`);
    const referenceTrace=[];globalThis.__umfRustCalls=0;const referenceOutcome=outcome(()=>referenceOperations[name](...argsFor(item.input,referenceTrace))),referenceCalls=globalThis.__umfRustCalls;
    if(canonical(referenceOutcome)!==canonical(item.expectedOutcome)||canonical(referenceTrace)!==canonical(item.expectedTrace))throw Error(`${name}/${item.id} reference packet mismatch`);
    if(referenceCalls!==0||((item.expectsRust?defaultCalls<1:defaultCalls!==0)))throw Error(`${name}/${item.id} invocation count mismatch`);
    cases.push({id:item.id,defaultOutcome,defaultTrace:trace,defaultRustCalls:defaultCalls,referenceOutcome,referenceTrace,referenceRustCalls:referenceCalls});
   }
   receipts[name]=cases;
  }
  return {receipts,userAgent:navigator.userAgent,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 });
 assert.equal(result.nodeGlobalsAbsent,true,'browser package exposed Node globals');
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 for(const [name,cases] of Object.entries(result.receipts)){
  const packetBytes=await readFile(join(root,evidence,`${name}.packet.json`));
  const receipt={format:'umf.r8.default-route-retirement-host-receipt/2',status:'pass',runtime:'chromium',hostVersion:browser.version(),cohortId,hostPlatform,archiveSha256,sourceClosureSha256,packetSha256:hash(packetBytes),defaultRoute:{routeId:'package-root-browser',entryMember:'dist/umf-browser.js',entrySha256:hash(files.browser),artifactMembers:[{path:'dist/umf_core_wasm_bg.wasm',sha256:hash(files.wasm)}]},referenceRoute:{routeId:'package-reference',entryMember:'dist/umf.js',entrySha256:hash(files.reference),artifactMembers:[]},cases};
  await writeFile(join(out,`${name}-chromium.json`),`${JSON.stringify(receipt,null,2)}\n`);
  console.log(JSON.stringify({exportName:name,runtime:'Chromium '+browser.version(),caseCount:cases.length,defaultRustCalls:cases.map(c=>c.defaultRustCalls),packetSha256:receipt.packetSha256,nodeGlobalsAbsent:result.nodeGlobalsAbsent}));
 }
}finally{await browser?.close();server.close();await rm(dir,{recursive:true,force:true});}
