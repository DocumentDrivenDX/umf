// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay the frozen predecessor's exact raw-host observations through V4 roots.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {relationshipCandidate} from '../../core-relationship-cases';
import {relationshipOperationCases} from '../../core-relationship-operation-cases';
import {declareCoreRelationship as declareRef,inspectCoreRelationships as inspectRef,lookupCoreRelationship as lookupRef,verifyCoreRelationshipOperation as verifyRef} from '../../../src/model/relationships';
const routeEntry=process.env.UMF_R8_RELATIONSHIPS_NODE_ENTRY;
const route=routeEntry?await import(pathToFileURL(resolve(routeEntry)).href):await import('../../../src/index-node-v4');
const {inspectCoreRelationships,lookupCoreRelationship,declareCoreRelationship,verifyCoreRelationshipOperation}=route;

const operations={inspectCoreRelationships,lookupCoreRelationship,declareCoreRelationship,verifyCoreRelationshipOperation};
const expected=JSON.parse(await readFile('docs/helix/04-build/evidence/rust-migration/r8-core-relationships-default-boundary/predecessor.json','utf8'));
const traceCases:any[]=[];
function observe(id:string,shape:string,run:(trace:string[])=>unknown){
 const trace:string[]=[];
 try{traceCases.push({id,shape,outcome:{status:'returned',value:run(trace)},trace});}
 catch(error){const e=error as {name?:unknown;code?:unknown;path?:unknown;message?:unknown};traceCases.push({id,shape,outcome:{status:'threw',name:String(e?.name??''),code:typeof e?.code==='string'?e.code:null,path:typeof e?.path==='string'?e.path:null,message:String(e?.message??'')},trace});}
}
function watched<T extends object>(value:T,label:string,trace:string[]):T{return new Proxy(value,{getPrototypeOf(t){trace.push(`${label}:getPrototypeOf`);return Reflect.getPrototypeOf(t);},ownKeys(t){trace.push(`${label}:ownKeys`);return Reflect.ownKeys(t);},getOwnPropertyDescriptor(t,k){trace.push(`${label}:descriptor:${String(k)}`);return Reflect.getOwnPropertyDescriptor(t,k);},get(t,k,r){trace.push(`${label}:get:${String(k)}`);return Reflect.get(t,k,r);}});}
function accessor<T extends object>(source:T,key:string,trace:string[]):T{const value=structuredClone(source);Object.defineProperty(value,key,{enumerable:true,get(){trace.push(`accessor:${key}`);return null;}});return value;}

observe('inspect.source-before-identity','source accessor and watched identity',trace=>inspectCoreRelationships(accessor(relationshipCandidate(),'umf',trace) as any,watched({module:'m'},'identity',trace)));
observe('inspect.identity-after-source','valid source and identity accessor',trace=>inspectCoreRelationships(watched(relationshipCandidate(),'source',trace),accessor({module:'m'},'module',trace) as any));
observe('lookup.identity-before-source','identity accessor and watched source',trace=>lookupCoreRelationship(watched(relationshipCandidate(),'source',trace),accessor({module:'m',id:'r'},'id',trace) as any));
observe('declare.request-before-source','request accessor and watched source',trace=>{const row=relationshipOperationCases()[0]!;return declareCoreRelationship(watched(row.source,'source',trace),watched(row.identity,'identity',trace),accessor(row.request,'name',trace) as any);});
observe('declare.source-before-identity','valid request, source accessor and watched identity',trace=>{const row=relationshipOperationCases()[0]!;return declareCoreRelationship(accessor(row.source,'umf',trace) as any,watched(row.identity,'identity',trace),row.request);});
observe('verify.receipt-before-current','receipt accessor and watched current',trace=>{const row=relationshipOperationCases()[0]!;const receipt=declareRef(row.source,row.identity,row.request);return verifyCoreRelationshipOperation(accessor(receipt,'version',trace) as any,watched(receipt.target,'current',trace));});
observe('verify.current-after-recompute','valid receipt and current accessor',trace=>{const row=relationshipOperationCases()[0]!;const receipt=declareRef(row.source,row.identity,row.request);return verifyCoreRelationshipOperation(watched(receipt,'receipt',trace),accessor(receipt.target,'umf',trace) as any);});
observe('verify.schema-refusal-before-current','malformed receipt and watched current',trace=>{const row=relationshipOperationCases()[0]!;const receipt=declareRef(row.source,row.identity,row.request);return verifyCoreRelationshipOperation({...receipt,version:'9.0.0'} as any,watched(receipt.target,'current',trace));});
observe('inspect.watched-success','watched source and identity',trace=>{const result=inspectCoreRelationships(watched(relationshipCandidate(),'source',trace),watched({module:'m'},'identity',trace));return {operation:result.operation,version:result.version,meaning:result.meaning.state,path:result.path};});
observe('lookup.wrong-identity','null identity',trace=>lookupCoreRelationship(watched(relationshipCandidate(),'source',trace),null as any));
observe('declare.wrong-request','null request',trace=>declareCoreRelationship(watched(relationshipCandidate(),'source',trace),watched({module:'m'},'identity',trace),null as any));

if(traceCases.length!==expected.caseCount)throw new Error(`Case count changed: ${traceCases.length}`);
for(let index=0;index<traceCases.length;index++){
 const actual=traceCases[index],frozen=expected.cases[index];
 if(actual.id!==frozen.id||actual.shape!==frozen.shape||JSON.stringify(actual.outcome)!==JSON.stringify(frozen.outcome)||JSON.stringify(actual.trace)!==JSON.stringify(frozen.trace)){
  throw new Error(`V4 predecessor mismatch at ${actual.id}: ${JSON.stringify({actual,frozen})}`);
 }
}
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const packetPath='docs/helix/04-build/evidence/rust-migration/r8-core-relationships-default-boundary/predecessor.json';
const sourcePaths=['scripts/rust-migration/r8/relationships-default-route-parity.ts','src/index-node-v4.ts','src/access/rust-relationships-default.ts','src/model/relationships.ts','bindings/core/node/src/core-relationships.js','bindings/core/wasm/src/core-relationships.js','crates/umf-core/src/core_relationships.rs','crates/umf-core-wire/src/lib.rs'];
const sourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,hash(await readFile(path))])));
const artifactHashes=routeEntry?{nodeEntry:hash(await readFile(resolve(routeEntry))),nativeAddon:hash(await readFile(resolve(dirname(routeEntry),'umf_core_node.node')))}:undefined;
const receipt={status:'pass',runtime:process.versions.bun?`Bun ${Bun.version}`:`Node ${process.version}`,caseCount:traceCases.length,hostAdmissionOrder:true,exactOutcomeParity:true,packetSha256:hash(await readFile(packetPath)),sourceHashes,...(artifactHashes?{artifactHashes}:{}),qualification:'Private package route replay only; release qualification is not claimed.'};
if(process.env.UMF_R8_RELATIONSHIPS_NODE_RECEIPT)await writeFile(process.env.UMF_R8_RELATIONSHIPS_NODE_RECEIPT,`${JSON.stringify(receipt,null,2)}\n`);
console.log(JSON.stringify(receipt));
