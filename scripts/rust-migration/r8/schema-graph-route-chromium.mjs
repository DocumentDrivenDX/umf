// SPDX-License-Identifier: MIT OR Apache-2.0
// Real Chromium replay of the public V4 browser bundle and explicit reference.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {extname} from 'node:path';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {
  OPERATIONS, fail, openArtifact, parseReplayOptions,
} from './schema-graph-route-common.mjs';

const options = parseReplayOptions();
const artifact = await openArtifact(options,{requireBrowser:true});
let server;
let browser;
try {
  const requests=[];
  const pageErrors=[];
  const externalRequests=[];
  const operationsJson=JSON.stringify(OPERATIONS);
  const probe = `
const operations=${operationsJson};
const wasmCounts=Object.fromEntries(operations.map(op=>[op.name,0]));
const wasmResults=Object.fromEntries(operations.map(op=>[op.name,[]]));
const wasmKeys={};
function wrapExports(exports){
 return new Proxy(exports,{get(target,key,receiver){
  const op=operations.find(item=>item.wasmExport===String(key));
  const value=Reflect.get(target,key,receiver);
  if(!op||typeof value!=='function')return value;
  wasmKeys[op.name]=String(key);
  return (...args)=>{wasmCounts[op.name]++;const result=Reflect.apply(value,target,args);wasmResults[op.name].push(result);return result;};
 }});
}
function wrapInstance(instance){return new Proxy(instance,{get(target,key,receiver){if(key==='exports')return wrapExports(Reflect.get(target,key,target));return Reflect.get(target,key,receiver);}});}
function wrapInstantiation(result){
 if(result&&result.instance)return {...result,instance:wrapInstance(result.instance)};
 if(result&&typeof result==='object'&&'exports' in result)return wrapInstance(result);
 throw Error('WASM instantiation result shape is unsupported');
}
const originalInstantiate=WebAssembly.instantiate.bind(WebAssembly);
WebAssembly.instantiate=async(...args)=>wrapInstantiation(await originalInstantiate(...args));
if(WebAssembly.instantiateStreaming){const originalStreaming=WebAssembly.instantiateStreaming.bind(WebAssembly);WebAssembly.instantiateStreaming=async(...args)=>wrapInstantiation(await originalStreaming(...args));}
function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';return JSON.stringify(value);}
function pointer(root,path){if(path==='')return root;if(!path.startsWith('/'))throw Error('Invalid provider JSON Pointer: '+path);return path.slice(1).split('/').map(x=>x.replaceAll('~1','/').replaceAll('~0','~')).reduce((x,k)=>x?.[k],root);}
function aliasClasses(root){const paths=new WeakMap(),active=new WeakSet();function visit(value,path){if(value===null||typeof value!=='object')return;const locations=paths.get(value)||[];locations.push(path);paths.set(value,locations);if(active.has(value))return;active.add(value);if(Array.isArray(value))value.forEach((x,i)=>visit(x,path+'/'+i));else for(const key of Object.keys(value))visit(value[key],path+'/'+key.replaceAll('~','~0').replaceAll('/','~1'));active.delete(value);}visit(root,'');const groups=[],seen=new WeakSet();function collect(value){if(value===null||typeof value!=='object'||seen.has(value))return;seen.add(value);const locations=paths.get(value);if(locations?.length>1)groups.push([...locations].sort());if(Array.isArray(value))value.forEach(collect);else Object.keys(value).forEach(key=>collect(value[key]));}collect(root);return groups.sort((a,b)=>a[0].localeCompare(b[0]));}
function validateGraph(text,actual,reference,name){let graph;try{graph=JSON.parse(text);}catch{throw Error(name+' provider returned malformed JSON');}if(!graph||typeof graph!=='object'||!graph.schema||!Array.isArray(graph.aliasGroups))throw Error(name+' provider returned an invalid schema graph');if(canonical(actual)!==canonical(reference))throw Error(name+' default/reference JSON differs');if(canonical(graph.schema)!==canonical(actual))throw Error(name+' provider schema differs from public default');const aliases=aliasClasses(reference),actualAliases=aliasClasses(actual),wireAliases=graph.aliasGroups.map(group=>{if(!Array.isArray(group)||group.length<2)throw Error(name+' malformed alias group');const values=group.map(path=>pointer(graph.schema,path));if(values.some(value=>value===null||typeof value!=='object'))throw Error(name+' alias path did not resolve to an object');if(values.some(value=>canonical(value)!==canonical(values[0])))throw Error(name+' alias values differ');return [...group].sort();}).sort((a,b)=>a[0].localeCompare(b[0]));if(canonical(actualAliases)!==canonical(aliases)||canonical(wireAliases)!==canonical(aliases))throw Error(name+' alias classes differ from TypeScript predecessor');return aliases;}
function mutationCheck(first,second,reference,aliases,name){if(first===second)throw Error(name+' reused a top-level result');if(canonical(second)!==canonical(reference))throw Error(name+' second result differs from predecessor');for(let i=0;i<aliases.length;i++){const value=pointer(first,aliases[i][0]);if(!value||typeof value!=='object')throw Error(name+' alias mutation source is not an object');const marker='__umf_schema_graph_probe_'+i+'__';value[marker]=true;for(const path of aliases[i])if(pointer(first,path)!==value||pointer(first,path)[marker]!==true)throw Error(name+' alias mutation did not propagate');}if(canonical(second)!==canonical(reference))throw Error(name+' mutation escaped into fresh result');return {freshInstance:true,mutationPropagation:true,aliasGroups:aliases.length};}
try{
 const [defaultApi,referenceApi]=await Promise.all([import('/umf-browser.js'),import('/umf.js')]);
 const baseline={...wasmCounts};
 for(const op of operations)wasmResults[op.name].length=0;
 const results={};
 for(const op of operations){
  const fn=defaultApi[op.name],reference=referenceApi[op.name];
  if(typeof fn!=='function'||typeof reference!=='function')throw Error(op.name+' public default/reference export is missing');
  if(fn.name!==op.name||fn.length!==0||reference.name!==op.name||reference.length!==0)throw Error(op.name+' public name/arity mismatch');
  const first=fn(),second=fn(),expected=reference();
  const calls=wasmCounts[op.name]-baseline[op.name];
  if((calls!==0&&calls!==2)||(wasmResults[op.name].length!==0&&wasmResults[op.name].length!==2)||calls!==wasmResults[op.name].length)throw Error(op.name+' WASM provider counter instrumentation was partial');
  const aliases=aliasClasses(expected);
  if(canonical(aliasClasses(first))!==canonical(aliases))throw Error(op.name+' public identity classes differ from TypeScript predecessor');
  const directGraphObserved=wasmResults[op.name].length===2&&wasmResults[op.name].every(value=>typeof value==='string');
  if(directGraphObserved){
   const wireAliases=validateGraph(wasmResults[op.name][0],first,expected,op.name);
   if(canonical(JSON.parse(wasmResults[op.name][1]))!==canonical(JSON.parse(wasmResults[op.name][0])))throw Error(op.name+' provider output was unstable');
   if(calls!==2)throw Error(op.name+' provider output was captured without two direct WASM calls');
  } else if(calls!==0||wasmResults[op.name].length!==0){
   throw Error(op.name+' WASM provider counter/result instrumentation was incomplete');
  }
  const identity=mutationCheck(first,second,expected,aliases,op.name);
  results[op.name]={provider:op.provider,wasmExport:wasmKeys[op.name]??null,providerCalls:directGraphObserved?calls:null,exactJsonParity:true,aliasGroupPointers:aliases,...identity,name:fn.name,arity:fn.length};
 }
 const counterStates=operations.map(op=>({count:wasmCounts[op.name]-baseline[op.name],results:wasmResults[op.name].length}));
 const countersObserved=counterStates.every(state=>state.count===2&&state.results===2);
 const countersAbsent=counterStates.every(state=>state.count===0&&state.results===0);
 if(!countersObserved&&!countersAbsent)throw Error('WASM provider counter coverage is partial; refusing to imply a complete browser call trace');
 if(typeof process!=='undefined'||typeof Buffer!=='undefined'||typeof require!=='undefined')throw Error('Node globals are present in Chromium');
 window.__schemaGraphResult={status:'pass',runtime:navigator.userAgent,operations:results,wasmCounters:countersObserved?'directly-observed':'unobserved',routeTrace:countersObserved?'Direct WASM schema provider exports were intercepted during public bundle calls.':'V4 source binding and exact public bundle execution were exercised; direct WASM provider counters were unavailable.',nodeGlobalsAbsent:true,requireAbsent:true};
}catch(error){window.__schemaGraphResult={status:'fail',error:String(error?.message??error).slice(0,600),wasmCounts,wasmKeys,nodeGlobalsAbsent:typeof process==='undefined'&&typeof Buffer==='undefined'&&typeof require==='undefined',requireAbsent:typeof require==='undefined'};}
`;
  const html='<!doctype html><meta charset="utf-8"><script type="module" src="/schema-graph-probe.js"></script>';
  server=createServer(async(request,response)=>{
    const path=new URL(request.url??'/', 'http://127.0.0.1').pathname;
    requests.push(path);
    try {
      if(path==='/') {response.writeHead(200,{'content-type':'text/html'});response.end(html);return;}
      if(path==='/schema-graph-probe.js') {response.writeHead(200,{'content-type':'text/javascript'});response.end(probe);return;}
      const names=new Map([
        ['/umf-browser.js',artifact.files.browser],
        ['/umf.js',artifact.files.reference],
        ['/umf_core_wasm_bg.wasm',artifact.files.wasm],
      ]);
      const file=names.get(path);
      if(!file) {response.writeHead(404);response.end('not found');return;}
      const bytes=await readFile(file);
      response.writeHead(200,{'content-type':extname(file)==='.wasm'?'application/wasm':'text/javascript','content-length':bytes.length});
      response.end(bytes);
    } catch {
      response.writeHead(500);response.end('schema graph replay asset error');
    }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const address=server.address();
  if(!address||typeof address==='string')fail('Could not bind the local Chromium replay server');
  browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
  const page=await browser.newPage();
  page.on('pageerror',error=>pageErrors.push(String(error).slice(0,500)));
  page.on('request',request=>{if(new URL(request.url()).origin!==`http://127.0.0.1:${address.port}`)externalRequests.push(request.url().slice(0,300));});
  await page.goto(`http://127.0.0.1:${address.port}/`);
  await page.waitForFunction(()=>Boolean(window.__schemaGraphResult),undefined,{timeout:90_000});
  const result=await page.evaluate(()=>window.__schemaGraphResult);
  assert.equal(result.status,'pass',result.error??'browser replay failed');
  assert.equal(result.nodeGlobalsAbsent,true);
  assert.equal(result.requireAbsent,true);
  assert.deepEqual(pageErrors,[]);
  assert.deepEqual(externalRequests,[]);
  assert(requests.includes('/umf_core_wasm_bg.wasm'),'Chromium did not request adjacent WASM');
  process.stdout.write(`${JSON.stringify({
    status:'pass',
    artifact:{input:options.input,artifactSha256:artifact.artifactSha,manifestSha256:artifact.manifestSha,packageJsonSha256:artifact.packageSha,packageManifestSha256:artifact.packageManifestSha256,sourceClosureSha256:artifact.sourceClosureSha256},
    chromium:{version:browser.version(),userAgent:result.runtime,operations:result.operations,wasmRequested:true,wasmCounters:result.wasmCounters,routeTrace:result.routeTrace,nodeGlobalsAbsent:result.nodeGlobalsAbsent,requireAbsent:result.requireAbsent,externalRequests:externalRequests.length,pageErrors:pageErrors.length},
    limits:'Private built/installed browser route replay for five schema graph exports; not a release qualification or declaration retirement.',
  })}\n`);
} finally {
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  await artifact.cleanup();
}
