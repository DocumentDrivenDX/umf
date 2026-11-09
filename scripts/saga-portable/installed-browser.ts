// SPDX-License-Identifier: MIT OR Apache-2.0
// Qualification only: exercise the retained installed public browser facade.
import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {capturePortableProducerSnapshot,verifyPortableProducerSnapshot,sha256File,SDK_SAGA_MEMBERS} from './custody';

const consumer=resolve(process.env.UMF_SDK_INSTALL_RETAIN_DIR!);
const packageRoot=resolve(consumer,'node_modules/@umf/core');
const output=resolve(process.env.UMF_TEMPORAL_OUTPUT!);
const custody=JSON.parse(await readFile(resolve(consumer,'g03-sdk-install-custody.json'),'utf8'));
if(custody.profile!=='umf.sdk-installed-saga-custody/1'||custody.sagaResult.cases!==19||custody.sagaResult.passed!==19)throw Error('Installed SDK Saga custody missing');
const archive=resolve('.cache/sdk-distribution/umf-sdk.tgz');
const snapshot=await capturePortableProducerSnapshot('.', {sdkArchive:archive});
if(snapshot.artifacts.sdkArchive!==custody.archiveSha256)throw Error('Browser candidate differs from installed archive');
async function verifyMembers(){for(const member of SDK_SAGA_MEMBERS){
 const expected=custody.installedMembers['package/'+member];
 if(!expected||await sha256File(resolve(packageRoot,member))!==expected.sha256)throw Error('Installed browser member changed: '+member);
}}
await verifyMembers();
const oracle=await Bun.build({entrypoints:['scripts/saga-portable/verify.ts'],target:'browser',format:'esm'});
if(!oracle.success)throw Error('Oracle bundle failed');
const vectors=await Bun.file('fixtures/saga/portable.json').json();
const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/')return new Response('<!doctype html><title>Installed SDK Saga</title>');
 if(path==='/oracle.js')return new Response(oracle.outputs[0],{headers:{'content-type':'text/javascript'}});
 if(path==='/vectors.json')return Response.json(vectors);
 if(!path.startsWith('/sdk/'))return new Response('Refused',{status:403});
 const file=resolve(packageRoot,decodeURIComponent(path.slice(5)));
 if(!file.startsWith(packageRoot+sep))return new Response('Refused',{status:403});
 return new Response(Bun.file(file));
}});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();await page.goto(server.url.href);
 const report=await page.evaluate(async()=>{
  const sdkPath='/sdk/dist/umf-browser.js',bindingPath='/sdk/dist/runtime/wasm/index.js';
  const sdk=await import(sdkPath);
  const binding=await import(bindingPath);
  const resources=sdk.createSagaResources();
  const engine=await binding.initializeCodegenWasm(undefined,globalThis,resources);
  const core=await binding.initializeWasm(undefined,globalThis,resources);
  const registry=sdk.registerSagas(new sdk.Registry(core),engine);
  const oraclePath='/oracle.js';
  const {verifySagaVectors,verifySagaExchange}=await import(oraclePath);
  const vectors=await (await fetch('/vectors.json')).json();
  const subject={inspectSagas:(source:any)=>sdk.inspectSagas(source,registry),declareSaga:(source:any,module:string,definition:any)=>sdk.declareSaga(source,module,definition,registry),editSaga:(source:any,identity:any,replacement:any)=>sdk.editSaga(source,identity,replacement,registry),assessSaga:(source:any,identity:any,capabilities:any)=>sdk.assessSaga(source,identity,capabilities,registry)};
  const fetchBefore=globalThis.fetch;let hostCalls=0;
  globalThis.fetch=(()=>{hostCalls++;throw Error('Saga attempted host fetch');}) as unknown as typeof fetch;
  try{
   verifySagaExchange(core,subject,vectors.cases.find((v:any)=>v.expected.unknown).source);
   const result=verifySagaVectors(subject,vectors.cases);
   if(hostCalls||result.cases!==19||result.passed!==19)throw Error(JSON.stringify({hostCalls,result}));
   if(!Object.isFrozen(subject.inspectSagas(vectors.cases[0].source).source))throw Error('Public browser API lost immutable reports');
   return {result,hostCalls};
  }finally{globalThis.fetch=fetchBefore;}
 });
 await verifyMembers();await verifyPortableProducerSnapshot('.',{sdkArchive:archive},snapshot);
 await writeFile(resolve(output,'installed-sdk-browser.json'),JSON.stringify({profile:'umf.sdk-installed-browser-saga/1',artifactSourceS:process.env.UMF_ARTIFACT_SOURCE,controllerQ:process.env.UMF_CONTROLLER_COMMIT,archiveSha256:custody.archiveSha256,qualificationInputs:snapshot.qualificationInputs,installedMembers:custody.installedMembers,browser:browser.version(),...report},null,2)+'\n');
 console.log(JSON.stringify(report));
}finally{await browser.close();server.stop(true);}
