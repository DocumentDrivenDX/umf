// SPDX-License-Identifier: MIT OR Apache-2.0
// Real Chromium parity for the frozen record-members packet over rebuilt WASM.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {extname,join,normalize,resolve} from 'node:path';
import {chromium} from 'playwright';

const root=process.cwd();
const host=process.env.UMF_R5_RECORD_MEMBERS_BROWSER_HOST??'/private/tmp/umf-r5-record-members-browser';
const wasmPackage=process.env.UMF_R5_RECORD_MEMBERS_WASM_PKG??'/private/tmp/umf-r5-record-members/pkg';
const pkg=join(host,'wasm/pkg');
await mkdir(join(host,'wasm/src'),{recursive:true});
await mkdir(pkg,{recursive:true});
for(const file of ['index.js',...(await readdir(join(root,'bindings/core/wasm/src'))).filter(file=>file.endsWith('.js')).map(file=>`src/${file}`)]){
  await writeFile(join(host,'wasm',file),await readFile(join(root,'bindings/core/wasm',file)));
}
await writeFile(join(host,'wasm/package.json'),'{"type":"module"}');
for(const file of ['umf_core_wasm.js','umf_core_wasm_bg.wasm','umf_core_wasm.d.ts']){
  await writeFile(join(pkg,file),await readFile(join(wasmPackage,file)));
}
const resources=Object.fromEntries(await Promise.all([
  ['coreSchema','spec/core/schema.json'],['referenceSchema','spec/core/semantic-type-reference.schema.json'],
  ['packageSchema','spec/core/extension-package.schema.json'],['constraints','spec/metamodel/generated/core-constraints.json'],
  ['domainPolicy','spec/metamodel/generated/domain-policy.json'],
].map(async([name,path])=>[name,JSON.parse(await readFile(join(root,path),'utf8'))])));
const frozen=JSON.parse(await readFile(join(root,'docs/helix/04-build/evidence/rust-migration/r5-record-members-inspection/frozen-typescript.json'),'utf8'));
await writeFile(join(host,'inputs.json'),JSON.stringify({resources,frozen}));
const mime={'.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.d.ts':'text/plain'};
const server=createServer(async(req,res)=>{
  try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const path=normalize(join(host,pathname));if(!path.startsWith(host))throw Error('path');const bytes=await readFile(path);res.writeHead(200,{'content-type':mime[extname(path)]??'application/octet-stream','access-control-allow-origin':'*'});res.end(bytes);}
  catch{res.writeHead(404);res.end('not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  const address=server.address();
  await page.goto('http://127.0.0.1:'+address.port+'/inputs.json');
  const result=await page.evaluate(async()=>{
    const {resources,frozen}=await (await fetch('/inputs.json')).json();
    const {initializeCoreModelWasm}=await import('/wasm/index.js');
    const engine=await initializeCoreModelWasm(resources,()=>import('/wasm/pkg/umf_core_wasm.js'),globalThis);
    const actual={};
    for(const [name,{source,identity}] of Object.entries(frozen.cases)){
      try{actual[name]={ok:true,value:engine.inspectCoreRecordMembers(source,identity)};}
      catch(error){actual[name]={ok:false,error:{code:error.code??'',message:error.message??String(error),path:error.path??''}};}
    }
    return {actual,nodeGlobalsAbsent:!('process' in globalThis)&&!('Buffer' in globalThis)};
  });
  assert.equal(result.nodeGlobalsAbsent,true);
  for(const [name,expected] of Object.entries(frozen.outcomes))assert.equal(JSON.stringify(result.actual[name]),JSON.stringify(expected),name);
  const wasm=new Uint8Array(await readFile(join(pkg,'umf_core_wasm_bg.wasm')));
  const frozenBytes=new Uint8Array(await readFile(join(root,'docs/helix/04-build/evidence/rust-migration/r5-record-members-inspection/frozen-typescript.json')));
  const hashFile=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
  const wasmJs=await readFile(join(pkg,'umf_core_wasm.js'));
  const receipt={format:'umf-r5-record-members-chromium/1',status:'pass',cohort:'opt-in scoped source slice (browser wrapper copied from repository; not a full transitive closure)',chromium:browser.version(),cases:Object.keys(result.actual).length,nodeGlobalsAbsent:result.nodeGlobalsAbsent,
    artifacts:{wasmSha256:createHash('sha256').update(wasm).digest('hex'),wasmBindgenJsSha256:createHash('sha256').update(wasmJs).digest('hex')},
    frozenTypescriptSha256:createHash('sha256').update(frozenBytes).digest('hex'),
    sourceSha256:{core:await hashFile(resolve(root,'crates/umf-core/src/record_members_inspection.rs')),wire:await hashFile(resolve(root,'crates/umf-core-wire/src/lib.rs')),wasmBinding:await hashFile(resolve(root,'bindings/core/wasm/src/lib.rs')),test:await hashFile(resolve(root,'crates/umf-core-wire/tests/r5_record_members_inspection.rs')),runner:await hashFile(resolve(root,'scripts/rust-migration/r5/record-members-inspection-browser.mjs')),wasmIndex:await hashFile(join(host,'wasm/index.js')),...Object.fromEntries(await Promise.all((await readdir(join(host,'wasm/src'))).filter(file=>file.endsWith('.js')).map(async file=>[file,await hashFile(join(host,'wasm/src',file))])))},actual:result.actual};
  const receiptPath=process.env.UMF_R5_RECORD_MEMBERS_BROWSER_RECEIPT??'docs/helix/04-build/evidence/rust-migration/r5-record-members-inspection/chromium.json';
  await writeFile(resolve(root,receiptPath),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({status:receipt.status,chromium:receipt.chromium,cases:receipt.cases,nodeGlobalsAbsent:receipt.nodeGlobalsAbsent,wasmSha256:receipt.wasmSha256}));
}finally{await browser?.close();server.close();}
