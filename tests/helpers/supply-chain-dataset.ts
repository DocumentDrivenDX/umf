import type {Document} from '../../src/model/types';
import type {CoreDatasetInput} from '../../src/model/dataset-values';
/** Explicit test consumer of retained candidate lexical values; no native IDs. */
export function supplyChainDataset(source:Document,graph:any):CoreDatasetInput{
 const elements=new Map(source.modules.flatMap(m=>m.elements.map(e=>[JSON.stringify([m.id,e.id]),e] as const)));
 const objects=new Map<string,any>(graph.objects.map((o:any)=>[o.key,o]));
 const value=(ref:any,obj:any)=>{
  const field=elements.get(JSON.stringify([ref.module,ref.element]))!,token=obj.values[ref.element];
  if(token===null)return null;
  if(typeof token!=='string')throw Error('Original candidate lexical text required');
  if(field.scalarType==='integer')return {integerToken:token};if(field.scalarType==='decimal')return {decimalToken:token};if(field.scalarType==='string')return {string:token};throw Error('Explicit supported original supply-chain family required');
 };
 return {scope:{id:'original-supply-chain-fixture',closure:'supplied-dataset-only'},context:{fixtureFormat:graph.format,fixtureVersion:graph.version,qualification:graph.qualification},
  records:graph.objects.map((obj:any)=>{if(obj.type.document!==source.id)throw Error('Original source identity differs');const identity={module:obj.type.module,element:obj.type.element};const record=elements.get(JSON.stringify([identity.module,identity.element]))!;return {instanceId:obj.key,identity,values:(record.members as any[]).map(ref=>({field:ref,state:'present',value:value(ref,obj)}))};}),
  relationships:graph.edges.map((edge:any)=>{if(edge.relationship.document!==source.id)throw Error('Original relationship source differs');const module=source.modules.find(m=>m.id===edge.relationship.module)!,relationship=(module.relationships as any[]).find(r=>r.id===edge.relationship.id),target=objects.get(edge.target)!;const record=elements.get(JSON.stringify([target.type.module,target.type.element]))!,endpoint=relationship.target.find((r:any)=>r.module===target.type.module&&r.element===target.type.element),key=(record.keys as any[]).find(k=>k.id===endpoint.key);return {instanceId:edge.key,identity:{module:module.id,id:relationship.id},sourceInstanceId:edge.source,target:{identity:{module:target.type.module,element:target.type.element,key:key.id},values:key.fields.map((ref:any)=>value(ref,target))}};})};
}
