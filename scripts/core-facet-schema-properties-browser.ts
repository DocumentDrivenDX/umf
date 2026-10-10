import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {inspectCoreFacets} from '../src/model/facets';
import type {Document} from '../src/model/types';
const identity={module:'m',element:'v'};
const rows=[{scalarType:'string',facets:{length:{min:2,unit:'unicode-scalar'}}},{scalarType:'binary',facets:{length:{min:0,max:8,unit:'byte'}}},{scalarType:'integer',facets:{integerWidth:{bits:128,signed:true},range:{min:{integerToken:'9007199254740993'},max:{integerToken:'9007199254740995'},minInclusive:false}}},{scalarType:'decimal',facets:{precision:38,scale:2,range:{min:{decimalToken:'-1.25'},max:{decimalToken:'2.50'},maxInclusive:false}}},{cardinality:'array',itemType:{module:'m',element:'item'},facets:{collectionSize:{min:0,max:3}}},{cardinality:'map',itemType:{module:'m',element:'item'},facets:{collectionSize:{min:2}}},{scalarType:'string',facets:{length:{min:1,unit:'future'}}},{scalarType:'integer',facets:{range:{min:{integerToken:'1'},'future/~':false},future:null}},{scalarType:'string'},{kind:'record',members:[]}];
const cases=rows.map(row=>{const source={umf:'0.8.0',id:'original',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'v',kind:'field',extensions:{},...row},{id:'item',kind:'field',scalarType:'string',extensions:{}}]}]} as Document;return {source,expected:inspectCoreFacets(source,identity)};});
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json(cases);return new Response('<!doctype html><title>Facet inspection parity</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{const path='/umf.js',u=await import(path),cases=await(await fetch('/cases')).json();let inspections=0,authorRefusals=0,recoveries=0,getterCalls=0;
  for(const row of cases){const r=u.inspectCoreFacets(row.source,{module:'m',element:'v'});if(JSON.stringify(r)!==JSON.stringify(row.expected))throw Error('Full host/browser inspection mismatch');inspections++;
   for(const format of ['json','yaml'])if(JSON.stringify(u.readJsonValue(u.writeJsonValue(r,format),format))!==JSON.stringify(r))throw Error('Recovery mismatch');else recoveries++;
   let refused=false;try{u.declareCoreFacets(row.source,{module:'m',element:'v'},{integerWidth:{bits:8,signed:true}});}catch(e){if((e as any).code==='CORE_FACET_VERSION')refused=true;}if(!refused)throw Error('Missing author version refusal');authorRefusals++;
  }
  let refused=false;try{u.inspectCoreFacets({get umf(){getterCalls++;return '0.8.0';}},{module:'m',element:'v'});}catch{refused=true;}if(!refused||getterCalls)throw Error('Accessor executed');if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {inspections,authorRefusals,recoveries,getterCalls};
 });assert.deepEqual(checks,{inspections:10,authorRefusals:10,recoveries:20,getterCalls:0});assert.deepEqual(externalRequests,[]);
 const paths=['scripts/core-facet-schema-properties-browser.ts','src/model/facets.ts','src/validation/facets.ts','src/validation/schema-properties.ts','src/validation/document.ts','spec/core/facet-operation-v4.schema.json','spec/core/schema-properties-document.schema.json','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/core-facet-schema-properties-browser.json',JSON.stringify({scope:'Original core0.8 read-only facet inspection, exact retained output parity and serialization; no native enforcement qualification',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
