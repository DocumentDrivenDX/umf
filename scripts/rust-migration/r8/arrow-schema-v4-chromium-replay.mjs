// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay the V4 Arrow host adapter with the Arrow schema WASM runtime.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {gunzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const root=resolve(import.meta.dir,'../../..');
const wasmPackage=resolve(process.argv[2]??`${root}/bindings/core/wasm/pkg`);
const packetPath=`${root}/docs/helix/04-build/evidence/rust-migration/r5-arrow-typescript-predecessor-20261027/typescript-arrow-schema-outcomes.json.gz`;
const packetBytes=await readFile(packetPath),packet=JSON.parse(gunzipSync(packetBytes).toString('utf8'));
const builds=await Promise.all([
 Bun.build({entrypoints:[`${root}/bindings/core/wasm/index.js`],target:'browser',format:'esm',write:false}),
 Bun.build({entrypoints:[`${root}/src/adapters/arrow/index.ts`],target:'browser',format:'esm',write:false}),
 Bun.build({entrypoints:[`${root}/src/adapters/arrow/rust-default.ts`],target:'browser',format:'esm',write:false}),
 Bun.build({entrypoints:[`${root}/src/index.ts`],target:'browser',format:'esm',write:false}),
]);
for(const build of builds)assert.equal(build.success,true,JSON.stringify(build.logs));
const [binding,oracle,adapter,reference]=await Promise.all(builds.map(build=>build.outputs[0].text()));
const wasmJs=await readFile(`${wasmPackage}/umf_core_wasm.js`,'utf8');
const wasm=await readFile(`${wasmPackage}/umf_core_wasm_bg.wasm`);
const packagedBrowser=await readFile(`${root}/dist/umf-browser.js`,'utf8');
const packagedReference=await readFile(`${root}/dist/umf.js`,'utf8');
const packagedWasm=await readFile(`${root}/dist/umf_core_wasm_bg.wasm`);
const server=createServer((request,response)=>{
 const path=new URL(request.url??'/','http://127.0.0.1').pathname;
 if(path==='/'){response.writeHead(200,{'content-type':'text/html; charset=utf-8'});response.end('<!doctype html><meta charset="utf-8"><title>UMF Arrow V4</title>');return;}
 if(path==='/binding.js'){response.writeHead(200,{'content-type':'text/javascript'});response.end(binding);return;}
 if(path==='/oracle.js'){response.writeHead(200,{'content-type':'text/javascript'});response.end(oracle);return;}
 if(path==='/adapter.js'){response.writeHead(200,{'content-type':'text/javascript'});response.end(adapter);return;}
 if(path==='/reference.js'){response.writeHead(200,{'content-type':'text/javascript'});response.end(reference);return;}
 if(path==='/dist/umf-browser.js'){response.writeHead(200,{'content-type':'text/javascript'});response.end(packagedBrowser);return;}
 if(path==='/dist/umf.js'){response.writeHead(200,{'content-type':'text/javascript'});response.end(packagedReference);return;}
 if(path==='/dist/umf_core_wasm_bg.wasm'){response.writeHead(200,{'content-type':'application/wasm'});response.end(packagedWasm);return;}
 if(path==='/bindings/core/wasm/pkg/umf_core_wasm.js'){response.writeHead(200,{'content-type':'text/javascript'});response.end(wasmJs);return;}
 if(path==='/bindings/core/wasm/pkg/umf_core_wasm_bg.wasm'){response.writeHead(200,{'content-type':'application/wasm'});response.end(wasm);return;}
 if(path==='/pkg/umf_core_wasm.js'){response.writeHead(200,{'content-type':'text/javascript'});response.end(wasmJs);return;}
 if(path==='/pkg/umf_core_wasm_bg.wasm'){response.writeHead(200,{'content-type':'application/wasm'});response.end(wasm);return;}
 response.writeHead(404);response.end('missing');
});
await new Promise(done=>server.listen(Number(process.env.UMF_CHROMIUM_PORT??41739),'127.0.0.1',done));
const address=server.address();assert(address&&typeof address!=='string');
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),pageErrors=[];page.on('pageerror',error=>pageErrors.push(String(error)));
 await page.goto(`http://127.0.0.1:${address.port}/`);
 const result=await page.evaluate(async({packet})=>{
  const wasm=await import('/pkg/umf_core_wasm.js');await wasm.default('/pkg/umf_core_wasm_bg.wasm');
  const binding=await import('/binding.js'),adapter=await import('/adapter.js'),oracle=await import('/oracle.js'),reference=await import('/reference.js');
  const engine=binding.createArrowSchemaEngine(wasm),subject=adapter.bindArrowSchemaRust(engine,binding.isNativeUmfCoreError);
  const capture=(run,errorType=adapter.UmfError)=>{try{return {kind:'return',value:run()};}catch(error){return {kind:'throw',thrown:error,error:{code:error?.code??null,path:error?.path??null,message:error?.message??String(error),publicUmfError:error instanceof errorType}};}};
  const importDoc=(text,id)=>subject.importArrowSchema(text,{id});
  const same=(a,b,label)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${label} mismatch`);};
  function check(actual,expected,label){
   if(actual.kind!==expected.kind)throw new Error(`${label} kind mismatch`);
   if(expected.kind==='return'){
    same(actual.value,JSON.parse(expected.outputJson),`${label} JSON`);
    if(expected.nativeOutputBytes){const bytes=Uint8Array.from(atob(expected.nativeOutputBytes.utf8Base64),c=>c.charCodeAt(0));if(actual.value!==new TextDecoder().decode(bytes))throw new Error(`${label} native bytes mismatch`);}
   }else{
    same({code:actual.error.code,path:actual.error.path,message:actual.error.message},{code:expected.error.code,path:expected.error.path,message:expected.error.message},`${label} error`);
    if(expected.error.name==='UmfError'&&!actual.error.publicUmfError)throw new Error(`${label} was not public UmfError`);
   }
  }
  let corpusOperations=0;
  for(const row of packet.corpus){
   const imported=capture(()=>importDoc(row.inputJson,row.id));check(imported,row.operations.importArrowSchema,`${row.id} import`);corpusOperations++;
   const doc=imported.value,before=JSON.stringify(doc);
   for(const [name,run] of [['inspectArrow',()=>subject.inspectArrow(doc)],['exportArrowSchema',()=>subject.exportArrowSchema(doc)],['getArrowNode',()=>subject.getArrowNode(doc,'')],['proposeArrowNodeEdit',()=>subject.proposeArrowNodeEdit(doc,'/fields/0/name',JSON.stringify(`${row.id}-edited`))]]){check(capture(run),row.operations[name],`${row.id} ${name}`);corpusOperations++;}
   if(JSON.stringify(doc)!==before)throw new Error(`${row.id} input mutated`);
  }
  let referenceOperations=0;
  for(const row of packet.corpus){
   const imported=capture(()=>reference.importArrowSchema(row.inputJson,{id:row.id}));check(imported,row.operations.importArrowSchema,`reference ${row.id} import`);referenceOperations++;
   const doc=imported.value;
   for(const [name,run] of [['inspectArrow',()=>reference.inspectArrow(doc)],['exportArrowSchema',()=>reference.exportArrowSchema(doc)],['getArrowNode',()=>reference.getArrowNode(doc,'')],['proposeArrowNodeEdit',()=>reference.proposeArrowNodeEdit(doc,'/fields/0/name',JSON.stringify(`${row.id}-edited`))]]){check(capture(run),row.operations[name],`reference ${row.id} ${name}`);referenceOperations++;}
  }
  if(referenceOperations!==260)throw new Error('unexpected explicit reference replay count');
  const publicBrowser=await import('/dist/umf-browser.js'),publicReference=await import('/dist/umf.js');
  let packagedBrowserOperations=0,packagedReferenceOperations=0;
  for(const [label,module,counter] of [['packaged browser',publicBrowser,'browser'],['packaged reference',publicReference,'reference']]){
   for(const row of packet.corpus){
    const imported=capture(()=>module.importArrowSchema(row.inputJson,{id:row.id}),module.UmfError);check(imported,row.operations.importArrowSchema,`${label} ${row.id} import`);
    if(counter==='browser')packagedBrowserOperations++;else packagedReferenceOperations++;
    const doc=imported.value;
    for(const [name,run] of [['inspectArrow',()=>module.inspectArrow(doc)],['exportArrowSchema',()=>module.exportArrowSchema(doc)],['getArrowNode',()=>module.getArrowNode(doc,'')],['proposeArrowNodeEdit',()=>module.proposeArrowNodeEdit(doc,'/fields/0/name',JSON.stringify(`${row.id}-edited`))]]){
     check(capture(run,module.UmfError),row.operations[name],`${label} ${row.id} ${name}`);
     if(counter==='browser')packagedBrowserOperations++;else packagedReferenceOperations++;
    }
   }
  }
  if(packagedBrowserOperations!==260||packagedReferenceOperations!==260)throw new Error('packaged root replay count mismatch');
  let focusedImports=0,focusedOperations=0;
  for(const row of packet.focused){
   if(row.name==='proxy-reflection-throw-identity'||!row.import)continue;
   const imported=capture(()=>importDoc(row.inputJson,row.id));check(imported,row.import,`${row.name} import`);focusedImports++;
   if(imported.kind!=='return')continue;
   const doc=imported.value,before=JSON.stringify(doc),ops=row.operations??{};
   const pointer=row.name==='future-type-duplicate-metadata-exact-numbers'?'/fields/0/type/parameter':['dictionary-scientific-integer','map-layout','run-end-layout'].includes(row.name)?'/fields/0':'';
   const replacement=row.name==='future-type-duplicate-metadata-exact-numbers'?'"changed"':JSON.stringify(`${row.id}-edited`);
   for(const [name,run] of [['inspectArrow',()=>subject.inspectArrow(doc)],['exportArrowSchema',()=>subject.exportArrowSchema(doc)],['getArrowNode',()=>subject.getArrowNode(doc,pointer)],['proposeArrowNodeEdit',()=>subject.proposeArrowNodeEdit(doc,'/fields/0/name',replacement)]])if(ops[name]){check(capture(run),ops[name],`${row.name} ${name}`);focusedOperations++;}
   if(JSON.stringify(doc)!==before)throw new Error(`${row.name} input mutated`);
  }
  const controls=packet.focused.find(row=>row.name==='operation-errors-and-edit-controls'),controlDoc=importDoc(controls.inputJson,controls.id);focusedImports++;
  for(const [name,run] of [['get-missing-pointer',()=>subject.getArrowNode(controlDoc,'/fields/3/name')],['get-invalid-pointer-escape',()=>subject.getArrowNode(controlDoc,'/fields/0/name/~2')],['edit-invalid-json-replacement',()=>subject.proposeArrowNodeEdit(controlDoc,'/fields/0/name','{')],['edit-missing-pointer',()=>subject.proposeArrowNodeEdit(controlDoc,'/fields/3/name','"x"')],['edit-invalid-type',()=>subject.proposeArrowNodeEdit(controlDoc,'/fields/0/type','{"name":"int","bitWidth":7,"isSigned":true}')],['edit-success',()=>subject.proposeArrowNodeEdit(controlDoc,'/fields/0/name','"renamed"')]]){check(capture(run),controls.operations[name],name);focusedOperations++;}
  const representation=packet.focused.find(row=>row.name==='unknown-representation-field'),representationDoc=importDoc(representation.inputJson,representation.id);focusedImports++;
  representationDoc.modules[0].elements[0].extensions['umf.arrow'].future={keep:true};
  for(const [name,run] of [['inspectArrow',()=>subject.inspectArrow(representationDoc)],['exportArrowSchema',()=>subject.exportArrowSchema(representationDoc)],['getArrowNode',()=>subject.getArrowNode(representationDoc,'/fields/0/name')],['proposeArrowNodeEdit',()=>subject.proposeArrowNodeEdit(representationDoc,'/fields/0/name','"renamed"')]]){check(capture(run),representation.operations[name],`unknown representation ${name}`);focusedOperations++;}
  if(corpusOperations!==260||focusedImports!==16||focusedOperations!==26)throw new Error('unexpected replay counts');
  const getterTrace=[];let getterReads=0;
  const malformedWithGetter=capture(()=>subject.importArrowSchema('{',{get id(){getterReads++;getterTrace.push('id');return 'getter-id';}}));
  if(malformedWithGetter.kind!=='throw'||malformedWithGetter.error.code!=='JSON_SCHEMA_SYNTAX'||!malformedWithGetter.error.publicUmfError||getterReads!==1||JSON.stringify(getterTrace)!=='["id"]')throw new Error('options getter order/read count mismatch');
  const sentinel={source:'document ownKeys'},doc=importDoc('{"fields":[],"metadata":[]}','proxy'),proxy=new Proxy(doc,{ownKeys(){throw sentinel;}});
  if(capture(()=>subject.inspectArrow(proxy)).thrown!==sentinel)throw new Error('source Proxy trap object identity changed');
  const publicGetterReads=[];let publicGetterCount=0;
  const publicGetter=capture(()=>publicBrowser.importArrowSchema('{',{get id(){publicGetterCount++;publicGetterReads.push('id');return 'getter-id';}}),publicBrowser.UmfError);
  if(publicGetter.kind!=='throw'||publicGetter.error.code!=='JSON_SCHEMA_SYNTAX'||!publicGetter.error.publicUmfError||publicGetterCount!==1||JSON.stringify(publicGetterReads)!=='["id"]')throw new Error('packaged browser options getter order/read count mismatch');
  const publicSentinel={source:'packaged public document ownKeys'},publicDoc=publicBrowser.importArrowSchema('{"fields":[],"metadata":[]}',{id:'proxy'}),publicProxy=new Proxy(publicDoc,{ownKeys(){throw publicSentinel;}});
  if(capture(()=>publicBrowser.inspectArrow(publicProxy),publicBrowser.UmfError).thrown!==publicSentinel)throw new Error('packaged browser source Proxy identity mismatch');
  if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw new Error('Node globals leaked into Chromium');
  if(!oracle.importArrowSchema)throw new Error('retained TypeScript reference is unavailable');
  if(capture(()=>oracle.importArrowSchema('{',{id:'id'})).error?.code!=='JSON_SCHEMA_SYNTAX')throw new Error('reference route changed');
  engine.dispose();
  return {status:'pass',corpusCases:packet.corpus.length,corpusOperations,referenceOperations,packagedBrowserOperations,packagedReferenceOperations,focusedCases:packet.focused.length,focusedImports,focusedOperations,optionsGetterReads:getterReads,packagedBrowserOptionsGetterReads:publicGetterCount,sourceProxyIdentity:true,nodeGlobals:false};
 },{packet});
 assert.deepEqual(pageErrors,[]);
 console.log(JSON.stringify({status:'pass',runtime:'Chromium',version:browser.version(),platform:`${process.platform}-${process.arch}`,adapterSha256:createHash('sha256').update(adapter).digest('hex'),wasmSha256:createHash('sha256').update(wasm).digest('hex'),packagedBrowserSha256:createHash('sha256').update(packagedBrowser).digest('hex'),packagedReferenceSha256:createHash('sha256').update(packagedReference).digest('hex'),packagedWasmSha256:createHash('sha256').update(packagedWasm).digest('hex'),packetSha256:createHash('sha256').update(packetBytes).digest('hex'),...result,pageErrors},null,2));
}finally{if(browser)await browser.close();server.close();}
