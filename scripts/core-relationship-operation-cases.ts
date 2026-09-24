import {relationshipCases} from './core-relationship-cases';
import type {CoreRelationshipRequest} from '../src/model/relationships';
export function relationshipRequest(r:any):CoreRelationshipRequest {
 const endpoint=(v:any)=>({module:v.module,element:v.element});
 return {id:r.id,name:r.name,source:r.source.map(endpoint),target:r.target.map((v:any)=>({...endpoint(v),key:v.key})),sourceMultiplicity:{min:r.sourceMultiplicity.min,max:r.sourceMultiplicity.max},targetMultiplicity:{min:r.targetMultiplicity.min,max:r.targetMultiplicity.max},targetLifecycle:r.targetLifecycle,directed:r.directed,...(r.inverse?{inverse:r.inverse}:{}),...(r.associationRecord?{associationRecord:endpoint(r.associationRecord)}:{})};
}
export function relationshipOperationCases(){
 return relationshipCases().filter(r=>r.valid&&r.document.modules[0].relationships?.length&&r.id!=='future-lifecycle').map(row=>{
  const source=structuredClone(row.document),request=relationshipRequest(source.modules[0].relationships[0]);delete source.modules[0].relationships;
  return {id:row.id,source,identity:{module:'m'},request};
 });
}
