import {getIcebergTableNode} from './table';
import {inspectIcebergTableContext} from './table-context';
import {inspectIcebergTransformType,type IcebergTransformType} from './transforms';
import {nativePointer,treeChild,type NativeJson} from '../../model/native-json';
import type {Document,Diagnostic} from '../../model/types';
export interface IcebergTableTransforms {
 status:'checked'|'blocked';complete:false;
 bindings:{fieldPath:string;sourcePath:string;assessment:IcebergTransformType}[];
 diagnostics:Diagnostic[];
}
/** Current selected fields only: no historical spec rebinding or transform execution. */
export function inspectIcebergTableTransforms(document:Document):IcebergTableTransforms {
 const context=inspectIcebergTableContext(document),root=getIcebergTableNode(document,''),diagnostics=[...context.diagnostics],bindings:IcebergTableTransforms['bindings']=[];
 const result=():IcebergTableTransforms=>({status:diagnostics.some(d=>d.severity==='error')?'blocked':'checked',complete:false,bindings,diagnostics});
 const error=(path:string,message:string)=>diagnostics.push({code:'ICEBERG_TABLE_TRANSFORM',path,message,severity:'error'});
 if(context.status==='blocked')return result();
 const member=(n:NativeJson|undefined,k:string)=>n?.kind==='object'?n.members[k]:undefined;
 const string=(n:NativeJson|undefined)=>n?.kind==='string'?n.value:undefined;
 const nodeAt=(path:string)=>{let n=root;for(const key of nativePointer(path))n=treeChild(n,key);return n;};
 const schemaPath=context.resolved['/current-schema-id'];if(!schemaPath){error('/current-schema-id','No current schema available');return result();}
 const fields=new Map<string,{path:string;type:NativeJson;collection:boolean}>();
 function walk(type:NativeJson,path:string,collection:boolean){
  const tag=string(member(type,'type'));
  if(tag==='struct'){const fs=member(type,'fields');if(fs?.kind==='array')fs.items.forEach((f,i)=>{const id=member(f,'id'),t=member(f,'type'),p=path+'/fields/'+i;if(id?.kind==='number'&&t){fields.set(BigInt(id.value).toString(),{path:p,type:t,collection});walk(t,p+'/type',collection);}});}
  else if(tag==='list'){const t=member(type,'element');if(t)walk(t,path+'/element',true);}
  else if(tag==='map'){for(const key of ['key','value']){const t=member(type,key);if(t)walk(t,path+'/'+key,true);}}
 }
 walk(nodeAt(schemaPath),schemaPath,false);
 for(const [selection,kind] of [['/default-spec-id','partition'],['/default-sort-order-id','sort']] as const){
  const selected=context.resolved[selection];if(!selected)continue;
  const spec=nodeAt(selected),fs=spec.kind==='array'?spec:member(spec,'fields'),base=spec.kind==='array'?selected:selected+'/fields';
  if(fs?.kind!=='array')continue;
  const order=member(spec,'order-id');if(kind==='sort'&&order?.kind==='number'&&BigInt(order.value)===0n&&fs.items.length)error(selected+'/order-id','Order zero must be unsorted');
  const ids=new Set<string>(),names=new Set<string>();
  fs.items.forEach((f,i)=>{
   const path=base+'/'+i;
   if(kind==='sort'){
    if(!['asc','desc'].includes(string(member(f,'direction'))??''))error(path+'/direction','Unknown sort direction');
    if(!['nulls-first','nulls-last'].includes(string(member(f,'null-order'))??''))error(path+'/null-order','Unknown null ordering');
   }else{
    const id=member(f,'field-id'),name=string(member(f,'name'));
    if(id?.kind==='number'){const key=BigInt(id.value).toString();if(ids.has(key))error(path+'/field-id','Duplicate partition field ID');ids.add(key);}
    if(name!==undefined){if(names.has(name))error(path+'/name','Duplicate partition field name');names.add(name);}
   }
   if(member(f,'source-ids')){error(path+'/source-ids','Multi-source transform preserved; binding semantics unavailable');return;}
   const id=member(f,'source-id'),field=id?.kind==='number'?fields.get(BigInt(id.value).toString()):undefined;
   if(!field){error(path+'/source-id','Source field is not in the current schema');return;}
   if(field.collection||field.type.kind!=='string'){error(path+'/source-id','Source must be an interpreted scalar field outside collections');return;}
   const transform=string(member(f,'transform'))!,assessment=inspectIcebergTransformType(field.type.value,transform);
   bindings.push({fieldPath:path,sourcePath:field.path,assessment});
   if(assessment.status!=='compatible')error(path+'/transform',assessment.reason);
  });
 }
 diagnostics.push({code:'ICEBERG_TABLE_TRANSFORM_INCOMPLETE',path:'',severity:'warning',message:'Current field/type binding only; version feature availability, history, value execution and safe evolution remain unchecked'});
 return result();
}
