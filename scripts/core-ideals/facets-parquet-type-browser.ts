import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {inspectParquetFacetType} from '../../src/adapters/parquet/facet-type';
import type {Json} from '../../src/model/types';
const fixture='fixtures/validation/facets-parquet-discovery.json';
const positive=(await Bun.file(fixture).json()).fields.map((r:any)=>r.nativeField);
const negative:Json[]=[{type:'7',type_length:'0'},{type:'7',type_length:'2.0'},
 {type:'1',logicalType:{INTEGER:{bitWidth:'8',isSigned:true}},converted_type:'11'},
 {type:'7',type_length:'1',logicalType:{DECIMAL:{precision:'3',scale:'0'}}},
 {type:'6',logicalType:{DECIMAL:{precision:'3',scale:'-1'}}},
 {type:'6',logicalType:{FUTURE:{}}},{type:'1',$unknown:[]},
 {type:'1',logicalType:{INTEGER:{bitWidth:'8',isSigned:true,future:1}}},
 {type:'6',logicalType:{STRING:{}},converted_type:'5'},
 {type:'7',type_length:'9007199254740993'}];
const rows:any[]=[...positive,...negative].map(native=>({native,expected:inspectParquetFacetType(native)}));
assert.ok(rows.slice(0,80).every(r=>r.expected.state==='declared'));
assert.ok(rows.slice(80).every(r=>r.expected.state==='unsupported'));
const build=await Bun.build({entrypoints:['src/adapters/parquet/facet-type.ts'],target:'browser',format:'esm'});
assert.ok(build.success);const bundle='dist/parquet-facet-type.js';await Bun.write(bundle,build.outputs[0]!);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){return new URL(request.url).pathname==='/type.js'?new Response(Bun.file(bundle),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Parquet facet type</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',r=>{if(!r.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(r.request().url());return r.abort();}return r.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async(input:any)=>{
  const path='/type.js',m=await import(path);let declared=0,unsupported=0;
  for(const row of input){
   const before=JSON.stringify(row.native),r=m.inspectParquetFacetType(row.native);
   if(JSON.stringify(r)!==JSON.stringify(row.expected)||JSON.stringify(row.native)!==before)throw Error('Parity or source mutation');
   if(r.enforcement!=='unverified')throw Error('Invented enforcement');
   if(r.state==='declared')declared++;else unsupported++;
  }
  const source={type:'1','a/b':{token:'9007199254740993'}},r=m.inspectParquetFacetType(source);
  if(r.unclaimedPaths[0]!=='/a~1b'||r.native['a/b'].token!=='9007199254740993')throw Error('Unknown loss');
  r.native['a/b'].token='changed';if(source['a/b'].token!=='9007199254740993')throw Error('Aliasing');
  let getterCalls=0,rejected=false;
  try{m.inspectParquetFacetType({get type(){getterCalls++;return '1';}});}catch{rejected=true;}
  if(!rejected||getterCalls||'Bun'in globalThis||'process'in globalThis)throw Error('Unsafe runtime');
  return {cases:input.length,declared,unsupported,unknownRecovery:true,getterCalls};
 },rows);
 assert.deepEqual(checks,{cases:90,declared:80,unsupported:10,unknownRecovery:true,getterCalls:0});assert.deepEqual(externalRequests,[]);
 const paths=[fixture,'src/adapters/parquet/facet-type.ts','src/model/json.ts','src/model/types.ts','scripts/core-ideals/facets-parquet-type-browser.ts',bundle];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-parquet-type-browser.json',JSON.stringify({scope:'Internal isolated Parquet declaration interpretation; no public facet classification, projection or binding acceptance',browser:browser.version(),checks,externalRequests,bindingAccepted:false,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
