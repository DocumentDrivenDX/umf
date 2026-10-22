import {getIcebergTableNode} from './table';
import {pointer,type Document,type Diagnostic} from '../../model/types';
import type {NativeJson} from '../../model/native-json';

export interface IcebergTableContext {
 status:'checked'|'blocked';
 complete:false;
 scope:'iceberg-v1-v3-current-references';
 resolved:Record<string,string>;
 diagnostics:Diagnostic[];
}
/** Checks only retained identities and current selections; never mutates or normalizes metadata. */
export function inspectIcebergTableContext(document:Document):IcebergTableContext {
 const root=getIcebergTableNode(document,''),diagnostics:Diagnostic[]=[],resolved:Record<string,string>={};
 const result=():IcebergTableContext=>({status:diagnostics.some(d=>d.severity==='error')?'blocked':'checked',complete:false,scope:'iceberg-v1-v3-current-references',resolved,diagnostics});
 const error=(path:string,message:string)=>diagnostics.push({code:'ICEBERG_TABLE_REFERENCE',path,message,severity:'error'});
 const member=(n:NativeJson|undefined,k:string)=>n?.kind==='object'?n.members[k]:undefined;
 const id=(n:NativeJson|undefined)=>n?.kind==='number'?BigInt(n.value).toString():undefined;
 const version=id(member(root,'format-version'));
 if(!['1','2','3'].includes(version??'')){error('/format-version','Unknown format: current-reference interpretation unavailable');return result();}
 const index=(key:string,idKey:string)=>{
  const map=new Map<string,string>(),array=member(root,key);
  if(array?.kind==='array')array.items.forEach((node,i)=>{
   const path='/'+key+'/'+i,value=id(member(node,idKey));
   if(value===undefined)error(path+'/'+idKey,'Retained entry has no explicit identity');
   else if(map.has(value)){error(path+'/'+idKey,'Duplicate retained identity '+value);map.set(value,'');}
   else map.set(value,path);
  });
  return map;
 };
 const schemas=index('schemas','schema-id'),specs=index('partition-specs','spec-id'),orders=index('sort-orders','order-id'),snapshots=index('snapshots','snapshot-id');
 const resolve=(node:NativeJson|undefined,path:string,map:Map<string,string>)=>{
  const value=id(node),target=value===undefined?undefined:map.get(value);
  if(!target)error(path,'No unique retained target for '+(value??'missing ID'));
  else resolved[path]=target;
 };
 for(const [key,collection,map,legacy] of [
  ['current-schema-id','schemas',schemas,'schema'],
  ['default-spec-id','partition-specs',specs,'partition-spec'],
  ['default-sort-order-id','sort-orders',orders,undefined],
 ] as const){
  const selection=member(root,key);
  if(selection!==undefined)resolve(selection,'/'+key,map);
  else if(version==='1'&&legacy&&member(root,legacy)!==undefined&&member(root,collection)===undefined)resolved['/'+key]='/'+legacy;
  else if(version==='1'&&key==='default-sort-order-id'&&member(root,collection)===undefined){
   diagnostics.push({code:'ICEBERG_TABLE_IMPLICIT',path:'/'+key,severity:'warning',message:'Legacy unsorted default is implicit; source remains absent'});
  }else error('/'+key,'Selection missing or ambiguous; no default inserted');
 }
 const current=member(root,'current-snapshot-id'),currentId=id(current),hasCurrent=currentId!==undefined&&currentId!=='-1';
 if(hasCurrent)resolve(current,'/current-snapshot-id',snapshots);
 const refs=member(root,'refs');
 if(refs?.kind==='object')for(const [name,ref] of Object.entries(refs.members)){
  const path='/refs/'+pointer(name),target=member(ref,'snapshot-id');resolve(target,path+'/snapshot-id',snapshots);
  if(name==='main'){
   if(!hasCurrent||id(target)!==currentId)error(path+'/snapshot-id','Main reference must equal the current snapshot ID');
   const type=member(ref,'type');if(type?.kind!=='string'||type.value!=='branch')error(path+'/type','Main reference must be a branch');
  }
 }
 diagnostics.push({code:'ICEBERG_TABLE_CONTEXT_INCOMPLETE',path:'',severity:'warning',message:'Only retained IDs and current selections checked. Expired parents, historical schemas, transforms, files and commits are not validated; absent main is not inserted.'});
 return result();
}
