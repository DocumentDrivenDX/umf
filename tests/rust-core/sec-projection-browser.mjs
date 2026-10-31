import assert from 'node:assert/strict';
import {readFile, mkdir, rm, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {chromium} from 'playwright';

const pkgSource=process.env.UMF_SEC_PROJECTION_WASM_PKG;
if(!pkgSource)throw new Error('Set UMF_SEC_PROJECTION_WASM_PKG to fresh wasm-bindgen --target web output');
const root=resolve(import.meta.dir,'../..'),stage='/private/tmp/umf-sec-projection-browser';
await rm(stage,{recursive:true,force:true});await mkdir(join(stage,'pkg'),{recursive:true});
for(const file of ['umf_core_wasm.js','umf_core_wasm_bg.wasm'])await writeFile(join(stage,'pkg',file),await readFile(join(pkgSource,file)));
await writeFile(join(stage,'package.json'),'{"type":"module"}');
const build=await Bun.build({entrypoints:[join(root,'src/domain-packs/sec-projection-rust.ts')],target:'browser',format:'esm',write:false});
if(!build.success)throw new Error(build.logs.map(log=>log.message).join('\n'));
await writeFile(join(stage,'adapter.js'),await build.outputs[0].text());
const submissions=await readFile(join(root,'spec/domain-packs/public-company-intelligence/sources/scoped-submissions-0000004962.json'));
const facts=await readFile(join(root,'spec/domain-packs/public-company-intelligence/sources/scoped-companyfacts-0000004962.json'));
const server=Bun.serve({port:0,hostname:'127.0.0.1',async fetch(request){
  const path=new URL(request.url).pathname;
  if(path==='/')return new Response('<!doctype html><meta charset="utf-8">',{headers:{'content-type':'text/html'}});
  if(path==='/submissions.json')return new Response(submissions,{headers:{'content-type':'application/json'}});
  if(path==='/facts.json')return new Response(facts,{headers:{'content-type':'application/json'}});
  try{const bytes=await readFile(join(stage,path));return new Response(bytes,{headers:{'content-type':path.endsWith('.wasm')?'application/wasm':'text/javascript'}});}
  catch{return new Response('missing',{status:404});}
}});let browser;
try{browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();await page.goto(server.url.toString());
const result=await page.evaluate(async()=>{const {createSecProjectionRustOperations}=await import('/adapter.js');const wasm=await import('/pkg/umf_core_wasm.js');await wasm.default();const input=await fetch('/submissions.json').then(r=>r.text());const facts=await fetch('/facts.json').then(r=>r.text());const operations=createSecProjectionRustOperations({submissions:(a,b)=>wasm.projectSecSubmissionsUtf16Wire(a,b),companyFacts:(a,b)=>wasm.projectSecCompanyFactsUtf16Wire(a,b)});const projected=operations.projectSecSubmissions(input,'browser/scoped');if(!projected.filings.length)throw Error('no projected SEC filings');const source='browser/\u0000\ud800';const observations=operations.projectSecCompanyFacts(facts,source);const returnedSource=observations[0]?.snapshot_id;if(!returnedSource||returnedSource.charCodeAt(8)!==0||returnedSource.charCodeAt(9)!==0xd800)throw Error('UTF-16 source identity changed');const capture=(text)=>{try{operations.projectSecSubmissions(text,'')}catch(e){return{name:e.name,code:e.code??null,message:e.message}}};const malformed=capture('{');const wrongRoot=capture('[]');if(malformed?.name!=='UmfError'||malformed.code!=='JSON_SCHEMA_SYNTAX'||wrongRoot?.message!=='Expected SEC object')throw Error(`validation precedence mismatch: ${JSON.stringify({malformed,wrongRoot})}`);if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw Error('Node globals leaked');return{filings:projected.filings.length,observations:observations.length,isolatedSurrogateAndNul:true,parseAndRootPrecedence:true,browserGlobals:true};});
assert.equal(result.browserGlobals,true);console.log(JSON.stringify({status:'pass',browser:'Chromium',version:browser.version(),...result}));
}finally{await browser?.close();server.stop();}
