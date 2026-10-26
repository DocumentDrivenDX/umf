// SPDX-License-Identifier: MIT OR Apache-2.0
// Source-level Chromium replay for the Rust-owned Schema Properties host boundary.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {extname,normalize,resolve,sep} from 'node:path';
import {chromium} from 'playwright';
import {CORE_MODEL_RESOURCES} from '../../../src/access/core-model-resources';
import frozen from '../../../docs/helix/04-build/evidence/rust-migration/r5-schema-properties/frozen-typescript.json' with {type:'json'};

const root=process.cwd();
const packageRoot=process.env.UMF_SCHEMA_PROPERTIES_WASM_PACKAGE??'/private/tmp/umf-schema-properties-wasm-package';
const outputRoot='/private/tmp/umf-schema-properties-browser-replay';
const wasmBundle=resolve(outputRoot,'wasm-index.js');
const binderBundle=resolve(outputRoot,'binder.js');
const referenceBundle=resolve(outputRoot,'reference.js');
execFileSync('bun',['build','bindings/core/wasm/index.js','--target','browser','--format','esm','--outfile',wasmBundle],{cwd:root,stdio:'inherit'});
execFileSync('bun',['build','src/access/rust-schema-properties-default.ts','--target','browser','--format','esm','--outfile',binderBundle],{cwd:root,stdio:'inherit'});
execFileSync('bun',['build','src/model/schema-properties.ts','--target','browser','--format','esm','--outfile',referenceBundle],{cwd:root,stdio:'inherit'});
const inputs={resources:CORE_MODEL_RESOURCES,source:frozen.inputs.source};
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/inputs.json'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(inputs));return;}
  if(pathname==='/wasm-index.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(await readFile(wasmBundle));return;}
  if(pathname==='/binder.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(await readFile(binderBundle));return;}
  if(pathname==='/reference.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(await readFile(referenceBundle));return;}
  if(!pathname.startsWith('/pkg/'))throw Error('route');
  const relative=normalize(pathname.slice('/pkg/'.length));const path=resolve(packageRoot,relative);
  if(!path.startsWith(resolve(packageRoot)+sep))throw Error('path');
  res.writeHead(200,{'content-type':extname(path)==='.wasm'?'application/wasm':'text/javascript'});res.end(await readFile(path));
 }catch{res.writeHead(404);res.end('not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,timeout:30_000,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/inputs.json`);
 const result=await page.evaluate(async()=>{
  const {resources,source}=await(await fetch('/inputs.json')).json();
  const [{initializeCoreModelRootWasm},{bindCoreSchemaPropertiesRust},reference]=await Promise.all([import('/wasm-index.js'),import('/binder.js'),import('/reference.js')]);
  const engine=await initializeCoreModelRootWasm(resources,()=>import('/pkg/umf_core_wasm.js'),globalThis);
  const api=bindCoreSchemaPropertiesRust(engine);
  const capture=fn=>{try{return{ok:true,value:fn()};}catch(error){return{ok:false,error:{name:error.name,code:error.code??'',message:error.message??String(error),path:error.path??''}};}};
  const compare=(expected,actual)=>JSON.stringify(capture(expected))===JSON.stringify(capture(actual));
  const identity={scope:'element',module:'m',element:'quantity'};
  const basic=[
   ()=>reference.inspectCoreSchemaProperties(source,identity),()=>api.inspectCoreSchemaProperties(source,identity),
   ()=>reference.declareCoreSchemaProperties(source,identity,{title:'New title'}),()=>api.declareCoreSchemaProperties(source,identity,{title:'New title'}),
   ()=>reference.validateCoreFieldValue(source,{module:'m',element:'quantity'},{integerToken:'3'}),()=>api.validateCoreFieldValue(source,{module:'m',element:'quantity'},{integerToken:'3'}),
   ()=>reference.resolveCoreDefault(source,{module:'m',element:'quantity'},{state:'missing'}),()=>api.resolveCoreDefault(source,{module:'m',element:'quantity'},{state:'missing'}),
  ];
  const basicParity=basic.every((fn,index)=>index%2?compare(basic[index-1],fn):true);
  const malformedCarrierCases=[false,true].map(withAllowedValues=>{
   const document=structuredClone(source),label=document.modules.find(module=>module.id==='m').elements.find(element=>element.id==='label');
   label.facets={length:{min:0,max:3,unit:'unicode-scalar'}};
   if(withAllowedValues)label.allowedValues=[{string:'new'},{string:'x'}];
   const identity={module:'m',element:'label'},value={string:7};
   const expected=capture(()=>reference.validateCoreFieldValue(document,identity,value));
   const actual=capture(()=>api.validateCoreFieldValue(document,identity,value));
   return {withAllowedValues,expected,actual,parity:compare(()=>reference.validateCoreFieldValue(document,identity,value),()=>api.validateCoreFieldValue(document,identity,value))};
  });
  const invalidSource={...structuredClone(source),umf:'0.7.0'};
  const unknownIdentity={scope:'element',module:'m',element:'quantity',future:true};
  const unknownField={module:'m',element:'quantity',future:true};
  const accessorValue={};Object.defineProperty(accessorValue,'integerToken',{enumerable:true,get(){throw Error('getter must not run');}});
  const crossed=[
   ['inspect source before identity',()=>reference.inspectCoreSchemaProperties(invalidSource,unknownIdentity),()=>api.inspectCoreSchemaProperties(invalidSource,unknownIdentity)],
   ['declare patch before source',()=>reference.declareCoreSchemaProperties(invalidSource,identity,{future:true}),()=>api.declareCoreSchemaProperties(invalidSource,identity,{future:true})],
   ['declare source before identity',()=>reference.declareCoreSchemaProperties(invalidSource,unknownIdentity,{title:'x'}),()=>api.declareCoreSchemaProperties(invalidSource,unknownIdentity,{title:'x'})],
   ['field copy before identity',()=>reference.validateCoreFieldValue(source,unknownField,accessorValue),()=>api.validateCoreFieldValue(source,unknownField,accessorValue)],
   ['field source after admitted operands',()=>reference.validateCoreFieldValue(invalidSource,{module:'m',element:'quantity'},{integerToken:'3'}),()=>api.validateCoreFieldValue(invalidSource,{module:'m',element:'quantity'},{integerToken:'3'})],
   ['default state before identity',()=>reference.resolveCoreDefault(invalidSource,unknownField,{state:'missing',future:true}),()=>api.resolveCoreDefault(invalidSource,unknownField,{state:'missing',future:true})],
   ['default identity before source',()=>reference.resolveCoreDefault(invalidSource,unknownField,{state:'missing'}),()=>api.resolveCoreDefault(invalidSource,unknownField,{state:'missing'})],
   ['default source before value refusal',()=>reference.resolveCoreDefault(invalidSource,{module:'',element:'quantity'},{state:'missing'}),()=>api.resolveCoreDefault(invalidSource,{module:'',element:'quantity'},{state:'missing'})],
  ];
  const crossedResults=crossed.map(([name,expected,actual])=>({name,parity:compare(expected,actual),actual:capture(actual)}));
  const callbackStages=[
   bad=>api.inspectCoreSchemaProperties(bad,identity),bad=>api.inspectCoreSchemaProperties(source,bad),
   bad=>api.declareCoreSchemaProperties(source,identity,bad),bad=>api.declareCoreSchemaProperties(bad,identity,{title:'x'}),bad=>api.declareCoreSchemaProperties(source,bad,{title:'x'}),
   bad=>api.validateCoreFieldValue(source,{module:'m',element:'quantity'},bad),bad=>api.validateCoreFieldValue(source,bad,{integerToken:'3'}),bad=>api.validateCoreFieldValue(bad,{module:'m',element:'quantity'},{integerToken:'3'}),
   bad=>api.resolveCoreDefault(source,{module:'m',element:'quantity'},bad),bad=>api.resolveCoreDefault(source,bad,{state:'missing'}),bad=>api.resolveCoreDefault(bad,{module:'m',element:'quantity'},{state:'missing'}),
  ];
  const callbackResults=callbackStages.map(operation=>{const sentinel=Error('proxy callback');const bad=new Proxy({}, {ownKeys(){throw sentinel;}});try{operation(bad);return{same:false,returned:true};}catch(error){return{same:error===sentinel,name:error?.name,message:error?.message,code:error?.code,path:error?.path};}});
  return{basicParity,malformedCarrierCases,crossedResults,callbackResults,wasmOperation:typeof engine.inspectCoreSchemaProperties,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 });
 assert.equal(result.basicParity,true,'four methods match the TypeScript predecessor');
 assert.equal(result.malformedCarrierCases.length,2);
 assert.equal(result.malformedCarrierCases.every(item=>item.parity),true,JSON.stringify(result.malformedCarrierCases));
 assert.deepEqual(result.malformedCarrierCases.map(item=>item.expected),[
  {ok:true,value:{valid:true,complete:true,diagnostics:[]}},
  {ok:true,value:{valid:false,complete:false,diagnostics:[{code:'CORE_SCHEMA_PROPERTIES',path:'',message:'Literal is not an allowed value',severity:'error'}]}},
 ]);
 assert.equal(result.crossedResults.every(item=>item.parity),true,JSON.stringify(result.crossedResults));
 assert.equal(result.callbackResults.every(item=>item.same),true,`Proxy callback errors retain identity at every operand stage: ${JSON.stringify(result.callbackResults)}`);
 assert.equal(result.wasmOperation,'function');
 assert.equal(result.nodeGlobalsAbsent,true);
 console.log(JSON.stringify({status:'pass',runtime:'Chromium WASM source route',malformedCarrierCases:result.malformedCarrierCases.length,crossed:result.crossedResults.length,callbackStages:11,nodeGlobalsAbsent:result.nodeGlobalsAbsent}));
}finally{await browser?.close();server.close();}
