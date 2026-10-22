import {literalIdentity} from '../../model/schema-literals';
import {copyJson} from '../../model/json';
import {UmfError,type Document} from '../../model/types';
import {encodeCoreKeyTuple,type CoreKeyTupleValue} from '../../model/key-tuple';
import {encodeBit128Record,decodeBit128Record,type Bit128RecordValue} from './bit128-record';
import {resolveBit128ModelSources} from './model-source';
import {bit128RefKey,type Bit128Ref,type Resolved128Record} from './bit128-layout';
import type {CoreRelationship} from '../../validation/relationships';
export interface Bit128DatasetRecord {record:Bit128Ref;rows:Bit128RecordValue[][]}
/** Complete finite snapshot validation. This does not authorize concurrent mutations. */
export function validateBit128Dataset(bindingInput:Document,sourceInput:Document,input:Bit128DatasetRecord[]):Bit128DatasetRecord[]{
 const {binding,source,layout}=resolveBit128ModelSources(bindingInput,sourceInput),data=copyJson(input) as unknown as Bit128DatasetRecord[];
 const fail=(s:string):never=>{throw new UmfError('MODEL_DATASET',s);};
 if(!Array.isArray(data)||data.length!==layout.records.length||new Set(data.map(d=>bit128RefKey(d.record))).size!==data.length)fail('Exact complete Record populations required');
 const populations=new Map<string,Bit128RecordValue[][]>(),keys=new Map<string,Map<string,number>>();
 const keyId=(r:Bit128Ref,k:string)=>JSON.stringify([r.module,r.element,k]);
 const values=(row:Bit128RecordValue[],fields:Bit128Ref[])=>fields.map(f=>row.find(v=>bit128RefKey(v.field)===bit128RefKey(f))!.value);
 const tuple=(r:Resolved128Record,k:string,v:unknown[])=>encodeCoreKeyTuple(source,{...r.identity,key:k},v as CoreKeyTupleValue[],{profile:'umf-key-tuple-v2'}).bytesHex;
 for(const record of layout.records){
  const population=data.find(d=>bit128RefKey(d.record)===bit128RefKey(record.identity));if(!population||Object.keys(population).sort().join(',')!=='record,rows'||!Array.isArray(population.rows))fail('Record population missing/malformed');
  const rows=population!.rows.map(row=>decodeBit128Record(binding,source,record.identity,encodeBit128Record(binding,source,record.identity,row)));populations.set(bit128RefKey(record.identity),rows);
  for(const k of record.keys){const index=new Map<string,number>();for(const [i,row] of rows.entries()){const token=tuple(record,k.id,values(row,k.fields));if(index.has(token))fail('Duplicate logical Key');index.set(token,i);}keys.set(keyId(record.identity,k.id),index);}
 }
 for(const {index,record,fields} of layout.indexes)if(index.unique){const seen=new Set<string>();for(const row of populations.get(bit128RefKey(record.identity))!){const v=values(row,fields.map(f=>f.identity));if(v.some(v=>v===null))continue;const token=JSON.stringify(v.map((v,i)=>literalIdentity(fields[i]!.field,v as any)));if(seen.has(token))fail('Duplicate unique index');seen.add(token);}}
 const nativeLinks=new Map<string,Map<number,number>>();
 for(const rel of layout.relationships){const edges=new Map<number,number>(),rows=populations.get(bit128RefKey(rel.source.identity))!;
  for(const [i,row] of rows.entries()){const v=values(row,rel.sourceFields.map(f=>f.identity)),nulls=v.filter(v=>v===null).length;if(nulls){if(nulls!==v.length)fail('Partial composite foreign key');continue;}
   const target=keys.get(keyId(rel.target.identity,rel.targetKey.id))!.get(tuple(rel.target,rel.targetKey.id,v));if(target===undefined)fail('Orphan endpoint');edges.set(i,target!);
  }nativeLinks.set(rel.layout.module+'\0'+rel.layout.id,edges);
 }
 const bounds=(d:CoreRelationship,edges:[string,string][])=>{
  const a=new Map<string,Set<string>>(),b=new Map<string,Set<string>>();
  for(const end of d.source)for(const [i] of populations.get(bit128RefKey(end))!.entries())a.set(bit128RefKey(end)+'\0'+i,new Set());
  for(const end of d.target)for(const [i] of populations.get(bit128RefKey(end))!.entries())b.set(bit128RefKey(end)+'\0'+i,new Set());
  for(const [x,y] of edges){a.get(x)!.add(y);b.get(y)!.add(x);}
  for(const [map,limit] of [[a,d.targetMultiplicity],[b,d.sourceMultiplicity]] as const)for(const set of map.values())if(set.size<limit.min||limit.max!=='*'&&set.size>limit.max)fail('Distinct endpoint multiplicity violated');
 };
 const associationIds=new Set((layout.associations??[]).map(a=>a.layout.module+'\0'+a.layout.id));
 for(const m of source.modules)for(const d of (m.relationships??[]) as CoreRelationship[]){
  if(associationIds.has(m.id+'\0'+d.id))continue;
  const rel=layout.relationships.find(r=>r.layout.module===m.id&&r.layout.id===d.id)!;
  bounds(d,[...nativeLinks.get(m.id+'\0'+d.id)!.entries()].map(([a,b])=>[bit128RefKey(rel.source.identity)+'\0'+a,bit128RefKey(rel.target.identity)+'\0'+b]));
 }
 for(const {layout:a,declaration:d} of layout.associations??[]){
  const rows=populations.get(bit128RefKey(a.record))!,edges:[string,string][]=[];
  for(const [i] of rows.entries()){
   const select=(side:'source'|'target')=>{const present=a[side].flatMap((end,j)=>{const target=nativeLinks.get(a.module+'\0'+a.id+'_'+side+'_'+j)!.get(i);return target===undefined?[]:[bit128RefKey(end.record)+'\0'+target];});if(present.length!==1)fail('Association needs exactly one endpoint alternative per side');return present[0]!;};
   edges.push([select('source'),select('target')]);
  }bounds(d,edges);
 }
 return layout.records.map(r=>({record:r.identity,rows:populations.get(bit128RefKey(r.identity))!}));
}
