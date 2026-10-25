// Execute frozen CONTRACT-049 schema-properties results through opt-in WASM in real Chromium.
import {readdir,readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
const root=process.cwd(),host='/private/tmp/umf-r5-schema-properties-browser',pkg=join(host,'wasm/pkg');
await mkdir(join(host,'wasm/src'),{recursive:true});await mkdir(pkg,{recursive:true});
await Bun.write(join(host,'wasm/index.js'),await readFile(join(root,'bindings/core/wasm/index.js')));
for(const file of await readdir(join(root,'bindings/core/wasm/src')))if(file.endsWith('.js'))await Bun.write(join(host,'wasm/src',file),await readFile(join(root,'bindings/core/wasm/src',file)));
await Bun.write(join(host,'wasm/package.json'),'{"type":"module"}');
for(const file of ['umf_core_wasm.js','umf_core_wasm_bg.wasm','umf_core_wasm.d.ts'])await Bun.write(join(pkg,file),await readFile(join('/private/tmp/umf-r5-schema-properties-wasm/pkg',file)));
const [frozen,resources]=await Promise.all([
  Bun.file('docs/helix/04-build/evidence/rust-migration/r5-schema-properties/frozen-typescript.json').json(),
  Promise.all(([
    ['coreSchema','spec/core/schema.json'],['referenceSchema','spec/core/semantic-type-reference.schema.json'],['packageSchema','spec/core/extension-package.schema.json'],['constraints','spec/metamodel/generated/core-constraints.json'],['domainPolicy','spec/metamodel/generated/domain-policy.json'],
  ] as const).map(async([key,path])=>[key,await Bun.file(path).json()] as const)).then(Object.fromEntries),
]);
const payload=JSON.stringify({frozen,resources});
const server=createServer(async(req,res)=>{const path=new URL(req.url??'/','http://localhost').pathname;if(path==='/'){res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><meta charset="utf-8"><title>Schema properties WASM</title>');return;}if(path==='/input.json'){res.writeHead(200,{'content-type':'application/json'});res.end(payload);return;}try{const bytes=await readFile(join(host,path));res.writeHead(200,{'content-type':path.endsWith('.wasm')?'application/wasm':path.endsWith('.js')?'text/javascript':'application/octet-stream'});res.end(bytes);}catch{res.writeHead(404);res.end('missing');}});
const port=Number(process.env.UMF_SCHEMA_PROPERTIES_PORT??38761);await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});const address=server.address();if(!address||typeof address==='string')throw Error('Browser server did not start');let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+address.port+'/');
 const result=await page.evaluate(async()=>{
  const wrapper=await import(new URL('/wasm/index.js',location.href).href),wasm=await import(new URL('/wasm/pkg/umf_core_wasm.js',location.href).href);const {frozen,resources}=await fetch('/input.json').then(r=>r.json());
  const engine=await wrapper.initializeCoreModelWasm(resources,()=>Promise.resolve(wasm),globalThis);
  const canonical=(v:any):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
  const equal=(label:string,actual:any,expected:any)=>{if(canonical(actual)!==canonical(expected))throw Error(label+' differs from frozen TypeScript');};
  const capture=(fn:()=>unknown):{ok:true;value:unknown}|{ok:false;error:{name:string;code:string;message:string;path:string}}=>{try{return{ok:true,value:fn()};}catch(e:any){return{ok:false,error:{name:e.name,code:e.code??'',message:e.message??String(e),path:e.path??''}};}};
  const {source,identity,patch,unknownFacets,unknownRange,invalidSource,unknownPatch}=frozen.inputs;const expected=frozen.success;
  equal('document inspect',engine.inspectCoreSchemaProperties(source,{scope:'document'}),expected.inspectDocument.value);
  equal('module inspect',engine.inspectCoreSchemaProperties(source,{scope:'module',module:'m'}),expected.inspectModule.value);
  equal('element inspect',engine.inspectCoreSchemaProperties(source,identity),expected.inspectElement.value);
  const original=canonical(source),declared=engine.declareCoreSchemaProperties(source,identity,patch);equal('declare',declared,expected.declare.value);if(canonical(source)!==original)throw Error('Source was mutated');
  equal('unknown unrelated group merge',engine.declareCoreSchemaProperties(unknownFacets.source,identity,unknownFacets.patch),expected.unknownUnrelatedFacetMerge.value);
  equal('unknown qualifier diagnostics',engine.inspectCoreSchemaProperties(expected.unknownQualifierInspection.value.source,expected.unknownQualifierInspection.value.identity),expected.unknownQualifierInspection.value);
  equal('patch-before-source refusal',capture(()=>engine.declareCoreSchemaProperties(unknownPatch.source,unknownPatch.identity,unknownPatch.patch)),frozen.refusals.patchBeforeInvalidSource);
  equal('source-before-identity refusal',capture(()=>engine.declareCoreSchemaProperties(invalidSource.source,invalidSource.identity,invalidSource.patch)),frozen.refusals.sourceBeforeMissingIdentity);
  equal('unknown-group refusal',capture(()=>engine.declareCoreSchemaProperties(unknownRange.source,identity,unknownRange.patch)),frozen.refusals.unknownExistingGroup);
  for(const format of ['json','yaml'])equal(format+' round trip',engine.readDocument(engine.writeDocument(declared,format),format),frozen.copyAndRoundTrip.jsonRoundTrip);
  let meteredWork=0;const metered=wrapper.createCoreModelEngine(wasm,resources,{controls:{meter:(amount:number)=>{meteredWork+=amount;}}});metered.inspectCoreSchemaProperties(source,identity);if(meteredWork===0)throw Error('Schema-properties work was not metered');
  let cancelled=false;const cancellable=wrapper.createCoreModelEngine(wasm,resources,{controls:{isCancelled:()=>cancelled}});cancelled=true;const cancellation=capture(()=>cancellable.inspectCoreSchemaProperties(source,identity));if(cancellation.ok)throw Error('Schema-properties cancellation was not enforced');if(cancellation.error.code!=='CANCELLED')throw Error('Schema-properties cancellation returned the wrong refusal');
  if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw Error('Node globals are present');
  return{inspections:3,declarations:2,refusals:3,roundTrips:2,diagnostics:3,meteredWork,cancellation:cancellation.error.code,nodeGlobalsAbsent:true};
 });
 console.log(JSON.stringify({status:'pass',chromium:browser.version(),...result}));
}finally{await browser?.close();server.close();}
