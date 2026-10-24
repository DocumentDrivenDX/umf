// SPDX-License-Identifier: MIT OR Apache-2.0
/** @covers US-093-AC1 @covers US-093-AC2 @covers US-093-AC4 */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
const sha=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const paths=['crates/umf-core/src/lakeview.rs','crates/umf-core/src/serialization.rs','crates/umf-core-wire/src/lib.rs','src/adapters/lakeview/index.ts','src/adapters/lakeview/project.ts','src/registry/registry.ts','src/registry/kind-runtime.ts','spec/extensions/lakeview/package.json','spec/extensions/lakeview/schema.json','spec/metamodel/generated/manifest.json','bindings/core/wasm/index.js','bindings/core/wasm/index.d.ts','tests/lakeview/browser-entry.ts','tests/lakeview/interchange.test.ts','scripts/lakeview-browser.ts',...['marketing-campaign','lexical-quirks','empty-sections'].map(n=>'fixtures/lakeview/'+n+'.lvdash.json')];
const snapshot=async()=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,sha(await Bun.file(p).bytes())])));
const before=await snapshot();
const build=await Bun.build({entrypoints:['tests/lakeview/browser-entry.ts'],target:'browser',format:'esm'});
if(!build.success)throw Error(build.logs.join('\n'));const bundle=await build.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/')return new Response('<!doctype html><title>Lakeview exact original reconstruction</title>');
 if(path==='/entry.js')return new Response(bundle,{headers:{'content-type':'text/javascript'}});
 if(/^\/fixture\/(marketing-campaign|lexical-quirks|empty-sections)$/.test(path))return new Response(Bun.file('fixtures/lakeview/'+path.split('/').at(-1)+'.lvdash.json'));
 if(path==='/wasm/umf_core_wasm.js')return new Response(Bun.file('bindings/core/wasm/pkg/umf_core_wasm.js'),{headers:{'content-type':'text/javascript'}});
 if(path==='/wasm/umf_core_wasm_bg.wasm')return new Response(Bun.file('bindings/core/wasm/pkg/umf_core_wasm_bg.wasm'),{headers:{'content-type':'application/wasm'}});
 return new Response('missing',{status:404});
}});
let browser;let result:any;let version='';const errors:string[]=[],externalRequests:string[]=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});version=browser.version();const page=await browser.newPage();
 page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(new URL(r.url()).hostname!=='127.0.0.1')externalRequests.push(r.url())});
 await page.goto('http://127.0.0.1:'+server.port+'/');
 result=await page.evaluate(async()=>{const url='/entry.js';return (await import(url)).verify()});
}finally{await browser?.close();server.stop(true)}
if(errors.length||externalRequests.length)throw Error(JSON.stringify({errors,externalRequests}));
for(const row of result.results){const original=await Bun.file('fixtures/lakeview/'+row.name+'.lvdash.json').bytes();if(sha(original)!==row.original||row.recoveries.some((r:any)=>r.sha256!==row.original))throw Error('Browser hashes differ from original input '+row.name)}
if(JSON.stringify(before)!==JSON.stringify(await snapshot()))throw Error('Source changed during Lakeview qualification');
const receipt={profile:'umf.lakeview.original-bytes/1',core:'0.10.0',extension:'0.2.0',chromium:version,bun:Bun.version,...result,errors,externalRequests,sources:before,artifacts:{wasm:sha(await Bun.file('bindings/core/wasm/pkg/umf_core_wasm_bg.wasm').bytes()),bundle:sha(bundle)},limits:'Three committed files; direct and UMF JSON/YAML untouched UTF-8 reconstruction and generic composition only. No live Databricks acceptance or edited-source rewrite.'};
await mkdir('docs/helix/04-build/evidence/lakeview',{recursive:true});await Bun.write('docs/helix/04-build/evidence/lakeview/browser.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
