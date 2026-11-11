// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {generateAccessPackage} from '../src/node-access-compilation';
import {request,profile,mutateSource} from '../tests/compilation/access-fixtures';
if(process.argv.slice(2).join(' ')!=='--suite access-generator')throw Error('Usage: bun scripts/compilation-browser.ts --suite access-generator');
const cases:{id:string;request:ReturnType<typeof request>;profile:ReturnType<typeof profile>}[]=[];
function add(id:string,change:(r:ReturnType<typeof request>,p:ReturnType<typeof profile>)=>void=()=>{}){const r=request(),p=profile();change(r,p);cases.push({id,request:r,profile:p});}
add('commerce-engine');add('all-commerce',(r)=>{r.records.push({module:'commerce',element:'Customer'},{module:'commerce',element:'OrderLine'});});
add('unknown-selected',(r)=>mutateSource(r,d=>{Object.assign(d.modules[0]!.elements[5]!,{future:{retained:true}});}));
add('missing-view',(r)=>mutateSource(r,d=>{d.modules[0]!.extensions['umf.access'].views=[];}));
add('coverage-gap',(r)=>mutateSource(r,d=>{d.modules[0]!.extensions['umf.access'].views[0]!.fields.pop();}));
add('name-reserved',(r)=>{r.names=[{sourceId:'logical',pointer:'/modules/0/elements/0',python:'model_config'}];});
add('profile-changed',(_r,p)=>{p.codeSha256='b'.repeat(64);});
add('profile-invalid-digest',(_r,p)=>{p.codeSha256='prefix'+'a'.repeat(64);});
add('hostile-literal',(r)=>mutateSource(r,d=>{Object.assign(d.modules[0]!.elements[0]!,{description:'\"\'\\\n\u2028'});}));
add('report-mode',(r)=>{r.mode='report';});
for(const fixture of ['containers','actions','relationships','named']){
 const text=await Bun.file('fixtures/access/commerce/'+fixture+'.json').text();
 add(fixture,r=>{r.sources[0]!.text=text;if(fixture==='actions')r.actions=[{module:'commerce',action:'shipOrder'}];});
}
add('multiple-projections',r=>{r.projections=[{name:'orderSummary',record:r.records[0]!,fields:[{module:'commerce',element:'orderId'}]},{name:'orderDetails',record:r.records[0]!,fields:[{module:'commerce',element:'amount'}]}];});
const outputs=cases.map(c=>generateAccessPackage(c.request,c.profile));
for(const [i,c] of cases.entries())assert.deepEqual(generateAccessPackage(c.request,c.profile),outputs[i]);
const wasmGlue=resolve('bindings/core/wasm/pkg/umf_core_wasm.js'),wasmBytes=resolve('bindings/core/wasm/pkg/umf_core_wasm_bg.wasm');
const built=await Bun.build({entrypoints:['src/browser-access-compilation.ts'],target:'browser',format:'esm',plugins:[{name:'fresh-wasm',setup(build){build.onResolve({filter:/umf_core_wasm\.js$/},args=>args.path.endsWith('/pkg/umf_core_wasm.js')?{path:wasmGlue}:undefined);}}]});if(!built.success)throw Error(built.logs.join('\n'));
const bundle=await built.outputs[0]!.text(),originFiles=['src/browser-access-compilation.ts','src/access-compilation-rust-default.ts','src/compilation/ir/index.ts','src/compilation/bundle/hash.ts','scripts/compilation-browser.ts','tests/compilation/access-fixtures.ts'];
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const p=new URL(req.url).pathname;if(p==='/generator.js')return new Response(bundle,{headers:{'content-type':'text/javascript'}});if(p==='/umf_core_wasm_bg.wasm')return new Response(Bun.file(wasmBytes),{headers:{'content-type':'application/wasm'}});if(p==='/cases')return Response.json(cases);return new Response('<!doctype html><html><body>Typed access generator Rust browser parity</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),externalRequests:string[]=[];let wasmRequested=false;
 page.on('request',r=>{if(!r.url().startsWith(`http://127.0.0.1:${server.port}/`))externalRequests.push(r.url());if(r.url().includes('umf_core_wasm_bg.wasm'))wasmRequested=true;});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const observed=await page.evaluate(async()=>{const path='/generator.js',u=await import(path),cs=await(await fetch('/cases')).json(),results=[];for(const c of cs){const a=u.generateAccessPackage(c.request,c.profile),b=u.generateAccessPackage(c.request,c.profile);if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Browser generation drift');results.push(a);}if('Bun'in globalThis||'process'in globalThis||'Buffer'in globalThis||'require'in globalThis)throw Error('Host global leak');return results;});
 assert.deepEqual(observed,outputs);assert.deepEqual(externalRequests,[]);assert.equal(wasmRequested,true);
 const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
 const evidence={scope:'Native CodegenEngine typed access generation in Node and real Chromium WASM; output parity does not qualify Python runtime execution',bun:Bun.version,chromium:browser.version(),cases:cases.map(c=>c.id),runsPerRuntime:2,candidates:outputs.filter(r=>r.outcome==='candidate').length,refusals:outputs.filter(r=>r.outcome==='refused').length,externalRequests,wasmRequested,bundleSha256:sha(bundle),inputsSha256:sha(JSON.stringify(cases)),outputsSha256:sha(JSON.stringify(outputs)),sourceSha256:Object.fromEntries(await Promise.all(originFiles.map(async p=>[p,sha(await Bun.file(p).text())])))};
 await Bun.write('out/typed-persistence/b-tp-002-003/browser.json',JSON.stringify(evidence,null,2)+'\n');
 await Bun.write('out/typed-persistence/b-tp-002-003/browser-cases.json',JSON.stringify({cases,outputs},null,2)+'\n');
 console.log(JSON.stringify(evidence));
}finally{await browser?.close();server.stop(true);}
