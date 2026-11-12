// SPDX-License-Identifier: MIT OR Apache-2.0
/** Focused Chromium check of the built public browser root and Rust/WASM Avro projection. */
import {chromium} from 'playwright';

const wasmPath='dist/umf_core_wasm_bg.wasm';
const wasmFile=Bun.file(wasmPath);
if(!(await wasmFile.exists()))throw new Error(`Missing built Rust/WASM asset: ${wasmPath}; run the SDK build first`);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/umf-browser.js')return new Response(Bun.file('dist/umf-browser.js'),{headers:{'content-type':'text/javascript'}});
 if(path==='/umf_core_wasm.js')return new Response(Bun.file('dist/umf_core_wasm.js'),{headers:{'content-type':'text/javascript'}});
 if(path==='/umf_core_wasm_bg.wasm')return new Response(wasmFile,{headers:{'content-type':'application/wasm'}});
 return new Response('<!doctype html><title>UMF Avro projection</title>');
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const result=await page.evaluate(async()=>{
  const browserModulePath='/umf-browser.js';
  const umf=await import(browserModulePath);
  const source=umf.importAvroSchema(JSON.stringify({type:'record',name:'Thing',fields:[{name:'id',type:'long'}]}),{id:'browser-avro-source'});
  const bindings={id:'browser-avro-target',schemaId:'https://example.test/schemas/browser-avro',long:'decimal-string',bytes:'hex-string',union:'untagged',lossPolicy:'allow-reported-loss'} as const;
  const projected=umf.projectAvroToJsonSchema(source,bindings);
  if(projected.status!=='projected'||!projected.target||!projected.nativeSchema.includes('"$defs"')||!projected.issues.some((issue:any)=>issue.code==='LONG_ENCODING'))throw new Error('Rust/WASM Avro projection baseline failed');
  const strict=umf.projectAvroToJsonSchema(source,{...bindings,lossPolicy:'strict'});
  if(strict.status!=='blocked'||strict.target!==undefined||strict.source.id!==source.id)throw new Error('Strict projection loss refusal failed');
  if('process'in globalThis||'Buffer'in globalThis)throw new Error('Node globals leaked into browser root');
  return {projected:projected.status,lossIssues:projected.issues.length,strict:strict.status,retainedSource:strict.source.id};
 });
 if(external.length)throw new Error(`Unexpected external browser requests: ${external.join(', ')}`);
 console.log(JSON.stringify({...result,browser:browser.version(),externalRequests:external}));
}finally{await browser?.close();server.stop(true);}
