import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {parseNativeJson} from '../../src/model/native-json';
import {inspectAvroFacetSelection} from '../../src/core-ideals/avro-facet-selection';
const fixture='fixtures/avro/facet-selection-cases.json';
const rows=(await Bun.file(fixture).json()).cases.map((row:any)=>{
 const roots=[...(row.dependencies??[]).map((d:any)=>({root:parseNativeJson(d.schema),dependencyId:d.id})),{root:parseNativeJson(row.schema)}];
 return {...row,roots,...(row.selectionResolves?{expected:inspectAvroFacetSelection(roots,row.location)}:{})};
});
const build=await Bun.build({entrypoints:['src/core-ideals/avro-facet-selection.ts'],target:'browser',format:'esm'});assert.ok(build.success,JSON.stringify(build.logs));
const bundle='dist/avro-facet-selection.js';await Bun.write(bundle,build.outputs[0]!);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(r){return new URL(r.url).pathname==='/selection.js'?new Response(Bun.file(bundle),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Avro facet selection</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async(rows:any)=>{
  const path='/selection.js',m=await import(path);let resolved=0,refused=0;
  for(const row of rows){
   const before=JSON.stringify(row.roots);let result:any,error:any;
   try{result=m.inspectAvroFacetSelection(row.roots,row.location);}catch(e){error=e;}
   if(row.selectionResolves){if(error||JSON.stringify(result)!==JSON.stringify(row.expected))throw Error('Selection parity');resolved++;}
   else {if(!error)throw Error('Missing refusal');refused++;}
   if(JSON.stringify(row.roots)!==before)throw Error('Source mutation');
  }
  let getterCalls=0,rejected=false;try{m.inspectAvroFacetSelection([{get root(){getterCalls++;return null;}}],{path:''});}catch{rejected=true;}
  if(!rejected||getterCalls||'Bun'in globalThis||'process'in globalThis)throw Error('Unsafe runtime');
  return {cases:rows.length,resolved,refused,getterCalls};
 },rows);
 assert.deepEqual(checks,{cases:10,resolved:8,refused:2,getterCalls:0});assert.deepEqual(externalRequests,[]);
 const paths=[fixture,'scripts/core-ideals/facets-avro-selection-browser.ts','src/core-ideals/avro-facet-selection.ts','src/core-ideals/avro-cardinality-type.ts','src/adapters/avro/facet-type.ts',bundle];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-avro-selection-browser.json',JSON.stringify({scope:'Internal Avro facet type selection in Chromium; no public binding acceptance or enforcement',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
