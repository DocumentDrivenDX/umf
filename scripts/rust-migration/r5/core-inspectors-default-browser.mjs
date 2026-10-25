// SPDX-License-Identifier: MIT OR Apache-2.0
// Real Chromium replay of the default inspector binder over the isolated WASM package.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {extname,normalize,resolve,sep} from 'node:path';
import {chromium} from 'playwright';

const root=process.cwd();
const packageRoot=process.env.UMF_INSPECTORS_WASM_PACKAGE??'/private/tmp/umf-semantic-wasm-build/package';
const binderBundle='/private/tmp/umf-inspectors-chromium-replay/binder.js';
await mkdir(resolve(binderBundle,'..'),{recursive:true});
execFileSync('bun',['build','src/access/rust-core-inspectors-default.ts','--target','browser','--format','esm','--outfile',binderBundle],{cwd:root,stdio:'inherit'});
const hostFiles={coreSchema:'spec/core/schema.json',referenceSchema:'spec/core/semantic-type-reference.schema.json',packageSchema:'spec/core/extension-package.schema.json',constraints:'spec/metamodel/generated/core-constraints.json',domainPolicy:'spec/metamodel/generated/domain-policy.json'};
const packetPath='docs/helix/04-build/evidence/rust-migration/r5-core-inspectors-default/frozen-predecessors.json';
const inputs={resources:Object.fromEntries(await Promise.all(Object.entries(hostFiles).map(async([key,path])=>[key,JSON.parse(await readFile(resolve(root,path),'utf8'))]))),frozen:JSON.parse(await readFile(resolve(root,packetPath),'utf8'))};
const mime={'.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.d.ts':'text/plain'};
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/inputs.json'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(inputs));return;}
  if(pathname==='/binder.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(await readFile(binderBundle));return;}
  if(!pathname.startsWith('/package/'))throw Error('route');
  const relative=normalize(pathname.slice('/package/'.length));const path=resolve(packageRoot,relative);
  if(path!==resolve(packageRoot,relative)||!path.startsWith(resolve(packageRoot)+sep))throw Error('path');
  res.writeHead(200,{'content-type':mime[extname(path)]??'application/octet-stream'});res.end(await readFile(path));
 }catch{res.writeHead(404);res.end('not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,timeout:30_000,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/inputs.json`);
 const result=await page.evaluate(async()=>{
  const {resources,frozen}=await(await fetch('/inputs.json')).json();
  const pkg=await import('/package/index.js');
  const engine=await pkg.initializeCoreModelWasm(resources,()=>import('/package/pkg/umf_core_wasm.js'),globalThis);
  const {bindCoreInspectorsRust}=await import('/binder.js');
  const bound=bindCoreInspectorsRust(engine);
  const names={scalarType:'inspectCoreScalarType',recordMembers:'inspectCoreRecordMembers',referenceLinks:'inspectCoreReferenceLinks'};
  const actual={};
  for(const[group,operationName]of Object.entries(names)){
   const packet=frozen.packets[group].packet;actual[group]={};
   for(const[name,{source,identity}]of Object.entries(packet.cases)){
    try{actual[group][name]={ok:true,value:bound[operationName](source,identity)}}
    catch(error){actual[group][name]={ok:false,error:{code:error.code??'',message:error.message??String(error),path:error.path??''}}}
   }
  }
  const meter=[];
  const metered=await pkg.initializeCoreModelWasm(resources,()=>import('/package/pkg/umf_core_wasm.js'),globalThis,{controls:{meter:amount=>meter.push(amount)}});
  const meteredResult=metered.inspectCoreScalarType(frozen.packets.scalarType.packet.cases.known_uuid.source,frozen.packets.scalarType.packet.cases.known_uuid.identity);
  let resourceError;try{const limited=await pkg.initializeCoreModelWasm(resources,()=>import('/package/pkg/umf_core_wasm.js'),globalThis,{controls:{maxWork:0}});limited.inspectCoreScalarType(frozen.packets.scalarType.packet.cases.known_uuid.source,frozen.packets.scalarType.packet.cases.known_uuid.identity)}catch(error){resourceError={name:error.name,code:error.code,message:error.message,path:error.path??''}}
  const linkCase=frozen.packets.referenceLinks.packet.cases.repeated_opaque_order;
  const ordered=bound.inspectCoreReferenceLinks(linkCase.source,linkCase.identity).meaning.links.map(link=>link.reference.role);
  return{actual,meterCount:meter.length,meterTotal:meter.reduce((a,b)=>a+b,0),meteredOperation:meteredResult.operation,resourceError,ordered,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 });
 assert.equal(result.nodeGlobalsAbsent,true);
 let caseCount=0;
 for(const[group,{packet}]of Object.entries(inputs.frozen.packets))for(const[name,expected]of Object.entries(packet.outcomes)){
  assert.equal(JSON.stringify(result.actual[group][name]),JSON.stringify(expected),`${group}/${name}`);caseCount++;
 }
 assert.ok(result.meterCount>0&&result.meterTotal>0,'meter callback observed work');
 assert.equal(result.meteredOperation,'inspect-core-scalar-type');
 assert.equal(result.resourceError?.code,'RESOURCE_LIMIT','host work limit refusal');
 assert.equal(JSON.stringify(result.ordered),JSON.stringify(['record-type','future-role','record-type']),'unknown and repeated reference order');
 const files=['src/access/rust-core-inspectors-default.ts','src/index-node-v4.ts','src/index-browser-v4.ts','scripts/rust-migration/r5/core-inspectors-default-browser.mjs','/private/tmp/umf-inspectors-chromium-replay/binder.js','docs/helix/04-build/evidence/rust-migration/r5-core-inspectors-default/frozen-predecessors.json'];
 const sourceHashes=Object.fromEntries(await Promise.all(files.map(async path=>{const p=path.startsWith('/')?path:resolve(root,path);return[path,createHash('sha256').update(await readFile(p)).digest('hex')]})));
 const artifacts={};for(const path of ['index.js','src/core-model.js','src/wire.js','pkg/umf_core_wasm.js','pkg/umf_core_wasm_bg.wasm'])artifacts[path]=createHash('sha256').update(await readFile(resolve(packageRoot,path))).digest('hex');
 const receipt={format:'umf.r5.core-inspectors-default.chromium/1',status:'pass',qualification:'source-route and isolated WASM package behavior only; no installed SDK qualification or retirement claim',chromium:browser.version(),target:'wasm32-unknown-unknown isolated package at /private/tmp/umf-semantic-wasm-build/package',packageRoot,packetSha256:createHash('sha256').update(await readFile(resolve(root,packetPath))).digest('hex'),caseCount,nodeGlobalsAbsent:result.nodeGlobalsAbsent,controls:{meterCallback:{count:result.meterCount,total:result.meterTotal},workLimitError:result.resourceError,referenceRoleOrder:result.ordered},sourceHashes,packageArtifactSha256:artifacts};
 const out=resolve(root,'docs/helix/04-build/evidence/rust-migration/r5-core-inspectors-default/chromium.json');await writeFile(out,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,chromium:receipt.chromium,caseCount,controls:receipt.controls,artifacts}));
}finally{await browser?.close();server.close();}
