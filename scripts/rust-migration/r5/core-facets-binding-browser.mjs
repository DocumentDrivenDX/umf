// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay the frozen TypeScript facet predecessor through extracted WASM in a real browser.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {extname,join,normalize,resolve} from 'node:path';
import {chromium} from 'playwright';

const root=process.cwd();
const pkg=process.env.UMF_R5_WASM_PKG;
if(!pkg)throw new Error('UMF_R5_WASM_PKG is required');
const browserName=process.env.UMF_R5_BROWSER??'chromium';
const host=`/private/tmp/umf-r5-facets-${browserName}-browser`;
await mkdir(join(host,'wasm/src'),{recursive:true});
await mkdir(join(host,'wasm/pkg'),{recursive:true});
for(const file of ['index.js','src/core-model.js','src/wire.js','src/javascript-numeric.js','src/bit128.js','src/json-schema.js','src/document-comparison.js'])await writeFile(join(host,'wasm',file),await readFile(join(root,'bindings/core/wasm',file)));
await writeFile(join(host,'wasm/package.json'),'{"type":"module"}');
for(const file of ['umf_core_wasm.js','umf_core_wasm_bg.wasm','umf_core_wasm.d.ts'])await writeFile(join(host,'wasm/pkg',file),await readFile(join(pkg,file)));
const inputs={
 resources:Object.fromEntries(await Promise.all([['coreSchema','spec/core/schema.json'],['referenceSchema','spec/core/semantic-type-reference.schema.json'],['packageSchema','spec/core/extension-package.schema.json'],['constraints','spec/metamodel/generated/core-constraints.json'],['domainPolicy','spec/metamodel/generated/domain-policy.json']].map(async([name,path])=>[name,JSON.parse(await readFile(join(root,path),'utf8'))]))),
 frozen:JSON.parse(await readFile(join(root,'docs/helix/04-build/evidence/rust-migration/r5-core-facets/frozen-typescript.json'),'utf8')),
 regressions:JSON.parse(await readFile(join(root,'docs/helix/04-build/evidence/rust-migration/r5-core-facets/regression-cases.json'),'utf8')),
 errors:JSON.parse(await readFile(join(root,'docs/helix/04-build/evidence/rust-migration/r5-core-facets/exact-errors.json'),'utf8')),
};
await writeFile(join(host,'inputs.json'),JSON.stringify(inputs));
const mime={'.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.d.ts':'text/plain'};
const server=createServer(async(req,res)=>{try{const path=normalize(join(host,decodeURIComponent(new URL(req.url,'http://localhost').pathname)));if(!path.startsWith(host))throw Error('path');const bytes=await readFile(path);res.writeHead(200,{'content-type':mime[extname(path)]??'application/octet-stream','access-control-allow-origin':'*'});res.end(bytes);}catch{if(!res.headersSent){res.writeHead(404);res.end('not found');}}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 const options={headless:true};if(browserName==='edge')options.channel='msedge';
 browser=await chromium.launch(options);
 const page=await browser.newPage();
 const address=server.address();
 await page.goto(`http://127.0.0.1:${address.port}/inputs.json`);
 const result=await page.evaluate(async()=>{
  const {resources,frozen,regressions,errors}=await (await fetch('/inputs.json')).json();
  const {initializeCoreModelWasm}=await import('/wasm/index.js');
  const engine=await initializeCoreModelWasm(resources,()=>import('/wasm/pkg/umf_core_wasm.js'),globalThis);
  const capture=fn=>{try{return {ok:true,value:fn()};}catch(error){return {ok:false,error:{code:error.code??'',message:error.message??String(error),path:error.path??''}};}};
  const actual={
   inspection:capture(()=>engine.inspectCoreFacets(frozen.receipt.target,frozen.identity)),
   declaration:capture(()=>engine.declareCoreFacets(frozen.source,frozen.identity,frozen.request)),
   verification:capture(()=>engine.verifyCoreFacetDeclaration(frozen.receipt,frozen.receipt.target)),
   unknownQualifierDeclaration:capture(()=>engine.declareCoreFacets(frozen.unknownFacetDeclaration.source,frozen.unknownFacetDeclaration.identity,frozen.unknownFacetDeclaration.request)),
   lengthMerge:capture(()=>engine.declareCoreFacets(regressions.cases.lengthMerge.source,regressions.cases.lengthMerge.identity,regressions.cases.lengthMerge.request)),
   surrogateQualifierInspection:capture(()=>engine.inspectCoreFacets(regressions.cases.loneSurrogateQualifier.source,regressions.cases.loneSurrogateQualifier.identity)),
   staleReceipt:capture(()=>engine.verifyCoreFacetDeclaration(frozen.receipt,frozen.source)),
   malformedReceipt:capture(()=>engine.verifyCoreFacetDeclaration(regressions.cases.verifyMalformedBeforeCurrentCopy.receipt,frozen.source)),
   forgedReceipt:capture(()=>engine.verifyCoreFacetDeclaration(regressions.cases.verifyForgedBeforeCurrentCopy.receipt,frozen.source)),
   invalidRequest:capture(()=>engine.declareCoreFacets(frozen.source,frozen.identity,{precision:3})),
   historical:regressions.cases.historical.map(({input})=>capture(()=>engine.historicalCoreFacetPatch(input))),
  };
  const copySource=structuredClone(frozen.receipt.target);const copyResult=engine.inspectCoreFacets(copySource,frozen.identity);copyResult.source.modules[0].elements[0].facets.integerWidth.bits=8;
  const declarationSource=structuredClone(frozen.source);const declarationResult=engine.declareCoreFacets(declarationSource,frozen.identity,frozen.request);declarationResult.target.modules[0].elements[0].facets.integerWidth.bits=8;
  actual.copiedResults={inspectionDetached:copySource.modules[0].elements[0].facets.integerWidth.bits===16,declarationDetached:!Object.hasOwn(declarationSource.modules[0].elements[0],'facets')&&!Object.hasOwn(declarationResult.source.modules[0].elements[0],'facets')};
  let resourceRefusal;try{await initializeCoreModelWasm(resources,()=>import('/wasm/pkg/umf_core_wasm.js'),globalThis,{controls:{maxWork:0}}).then(e=>e.inspectCoreFacets(frozen.receipt.target,frozen.identity));resourceRefusal={ok:true};}catch(error){resourceRefusal={ok:false,code:error.code??'',message:error.message??String(error),path:error.path??''};}
  return {actual,resourceRefusal,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 });
 const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
 const wireError=error=>{const {name,...semantic}=error;return semantic;};
 const same=(name,actual,expected)=>assert.equal(canonical(actual),canonical(expected),name);
 same('inspection',result.actual.inspection,{ok:true,value:inputs.frozen.inspection});
 same('declaration',result.actual.declaration,{ok:true,value:inputs.frozen.receipt});
 same('verification',result.actual.verification,{ok:true,value:inputs.frozen.receipt});
 same('unknown qualifier declaration',result.actual.unknownQualifierDeclaration,{ok:true,value:inputs.frozen.unknownFacetDeclaration});
 same('length merge',result.actual.lengthMerge,{ok:true,value:inputs.regressions.cases.lengthMerge.outcome});
 same('surrogate qualifier',result.actual.surrogateQualifierInspection,{ok:true,value:inputs.regressions.cases.loneSurrogateQualifier.outcome});
 for(const [name,actualName] of [['stale','staleReceipt'],['malformedReceipt','malformedReceipt'],['forged','forgedReceipt']])same(actualName,result.actual[actualName],{ok:false,error:wireError(inputs.errors.cases[name])});
 same('invalid request',result.actual.invalidRequest,{ok:false,error:inputs.errors.cases.invalidRequest});
 assert.equal(result.actual.copiedResults.inspectionDetached,true);assert.equal(result.actual.copiedResults.declarationDetached,true);
 for(let index=0;index<result.actual.historical.length;index++){const expected=inputs.regressions.cases.historical[index].outcome;same(`historical ${index}`,result.actual.historical[index],'error'in expected?{ok:false,error:wireError(expected.error)}:{ok:true,value:expected.ok});}
 assert.equal(result.resourceRefusal.ok,false);assert.equal(result.resourceRefusal.code,'RESOURCE_LIMIT');assert.equal(result.nodeGlobalsAbsent,true);
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 const sourcePaths=['crates/umf-core/src/facets.rs','crates/umf-core-wire/src/lib.rs','bindings/core/wasm/src/core-model.js','bindings/core/wasm/src/wire.js','bindings/core/wasm/index.d.ts','scripts/rust-migration/r5/core-facets-binding-browser.mjs'];
 const sourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,hash(await readFile(resolve(root,path)))])));
 const packetPaths=['docs/helix/04-build/evidence/rust-migration/r5-core-facets/frozen-typescript.json','docs/helix/04-build/evidence/rust-migration/r5-core-facets/regression-cases.json','docs/helix/04-build/evidence/rust-migration/r5-core-facets/exact-errors.json'];
 const packetHashes=Object.fromEntries(await Promise.all(packetPaths.map(async path=>[path,hash(await readFile(resolve(root,path)))])));
 const wasm=await readFile(join(pkg,'umf_core_wasm_bg.wasm'));
 const glue=await readFile(join(pkg,'umf_core_wasm.js'));
 const receipt={status:'pass',browser:browserName,version:browser.version(),target:'wasm32-unknown-unknown',cargoProfile:'release',wasmBindgen:'0.2.100',wasmSha256:hash(wasm),wasmBytes:wasm.length,wasmGlueSha256:hash(glue),wasmGlueBytes:glue.length,sourceHashes,packetHashes,cases:result.actual,resourceRefusal:result.resourceRefusal,nodeGlobalsAbsent:result.nodeGlobalsAbsent};
 const output=process.env.UMF_R5_RECEIPT_PATH??resolve(root,'docs/helix/04-build/evidence/rust-migration/r5-core-facets',`${browserName}.json`);
 await writeFile(output,JSON.stringify(receipt,null,2)+'\n');
 process.stdout.write(JSON.stringify({status:receipt.status,browser:receipt.browser,version:receipt.version,wasmSha256:receipt.wasmSha256,cases:Object.keys(result.actual).length,resourceRefusal:result.resourceRefusal.code})+'\n');
}finally{await browser?.close();server.close();}
