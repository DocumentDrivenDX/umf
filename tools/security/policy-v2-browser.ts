import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import * as nodeRuntime from '../../src/index-node-v4';
import {buildBindingBrowserRuntime} from '../../scripts/binding/browser-runtime';
import {evaluationFixture} from '../../tests/security/evaluation-fixture';
import {configurePolicyV2Api,policyV2Controls} from './policy-v2-controls';
const files=['src/index-node-v4.ts','src/index-browser-v4.ts','scripts/binding/browser-runtime.ts','bindings/core/wasm/pkg/umf_core_wasm.js','bindings/core/wasm/pkg/umf_core_wasm_bg.wasm','src/extensions/security/policy-representation-v2.ts','src/extensions/security/policy-v2-legacy-access.ts','src/extensions/security/protection/references.ts','src/extensions/security/evaluate.ts','src/extensions/security/policy.ts','spec/extensions/security-v0.2/schema.json','spec/extensions/security-v0.2/package.json','tools/security/policy-v2-controls.ts','tools/security/policy-v2-browser.ts','tests/security/evaluation-fixture.ts','tests/security/fixture.ts','bun.lock'];
const hash=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const pins=async()=>Object.fromEntries(await Promise.all(files.map(async p=>[p,hash(new Uint8Array(await Bun.file(p).arrayBuffer()))])));
const before=await pins();configurePolicyV2Api(nodeRuntime);const bun=policyV2Controls(evaluationFixture());
const build=await Bun.build({entrypoints:['tools/security/policy-v2-controls.ts'],target:'browser',format:'esm'});
if(!build.success||build.outputs.length!==1)throw Error('Browser public API build failed');
const js=await build.outputs[0]!.text();if(js.length>16_000_000)throw Error('Bundle UTF16 bound');
const {browserJs,wasmBytes}=await buildBindingBrowserRuntime();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:r=>{const path=new URL(r.url).pathname;if(path==='/controls.js')return new Response(js,{headers:{'content-type':'text/javascript'}});if(path==='/umf.js')return new Response(browserJs,{headers:{'content-type':'text/javascript'}});if(path==='/umf_core_wasm_bg.wasm')return new Response(Bun.file(wasmBytes),{headers:{'content-type':'application/wasm'}});return new Response('<!doctype html><title>Policy semantic embedding</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(Bun.env.UMF_CHROMIUM_PATH?{executablePath:Bun.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();let externalRequests=0;
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():(externalRequests++,route.abort()));
 await page.goto(`http://127.0.0.1:${server.port}`);
 const observed=await page.evaluate(async(f)=>{const path='/controls.js';const api=await import(path),runtime=await import('/umf.js');api.configurePolicyV2Api(runtime);return {rows:api.policyV2Controls(f),hostGlobalsAbsent:['Bun','process','Buffer','Deno'].every(k=>!(k in globalThis))};},evaluationFixture());
 const after=await pins();
 if(externalRequests||!observed.hostGlobalsAbsent||!bun.length||bun.some(x=>!x.passed)||JSON.stringify(bun)!==JSON.stringify(observed.rows)||JSON.stringify(before)!==JSON.stringify(after))throw Error('Bun/browser controls failed: '+JSON.stringify({bun,observed}));
 const receipt={status:'legacy-embedding-component-passed',bun:Bun.version,chromium:browser.version(),bunObservations:bun,browserObservations:observed,externalRequests,sourceDigests:after,bundleSha256:hash(js),bundleUtf16Units:js.length,bundleBytes:new TextEncoder().encode(js).length,acceptanceCasesPromoted:[],scope:'Public root API: representation/source-address controls and explicit legacy-body semantic embedding. Expected access output authored independently of evaluator result; synthetic host attestations. No general0.2/protection interpretation/native admission or full S15 oracle qualification.'};
 await Bun.write('docs/helix/04-build/evidence/security/policy-v2-20261015/browser.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,controls:bun.length,chromium:receipt.chromium}));
}finally{await browser?.close();server.stop(true);}
