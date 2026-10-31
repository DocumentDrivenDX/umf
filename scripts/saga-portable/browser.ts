// SPDX-License-Identifier: MIT OR Apache-2.0
/** Same static expectation vectors on actual Chromium and production WASM. */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {capturePortableProducerSnapshot,verifyPortableProducerSnapshot} from './custody';
const root=resolve('.');
const artifactPaths={'dist/runtime/wasm/index.js':'dist/runtime/wasm/index.js','dist/runtime/wasm/pkg/umf_core_wasm.js':'dist/runtime/wasm/pkg/umf_core_wasm.js','dist/runtime/wasm/pkg/umf_core_wasm_bg.wasm':'dist/runtime/wasm/pkg/umf_core_wasm_bg.wasm'};
const snapshot=await capturePortableProducerSnapshot(root,artifactPaths);
const bundle=await Bun.build({entrypoints:['scripts/saga-portable/verify.ts'],target:'browser',format:'esm'});if(!bundle.success)throw Error(bundle.logs.join('\n'));
const corpus=await Bun.file('fixtures/saga/portable.json').json();
const resources=Object.fromEntries(await Promise.all(Object.entries({coreSchema:'spec/core/schema.json',referenceSchema:'spec/core/semantic-type-reference.schema.json',packageSchema:'spec/core/extension-package.schema.json',constraints:'spec/metamodel/generated/core-constraints.json',domainPolicy:'spec/metamodel/generated/domain-policy.json',tablesPackage:'spec/extensions/tables/package.json',actionsPackage:'spec/extensions/actions/package.json',bindingPackage:'spec/extensions/binding/package.json',stableBindingPackage:'spec/extensions/binding-stable/package.json',sagaPackage:'spec/extensions/saga/package.json'}).map(async([name,path])=>[name,await Bun.file(path).json()])));
const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){const url=new URL(request.url);if(url.pathname==='/')return new Response('<!doctype html><title>Saga conformance</title>');if(url.pathname==='/oracle.js')return new Response(bundle.outputs[0],{headers:{'content-type':'text/javascript'}});if(url.pathname==='/inputs.json')return Response.json({resources,corpus});const path=resolve(root,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(root+sep))return new Response('Refused',{status:403});return new Response(Bun.file(path));}});
const browser=await chromium.launch({headless:true});
try{const page=await browser.newPage();await page.goto(server.url.href);const report=await page.evaluate(async()=>{
 const {resources,corpus}=await (await fetch('/inputs.json')).json();
 const bindingPath='/dist/runtime/wasm/index.js';const binding=await import(bindingPath);
 const engine=await binding.initializeCodegenWasm(undefined,globalThis,resources);
 const core=await binding.initializeWasm(undefined,globalThis,resources);
 const oraclePath='/oracle.js';const oracle=await import(oraclePath);
 const originalFetch=globalThis.fetch;let hostCalls=0;globalThis.fetch=Object.assign(()=>{hostCalls++;throw Error('Artifact attempted host fetch');},{preconnect:()=>{hostCalls++;throw Error('Artifact attempted host preconnect');}});
 try{oracle.verifySagaExchange(core,engine,corpus.cases.find((v:any)=>v.expected.unknown).source);const result=oracle.verifySagaVectors(engine,corpus.cases);if(hostCalls)throw Error('Artifact attempted host call');return {...result,hostCalls,host:'Chromium WASM'};}finally{globalThis.fetch=originalFetch;}
});await verifyPortableProducerSnapshot(root,artifactPaths,snapshot);const artifacts=Object.fromEntries(Object.entries(artifactPaths).map(([name,path])=>[name,{path,sha256:snapshot.artifacts[name]!}]));const receipt={...report,profile:'umf.saga.portable-host-receipt/2',hostId:'browser',runtime:{browser:browser.version(),platform:process.platform,arch:process.arch},qualificationInputs:snapshot.qualificationInputs,corpusSha256:snapshot.qualificationInputs['fixtures/saga/portable.json'],artifacts};await mkdir('.cache/saga',{recursive:true});await Bun.write('.cache/saga/portable-browser.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.passed!==report.cases)throw Error('Chromium saga conformance failed');}finally{await browser.close();server.stop(true);}
