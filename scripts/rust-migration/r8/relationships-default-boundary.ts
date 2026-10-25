// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze current public TypeScript host admission before a Rust default cutover.
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {relationshipCandidate} from '../../core-relationship-cases';
import {relationshipOperationCases} from '../../core-relationship-operation-cases';
import {declareCoreRelationship,inspectCoreRelationships,lookupCoreRelationship,verifyCoreRelationshipOperation} from '../../../src/model/relationships';

const output='docs/helix/04-build/evidence/rust-migration/r8-core-relationships-default-boundary/predecessor.json';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const sourceFiles=['src/model/relationships.ts','src/model/json.ts','src/validation/document.ts','spec/core/relationship-operation.schema.json','spec/core/relationship-operation-v3.schema.json','scripts/core-relationship-cases.ts','scripts/core-relationship-operation-cases.ts'];
type Observation={id:string;shape:string;outcome:unknown;trace:string[]};
const cases:Observation[]=[];
function observe(id:string,shape:string,run:(trace:string[])=>unknown){
 const trace:string[]=[];
 try {const value=run(trace);cases.push({id,shape,outcome:{status:'returned',value},trace});}
 catch (error){
  const candidate=error as {name?:unknown;code?:unknown;path?:unknown;message?:unknown};
  cases.push({id,shape,outcome:{status:'threw',name:String(candidate?.name??''),code:typeof candidate?.code==='string'?candidate.code:null,path:typeof candidate?.path==='string'?candidate.path:null,message:String(candidate?.message??'')},trace});
 }
}
function watched<T extends object>(value:T,label:string,trace:string[]):T {
 return new Proxy(value,{
  getPrototypeOf(target){trace.push(`${label}:getPrototypeOf`);return Reflect.getPrototypeOf(target);},
  ownKeys(target){trace.push(`${label}:ownKeys`);return Reflect.ownKeys(target);},
  getOwnPropertyDescriptor(target,key){trace.push(`${label}:descriptor:${String(key)}`);return Reflect.getOwnPropertyDescriptor(target,key);},
  get(target,key,receiver){trace.push(`${label}:get:${String(key)}`);return Reflect.get(target,key,receiver);},
 });
}
function accessor<T extends object>(source:T,key:string,trace:string[]):T {
 const value=structuredClone(source);
 Object.defineProperty(value,key,{enumerable:true,get(){trace.push(`accessor:${key}`);return null;}});
 return value;
}

observe('inspect.source-before-identity','source accessor and watched identity',trace=>{
 const source=accessor(relationshipCandidate(),'umf',trace);
 return inspectCoreRelationships(source as any,watched({module:'m'},'identity',trace));
});
observe('inspect.identity-after-source','valid source and identity accessor',trace=>
 inspectCoreRelationships(watched(relationshipCandidate(),'source',trace),accessor({module:'m'},'module',trace) as any));
observe('lookup.identity-before-source','identity accessor and watched source',trace=>
 lookupCoreRelationship(watched(relationshipCandidate(),'source',trace),accessor({module:'m',id:'r'},'id',trace) as any));
observe('declare.request-before-source','request accessor and watched source',trace=>{
 const row=relationshipOperationCases()[0]!;
 return declareCoreRelationship(watched(row.source,'source',trace),watched(row.identity,'identity',trace),accessor(row.request,'name',trace) as any);
});
observe('declare.source-before-identity','valid request, source accessor and watched identity',trace=>{
 const row=relationshipOperationCases()[0]!;
 return declareCoreRelationship(accessor(row.source,'umf',trace) as any,watched(row.identity,'identity',trace),row.request);
});
observe('verify.receipt-before-current','receipt accessor and watched current',trace=>{
 const row=relationshipOperationCases()[0]!;
 const receipt=declareCoreRelationship(row.source,row.identity,row.request);
 return verifyCoreRelationshipOperation(accessor(receipt,'version',trace) as any,watched(receipt.target,'current',trace));
});
observe('verify.current-after-recompute','valid receipt and current accessor',trace=>{
 const row=relationshipOperationCases()[0]!;
 const receipt=declareCoreRelationship(row.source,row.identity,row.request);
 return verifyCoreRelationshipOperation(watched(receipt,'receipt',trace),accessor(receipt.target,'umf',trace) as any);
});
observe('verify.schema-refusal-before-current','malformed receipt and watched current',trace=>{
 const row=relationshipOperationCases()[0]!;
 const receipt=declareCoreRelationship(row.source,row.identity,row.request);
 const malformed={...receipt,version:'9.0.0'};
 return verifyCoreRelationshipOperation(malformed as any,watched(receipt.target,'current',trace));
});
observe('inspect.watched-success','watched source and identity',trace=>{
 const result=inspectCoreRelationships(watched(relationshipCandidate(),'source',trace),watched({module:'m'},'identity',trace));
 return {operation:result.operation,version:result.version,meaning:result.meaning.state,path:result.path};
});
observe('lookup.wrong-identity','null identity',trace=>lookupCoreRelationship(watched(relationshipCandidate(),'source',trace),null as any));
observe('declare.wrong-request','null request',trace=>declareCoreRelationship(watched(relationshipCandidate(),'source',trace),watched({module:'m'},'identity',trace),null as any));

const sourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,hash(await readFile(file))])));
const packet={format:'umf-r8-core-relationships-default-boundary/1',runtime:{bun:Bun.version},sourceHashes,captureScriptSha256:hash(await readFile('scripts/rust-migration/r8/relationships-default-boundary.ts')),caseCount:cases.length,cases};
const body=JSON.stringify(packet,null,2)+'\n';
if(process.argv.includes('--check')){
 if((await readFile(output,'utf8'))!==body)throw new Error('Relationship default-boundary predecessor changed; review before refresh');
}else await writeFile(output,body);
console.log(JSON.stringify({mode:process.argv.includes('--check')?'check':'write',caseCount:cases.length,sha256:hash(body)}));
