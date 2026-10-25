// SPDX-License-Identifier: MIT OR Apache-2.0
// Compare the V4 browser root against the frozen 11-case raw-host packet.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {extname,join,resolve} from 'node:path';
import {chromium} from 'playwright';
import {relationshipCandidate} from '../../core-relationship-cases.ts';
import {relationshipOperationCases} from '../../core-relationship-operation-cases.ts';
import {declareCoreRelationship as declareReference} from '../../../src/model/relationships.ts';

const root=process.cwd(),pkg=process.env.UMF_R8_RELATIONSHIPS_WASM_PKG;
if(!pkg)throw new Error('UMF_R8_RELATIONSHIPS_WASM_PKG is required');
const packetPath='docs/helix/04-build/evidence/rust-migration/r8-core-relationships-default-boundary/predecessor.json';
const packet=JSON.parse(await readFile(resolve(root,packetPath),'utf8'));
const files={entry:await readFile(join(pkg,'umf-browser.js')),wasm:await readFile(join(pkg,'umf_core_wasm_bg.wasm'))};
const candidate=relationshipCandidate(),row=relationshipOperationCases()[0];
const receipt=declareReference(row.source,row.identity,row.request);
const inputs={candidate,row,receipt,packet};
const temp=await import('node:os').then(m=>m.tmpdir());
const {mkdtemp,rm,writeFile:write}=await import('node:fs/promises');
const tempRoot=await mkdtemp(join(temp,'umf-r8-rel-browser-'));
const bundle=join(tempRoot,'root.js');
await write(join(tempRoot,'index.html'),'<!doctype html><meta charset="utf-8">');
await write(join(tempRoot,'umf_core_wasm_bg.wasm'),files.wasm);
await write(join(tempRoot,'inputs.json'),JSON.stringify(inputs));
await write(bundle,files.entry);
const mime={'.js':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html'};
const server=createServer(async(req,res)=>{try{const path=new URL(req.url??'/', 'http://localhost').pathname;const name=path==='/'?'index.html':path.slice(1);if(!['index.html','root.js','inputs.json','umf_core_wasm_bg.wasm'].includes(name))throw Error('not found');res.writeHead(200,{'content-type':mime[extname(name)]??'application/octet-stream'});res.end(await readFile(join(tempRoot,name)));}catch{res.writeHead(404);res.end('not found');}});
await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));
let browser;
try{
 browser=await chromium.launch({headless:true,timeout:30_000,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));const address=server.address();
 await page.goto(`http://127.0.0.1:${address.port}/`);
 const actual=await page.evaluate(async()=>{
  const api=await import('/root.js'),{candidate,row,receipt,packet}=await(await fetch('/inputs.json')).json(),cases=[];
  const observe=(id,shape,run)=>{const trace=[];try{cases.push({id,shape,outcome:{status:'returned',value:run(trace)},trace});}catch(e){cases.push({id,shape,outcome:{status:'threw',name:String(e?.name??''),code:typeof e?.code==='string'?e.code:null,path:typeof e?.path==='string'?e.path:null,message:String(e?.message??'')},trace});}};
  const watched=(value,label,trace)=>new Proxy(value,{getPrototypeOf(t){trace.push(`${label}:getPrototypeOf`);return Reflect.getPrototypeOf(t);},ownKeys(t){trace.push(`${label}:ownKeys`);return Reflect.ownKeys(t);},getOwnPropertyDescriptor(t,k){trace.push(`${label}:descriptor:${String(k)}`);return Reflect.getOwnPropertyDescriptor(t,k);},get(t,k,r){trace.push(`${label}:get:${String(k)}`);return Reflect.get(t,k,r);}});
  const accessor=(source,key,trace)=>{const value=structuredClone(source);Object.defineProperty(value,key,{enumerable:true,get(){trace.push(`accessor:${key}`);return null;}});return value;};
  const rows=[...packet.cases];
  observe(rows[0].id,rows[0].shape,t=>api.inspectCoreRelationships(accessor(candidate,'umf',t),watched({module:'m'},'identity',t)));
  observe(rows[1].id,rows[1].shape,t=>api.inspectCoreRelationships(watched(candidate,'source',t),accessor({module:'m'},'module',t)));
  observe(rows[2].id,rows[2].shape,t=>api.lookupCoreRelationship(watched(candidate,'source',t),accessor({module:'m',id:'r'},'id',t)));
  observe(rows[3].id,rows[3].shape,t=>api.declareCoreRelationship(watched(row.source,'source',t),watched(row.identity,'identity',t),accessor(row.request,'name',t)));
  observe(rows[4].id,rows[4].shape,t=>api.declareCoreRelationship(accessor(row.source,'umf',t),watched(row.identity,'identity',t),row.request));
  observe(rows[5].id,rows[5].shape,t=>api.verifyCoreRelationshipOperation(accessor(receipt,'version',t),watched(receipt.target,'current',t)));
  observe(rows[6].id,rows[6].shape,t=>api.verifyCoreRelationshipOperation(watched(receipt,'receipt',t),accessor(receipt.target,'umf',t)));
  observe(rows[7].id,rows[7].shape,t=>api.verifyCoreRelationshipOperation({...receipt,version:'9.0.0'},watched(receipt.target,'current',t)));
  observe(rows[8].id,rows[8].shape,t=>{const result=api.inspectCoreRelationships(watched(candidate,'source',t),watched({module:'m'},'identity',t));return {operation:result.operation,version:result.version,meaning:result.meaning.state,path:result.path};});
  observe(rows[9].id,rows[9].shape,t=>api.lookupCoreRelationship(watched(candidate,'source',t),null));
  observe(rows[10].id,rows[10].shape,t=>api.declareCoreRelationship(watched(candidate,'source',t),watched({module:'m'},'identity',t),null));
  return {cases,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis),userAgent:navigator.userAgent};
 });
 assert.deepEqual(errors,[],'Chromium emitted page errors');assert.deepEqual(actual.cases,packet.cases,'browser V4 output/reflection differed from predecessor');assert.equal(actual.nodeGlobalsAbsent,true);
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 const sourcePaths=['scripts/rust-migration/r8/relationships-default-browser.mjs','src/index-browser-v4.ts','src/index-node-v4.ts','src/access/rust-relationships-default.ts','bindings/core/wasm/src/core-relationships.js','crates/umf-core/src/core_relationships.rs','crates/umf-core-wire/src/lib.rs'];
 const sourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,hash(await readFile(resolve(root,path)))])));
const receiptOut={status:'pass',browser:browser.version(),userAgent:actual.userAgent,caseCount:actual.cases.length,packetSha256:hash(await readFile(resolve(root,packetPath))),browserEntrySha256:hash(files.entry),wasmSha256:hash(files.wasm),sourceHashes,nodeGlobalsAbsent:actual.nodeGlobalsAbsent,exactPacketParity:true,qualification:'Source-pinned private WASM replay only; package release/default qualification remains open.'};
 if(process.env.UMF_R8_RELATIONSHIPS_BROWSER_RECEIPT)await writeFile(resolve(process.env.UMF_R8_RELATIONSHIPS_BROWSER_RECEIPT),`${JSON.stringify(receiptOut,null,2)}\n`);
 console.log(JSON.stringify(receiptOut));
}finally{await browser?.close();server.close();await rm(tempRoot,{recursive:true,force:true});}
