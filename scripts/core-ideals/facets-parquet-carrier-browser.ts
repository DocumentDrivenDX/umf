import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const corpus='fixtures/validation/facets-parquet-carrier-corpus.json',rows:any[]=(await Bun.file(corpus).json()).rows;
for(const row of rows)row.bytes=Array.from(new Uint8Array(await Bun.file(row.path).arrayBuffer()));
const build=await Bun.build({entrypoints:['src/core-ideals/parquet-facet-carrier.ts'],target:'browser',format:'esm'});
assert.ok(build.success);const bundle='dist/parquet-facet-carrier.js';await Bun.write(bundle,build.outputs[0]!);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){return new URL(request.url).pathname==='/carrier.js'?new Response(Bun.file(bundle),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Parquet facet carriers</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',r=>{if(!r.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(r.request().url());return r.abort();}return r.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async(input:any)=>{
  const p='/carrier.js',m=await import(p);let bytes=0;
  for(const row of input){const before=JSON.stringify(row.request),actual=m.parquetFacetFile(row.request);if(JSON.stringify(Array.from(actual))!==JSON.stringify(row.bytes)||JSON.stringify(row.request)!==before)throw Error('Native byte parity or source mutation');bytes+=actual.length;}
  let refusals=0;const base={recordName:'R',fieldName:'v',nullable:false};
  for(const carrier of [{kind:'fixed',bytes:0},{kind:'fixed',bytes:4097},{kind:'decimal',carrier:'int32',precision:10,scale:0},{kind:'decimal',carrier:'fixed',precision:3,scale:0,bytes:1},{kind:'integer',bits:7,signed:true}]){try{m.parquetFacetFile({...base,carrier});}catch{refusals++;}}
  if(refusals!==5)throw Error('Invalid carrier emitted');
  let getterCalls=0,rejected=false;try{m.parquetFacetFile({...base,get carrier(){getterCalls++;return {};}});}catch{rejected=true;}
  if(!rejected||getterCalls||'Bun'in globalThis||'process'in globalThis)throw Error('Unsafe runtime');
  return {cases:input.length,bytes,refusals,getterCalls};
 },rows);
 assert.equal(checks.cases,54);assert.deepEqual(externalRequests,[]);
 const paths=[corpus,'src/core-ideals/parquet-facet-carrier.ts','src/core-ideals/parquet-carriers.ts','src/adapters/parquet/encode.ts','src/model/json.ts','scripts/core-ideals/facets-parquet-carrier-browser.ts',bundle,...rows.map(r=>r.path)];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-parquet-carrier-browser.json',JSON.stringify({scope:'Internal explicit native schema emitter, including reader-unrepresentable declarations; no author ideal projection or binding acceptance',browser:browser.version(),checks,externalRequests,bindingAccepted:false,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
