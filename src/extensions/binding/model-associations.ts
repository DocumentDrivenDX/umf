// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../../model/types';
import type {CoreRelationship} from '../../validation/relationships';
import type {Bit128BindingPayload} from './bit128';
import type {Bit128Ref} from './bit128-layout';
export interface AssociationEnd {record:Bit128Ref;key:string;fields:Bit128Ref[]}
export interface AssociationLayout {module:string;id:string;storage:'junction';record:Bit128Ref;source:AssociationEnd[];target:AssociationEnd[]}
const key=(r:Bit128Ref)=>JSON.stringify([r.module,r.element]);
const fail=(s:string):never=>{throw new UmfError('MODEL_ASSOCIATION',s);};
export function expandAssociations(payload:Bit128BindingPayload,source:Document){
 const copy=structuredClone(source),binding=structuredClone(payload),associations:{layout:AssociationLayout;declaration:CoreRelationship}[]=[];
 // Expansion is a private lowering view. Public reports retain original declarations.
 for(const m of copy.modules){const next:CoreRelationship[]=[];
 for(const d of (m.relationships??[]) as CoreRelationship[]){
  const rows=binding.relationships.filter((r:any)=>r.module===m.id&&r.id===d.id) as any[];
  if(rows.length!==1)fail('One exact relationship layout required');const row=rows[0];
  if(row.storage!=='junction'){next.push(d);continue;}
  if(Object.keys(row).sort().join(',')!=='id,module,record,source,storage,target')fail('Unknown association layout qualifier');
  const a=row as AssociationLayout,record=copy.modules.find(m=>m.id===a.record.module)?.elements.find(e=>e.id===a.record.element);
  if(record?.kind!=='record'||d.associationRecord&&key(d.associationRecord)!==key(a.record))fail('Association Record must resolve and agree with declaration');
  const fieldSet=new Set<string>();
  for(const side of ['source','target'] as const){
   if(!Array.isArray(a[side])||a[side].length!==d[side].length||new Set(a[side].map(e=>key(e.record))).size!==a[side].length)fail('Every endpoint alternative needs one mapping');
   for(const [i,end] of a[side].entries()){
    if(Object.keys(end).sort().join(',')!=='fields,key,record'||Object.keys(end.record).sort().join(',')!=='element,module')fail('Unknown endpoint mapping');
    const endpoint=d[side].find(r=>key(r)===key(end.record));if(!endpoint||side==='target'&&(endpoint as any).key!==end.key)fail('Endpoint identity/key mismatch');
    const target=copy.modules.find(m=>m.id===end.record.module)?.elements.find(e=>e.id===end.record.element),targetKey=(target?.keys as any[])?.find(k=>k.id===end.key);
    if(!targetKey||end.fields.length!==targetKey.fields.length)fail('Endpoint key arity mismatch');
    for(const f of end.fields){if(fieldSet.has(key(f)))fail('Association endpoint slots must be disjoint');fieldSet.add(key(f));}
    const id=d.id+'_'+side+'_'+i;
    next.push({id,name:id,source:[{...a.record}],target:[{...end.record,key:end.key}],sourceMultiplicity:{min:0,max:'*'},targetMultiplicity:{min:a[side].length===1?1:0,max:1},targetLifecycle:'unspecified',directed:true});
    binding.relationships.push({module:m.id,id,storage:'foreign_key',fields:end.fields});
   }
  }
  associations.push({layout:a,declaration:d});binding.relationships=binding.relationships.filter(r=>r!==row);
 }
 m.relationships=next;
 }
 return {source:copy,payload:binding,associations};
}
