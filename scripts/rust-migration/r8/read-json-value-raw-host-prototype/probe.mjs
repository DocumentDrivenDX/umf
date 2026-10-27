// SPDX-License-Identifier: MIT OR Apache-2.0
// Requires UMF_RAW_HOST_PROTOTYPE_ADDON pointing to the locally built .node.
import {createRequire} from 'node:module';
import {readJsonValue as defaultRoute} from '../../../../dist/umf-node.js';
import {readJsonValue as reference} from '../../../../dist/umf.js';
import {createEngine} from '../../../../bindings/core/node/index.js';

const require=createRequire(import.meta.url);
const addon=require(process.env.UMF_RAW_HOST_PROTOTYPE_ADDON);
const engine=createEngine({coreSchema:null,referenceSchema:null,packageSchema:null,constraints:null,domainPolicy:null});
const sentinel=new Error('coercion sentinel');
const throwingLength={};Object.defineProperty(throwingLength,'length',{get(){throw sentinel}});
const trace=[];
const overLimit=text=>text.length>100_000;
const readLength=text=>text.length;
const proxy=new Proxy({}, {get(_target,key){trace.push(`get:${String(key)}`);return key==='length'?1:undefined},getPrototypeOf(target){trace.push('getPrototypeOf');return Reflect.getPrototypeOf(target)},ownKeys(target){trace.push('ownKeys');return Reflect.ownKeys(target)}});
const cases=[
 ['undefined-text',undefined],['null-text',null],['number-text',1],['boolean-text',true],['symbol-text',Symbol('text')],['plain-object-text',{}],
 ['length-getter-throw-identity',throwingLength],['proxy-text-first-fault',proxy],['format-object-fallback','x: 1\n',{}],['format-number-fallback','x: 1\n',1],['format-symbol-fallback','x: 1\n',Symbol('format')],
];
function observe(run){try{return {status:'returned',value:run()}}catch(error){return {status:'threw',name:error?.name,code:error?.code,path:error?.path,message:error?.message,identity:error===sentinel}}}
const rows=cases.map(([id,source,format])=>{
 trace.length=0;const expected=observe(()=>reference(source,format));const expectedTrace=[...trace];
 trace.length=0;const defaultActual=observe(()=>defaultRoute(source,format));const defaultTrace=[...trace];
 trace.length=0;const actual=observe(()=>{
   const admitted=addon.admitReadJsonValueSource(source,overLimit,readLength);
   return engine.readJsonValue(admitted,format==='json'?'json':'yaml');
 });const actualTrace=[...trace];
 return {id,expected,defaultActual,actual,expectedTrace,defaultTrace,actualTrace,matches:JSON.stringify(expected)===JSON.stringify(defaultActual)&&JSON.stringify(expectedTrace)===JSON.stringify(defaultTrace)&&JSON.stringify(expected)===JSON.stringify(actual)&&JSON.stringify(expectedTrace)===JSON.stringify(actualTrace)};
});
console.log(JSON.stringify({runtime:process.versions.bun?'bun':'node',rows,mismatches:rows.filter(x=>!x.matches).length}));
