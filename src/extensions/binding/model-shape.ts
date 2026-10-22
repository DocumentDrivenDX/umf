// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document,type Element} from '../../model/types';
import type {Bit128Carrier,Bit128BindingPayload} from './bit128';
import {checkModelScalar,type ScalarCarrier} from './model-scalar';
import type {Bit128Ref} from './bit128-layout';
export type ModelShape={identity:Bit128Ref;field:Element;kind:'leaf';carrier:Bit128Carrier|ScalarCarrier}|{identity:Bit128Ref;field:Element;kind:'array';item:ModelShape}|{identity:Bit128Ref;field:Element;kind:'map';item:ModelShape}|{identity:Bit128Ref;field:Element;kind:'group';members:ModelShape[]};
export interface JsonCarrier {kind:'json';column:string;shape:ModelShape}
const key=(r:Bit128Ref)=>JSON.stringify([r.module,r.element]);
function fail(message:string):never{throw new UmfError('MODEL_SHAPE',message);}
export function modelShapes(payload:Bit128BindingPayload,source:Document){
 const elements=new Map(source.modules.flatMap(m=>m.elements.map(e=>[key({module:m.id,element:e.id}),e] as const))),used=new Set<string>(),groups=new Set<string>();
 const groupRows=(payload as Bit128BindingPayload&{groups?:{module:string;element:string;members:Bit128Ref[]}[]}).groups??[];
 if(new Set(groupRows.map(key)).size!==groupRows.length)fail('Duplicate group layout');
 let visits=0;
 for(const b of payload.fields)if(b.storage==='column'&&Object.keys(b).some(k=>!['module','element','storage','column'].includes(k)))fail('Unknown composition column qualifier');
 const row=(id:Bit128Ref)=>payload.fields.find(r=>key(r)===key(id));
 function shape(id:Bit128Ref,stack:string[]=[]):ModelShape{
  if(++visits>10_000)fail('Shape expansion exceeds budget');
  if(!id||Object.keys(id).sort().join(',')!=='element,module')fail('Exact shape identity required');
  const k=key(id);if(stack.includes(k)||stack.length>64)fail('Cyclic or excessive shape recursion');
  const field=elements.get(k);if(!field||field.kind!=='field')fail('Shape needs a Field');used.add(k);
  if(Object.keys(field.extensions??{}).length)fail('Unknown Field extension semantics');
  if(!['required','absent-allowed'].includes(field.nullability as string))fail('Known shape availability required');
  const next=[...stack,k];
  if(field.cardinality==='array'||field.cardinality==='map'){
   if(field.scalarType||field.references?.length)fail('Container cannot also declare scalar/record meaning');
   if(!field.itemType)fail('Explicit container item Field required');
   return {identity:id,field,kind:field.cardinality,item:shape(field.itemType as Bit128Ref,next)};
  }
  if(field.cardinality!=='one')fail('Known shape cardinality required');
  const refs=field.references??[];
  if(refs.length){
   if(refs.length!==1||refs[0]!.role!=='record-type'||field.scalarType)fail('One explicit group reference required');
   const ref={module:refs[0]!.module,element:refs[0]!.element},group=elements.get(key(ref)),layout=groupRows.find(r=>key(r)===key(ref));
   if(group?.kind!=='group'||Object.keys(group.extensions??{}).length||!layout||Object.keys(layout).sort().join(',')!=='element,members,module'||!layout.members.length)fail('Explicit known group and nonempty member layout required');
   if(groups.has(key(ref))&&next.includes(key(ref)))fail('Cyclic group');groups.add(key(ref));
   const members=layout.members.map(r=>shape(r,[...next,key(ref)]));
   if(new Set(members.map(m=>key(m.identity))).size!==members.length)fail('Duplicate group member');
   return {identity:id,field,kind:'group',members};
  }
  const binding=row(id);if(!binding)fail('Each leaf requires selected carrier');
  if(['uuid','bits128'].includes(field.scalarType!)){
   if(binding.storage!=='scalar-carrier')fail('UUID/128-bit leaf needs explicit carrier');
   return {identity:id,field,kind:'leaf',carrier:binding.carrier};
  }
  if(binding.storage!=='column'||!binding.column)fail('Scalar leaf needs explicit column');checkModelScalar(field);
  return {identity:id,field,kind:'leaf',carrier:{kind:'scalar',column:binding.column}};
 }
 function root(id:Bit128Ref):{carrier:Bit128Carrier|ScalarCarrier|JsonCarrier;slots:string[]}{
  const node=shape(id),binding=row(id);if(!binding)fail('Each root requires a binding');
  if(node.kind==='leaf')return {carrier:node.carrier,slots:node.carrier.kind==='words64'?[node.carrier.highColumn,node.carrier.lowColumn]:[node.carrier.column]};
  if(binding.storage!=='column'||!binding.column)fail('Container/group root needs an explicit JSON/native-field column');
  return {carrier:{kind:'json',column:binding.column,shape:node},slots:[binding.column]};
 }
 function complete(){
  for(const m of source.modules)for(const e of m.elements)if(e.kind==='field'&&!used.has(key({module:m.id,element:e.id}))||e.kind==='group'&&!groups.has(key({module:m.id,element:e.id})))fail('Unbound shape element would be lost');
  if(groupRows.some(g=>!groups.has(key(g))))fail('Unmatched group layout');
  for(const b of payload.fields)if(!used.has(key(b)))fail('Unmatched Field binding');
 }
 return {root,complete};
}
