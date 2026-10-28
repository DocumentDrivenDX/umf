// SPDX-License-Identifier: MIT OR Apache-2.0
// Run focused V4 browser parity against a freshly generated wasm-bindgen package.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const root=resolve(import.meta.dir,'../../..');
const wasmPackage=resolve(process.argv[2]??'');
assert(process.argv[2],'pass a freshly generated wasm-bindgen package directory');
const wasmJs=await readFile(resolve(wasmPackage,'umf_core_wasm.js'));
const wasm=await readFile(resolve(wasmPackage,'umf_core_wasm_bg.wasm'));
const [v4Build,oracleBuild]=await Promise.all([
 Bun.build({
  entrypoints:[`${root}/src/index-browser-v4.ts`],target:'browser',format:'esm',write:false,
  plugins:[{name:'fresh-wasm',setup(build){
   build.onResolve({filter:/umf_core_wasm\.js$/},()=>({path:resolve(wasmPackage,'umf_core_wasm.js')}));
  }}],
 }),
 Bun.build({entrypoints:[`${root}/src/adapters/arrow/capture.ts`],target:'browser',format:'esm',write:false}),
]);
assert.equal(v4Build.success,true,JSON.stringify(v4Build.logs));
assert.equal(oracleBuild.success,true,JSON.stringify(oracleBuild.logs));
const [bundle,oracle]=await Promise.all([v4Build.outputs[0].text(),oracleBuild.outputs[0].text()]);
const manifestBytes=await readFile(`${root}/fixtures/arrow/ipc-inputs/manifest.json`);
const manifest=JSON.parse(manifestBytes.toString('utf8'));
const fixtures=await Promise.all(manifest.cases.map(async row=>({
 id:row.file,
 bytes:await readFile(resolve(root,'fixtures/arrow/ipc-inputs',row.file)),
})));
const fixtureHash=createHash('sha256');
for(const fixture of fixtures)fixtureHash.update(fixture.id).update('\0').update(fixture.bytes);
const fixtureSha256=fixtureHash.digest('hex');
const server=createServer(async(request,response)=>{
 const path=new URL(request.url??'/','http://localhost').pathname;
 if(path==='/'){
  response.writeHead(200,{'content-type':'text/html'});
  response.end('<!doctype html><title>UMF Arrow IPC V4</title>');
 }else if(path.endsWith('/v4.js')){
  response.writeHead(200,{'content-type':'text/javascript'});
  response.end(bundle);
 }else if(path==='/oracle.js'){
  response.writeHead(200,{'content-type':'text/javascript'});
  response.end(oracle);
 }else if(path.startsWith('/missing/')&&path.endsWith('.wasm')){
  response.writeHead(404);
  response.end('synthetic missing WASM');
 }else if(path.startsWith('/corrupt/')&&path.endsWith('.wasm')){
  response.writeHead(200,{'content-type':'application/wasm'});
  response.end(Buffer.from([0,1,2,3]));
 }else if(path==='/umf_core_wasm_bg.wasm'){
  response.writeHead(200,{'content-type':'application/wasm'});
  response.end(wasm);
 }else{
  response.writeHead(404);
  response.end();
 }
});
await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));
const {port}=server.address();
let browser;
try{
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 const pageErrors=[];
 page.on('pageerror',error=>pageErrors.push(String(error)));
 await page.goto(`http://127.0.0.1:${port}/`);
 const result=await page.evaluate(async(fixtures)=>{
  const v4=await import('/v4.js');
  const ts=await import('/oracle.js');
  const canonical=value=>value&&typeof value==='object'
   ?Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]))
   :value;
  let operations=0;
  for(const row of fixtures){
   const bytes=Uint8Array.from(atob(row.base64),char=>char.charCodeAt(0));
   const expected=ts.captureArrowIpc(bytes,{id:row.id});
   const actual=v4.captureArrowIpc(bytes,{id:row.id});
   if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error(`capture mismatch: ${row.id}`);
   const actualInspection=v4.inspectArrowIpcCapture(actual);
   const expectedInspection=ts.inspectArrowIpcCapture(expected);
   if(JSON.stringify(canonical(actualInspection))!==JSON.stringify(canonical(expectedInspection)))
    throw Error(`inspect mismatch: ${row.id}`);
   if([...v4.exportArrowIpcCapture(actual)].join(',')!==[...ts.exportArrowIpcCapture(expected)].join(','))
    throw Error(`export mismatch: ${row.id}`);
   operations+=3;
  }
  let wrongBytes;
  try{v4.captureArrowIpc([],{});}catch(error){wrongBytes=error;}
  if(!(wrongBytes instanceof v4.UmfError)||wrongBytes.code!=='ARROW_IPC_LIMIT')
   throw Error('wrong-byte class/public error identity mismatch');
  let invalidId;
  try{v4.captureArrowIpc(new Uint8Array([1]),{id:3});}catch(error){invalidId=error;}
  if(!(invalidId instanceof v4.UmfError)||invalidId.code!=='ARROW_IPC_CAPTURE')
   throw Error('invalid id/public error identity mismatch');
  const iteratorSentinel={source:'iterator'};
  class ThrowingBytes extends Uint8Array{
   [Symbol.iterator](){throw iteratorSentinel;}
  }
  let iteratorError;
  try{v4.captureArrowIpc(new ThrowingBytes([1]),{id:'x'});}catch(error){iteratorError=error;}
  if(iteratorError!==iteratorSentinel)throw Error('caller iterator exception identity mismatch');
  const refusals=[];
  for(const variant of ['missing','corrupt']){
   let failure;
   try{await import(`/${variant}/v4.js?${Date.now()}-${variant}`);}
   catch(error){failure=String(error?.message??error);}
   if(!failure||!/wasm|compile|magic|fetch|instantiate/i.test(failure))
    throw Error(`${variant} WASM did not fail closed: ${failure??'import succeeded'}`);
   refusals.push(variant);
  }
  return {operations,fixtures:fixtures.length,publicErrorIdentity:true,iteratorIdentity:true,refusals};
 },fixtures.map(row=>({id:row.id,base64:row.bytes.toString('base64')})));
 assert.deepEqual(pageErrors,[]);
 console.log(JSON.stringify({
  status:'pass',runtime:'Chromium',version:browser.version(),port,
  buildBytes:Buffer.byteLength(bundle),buildSha256:createHash('sha256').update(bundle).digest('hex'),
  wasmJsSha256:createHash('sha256').update(wasmJs).digest('hex'),
  wasmBytes:wasm.length,wasmSha256:createHash('sha256').update(wasm).digest('hex'),
  manifestSha256:createHash('sha256').update(manifestBytes).digest('hex'),fixtureSha256,
  ...result,pageErrors,
 },null,2));
}finally{
 if(browser)await browser.close();
 server.close();
}
