// SPDX-License-Identifier: MIT OR Apache-2.0
// Real Chromium parity for the frozen reference-links packet over rebuilt WASM.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {extname,join,normalize,resolve} from 'node:path';
import {chromium} from 'playwright';
const root=process.cwd(),host='/private/tmp/umf-r5-reference-links-browser',pkg=join(host,'wasm/pkg');
await mkdir(join(host,'wasm/src'),{recursive:true});await mkdir(pkg,{recursive:true});
for(const file of ['index.js','src/core-model.js','src/wire.js','src/javascript-numeric.js','src/bit128.js','src/json-schema.js','src/document-comparison.js'])await writeFile(join(host,'wasm',file),await readFile(join(root,'bindings/core/wasm',file)));
await writeFile(join(host,'wasm/package.json'),'{"type":"module"}');
for(const file of ['umf_core_wasm.js','umf_core_wasm_bg.wasm','umf_core_wasm.d.ts'])await writeFile(join(pkg,file),await readFile(join('/private/tmp/umf-r5-reference-links/pkg',file)));
const resources=Object.fromEntries(await Promise.all([['coreSchema','spec/core/schema.json'],['referenceSchema','spec/core/semantic-type-reference.schema.json'],['packageSchema','spec/core/extension-package.schema.json'],['constraints','spec/metamodel/generated/core-constraints.json'],['domainPolicy','spec/metamodel/generated/domain-policy.json']].map(async([name,path])=>[name,JSON.parse(await readFile(join(root,path),'utf8'))])));
const frozen=JSON.parse(await readFile(join(root,'docs/helix/04-build/evidence/rust-migration/r5-reference-links-inspection/frozen-typescript.json'),'utf8'));
await writeFile(join(host,'inputs.json'),JSON.stringify({resources,frozen}));
const mime={'.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.d.ts':'text/plain'};
const server=createServer(async(req,res)=>{try{const path=normalize(join(host,decodeURIComponent(new URL(req.url,'http://localhost').pathname)));if(!path.startsWith(host))throw Error('path');res.writeHead(200,{'content-type':mime[extname(path)]??'application/octet-stream','access-control-allow-origin':'*'});res.end(await readFile(path))}catch{res.writeHead(404);res.end('not found')}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/inputs.json');const result=await page.evaluate(async()=>{
 const {resources,frozen}=await(await fetch('/inputs.json')).json();const {initializeCoreModelWasm}=await import('/wasm/index.js');const engine=await initializeCoreModelWasm(resources,()=>import('/wasm/pkg/umf_core_wasm.js'),globalThis);const actual={};
 for(const [name,{source,identity}]of Object.entries(frozen.cases)){try{actual[name]={ok:true,value:engine.inspectCoreReferenceLinks(source,identity)}}catch(error){actual[name]={ok:false,error:{code:error.code??'',message:error.message??String(error),path:error.path??''}}}}
 return{actual,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
});assert.equal(result.nodeGlobalsAbsent,true);for(const[name,expected]of Object.entries(frozen.outcomes))assert.equal(JSON.stringify(result.actual[name]),JSON.stringify(expected),name);
 const wasm=new Uint8Array(await readFile(join(pkg,'umf_core_wasm_bg.wasm'))),frozenBytes=new Uint8Array(await readFile(join(root,'docs/helix/04-build/evidence/rust-migration/r5-reference-links-inspection/frozen-typescript.json')));
 const pinnedPaths=['crates/umf-core/src/reference_links_inspection.rs','crates/umf-core/src/lib.rs','crates/umf-core-wire/src/lib.rs','bindings/core/wasm/src/core-model.js','bindings/core/wasm/src/wire.js','bindings/core/wasm/src/lib.rs','bindings/core/wasm/src/shared-sources.json','bindings/core/wasm/Cargo.toml','Cargo.lock','scripts/rust-migration/r5/reference-links-inspection-browser.mjs'];
 const sourceHashes=Object.fromEntries(await Promise.all(pinnedPaths.map(async path=>[path,createHash('sha256').update(await readFile(join(root,path))).digest('hex')])));
 const receipt={status:'pass',chromium:browser.version(),cases:Object.keys(result.actual).length,nodeGlobalsAbsent:result.nodeGlobalsAbsent,target:'wasm32-unknown-unknown',cargoProfile:'release',rustc:'1.90.0 (1159e78c4 2025-09-14)',cargo:'1.90.0 (840b83a10 2025-07-30)',wasmBindgen:'0.2.100',wasmSha256:createHash('sha256').update(wasm).digest('hex'),frozenTypescriptSha256:createHash('sha256').update(frozenBytes).digest('hex'),sourceHashes,actual:result.actual};
 const evidence=resolve(root,'docs/helix/04-build/evidence/rust-migration/r5-reference-links-inspection/chromium.json');await writeFile(evidence,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,chromium:receipt.chromium,cases:receipt.cases,nodeGlobalsAbsent:receipt.nodeGlobalsAbsent,wasmSha256:receipt.wasmSha256}));
}finally{await browser?.close();server.close()}
