// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {generateAccessPackage} from '../src/compilation/index';
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
const built=await Bun.build({entrypoints:['src/compilation/index.ts'],target:'browser',format:'esm'});if(!built.success)throw Error(built.logs.join('\n'));
const bundle=await built.outputs[0]!.text(),originFiles=['src/compilation/index.ts','src/compilation/admission/index.ts','src/compilation/admission/diff.ts','src/compilation/admission/access/index.ts','src/compilation/ir/index.ts','src/compilation/bundle/index.ts','src/compilation/bundle/hash.ts','src/compilation/targets/python/index.ts','scripts/compilation-browser.ts','tests/compilation/access-fixtures.ts'];
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const p=new URL(req.url).pathname;if(p==='/generator.js')return new Response(bundle,{headers:{'content-type':'text/javascript'}});if(p==='/cases')return Response.json(cases);return new Response('<!doctype html><html><body>Typed access generator parity</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const observed=await page.evaluate(async()=>{const path='/generator.js',u=await import(path),cs=await(await fetch('/cases')).json(),results=[];for(const c of cs){const a=u.generateAccessPackage(c.request,c.profile),b=u.generateAccessPackage(c.request,c.profile);if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Browser generation drift');results.push(a);}if('Bun'in globalThis||'process'in globalThis||'Buffer'in globalThis)throw Error('Host global leak');return results;});
 assert.deepEqual(observed,outputs);assert.deepEqual(externalRequests,[]);
 const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
 const evidence={scope:'Experimental stage-one candidate bytes and refusal/report parity; Python runtime ABI/native execution not qualified',bun:Bun.version,chromium:browser.version(),cases:cases.map(c=>c.id),runsPerRuntime:2,candidates:outputs.filter(r=>r.outcome==='candidate').length,refusals:outputs.filter(r=>r.outcome==='refused').length,externalRequests,bundleSha256:sha(bundle),inputsSha256:sha(JSON.stringify(cases)),outputsSha256:sha(JSON.stringify(outputs)),sourceSha256:Object.fromEntries(await Promise.all(originFiles.map(async p=>[p,sha(await Bun.file(p).text())])))};
 await Bun.write('docs/helix/04-build/evidence/typed-persistence/b-tp-002-003/browser.json',JSON.stringify(evidence,null,2)+'\n');
 await Bun.write('docs/helix/04-build/evidence/typed-persistence/b-tp-002-003/browser-cases.json',JSON.stringify({cases,outputs},null,2)+'\n');
 console.log(JSON.stringify(evidence));
}finally{await browser?.close();server.stop(true);}
