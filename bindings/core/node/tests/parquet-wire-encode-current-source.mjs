// Actual opt-in Node/Bun addon and WASM module replay against frozen TS bytes/refusals.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const repo=resolve(import.meta.dirname,'../../../..');
const host=process.env.UMF_PARQUET_ENCODE_HOST ?? 'node';
let engine;
if(host==='wasm') {
  const pkg=resolve(repo,'bindings/core/wasm/pkg');
  const wasm=await import(pathToFileURL(resolve(pkg,'umf_core_wasm.js')).href);
  await wasm.default(await readFile(resolve(pkg,'umf_core_wasm_bg.wasm')));
  const binding=await import(pathToFileURL(resolve(repo,'bindings/core/wasm/index.js')).href);
  engine=binding.createParquetCaptureEngine(wasm);
} else {
  const binding=await import(pathToFileURL(resolve(repo,'bindings/core/node/index.js')).href);
  engine=binding.createParquetCaptureEngine();
}
const frozen=JSON.parse(await readFile(resolve(repo,'tests/rust-core/fixtures/parquet-wire-encode-ts-freeze.json'),'utf8')).outcomes;
const cases=[
 {kind:'bool',value:true},{kind:'bool',value:false},{kind:'i8',value:'-128'},
 {kind:'i64',value:'-9223372036854775808'},{kind:'double',bits:'8000000000000000'},
 {kind:'binary',hex:'00abff'},{kind:'uuid',hex:'00112233445566778899aabbccddeeff'},
 {kind:'struct',fields:[{id:1,value:{kind:'bool',value:true}}]},
 {kind:'bool',value:true,['\ud800']:1},
];
const indexes=[0,1,2,6,8,9,10,null,26];
let checked=0;
for(let n=0;n<cases.length;n++){
 const value=cases[n]; const expected=indexes[n]===null?{status:'ok',hex:'1100'}:frozen[indexes[n]];
 try {const result={status:'ok',hex:Buffer.from(engine.encodeParquetWire(value)).toString('hex')};assert.deepEqual(result,expected)}
 catch(error){if(expected.status!=='error')throw error;assert.deepEqual({status:'error',code:error.code,message:error.message,path:error.path??''},expected)}
 checked++;
}
console.log(JSON.stringify({status:'passed',host,checked}));
