// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {chromium} from 'playwright';
import {buildBindingBrowserRuntime} from './binding/browser-runtime';
import {sharedSdkBrowserWasm,writeLoaderContractRuntimeAssets} from './loader-contract-assets';

const scratch=await mkdtemp(join(tmpdir(),'umf-loader-browser-'));
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
let server:ReturnType<typeof Bun.serve>|undefined;
try {
 const [{browserJs,wasmBytes}]=await Promise.all([buildBindingBrowserRuntime(sharedSdkBrowserWasm()),writeLoaderContractRuntimeAssets(scratch)]);
 const js=new Set(['/loader-contract.js','/loader-contract-validator.js']);
 server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
  const path=new URL(request.url).pathname;
  const javascript={'content-type':'text/javascript'};
  if(path==='/')return new Response('<!doctype html><title>UMF loader contract</title>',{headers:{'content-type':'text/html'}});
  if(path==='/umf-browser.js')return new Response(browserJs,{headers:javascript});
  if(path==='/umf_core_wasm.js')return new Response(Bun.file(join(dirname(wasmBytes),'umf_core_wasm.js')),{headers:javascript});
  if(path==='/umf_core_wasm_bg.wasm')return new Response(Bun.file(wasmBytes),{headers:{'content-type':'application/wasm'}});
  if(js.has(path))return new Response(Bun.file(join(scratch,path.slice(1))),{headers:javascript});
  return new Response(null,{status:404});
 }});
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),url=`http://127.0.0.1:${server.port}`,external:string[]=[];
 let wasmRequests=0;
 await page.route('**/*',route=>{
  if(!route.request().url().startsWith(url+'/')){external.push(route.request().url());return route.abort();}
  if(route.request().url()===url+'/umf_core_wasm_bg.wasm')wasmRequests++;
  return route.continue();
 });
 await page.goto(url);
 const result=await page.evaluate(async()=>{
  const loaderPath='/loader-contract.js',sdkPath='/umf-browser.js';
  const {createValidator,generateDomainPackLoaderSchema}=await import(loaderPath);
  const {Registry,securityPackage,securityRegistry}=await import(sdkPath);
  const first=createValidator(),second=createValidator();
  const id='urn:umf:browser-loader-test';
  first.addSchema({$id:id,type:'object',const:{a:1,b:2}});
  const testFirst=first.compile({$ref:id}),testSecond=second.compile({type:'string'});
  const firstAccepted=testFirst({b:2,a:1}),secondAccepted=testSecond('ready');
  const refused=!testFirst({a:1,b:3})&&testFirst.errors?.[0]?.keyword==='const';
  let schemaConflict=false,registryConflict=false;
  try{first.addSchema({$id:id,type:'object',const:{a:1,b:3}});}catch{schemaConflict=true;}
  const registry=securityRegistry(new Registry().register(securityPackage,()=>[]));
  securityRegistry(registry);
  try{registry.register({...securityPackage,description:'different'});}catch(error){registryConflict=(error as {code?:string}).code==='DUPLICATE_VERSION';}
  return {firstAccepted,secondAccepted,refused,schemaConflict,registryConflict,generated:!!generateDomainPackLoaderSchema().$id};
 });
 assert.deepEqual(result,{firstAccepted:true,secondAccepted:true,refused:true,schemaConflict:true,registryConflict:true,generated:true});
 assert.deepEqual(external,[]);
 assert.equal(wasmRequests,1);
 console.log('Chromium passed loader schema references, exact equality, validator isolation, and registry replacement.');
}finally{
 await browser?.close();
 server?.stop(true);
 await rm(scratch,{recursive:true,force:true});
}
