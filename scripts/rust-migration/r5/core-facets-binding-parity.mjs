// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay the frozen TypeScript facet predecessor through the installed Rust binding.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';

const root=resolve(new URL('../../../',import.meta.url).pathname);
const entry=process.env.UMF_R5_BINDING_ENTRY ?? resolve(root,'bindings/core/node/index.js');
const packageDir=entry.endsWith('/index.js')?dirname(entry):entry;
const {createCoreModelEngine}=await import(entry);
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const [resources,frozen,regressions,errors]=await Promise.all([
  Promise.all(['spec/core/schema.json','spec/core/semantic-type-reference.schema.json','spec/core/extension-package.schema.json','spec/metamodel/generated/core-constraints.json','spec/metamodel/generated/domain-policy.json'].map(read)).then(([coreSchema,referenceSchema,packageSchema,constraints,domainPolicy])=>({coreSchema,referenceSchema,packageSchema,constraints,domainPolicy})),
  read('docs/helix/04-build/evidence/rust-migration/r5-core-facets/frozen-typescript.json'),
  read('docs/helix/04-build/evidence/rust-migration/r5-core-facets/regression-cases.json'),
  read('docs/helix/04-build/evidence/rust-migration/r5-core-facets/exact-errors.json'),
]);
const engine=createCoreModelEngine(resources);
const capture=fn=>{try{return {ok:true,value:fn()};}catch(error){return {ok:false,error:{code:error.code??'',message:error.message??String(error),path:error.path??''}};}};
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
const wireError=error=>{const {name,...semantic}=error;return semantic;};
const same=(name,actual,expected)=>assert.equal(canonical(actual),canonical(expected),name);
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
const copySource=structuredClone(frozen.receipt.target);
const copyResult=engine.inspectCoreFacets(copySource,frozen.identity);
copyResult.source.modules[0].elements[0].facets.integerWidth.bits=8;
const declarationSource=structuredClone(frozen.source);
const declarationResult=engine.declareCoreFacets(declarationSource,frozen.identity,frozen.request);
declarationResult.target.modules[0].elements[0].facets.integerWidth.bits=8;
actual.copiedResults={inspectionDetached:copySource.modules[0].elements[0].facets.integerWidth.bits===16,declarationDetached:!Object.hasOwn(declarationSource.modules[0].elements[0],'facets')&&!Object.hasOwn(declarationResult.source.modules[0].elements[0],'facets')};
same('inspection',actual.inspection,{ok:true,value:frozen.inspection});
same('declaration',actual.declaration,{ok:true,value:frozen.receipt});
same('verification',actual.verification,{ok:true,value:frozen.receipt});
same('unknown qualifier declaration',actual.unknownQualifierDeclaration,{ok:true,value:frozen.unknownFacetDeclaration});
same('length merge',actual.lengthMerge,{ok:true,value:regressions.cases.lengthMerge.outcome});
same('surrogate qualifier',actual.surrogateQualifierInspection,{ok:true,value:regressions.cases.loneSurrogateQualifier.outcome});
for(const name of ['stale','malformedReceipt','forged']) {
  const expected=errors.cases[name];
  const actualName=name==='stale'?'staleReceipt':name==='forged'?'forgedReceipt':name;
  same(actualName,actual[actualName],{ok:false,error:wireError(expected)});
}
same('invalid request',actual.invalidRequest,{ok:false,error:errors.cases.invalidRequest});
for(let index=0;index<actual.historical.length;index++) {
  const expected=regressions.cases.historical[index].outcome;
  same(`historical ${index}`,actual.historical[index],'error' in expected?{ok:false,error:wireError(expected.error)}:{ok:true,value:expected.ok});
}
assert.equal(actual.copiedResults.inspectionDetached,true);
assert.equal(actual.copiedResults.declarationDetached,true);

let resourceRefusal;
try { createCoreModelEngine(resources,{controls:{maxWork:0}}).inspectCoreFacets(frozen.receipt.target,frozen.identity); resourceRefusal={ok:true}; }
catch(error) { resourceRefusal={ok:false,code:error.code??'',message:error.message??String(error),path:error.path??''}; }
assert.equal(resourceRefusal.ok,false);
assert.equal(resourceRefusal.code,'RESOURCE_LIMIT');
const sourcePaths=['crates/umf-core/src/facets.rs','crates/umf-core-wire/src/lib.rs','bindings/core/node/src/core-model.js','bindings/core/node/src/wire.js','bindings/core/node/index.d.ts','bindings/core/node/package.json','bindings/core/wasm/src/core-model.js','bindings/core/wasm/src/wire.js','bindings/core/wasm/index.d.ts','scripts/rust-migration/r5/core-facets-binding-parity.mjs'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,hash(await readFile(resolve(root,path)))])));
const packetPaths=['docs/helix/04-build/evidence/rust-migration/r5-core-facets/frozen-typescript.json','docs/helix/04-build/evidence/rust-migration/r5-core-facets/regression-cases.json','docs/helix/04-build/evidence/rust-migration/r5-core-facets/exact-errors.json'];
const packetHashes=Object.fromEntries(await Promise.all(packetPaths.map(async path=>[path,hash(await readFile(resolve(root,path)))])));
const artifact=await readFile(resolve(packageDir,'umf_core_node.node')).catch(async()=>readFile(resolve(root,'bindings/core/node/umf_core_node.node')));
const packageManifest=await readFile(resolve(packageDir,'package.json'));
const packedTarball=process.env.UMF_R5_PACK_TARBALL;
const packedPackageSha256=packedTarball?hash(await readFile(packedTarball)):null;
const receipt={status:'pass',runtime:typeof Bun==='undefined'?'node':'bun',nodeVersion:process.version,bunVersion:typeof Bun==='undefined'?null:Bun.version,entry,packageInstall:'npm install from local packed tarball',packedTarballSha256:packedPackageSha256,packageManifestSha256:hash(packageManifest),artifactSha256:hash(artifact),artifactBytes:artifact.length,sourceHashes,packetHashes,cases:actual,resourceRefusal:{profile:'cooperative',requestedMaxWork:0,...resourceRefusal}};
const out=process.env.UMF_R5_RECEIPT_PATH ?? resolve(root,'docs/helix/04-build/evidence/rust-migration/r5-core-facets',`${receipt.runtime}.json`);
await writeFile(out,JSON.stringify(receipt,null,2)+'\n');
process.stdout.write(JSON.stringify({status:receipt.status,runtime:receipt.runtime,artifactSha256:receipt.artifactSha256,caseCount:Object.keys(actual).length,historicalCases:actual.historical.length,resourceRefusal:resourceRefusal.code})+'\n');
