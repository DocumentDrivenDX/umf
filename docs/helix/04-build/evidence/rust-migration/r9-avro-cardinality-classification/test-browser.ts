import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
import {encodeRequestWire,fromWire} from '../../../../../../bindings/core/node/src/wire.js';
const packet=JSON.parse(readFileSync(new URL('./typescript-predecessor.json',import.meta.url),'utf8'));
const row=packet.outcomes['empty-array/present-non-null-schema/strict'];
const profile='umf.avro-cardinality-binding/1.0.0';
const requests=[
 {op:'classifyAvroCardinality',source:row.source,request:row.request},
 {op:'verifyAvroCardinalityClassification',receipt:row.result,current:row.result.target},
 {op:'recoverAvroCardinalityBundle',receipt:row.result,current:row.result.target},
].map(x=>encodeRequestWire({profile,...x}));
const web='/private/tmp/umf-avro-cardinality-wasm-web';
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/glue.js')return new Response(Bun.file(`${web}/umf_core_wasm.js`),{headers:{'content-type':'text/javascript'}});if(path==='/wasm')return new Response(Bun.file(`${web}/umf_core_wasm_bg.wasm`),{headers:{'content-type':'application/wasm'}});if(path==='/requests')return Response.json(requests);return new Response('<!doctype html><title>UMF</title>',{headers:{'content-type':'text/html'}})}});
let browser;
try{browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.port}/`);const got=await page.evaluate(async()=>{const mod=await import('/glue.js');await mod.default('/wasm');if(mod.avroCardinalityBindingProfileVersion()!=='umf.avro-cardinality-binding/1.0.0')throw Error('profile');const requests=await(await fetch('/requests')).json();return requests.map((r:string)=>mod.executeAvroCardinalityWire(r));});const values=got.map(text=>{const e=JSON.parse(text);if(e.status!=='ok')throw Error(JSON.stringify(e));return fromWire(JSON.parse(e.wire))});const canonical=(v:any)=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);if(canonical(values[0])!==canonical(row.result)||canonical(values[1])!==canonical(row.result)||canonical(values[2])!==canonical(row.recovered))throw Error('browser parity');console.log(JSON.stringify({browser:browser.version(),classify:true,verify:true,recover:true}));}finally{await browser?.close();server.stop(true)}
