// SPDX-License-Identifier: MIT OR Apache-2.0
// Exercise the bounded resource harness directly against the TypeScript predecessor.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {inspectCoreFacets,declareCoreFacets,verifyCoreFacetDeclaration,historicalCoreFacetPatch} from '../../../src/model/facets.ts';
import {readJsonValue,writeJsonValue} from '../../../src/model/serialization.ts';
import {resourceSuiteSource,coreFacetResourceCaseIds} from './core-facets-resource-suite.mjs';

const fixture=JSON.parse(readFileSync(fileURLToPath(new URL('../../../docs/helix/04-build/evidence/rust-migration/r5-core-facets/frozen-typescript.json',import.meta.url)),'utf8'));
globalThis.p=fixture;
globalThis.__r8RustOperations=[];
const api={inspectCoreFacets,declareCoreFacets,verifyCoreFacetDeclaration,historicalCoreFacetPatch,readJsonValue,writeJsonValue};
const operations={
 inspectCoreFacets:(route,...args)=>route.inspectCoreFacets(...args),
 declareCoreFacets:(route,...args)=>route.declareCoreFacets(...args),
 verifyCoreFacetDeclaration:(route,...args)=>route.verifyCoreFacetDeclaration(...args),
 historicalCoreFacetPatch:(route,...args)=>route.historicalCoreFacetPatch(...args),
};
const cap=fn=>{try{return {ok:true,value:fn()}}catch(error){return {ok:false,error:{name:error.name,code:error.code??'',message:error.message??String(error),path:error.path??''}}}};
const normalized=result=>result.ok?{status:'returned',value:result.value}:{status:'threw',name:result.error.name,code:result.error.code,message:result.error.message,path:result.error.path};
const canonical=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
const run=new Function(resourceSuiteSource+'\nreturn runCoreFacetResourceSuite')();
const cases=await run(api,api,operations,cap,normalized,assert,canonical);
assert.deepEqual(cases.map(item=>item.id),coreFacetResourceCaseIds,'resource suite inventory');
console.log(JSON.stringify({status:'pass',predecessor:'TypeScript source',caseCount:cases.length,cases:cases.map(({id,referenceOutcome,referenceMetrics,referenceIntegrity,referenceValueFingerprint})=>({id,referenceOutcome,referenceMetrics,referenceIntegrity,referenceValueFingerprint}))}));
