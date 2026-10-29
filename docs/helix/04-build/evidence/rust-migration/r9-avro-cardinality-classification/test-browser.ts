import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
import {encodeRequestWire,fromWire} from '../../../../../../bindings/core/node/src/wire.js';
const packet=JSON.parse(readFileSync(new URL('./typescript-predecessor.json',import.meta.url),'utf8'));
const extra=JSON.parse(readFileSync(new URL('./typescript-extra.json',import.meta.url),'utf8'));
const row=packet.outcomes['empty-array/present-non-null-schema/strict'];
const profile='umf.avro-cardinality-binding/1.0.0';
const changedIds=['duplicate-named','verify-duplicate-named','recover-duplicate-named','fixed-unsafe-token','verify-fixed-unsafe-token','recover-fixed-unsafe-token','fixed-exponent','verify-fixed-exponent','recover-fixed-exponent'];
function same(a:any,b:any):boolean{if(Object.is(a,b))return true;if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>same(x,b[i]));if(a&&b&&typeof a==='object'&&typeof b==='object'){const keys=Object.keys(a),other=Object.keys(b);return keys.length===other.length&&keys.every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]))}return false}
const changed=changedIds.map(id=>{const found=extra.cases.find((x:any)=>x.id===id);if(!found?.result)throw Error(`Missing frozen browser control ${id}`);return found});
const adversarial=JSON.parse(readFileSync(new URL('./typescript-type-order-utf16.json',import.meta.url),'utf8'));
const adversarialRequests=adversarial.cases.flatMap((item:any)=>[{op:item.op,...item.args},{op:'verifyAvroCardinalityClassification',receipt:item.result,current:item.result.target},{op:'recoverAvroCardinalityBundle',receipt:item.result,current:item.result.target}]);
const adversarialExpected=adversarial.cases.flatMap((item:any)=>[item.result,item.result,{schema:item.args.request.nativeSource,dependencies:item.args.request.dependencies}]);
const requests=[
 {op:'classifyAvroCardinality',source:row.source,request:row.request},
 {op:'verifyAvroCardinalityClassification',receipt:row.result,current:row.result.target},
 {op:'recoverAvroCardinalityBundle',receipt:row.result,current:row.result.target},
 ...changed.map((x:any)=>({op:x.op,...x.args})),
 ...adversarialRequests,
].map(x=>encodeRequestWire({profile,...x}));
const web=process.env.UMF_AVRO_CARDINALITY_WASM_PACKAGE??'/private/tmp/umf-avro-cardinality-wasm-web';
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/glue.js')return new Response(Bun.file(`${web}/umf_core_wasm.js`),{headers:{'content-type':'text/javascript'}});if(path==='/wasm')return new Response(Bun.file(`${web}/umf_core_wasm_bg.wasm`),{headers:{'content-type':'application/wasm'}});if(path==='/requests')return Response.json(requests);return new Response('<!doctype html><title>UMF</title>',{headers:{'content-type':'text/html'}})}});
let browser;
try{browser=await chromium.launch({headless:true,args:['--renderer-process-limit=1']});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.port}/`);const got=await page.evaluate(async()=>{const mod=await import('/glue.js');await mod.default('/wasm');if(mod.avroCardinalityBindingProfileVersion()!=='umf.avro-cardinality-binding/1.0.0')throw Error('profile');const requests=await(await fetch('/requests')).json();return requests.map((r:string)=>mod.executeAvroCardinalityWire(r));});const values=got.map(text=>{const e=JSON.parse(text);if(e.status!=='ok')throw Error(JSON.stringify(e));return fromWire(JSON.parse(e.wire))});const expected=[row.result,row.result,row.recovered,...changed.map((x:any)=>x.result),...adversarialExpected];if(values.length!==expected.length||values.some((value,i)=>!same(value,expected[i])))throw Error('browser parity');console.log(JSON.stringify({browser:browser.version(),cases:values.length,classify:true,verify:true,recover:true,changed:changedIds}));}finally{await browser?.close();server.stop(true)}
