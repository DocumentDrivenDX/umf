// SPDX-License-Identifier: MIT OR Apache-2.0
// Requires UMF_RAW_HOST_WASM_NODE_MODULE pointing to wasm-bindgen Node output.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readJsonValue as reference} from '../../../../dist/umf.js';

const require=createRequire(import.meta.url);
const wasm=require(process.env.UMF_RAW_HOST_WASM_NODE_MODULE);
const sentinel=new Error('coercion sentinel');
const throwingLength={};Object.defineProperty(throwingLength,'length',{get(){throw sentinel}});
const trace=[];
const proxy=new Proxy({}, {get(_target,key){trace.push(`get:${String(key)}`);return key==='length'?1:undefined}});
const overLimit=text=>text.length>100_000;
const readLength=text=>text.length;
const cases=[['undefined-text',undefined],['null-text',null],['number-text',1],['boolean-text',true],['symbol-text',Symbol('text')],['plain-object-text',{}],['length-getter-throw-identity',throwingLength],['proxy-text-first-fault',proxy],['format-object-fallback','x: 1\n',{}],['format-number-fallback','x: 1\n',1],['format-symbol-fallback','x: 1\n',Symbol('format')]];
function observe(run){try{return {status:'returned',value:run()}}catch(error){return {status:'threw',name:error?.name,code:error?.code,path:error?.path,message:error?.message,identity:error===sentinel}}}
const rows=cases.map(([id,source,format])=>{trace.length=0;const expected=observe(()=>reference(source,format));const expectedTrace=[...trace];trace.length=0;const actual=observe(()=>wasm.readJsonValueRawPrototype(source,format,overLimit,readLength));const actualTrace=[...trace];return {id,expected,actual,expectedTrace,actualTrace,matches:JSON.stringify(expected)===JSON.stringify(actual)&&JSON.stringify(expectedTrace)===JSON.stringify(actualTrace)}});
assert.deepEqual(rows.filter(row=>!row.matches),[]);
console.log(JSON.stringify({runtime:process.versions.bun?'bun':'node',route:'wasm-bindgen Node output -> Rust raw-host readJsonValue prototype',cases:rows.length,mismatches:0,rows}));
