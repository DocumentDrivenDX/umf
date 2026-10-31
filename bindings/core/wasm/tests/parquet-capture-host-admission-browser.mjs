import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const repo=resolve(import.meta.dirname,'../../../..');
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();
 await page.route('http://umf.local/**',async route=>{
  const pathname=new URL(route.request().url()).pathname;
  if(pathname==='/')return route.fulfill({status:200,contentType:'text/html',body:'<html></html>'});
  const path=resolve(repo,'.'+pathname);
  if(!path.startsWith(repo+'/'))return route.fulfill({status:403,body:''});
  try {const body=await readFile(path);await route.fulfill({status:200,contentType:path.endsWith('.wasm')?'application/wasm':'application/javascript',body})}
  catch {await route.fulfill({status:404,body:''})}
 });
 await page.goto('http://umf.local/');
 const result=await page.evaluate(async()=>{
  const binding=await import('/bindings/core/wasm/index.js');
  const wasm=await import('/bindings/core/wasm/pkg/umf_core_wasm.js');
  await wasm.default({module_or_path:'/bindings/core/wasm/pkg/umf_core_wasm_bg.wasm'});
  const engine=binding.createParquetCaptureEngine(wasm);
  const bytes=new Uint8Array(await (await fetch('/fixtures/parquet/logical/string.parquet')).arrayBuffer());
  const source=engine.captureParquet(bytes,{id:'wasm-host-admission'});
  const append=engine.appendParquetKeyValueMetadata(source,undefined);
  const appendNestedUndefined=engine.appendParquetKeyValueMetadata(source,[{key:'custom',value:undefined}]);
  const rename=engine.renameParquetField(source,1,undefined);
  let encodeError;try{engine.encodeParquetWire({kind:'binary',hex:undefined})}catch(error){encodeError={name:error.name,code:error.code,message:error.message}}
  let uuidError;try{engine.encodeParquetWire({kind:'uuid',hex:undefined})}catch(error){uuidError={name:error.name,code:error.code,message:error.message}}
  let binarySymbolError;try{engine.encodeParquetWire({kind:'binary',hex:Symbol('bad')})}catch(error){binarySymbolError={name:error.name,code:error.code,message:error.message}}
  let uuidFunctionError;try{engine.encodeParquetWire({kind:'uuid',hex:()=> 'bad'})}catch(error){uuidFunctionError={name:error.name,code:error.code,message:error.message}}
  let unknownError;try{engine.encodeParquetWire({kind:'binary',hex:'00',unknown:undefined})}catch(error){unknownError={name:error.name,code:error.code,message:error.message}}
  const emptyMap=[...engine.encodeParquetWire({kind:'map',entries:[],keyType:undefined})];
  const framing=engine.inspectParquetFraming(source);
  return {append:{status:append.status,last:append.diagnostics.at(-1)},appendNestedUndefined:{status:appendNestedUndefined.status,last:appendNestedUndefined.diagnostics.at(-1)},rename:{status:rename.status,last:rename.diagnostics.at(-1)},encodeError,uuidError,binarySymbolError,uuidFunctionError,unknownError,emptyMap,prototypes:[Object.getPrototypeOf(framing)===Object.prototype,Object.getPrototypeOf(framing.source)===null,Object.getPrototypeOf(framing.source.modules[0])===null]};
 });
 assert.equal(result.append.status,'blocked');
 assert.equal(result.append.last.code,'PARQUET_METADATA_EDIT_BLOCKED');
 assert.equal(result.appendNestedUndefined.status,'blocked');
 assert.equal(result.appendNestedUndefined.last.code,'PARQUET_METADATA_EDIT_BLOCKED');
 assert.equal(result.rename.status,'blocked');
 assert.deepEqual(result.rename.last,{code:'PARQUET_RENAME_BLOCKED',path:'/schema/1',severity:'error',message:'Expected a nonempty lossless UTF-8 name up to 100000 UTF-16 units'});
 assert.deepEqual(result.encodeError,{name:'UmfError',code:'PARQUET_WIRE_ENCODE',message:'Binary length exceeds limit'});
 assert.deepEqual(result.uuidError,{name:'UmfError',code:'PARQUET_WIRE_ENCODE',message:'Invalid exact byte encoding'});
 assert.deepEqual(result.binarySymbolError,{name:'UmfError',code:'PARQUET_WIRE_ENCODE',message:'Binary length exceeds limit'});
 assert.deepEqual(result.uuidFunctionError,{name:'UmfError',code:'PARQUET_WIRE_ENCODE',message:'Invalid exact byte encoding'});
 assert.deepEqual(result.unknownError,{name:'UmfError',code:'PARQUET_WIRE_ENCODE',message:'Unknown wire representation fields cannot be discarded'});
 assert.deepEqual(result.emptyMap,[0]);
 assert.deepEqual(result.prototypes,[true,true,true]);
 console.log(JSON.stringify({status:'passed',browser:browser.version(),result}));
} finally {await browser.close();}
