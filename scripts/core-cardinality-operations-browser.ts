// SPDX-License-Identifier: MIT OR Apache-2.0
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {CURRENT_CORE_VERSION} from '../src/model/types';
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){return new URL(request.url).pathname==='/umf.js'?new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><html><body>Core Cardinality</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async(coreVersion:string)=>{
  const path='/umf.js',u=await import(path);let recoveries=0,refusals=0,authorRecoveries=0,authorRefusals=0;
  function source(cardinality:unknown,itemType?:unknown){return {umf:coreVersion,id:'browser',vocabularies:{future:{version:'1.0.0'}},modules:[{id:'m',namespace:'',elements:[{id:'e',kind:'field',cardinality,extensions:{future:{native:{repeated:true,unknown:'9007199254740993'}}},...(itemType===undefined?{}:{itemType})},{id:'item',kind:'field',scalarType:'integer',nullability:'absent-allowed',extensions:{}}]}]};}
  const equal=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Recovery mismatch');};
  for(const label of ['one','array','map','unspecified','future-container']){const doc=source(label);if(!u.validateDocument(doc).valid)throw Error('Valid shape refused');for(const format of ['json','yaml']){equal(u.readDocument(u.writeDocument(doc,format),format),doc);recoveries++;}}
  for(const shape of ['array','map'])for(const target of ['item','e']){const doc=source(shape,{module:'m',element:target});for(const format of ['json','yaml']){equal(u.readDocument(u.writeDocument(doc,format),format),doc);recoveries++;}}
  for(const shape of ['array','map']){const doc=source(shape);Object.assign(doc.modules[0]!.elements[0]!,{scalarType:'integer'});if(u.validateDocument(doc).valid)throw Error('Container is scalar');refusals++;}
  for(const ref of [{module:'m',element:'missing'},{module:'missing',element:'item'},{}]){if(u.validateDocument(source('array',ref)).valid)throw Error('Invalid item target');refusals++;}
  let getterCalls=0;const unsafe=source('array');Object.defineProperty(unsafe.modules[0]!.elements[0]!,'itemType',{enumerable:true,get(){getterCalls++;return {};}});if(u.validateDocument(unsafe).valid||getterCalls)throw Error('Getter invoked');refusals++;
  for(const cardinality of ['one','array','map','unspecified']){
   const doc=source('one'),identity={module:'m',element:'e'},request={cardinality,...(['array','map'].includes(cardinality)?{itemType:{module:'m',element:'item',future:{opaque:true}}}:{})};
   const receipt=u.declareCoreCardinality(doc,identity,request);const inspection=u.inspectCoreCardinality(receipt.target,identity);if(inspection.meaning.state!=='known'||inspection.meaning.cardinality!==cardinality||inspection.provenance!=='unverified')throw Error('Inspection meaning');
   for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(receipt,format),format);equal(u.verifyCoreCardinalityDeclaration(saved,saved.target),receipt);equal(saved.source,doc);authorRecoveries++;}
   const forged=structuredClone(receipt);forged.provenance.idealPath='/wrong';let refused=false;try{u.verifyCoreCardinalityDeclaration(forged,receipt.target);}catch{refused=true;}if(!refused)throw Error('Forged authorship');authorRefusals++;
  }
  const array=source('array',{module:'m',element:'item'}),cleared=u.declareCoreCardinality(array,{module:'m',element:'e'},{cardinality:'one',itemType:null});if(Object.hasOwn(cleared.target.modules[0].elements[0],'itemType'))throw Error('Explicit clear');equal(cleared.source,array);
  const scalar=source('one');Object.assign(scalar.modules[0]!.elements[0]!,{scalarType:'integer'});let conflict=false;try{u.declareCoreCardinality(scalar,{module:'m',element:'e'},{cardinality:'array'});}catch{conflict=true;}if(!conflict)throw Error('Implicit scalar movement');authorRefusals++;
  let currentInspections=0;
  for(const label of ['one','array','map','unspecified','future-container']){
   const doc=source(label,['array','map'].includes(label)?{module:'m',element:'item',future:{opaque:true}}:undefined);
   const result=u.inspectCoreCardinality(doc,{module:'m',element:'e'});
   if(result.meaning.state!==(label==='future-container'?'unknown':'known'))throw Error('Current cardinality inspection');equal(result.source,doc);equal(result.meaning,label==='future-container'?{state:'unknown',value:label}:{state:'known',cardinality:label,...(['array','map'].includes(label)?{itemType:(doc.modules[0]!.elements[0]! as {itemType?:unknown}).itemType}:{})});currentInspections++;
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {currentInspections,recoveries,refusals,getterCalls,authorRecoveries,authorRefusals};
 },CURRENT_CORE_VERSION);
 if(external.length)throw Error('External request');const paths=['spec/core/cardinality-operation-v5.schema.json','scripts/core-cardinality-operations-browser.ts','spec/core/schema.json','src/model/cardinality.ts','src/model/types.ts','src/validation/document.ts','src/validation/schema.ts','src/index.ts','dist/umf.js'];const fingerprints=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/core-cardinality-operations-current-browser.json',JSON.stringify({scope:'Current-core Cardinality authoring and inspection with verified receipts, copy-safe recovery, literal preserved content and hostile-input refusals; historical transition API evidence is archived separately',browser:browser.version(),checks,externalRequests:external,fingerprints},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
