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
  const path='/umf.js',u=await import(path);let recoveries=0,refusals=0;
  function source(cardinality:unknown,itemType?:unknown){return {umf:coreVersion,id:'browser',vocabularies:{future:{version:'1.0.0'}},modules:[{id:'m',namespace:'',elements:[{id:'e',kind:'field',cardinality,extensions:{future:{native:{repeated:true,unknown:'9007199254740993'}}},...(itemType===undefined?{}:{itemType})},{id:'item',kind:'field',scalarType:'integer',nullability:'absent-allowed',extensions:{}}]}]};}
  const equal=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Recovery mismatch');};
  for(const label of ['one','array','map','unspecified','future-container']){const doc=source(label);if(!u.validateDocument(doc).valid)throw Error('Valid shape refused');for(const format of ['json','yaml']){equal(u.readDocument(u.writeDocument(doc,format),format),doc);recoveries++;}}
  for(const shape of ['array','map'])for(const target of ['item','e']){const doc=source(shape,{module:'m',element:target});for(const format of ['json','yaml']){equal(u.readDocument(u.writeDocument(doc,format),format),doc);recoveries++;}}
  for(const shape of ['array','map']){const doc=source(shape);Object.assign(doc.modules[0]!.elements[0]!,{scalarType:'integer'});if(u.validateDocument(doc).valid)throw Error('Container is scalar');refusals++;}
  for(const ref of [{module:'m',element:'missing'},{module:'missing',element:'item'},{}]){if(u.validateDocument(source('array',ref)).valid)throw Error('Invalid item target');refusals++;}
  let getterCalls=0;const unsafe=source('array');Object.defineProperty(unsafe.modules[0]!.elements[0]!,'itemType',{enumerable:true,get(){getterCalls++;return {};}});if(u.validateDocument(unsafe).valid||getterCalls)throw Error('Getter invoked');refusals++;
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {recoveries,refusals,getterCalls};
 },CURRENT_CORE_VERSION);
 if(external.length)throw Error('External request');const paths=['scripts/core-cardinality-browser.ts','spec/core/schema.json','src/model/cardinality.ts','src/model/types.ts','src/validation/document.ts','src/validation/schema.ts','src/index.ts','dist/umf.js'];const fingerprints=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/core-cardinality-current-browser.json',JSON.stringify({scope:'Current-core structural Cardinality validation, JSON/YAML round trips, malformed declarations and hostile-input refusals; no native binding claim',browser:browser.version(),checks,externalRequests:external,fingerprints},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
