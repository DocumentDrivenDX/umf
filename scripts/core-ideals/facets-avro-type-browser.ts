import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {parseNativeJson} from '../../src/model/native-json';
import {inspectAvroFacetType} from '../../src/adapters/avro/facet-type';
const fixture='fixtures/avro/facet-discovery-cases.json';
const cases=(await Bun.file(fixture).json()).cases;
const rows=cases.map((row:any)=>{const native=parseNativeJson(JSON.stringify(row.schema));return {native,expected:inspectAvroFacetType(native)};});
const build=await Bun.build({entrypoints:['src/adapters/avro/facet-type.ts'],target:'browser',format:'esm'});
assert.ok(build.success,JSON.stringify(build.logs));const bundle='dist/avro-facet-type.js';await Bun.write(bundle,build.outputs[0]!);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){return new URL(request.url).pathname==='/type.js'?new Response(Bun.file(bundle),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Avro facet type</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async(input:any)=>{
  const path='/type.js',m=await import(path);let declared=0,unsupported=0;
  for(const row of input){const before=JSON.stringify(row.native),result=m.inspectAvroFacetType(row.native);if(JSON.stringify(result)!==JSON.stringify(row.expected)||JSON.stringify(row.native)!==before)throw Error('Parity or isolation failed');if(result.state==='declared')declared++;else unsupported++;if(result.enforcement!=='unverified')throw Error('Invented enforcement');}
  const object=(members:any)=>({kind:'object',members}),string=(value:string)=>({kind:'string',value}),number=(value:string)=>({kind:'number',value});
  const fixed=(size:string)=>object({type:string('fixed'),name:string('B'),size:number(size)});
  if(m.inspectAvroFacetType(fixed('0')).meaning?.exactBytes!==0)throw Error('Zero fixed domain');
  for(const size of ['2.0','2e0','9007199254740993'])if(m.inspectAvroFacetType(fixed(size)).state!=='unsupported')throw Error('Numeric normalization');
  const unknown=object({type:string('int'),'a/b':object({token:number('9007199254740993')})}),r=m.inspectAvroFacetType(unknown);
  if(r.unclaimedPaths[0]!=='/a~1b'||r.native.members['a/b'].members.token.value!=='9007199254740993')throw Error('Unknown loss');
  r.native.members.type.value='long';if(unknown.members.type.value!=='int')throw Error('Source mutation');
  let getterCalls=0,rejected=false;try{m.inspectAvroFacetType({get kind(){getterCalls++;return 'string';}});}catch{rejected=true;}
  if(!rejected||getterCalls||'Bun'in globalThis||'process'in globalThis)throw Error('Unsafe runtime');
  return {cases:input.length,declared,unsupported,zeroFixed:true,exactTokenRefusals:3,unknownRecovery:true,getterCalls};
 },rows);
 assert.equal(checks.cases,84);assert.ok(checks.declared>0&&checks.unsupported>0);assert.deepEqual(externalRequests,[]);
 const paths=[fixture,'src/adapters/avro/facet-type.ts','scripts/core-ideals/facets-avro-type-browser.ts',bundle];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-avro-type-browser.json',JSON.stringify({scope:'Internal isolated Avro declaration facts in Chromium; no public facet classification, enforcement or binding acceptance',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
