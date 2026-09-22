/** Native browser-codec discovery; independent of the unfinished UMF binding. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const fixture='fixtures/avro/cardinality-cases.json';
const proof='fixtures/validation/cardinality-avro-profile-native.json';
const cases=(await Bun.file(fixture).json()).cases,native=await Bun.file(proof).json();
const entry='.cache/cardinality-avro-profile-entry.ts';
await Bun.write(entry,`import {Type} from 'avsc/etc/browser/avsc-types';
export function probe(schema,value,wire){
 const type=Type.forSchema(JSON.parse(schema),{wrapUnions:false});
 const encoded=type.toBuffer(value);
 const raw=wire===undefined?encoded:encoded.constructor.from(wire,'hex');
 const decoded=type.fromBuffer(raw);
 return {hex:encoded.toString('hex'),decoded:JSON.parse(JSON.stringify(decoded)),keys:Object.keys(decoded)};
}`);
const build=await Bun.build({entrypoints:[entry],target:'browser',format:'esm'});
assert.ok(build.success,JSON.stringify(build.logs));const bundle=await build.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){return new URL(request.url).pathname==='/codec.js'?new Response(bundle,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><html><body>Avro Cardinality discovery</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async(input:string)=>{
  const {cases,native}=JSON.parse(input);
  const path='/codec.js',{probe}=await import(path);
  const canonical=(v:any):string=>v!==null&&typeof v==='object'?Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
  const rows=[];
  for(const c of cases){
   const result=probe(c.schema,c.value);
   const expected=structuredClone(c.expected??c.value);
   if(c.id==='special-property-keys')delete expected.value.__proto__;
   if(canonical(result.decoded)!==canonical(expected))throw Error('Unexpected codec value: '+c.id);
   const comparison=native.checks.find((n:any)=>n.id===c.id&&n.writer==='apache'&&n.reader==='fastavro');
   if(!comparison||result.hex!==comparison.hex)throw Error('Native binary mismatch: '+c.id);
   rows.push({id:c.id,...result,exactInputRecovery:canonical(result.decoded)===canonical(c.value),nativeValueAgreement:canonical(result.decoded)===canonical(comparison.value)});
  }
  const streams=[];
  for(const n of native.duplicateKeyStreams.filter((n:any)=>n.codec==='apache')){
   const r=probe(JSON.stringify({type:'map',values:'long'}),{a:2},n.hex);
   if(canonical(r.decoded)!==canonical(n.decoded)||r.hex===n.hex)throw Error('Duplicate stream expectation');
   streams.push({id:n.id,sourceHex:n.hex,rewrittenHex:r.hex,decoded:r.decoded,exactByteRecovery:false});
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');
  return {rows,streams};
 },JSON.stringify({cases,native}));
 assert.equal(external.length,0);
 assert.equal(checks.rows.filter(r=>!r.exactInputRecovery).length,2);
 assert.equal(checks.rows.filter(r=>!r.nativeValueAgreement).length,1);
 const paths=[fixture,proof,'scripts/core-ideals/cardinality-avro-profile-browser.ts','node_modules/avsc/package.json'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/cardinality-avro-profile-browser.json',JSON.stringify({scope:'Native browser codec discovery only; no UMF classification/projection acceptance',browser:browser.version(),avsc:(await Bun.file('node_modules/avsc/package.json').json()).version,checks,externalRequests:external,bundleSha256:createHash('sha256').update(bundle).digest('hex'),sha256,limitations:['avsc loses the own __proto__ map member while both Python codecs preserve it. This discrepancy is not counted as value agreement.','Float items narrow the binary64 counterexample in all three codecs.','Duplicate-key streams normalize during decoding; source bytes and decoded maps are distinct recovery obligations.']},null,2)+'\n');
 console.log(JSON.stringify({cases:checks.rows.length,duplicateStreams:checks.streams.length,valueDisagreements:1,floatNarrowings:1,externalRequests:external.length}));
}finally{await browser?.close();server.stop(true);}
