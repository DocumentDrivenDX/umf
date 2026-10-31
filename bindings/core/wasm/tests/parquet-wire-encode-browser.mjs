import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const repo=resolve(import.meta.dirname,'../../../..');
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://umf.local/**',async route=>{
  const pathname=new URL(route.request().url()).pathname;
  if(pathname==='/')return route.fulfill({status:200,contentType:'text/html',body:'<html></html>'});
  const path=resolve(repo,'.'+pathname);
  if(!path.startsWith(repo+'/'))return route.fulfill({status:403,body:''});
  try {const body=await readFile(path);await route.fulfill({status:200,contentType:path.endsWith('.wasm')?'application/wasm':'text/javascript',body})}
  catch {await route.fulfill({status:404,body:''})}
 });
 await page.goto('http://umf.local/');
 const result=await page.evaluate(async()=>{
  const wasm=await import('/bindings/core/wasm/pkg/umf_core_wasm.js');
  await wasm.default({module_or_path:'/bindings/core/wasm/pkg/umf_core_wasm_bg.wasm'});
  const {createParquetCaptureOperations}=await import('/bindings/core/wasm/src/parquet-capture.js');
  const {encodeRequestWire,fromWire,resultError}=await import('/bindings/core/wasm/src/wire.js');
  const engine=createParquetCaptureOperations((op,fields)=>{
   const envelope=JSON.parse(wasm.executeParquetCaptureWire(encodeRequestWire({op:`parquet.${op}`,...fields})));
   const error=resultError(envelope);if(error)throw Object.assign(new Error(error.message),{code:error.code});
   return fromWire(JSON.parse(envelope.wire));
  });
  const hex=Array.from(engine.encodeParquetWire({kind:'struct',fields:[{id:1,value:{kind:'bool',value:true}}]}),b=>b.toString(16).padStart(2,'0')).join('');
  let refusal;try{engine.encodeParquetWire({kind:'bool',value:true,['\ud800']:1})}catch(e){refusal={code:e.code,message:e.message}}
  return {hex,refusal};
 });
 assert.deepEqual(result,{hex:'1100',refusal:{code:'PARQUET_WIRE_ENCODE',message:'Unknown wire representation fields cannot be discarded'}});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({status:'passed',browser:browser.version(),result,pageErrors:errors.length}));
} finally {await browser.close()}
