// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import type {BunPlugin} from 'bun';
import type {Document} from '../../src/model/types';
import {inspectRawTableBinding as inspectReference} from '../../src/extensions/binding/raw-profiles';

const logical=await Bun.file('fixtures/binding/raw-profiles/logical.json').json() as Document;
const cases=[] as {binding:Document;logical:Document;target:{platform:string;majorVersion:string};module:string}[];
for(const system of ['lakebase','unity-catalog','spark-delta']){
 const binding=await Bun.file(`fixtures/binding/raw-profiles/${system}.json`).json() as Document;
 const profile=binding.extensions!['umf.binding'] as any,target={platform:system,majorVersion:profile.target.version};
 cases.push({binding,logical,target,module:'sales'});
 const missing=structuredClone(logical);delete (missing.modules[0]!.elements[1] as any).members;
 cases.push({binding,logical:missing,target,module:'sales'});
 const mismatch={...target,majorVersion:target.majorVersion+'.1'};
 cases.push({binding,logical,target:mismatch,module:'sales'});
}
const expected=cases.map(c=>inspectReference(c.binding,c.logical,c.target,c.module));
const wasmPackage=resolve(process.env.UMF_WASM_PKG??'bindings/core/wasm/pkg');
const factoryBuild=await Bun.build({entrypoints:['src/extensions/binding/raw-profiles-inspector.ts'],target:'browser',format:'esm'});
if(!factoryBuild.success)throw new Error(factoryBuild.logs.join('\n'));
const factoryBundle=await factoryBuild.outputs[0]!.text();
if(factoryBundle.includes('CORE_RECORD_MEMBERS_VERSION')||factoryBundle.includes('Explicit empty membership differs from an absent declaration'))throw new Error('Injected raw-profile factory retained the TypeScript inspector implementation');
const wasmImports=new Set<string>();
const wasmPlugin:BunPlugin={name:'raw-profile-browser-v4-wasm',setup(build){build.onResolve({filter:/umf_core_wasm\.js$/},args=>{
 if(args.importer.endsWith('bindings/core/wasm/index.js')&&args.path==='./pkg/umf_core_wasm.js'){wasmImports.add('adapter');return {path:resolve(wasmPackage,'umf_core_wasm.js')};}
 if(args.importer.endsWith('src/index-browser-v4.ts')&&args.path==='../bindings/core/wasm/pkg/umf_core_wasm.js'){wasmImports.add('root');return {path:resolve(wasmPackage,'umf_core_wasm.js')};}
 return undefined;
})}};
const built=await Bun.build({entrypoints:['src/index-browser-v4.ts'],target:'browser',format:'esm',plugins:[wasmPlugin]});
if(!built.success)throw new Error(built.logs.join('\n'));
if(!wasmImports.has('adapter')||!wasmImports.has('root'))throw new Error('V4 browser bundle did not resolve both WASM imports');
const bundle=await built.outputs[0]!.text(),wasm=await Bun.file(resolve(wasmPackage,'umf_core_wasm_bg.wasm')).bytes();
const glue=await Bun.file(resolve(wasmPackage,'umf_core_wasm.js')).text();
if(!glue.includes('securityNotScalar'))throw new Error('Selected WASM package predates current V4 browser requirements; pass UMF_WASM_PKG for a current generated WASM package.');
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const path=new URL(req.url).pathname;
 if(path==='/browser-root.js')return new Response(bundle,{headers:{'content-type':'text/javascript'}});
 if(path==='/umf_core_wasm_bg.wasm')return new Response(wasm,{headers:{'content-type':'application/wasm'}});
 if(path==='/cases')return Response.json(cases);
 return new Response('<!doctype html>V4 browser raw-profile route');
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),wasmRequests:string[]=[];
 page.on('request',request=>{if(request.url().endsWith('.wasm'))wasmRequests.push(request.url());});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const result=await page.evaluate(async()=>{
  const browserRootPath='/browser-root.js',api=await import(browserRootPath),cases=await(await fetch('/cases')).json();
  return {results:cases.map((c:any)=>api.inspectRawTableBinding(c.binding,c.logical,c.target,c.module)),nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)&&!('Bun'in globalThis)};
 });
 assert.deepEqual(result.results,expected);assert.equal(result.nodeGlobalsAbsent,true);assert.equal(wasmRequests.length>0,true);
 console.log(JSON.stringify({status:'pass',chromium:browser.version(),cases:cases.length,wasmRequests:wasmRequests.length,nodeGlobalsAbsent:result.nodeGlobalsAbsent,rootBundleHasShadowedTypescriptInspector:bundle.includes('CORE_RECORD_MEMBERS_VERSION'),factoryBundleHasTypescriptInspector:false}));
}finally{await browser?.close();server.stop(true);}
