// SPDX-License-Identifier: MIT OR Apache-2.0
// Build the current v4 browser root against an isolated WASM package and
// compare its CSV Boolean operations with the frozen TypeScript predecessor.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {join, resolve, extname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const repo=resolve(fileURLToPath(new URL('../../../..',import.meta.url)));
const packageRoot=resolve(process.argv[2]??'');
const receiptPath=process.argv[3]?resolve(process.argv[3]):null;
if(!process.argv[2])throw new Error('Usage: bun bindings/core/wasm/tests/csv-boolean-default-browser.mjs <isolated-wasm-package> [receipt.json]');
const packetPath=join(repo,'scripts/rust-migration/r5/csv-boolean-default-route/predecessor.json');
const packet=JSON.parse(await readFile(packetPath,'utf8'));
assert.equal(packet.format,'umf-r5-csv-boolean-default-route-predecessor/1');
for(const [relative,expected] of Object.entries(packet.sourceHashes)){
 const actual=createHash('sha256').update(await readFile(join(repo,relative))).digest('hex');
 assert.equal(actual,expected,`frozen predecessor source drift: ${relative}`);
}
const packageGlue=join(packageRoot,'pkg/umf_core_wasm.js');
const packageWasm=join(packageRoot,'pkg/umf_core_wasm_bg.wasm');
const glueBytes=await readFile(packageGlue);
const wasmBytes=await readFile(packageWasm);
const tempRoot=await mkdtemp(join(tmpdir(),'umf-r5-csv-boolean-default-browser-'));
const bundle=join(tempRoot,'index-browser-v4.js');
await writeFile(join(tempRoot,'index.html'),'<!doctype html><meta charset="utf-8">');
await writeFile(join(tempRoot,'ontology.json'),await readFile(join(repo,'spec/domain-packs/medical/ontology.json')));
await writeFile(join(tempRoot,'umf_core_wasm_bg.wasm'),wasmBytes);

const build=await Bun.build({
 entrypoints:[join(repo,'src/index-browser-v4.ts')],outdir:tempRoot,naming:'index-browser-v4.js',target:'browser',format:'esm',
 plugins:[{name:'isolated-csv-boolean-wasm-package',setup(builder){builder.onResolve({filter:/^\.\/pkg\/umf_core_wasm\.js$/},args=>args.importer.endsWith('/bindings/core/wasm/index.js')?{path:packageGlue}:undefined);}}],
});
if(!build.success)throw new Error(`v4 browser build failed: ${build.logs.map(log=>log.message).join('; ')}`);

const mime={'.js':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html'};
const server=createServer(async(req,res)=>{
 const pathname=new URL(req.url??'/', 'http://127.0.0.1').pathname;
 const name=pathname==='/'?'index.html':pathname.slice(1);
 if(!['index.html','index-browser-v4.js','ontology.json','umf_core_wasm_bg.wasm'].includes(name)){res.writeHead(404);res.end('not found');return;}
 try{const bytes=await readFile(join(tempRoot,name));res.writeHead(200,{'content-type':mime[extname(name)]??'application/octet-stream','cache-control':'no-store'});res.end(bytes);}
 catch{res.writeHead(404);res.end('not found');}
});
await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));
const address=server.address();
if(!address||typeof address==='string')throw new Error('Browser server did not start');
let browser;
try{
 browser=await chromium.launch({headless:true,timeout:30_000,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();
 const pageErrors=[];page.on('pageerror',error=>pageErrors.push(String(error)));
 await page.goto(`http://127.0.0.1:${address.port}/`,{waitUntil:'load'});
 const actual=await page.evaluate(async()=>{
  const api=await import('/index-browser-v4.js');
  const source=await(await fetch('/ontology.json')).json();
  const makeRequest=token=>({profile:'umf.csv-boolean-lexical/1.0.0',field:{module:'domain',element:'patients.active'},token,sourceContext:{source:'original.csv',row:1,column:'active',unknown:{retained:['雪',null]}}});
  const receipts={};
  for(const token of ['true','false','True','False']){
   const request=makeRequest(token);
   const receipt=api.validateCsvBooleanLexical(source,request);
   const verified=api.verifyCsvBooleanLexical(receipt,source,request);
   receipts[`token:${token}`]={receipt,verified};
  }
  let expectedSourceReads=0;
  const unreadSource=Object.defineProperty({},'umf',{enumerable:true,get(){expectedSourceReads++;return '0.10.0';}});
  let refusal;
  try{api.verifyCsvBooleanLexical({},unreadSource,makeRequest('true'));}
  catch(error){refusal={status:'refused',name:error.name,prototype:Object.getPrototypeOf(error)?.constructor?.name??null,code:error.code??null,path:error.path??'',message:error.message};}
  if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw new Error('Node globals are present in the browser');
  return {receipts,malformedReceiptBeforeExpectedInput:{result:refusal,expectedSourceReads},userAgent:navigator.userAgent,validateType:typeof api.validateCsvBooleanLexical,verifyType:typeof api.verifyCsvBooleanLexical};
 });
 assert.deepEqual(pageErrors,[],'browser emitted page errors');
 for(const token of ['true','false','True','False']){
  const item=actual.receipts[`token:${token}`];
  assert.equal(item.receipt.value.boolean,token==='true'||token==='True');
  assert.deepEqual(item.receipt,packet.cases[`token:${token}`],`receipt differs from frozen predecessor for ${token}`);
  assert.deepEqual(item.verified,item.receipt,`verification differs from receipt for ${token}`);
 }
 assert.deepEqual(actual.malformedReceiptBeforeExpectedInput,packet.cases.invalidReceiptBeforeExpectedInput);
 assert.equal(actual.validateType,'function');
 assert.equal(actual.verifyType,'function');
 const sourceHashes=Object.fromEntries(await Promise.all([
  'bindings/core/wasm/tests/csv-boolean-default-browser.mjs','src/access/rust-csv-boolean-default.ts','src/index-browser-v4.ts','src/index-node-v4.ts',
 ].map(async path=>[path,createHash('sha256').update(await readFile(join(repo,path))).digest('hex')])));
 const receipt={
  format:'umf-r5-csv-boolean-default-route-chromium/1',status:'pass',browser:browser.version(),userAgent:actual.userAgent,
  isolatedPackage:packageRoot,wasmSha256:createHash('sha256').update(wasmBytes).digest('hex'),wasmGlueSha256:createHash('sha256').update(glueBytes).digest('hex'),
  predecessorSha256:createHash('sha256').update(await readFile(packetPath)).digest('hex'),sourceHashes,
  operations:['validateCsvBooleanLexical','verifyCsvBooleanLexical'],tokens:Object.keys(actual.receipts),
  fullReceiptPredecessorParity:true,receiptRecomputationParity:true,malformedReceiptBeforeExpectedSource:actual.malformedReceiptBeforeExpectedInput,
  nodeGlobalsAbsent:true,qualification:'Fresh isolated-package source replay only; installed SDK qualification and broader CSV support are not claimed.',
 };
 if(receiptPath)await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`);
 console.log(JSON.stringify(receipt,null,2));
}finally{
 await browser?.close();
 await new Promise(resolveClose=>server.close(resolveClose));
 await rm(tempRoot,{recursive:true,force:true});
}
