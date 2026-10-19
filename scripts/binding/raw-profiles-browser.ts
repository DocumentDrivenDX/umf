// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {inspectRawTableBinding} from '../../src/extensions/binding/raw-profiles';
import {readBindingDocument,writeBindingDocument} from '../../src/extensions/binding';
import type {Document} from '../../src/model/types';
const root='docs/helix/04-build/evidence/typed-persistence/raw-binding-profiles/';
const logical=await Bun.file('fixtures/binding/raw-profiles/logical.json').json() as Document;
const cases:{id:string;binding:Document;logical:Document;target:{platform:string;majorVersion:string};module:string}[]=[];
for(const system of ['lakebase','unity-catalog','spark-delta']){
 const binding=await Bun.file(`fixtures/binding/raw-profiles/${system}.json`).json() as Document;
 const p=binding.extensions!['umf.binding'] as any,target={platform:system,majorVersion:p.target.version};
 cases.push({id:system,binding,logical,target,module:'sales'});
 cases.push({id:system+'-version-mismatch',binding,logical,target:{...target,majorVersion:p.target.version+'.1'},module:'sales'});
 const unknown=structuredClone(binding);(unknown.extensions!['umf.binding'] as any).future={retained:['opaque']};
 cases.push({id:system+'-unknown',binding:unknown,logical,target,module:'sales'});
 const missing=structuredClone(logical);delete (missing.modules[0]!.elements[1] as any).members;
 cases.push({id:system+'-missing-members',binding,logical:missing,target,module:'sales'});
}
const outputs=cases.map(c=>inspectRawTableBinding(c.binding,c.logical,c.target,c.module));
assert.deepEqual(outputs.map(r=>r.valid),cases.map(c=>!c.id.includes('-version-mismatch')&&!c.id.includes('-unknown')&&!c.id.includes('-missing-members')));
const built=await Bun.build({entrypoints:['src/extensions/binding/raw-profiles.ts','src/extensions/binding/index.ts'],target:'browser',format:'esm',splitting:true});
if(!built.success)throw Error(built.logs.join('\n'));
const assets=new Map(await Promise.all(built.outputs.map(async file=>[new URL(file.path,'file:').pathname.split('/').pop()!,await file.text()] as const)));
const rawName=[...assets.keys()].find(name=>name==='raw-profiles.js')!,bindingName=[...assets.keys()].find(name=>name==='index.js')!;
assert.ok(rawName&&bindingName);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const name=new URL(req.url).pathname.slice(1);if(assets.has(name))return new Response(assets.get(name),{headers:{'content-type':'text/javascript'}});if(name==='cases')return Response.json(cases);return new Response('<!doctype html>Declarative binding qualification',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const observed=await page.evaluate(async({rawName,bindingName})=>{
  const raw=await import('/'+rawName),binding=await import('/'+bindingName),cases=await(await fetch('/cases')).json();
  const results=cases.map((c:any)=>raw.inspectRawTableBinding(c.binding,c.logical,c.target,c.module));
  for(const c of cases.filter((c:any)=>!c.id.includes('-missing-members')))for(const format of ['json','yaml']){
   const recovered=binding.readBindingDocument(binding.writeBindingDocument(c.binding,c.logical,format),c.logical,format);
   if(JSON.stringify(recovered)!==JSON.stringify(c.binding))throw Error('Recovery mismatch');
  }
  if('Bun'in globalThis||'process'in globalThis||'Buffer'in globalThis)throw Error('Host globals leaked');
  return results;
 },{rawName,bindingName});
 assert.deepEqual(observed,outputs);assert.deepEqual(external,[]);
 for(const c of cases.filter(c=>!c.id.includes('-missing-members')))for(const format of ['json','yaml'] as const)assert.equal(JSON.stringify(readBindingDocument(writeBindingDocument(c.binding,c.logical,format),c.logical,format)),JSON.stringify(c.binding));
 const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
 const evidence={date:'2026-10-15',scope:'Partial declarative binding validation, identity refusals and JSON/YAML unknown recovery only; native types, SQL, execution and full ColumnSet coverage UNTESTED',bun:Bun.version,chromium:browser.version(),cases:cases.map(c=>c.id),outputsSha256:sha(JSON.stringify(outputs)),inputsSha256:sha(JSON.stringify(cases)),bundleSha256:Object.fromEntries([...assets].map(([name,text])=>[name,sha(text)])),externalRequests:external};
 await Bun.write(root+'browser.json',JSON.stringify(evidence,null,2)+'\n');await Bun.write(root+'browser-cases.json',JSON.stringify({cases,outputs},null,2)+'\n');console.log(JSON.stringify(evidence));
}finally{await browser?.close();server.stop(true);}
