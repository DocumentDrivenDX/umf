// SPDX-License-Identifier: MIT OR Apache-2.0
import {readFile} from 'node:fs/promises';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';

const work=await mkdtemp(join(tmpdir(),'umf-r7-v3-repair-browser-'));
const packageRoot=process.env.UMF_PACKED_PACKAGE_ROOT??process.cwd();
const corpus=JSON.parse(await Bun.file('docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json').text());
const commerce=await Bun.file('tests/unified/commerce.json').text();
const nativeTable=JSON.stringify((await import('../tests/unified/table-operation-fixture')).tableOperationSource());
const probe=await readFile('scripts/rust-migration/r7/codegen-host-read-gate0-probe.mjs','utf8');
const budgetProbe=await readFile('scripts/rust-migration/r7/codegen-host-read-v3-transport-budget-probe.mjs','utf8');
const legacyBuild=await Bun.build({entrypoints:['src/access/index.ts'],outdir:work,target:'browser',format:'esm',naming:'legacy.js'});
if(!legacyBuild.success)throw new Error(legacyBuild.logs.join('\n'));
const candidate=Bun.file(join(packageRoot,'dist/umf-rust-codegen-candidate-v3-browser.js'));
const wasm=Bun.file(join(packageRoot,'dist/umf_core_wasm_bg.wasm'));
const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/candidate.js')return new Response(candidate,{headers:{'content-type':'text/javascript'}});
 if(path==='/umf_core_wasm_bg.wasm')return new Response(wasm,{headers:{'content-type':'application/wasm'}});
 if(path==='/legacy.js')return new Response(await Bun.file(join(work,'legacy.js')),{headers:{'content-type':'text/javascript'}});
 if(path==='/probe.mjs')return new Response(probe,{headers:{'content-type':'text/javascript'}});
 if(path==='/budget-probe.mjs')return new Response(budgetProbe,{headers:{'content-type':'text/javascript'}});
 if(path==='/fixtures.json')return Response.json({commerce,nativeTable});
 if(path==='/corpus.json')return Response.json(corpus);
 return new Response('<!doctype html><title>V3 repair check</title>');
}});
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();let externalRequests=0;
 page.on('request',request=>{if(!request.url().startsWith(server.url.origin))externalRequests++;});
 await page.goto(server.url.href);
 const outcome=await page.evaluate(async()=>{
  const remoteImport=(path:string)=>import(new URL(path,location.href).href);
  const legacy=await remoteImport('/legacy.js') as any;
  const candidateApi=await remoteImport('/candidate.js') as any;
  const {runLegacyReadProbe}=await remoteImport('/probe.mjs') as any;
  const {runCumulativeHostResponseBudgetProbe}=await remoteImport('/budget-probe.mjs') as any;
  const {commerce,nativeTable}=await(await fetch('/fixtures.json')).json();
  const expected=runLegacyReadProbe(legacy.generatePythonClient,commerce,nativeTable);
  const generator=await candidateApi.createPythonClientRustCandidateV3();
  const actual=runLegacyReadProbe(generator,commerce,nativeTable);
  const canonical=(value:any)=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
  if(canonical(actual)!==canonical(expected))throw new Error('Edge Gate0 repair parity mismatch');
  const corpus=await(await fetch('/corpus.json')).json();
  const cases=corpus.cases.filter((item:any)=>item.operation==='generatePythonClient');
  for(const item of cases){let observed:any;try{observed={ok:true,result:generator(item.request)};}catch(error){const value=error as Error&{code?:string;path?:string};observed={ok:false,error:{code:value.code,message:value.message,path:value.path}};}if(canonical(observed)!==canonical(item.expected))throw new Error(`Edge R3 parity mismatch: ${item.id}`);}
  const invalidDocument=JSON.parse(commerce);invalidDocument.modules[0].actions=[{id:'legacy-action'}];let recordReads=0,crossed:any;
  try{generator({text:JSON.stringify(invalidDocument),package:'shop',get records(){recordReads++;throw new Error('records getter must be gated');}});}catch(error){crossed=error;}
  if(recordReads!==0||crossed?.code!=='ACCESS_UNSUPPORTED')throw new Error('Edge legacy-action crossed gate mismatch');
  let packageReads=0;const pathResult=generator({text:commerce,get package(){packageReads++;return packageReads<=4?'shop':'x\ud800';}});
  if(pathResult.files[0]?.path!=='x\ud800/__init__.py')throw new Error('Edge unpaired UTF-16 output path mismatch');
  const liveUint16Array=globalThis.Uint16Array;let poisonedResult:any;
  try{
   poisonedResult=generator({get text(){globalThis.Uint16Array=(()=>{throw new Error('live Uint16Array consulted during host frame transfer');}) as any;return commerce;},package:'shop'});
  }finally{globalThis.Uint16Array=liveUint16Array;}
  if(!poisonedResult.files.length)throw new Error('Edge host callback poisoning Uint16Array prevented valid frames');
  let recordsRead=false,throwFromMeter=true;
  const controlled=await candidateApi.createPythonClientRustCandidateV3({controls:{meter(){if(recordsRead&&throwFromMeter){throwFromMeter=false;throw new Error('meter during host response decode');}}}});
  let controlCode='';try{controlled({text:commerce,package:'shop',get records(){recordsRead=true;return [{module:'commerce',element:'Customer'}];}});}catch(error){controlCode=(error as {code?:string}).code??'';}
  if(controlCode!=='METER_FAILURE')throw new Error(`Edge host response control failure was ${controlCode}`);
  const recovered=controlled({text:commerce,package:'shop',records:[{module:'commerce',element:'Customer'}]});
  if(recovered.files.length===0)throw new Error('Edge generator did not recover after control failure');
  const cumulativeBudget=await runCumulativeHostResponseBudgetProbe(candidateApi.createPythonClientRustCandidateV3,commerce);
  if(cumulativeBudget.failedCode!=='METER_FAILURE'||cumulativeBudget.getterReadsAtFailure!==3||!cumulativeBudget.recovered)throw new Error('Edge cumulative host-response budget mismatch');
  const selectionError=(request:any)=>{try{generator(request);return null;}catch(error){const value=error as Error&{code?:string;path?:string};return {code:value.code,path:value.path,message:value.message};}};
  const surrogateRecord=selectionError({text:commerce,package:'shop',records:[{module:'\ud800',element:'x'}]});
  if(surrogateRecord?.code!=='ACCESS_UNSUPPORTED'||surrogateRecord.path!=='\ud800.x'||surrogateRecord.message!=='Selected Record not found')throw new Error(`Edge surrogate record selection mismatch: ${JSON.stringify(surrogateRecord)}`);
  const surrogateAction=selectionError({text:commerce,package:'shop',actions:[{module:'\ud800',action:'x'}]});
  if(surrogateAction?.code!=='ACCESS_UNSUPPORTED'||surrogateAction.path!=='\ud800.x'||surrogateAction.message!=='Selected Action not found')throw new Error(`Edge surrogate action selection mismatch: ${JSON.stringify(surrogateAction)}`);
  return {gate0Cases:46,r3Cases:cases.length,crossedGate:crossed.code,recordReads,latePath:JSON.stringify(pathResult.files[0]?.path),poisonedUint16ArrayRecovered:true,controlCode,recovered:true,cumulativeBudget,surrogateRecord,surrogateAction,browser:await navigator.userAgent};
 });
 if(outcome.gate0Cases!==46||outcome.r3Cases!==31||externalRequests!==0)throw new Error('Edge V3 repair qualification counts failed');
 console.log(JSON.stringify({...outcome,externalRequests}));
}finally{await browser?.close();server.stop(true);await rm(work,{recursive:true,force:true});}
