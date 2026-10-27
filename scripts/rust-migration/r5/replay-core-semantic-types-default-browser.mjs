// SPDX-License-Identifier: MIT OR Apache-2.0
// Real Chromium replay of the V4 source default root against frozen R5 cases.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const root=process.cwd();
const packet=JSON.parse(await readFile(resolve(root,'docs/helix/04-build/evidence/rust-migration/r5-core-semantic-types/frozen-typescript.json'),'utf8'));
const bundle=process.env.UMF_R5_BROWSER_BUNDLE??'/private/tmp/core-semantic-source.mjs';
const wasm=resolve(root,process.env.UMF_R5_WASM_PATH??'bindings/core/wasm/pkg/umf_core_wasm_bg.wasm');
const server=createServer(async(request,response)=>{
 const path=new URL(request.url??'/', 'http://localhost').pathname;
 try{
  if(path==='/'){response.writeHead(200,{'content-type':'text/html'});response.end('<!doctype html><meta charset="utf-8">');return;}
  if(path==='/frozen.json'){response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify(packet));return;}
  if(path==='/core-semantic-source.mjs'){response.writeHead(200,{'content-type':'text/javascript'});response.end(await readFile(bundle));return;}
  if(path==='/umf_core_wasm_bg.wasm'){response.writeHead(200,{'content-type':'application/wasm'});response.end(await readFile(wasm));return;}
 }catch{}
 response.writeHead(404);response.end('missing');
});
await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));
let browser;
try{
 browser=await chromium.launch({headless:true,timeout:30_000,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const actual=await page.evaluate(async()=>{
  const packet=await(await fetch('/frozen.json')).json();
  const api=await import('/core-semantic-source.mjs');
  const doc={umf:'0.10.0',id:'r5-semantic-types',vocabularies:{},modules:[{id:'m',namespace:'https://example.test',elements:[{id:'e',extensions:{},semanticTypes:[{vocabulary:'example.contact',version:'1.0.0',term:'email',qualifier:{future:'preserve'}}]}]}]};
  const missing=structuredClone(doc);delete missing.modules[0].elements[0].semanticTypes;
  const identity={module:'m',element:'e'},requested=[{vocabulary:'example.contact',version:'1.0.0',term:'email',qualifier:{future:'preserve'}}],old={...structuredClone(missing),umf:'0.9.0'};
  const capture=run=>{try{return{ok:true,value:run()}}catch(error){return{ok:false,error:{code:error?.code??null,message:String(error?.message??error),path:error?.path??null}}}};
  const outcomes={
   inspect:()=>api.inspectCoreSemanticTypes(doc,identity),
   inspect_missing:()=>api.inspectCoreSemanticTypes(missing,identity),
   get:()=>api.getCoreSemanticTypes(doc,identity),
   declare:()=>api.declareCoreSemanticTypes(missing,identity,requested),
   declare_missing_types:()=>api.declareCoreSemanticTypes(missing,identity,undefined),
   clear:()=>api.declareCoreSemanticTypes(doc,identity,null),
   invalid_identity_precedes_document:()=>api.inspectCoreSemanticTypes({umf:'bad'},{module:'',element:'e'}),
   invalid_reference_precedes_document:()=>api.declareCoreSemanticTypes({umf:'bad'},identity,[{vocabulary:'',version:'1',term:'x'}]),
   old_version_inspect_refusal:()=>api.inspectCoreSemanticTypes(old,identity),
   old_version_get_refusal:()=>api.getCoreSemanticTypes({...doc,umf:'0.9.0'},identity),
   old_version_declare_refusal:()=>api.declareCoreSemanticTypes(old,identity,requested),
  };
  const result=Object.fromEntries(Object.entries(outcomes).map(([name,run])=>[name,capture(run)]));
  const declaration=result.declare.value;
  result.verify=capture(()=>api.verifyCoreSemanticTypeDeclaration(declaration,declaration.target));
  const unknown=structuredClone(declaration);unknown.source=doc;unknown.request.types=null;
  result.verify_unknown_qualifier_recompute=capture(()=>api.verifyCoreSemanticTypeDeclaration(unknown,unknown.target));
  const forged=structuredClone(declaration);forged.provenance.origin='forged';
  result.verify_forged=capture(()=>api.verifyCoreSemanticTypeDeclaration(forged,declaration.target));
  const extra=structuredClone(declaration);extra.futureReceiptField=true;
  result.verify_extra_receipt_field=capture(()=>api.verifyCoreSemanticTypeDeclaration(extra,declaration.target));
  const malformed=structuredClone(declaration);malformed.request.types=[];
  result.verify_malformed_request=capture(()=>api.verifyCoreSemanticTypeDeclaration(malformed,declaration.target));
  let publicErrorIdentity=false;try{api.inspectCoreSemanticTypes({umf:'bad'},{module:'',element:'e'})}catch(error){publicErrorIdentity=error instanceof api.UmfError}
  return{result,expected:packet.cases,publicErrorIdentity,nodeGlobalsAbsent:typeof process==='undefined'&&typeof Buffer==='undefined',exportKinds:['inspectCoreSemanticTypes','getCoreSemanticTypes','declareCoreSemanticTypes','verifyCoreSemanticTypeDeclaration'].map(name=>typeof api[name])};
 });
 assert.deepEqual(actual.exportKinds,['function','function','function','function']);
 assert.equal(actual.nodeGlobalsAbsent,true);
 assert.equal(actual.publicErrorIdentity,true,'native refusal must use the public UmfError class');
 assert.deepEqual(actual.result,actual.expected,'Chromium V4 default route differs from frozen predecessor');
 assert.equal(actual.result.inspect.value.meaning.types[0].qualifier.future,'preserve');
 console.log(JSON.stringify({status:'pass',chromium:browser.version(),cases:Object.keys(actual.result).length,nodeGlobalsAbsent:actual.nodeGlobalsAbsent,unknownQualifierPreserved:true,dispatch:'V4 browser source root initializes and calls Rust/WASM model engine'}));
}finally{await browser?.close();server.close();}
