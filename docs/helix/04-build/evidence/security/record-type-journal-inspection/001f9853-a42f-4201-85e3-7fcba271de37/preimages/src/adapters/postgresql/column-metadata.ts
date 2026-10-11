import {copyJson} from '../../model/json';
import {type NativeJson} from '../../model/native-json';
import {type Element,type ScalarType} from '../../model/types';
export interface PostgresqlColumnMetadata {path:string;relation:{schema:string;name:string;kind:string};element:Element;nativeColumn:NativeJson;}
const families:Record<string,ScalarType>={bool:'boolean',int2:'integer',int4:'integer',int8:'integer',numeric:'decimal',float4:'float',float8:'float',text:'string',varchar:'string',bpchar:'string',bytea:'binary',date:'date',time:'time',timetz:'time',timestamp:'timestamp',timestamptz:'timestamp'};
const str=(n:NativeJson|undefined)=>n?.kind==='string'?n.value:undefined;
export function derivePostgresqlColumns(root:NativeJson):PostgresqlColumnMetadata[]{
 if(root.kind!=='object')return [];const snapshot=root.members.snapshot;if(snapshot?.kind!=='object')return [];
 const relations=snapshot.members.relations;if(relations?.kind!=='array')return [];
 const out:PostgresqlColumnMetadata[]=[];
 relations.items.forEach((relation,ri)=>{
  if(relation.kind!=='object'||relation.members.columns?.kind!=='array')return;
  const r=relation.members;
  relation.members.columns.items.forEach((column,ci)=>{
   if(column.kind!=='object')return;const c=column.members,t=c.nativeType;
   let scalarType:ScalarType|undefined;
   if(t?.kind==='object'&&str(t.members.schema)==='pg_catalog'&&str(t.members.kind)==='b'&&str(t.members.category)!=='A'&&t.members.dimensions?.kind==='number'&&Number(t.members.dimensions.value)===0){const name=str(t.members.name);if(name&&Object.hasOwn(families,name))scalarType=families[name];}
   const path='/snapshot/relations/'+ri+'/columns/'+ci,description=str(c.comment);
   out.push({path,relation:{schema:str(r.schema)??'',name:str(r.name)??'',kind:str(r.kind)??''},nativeColumn:copyJson(column) as NativeJson,element:{id:path,name:str(c.name)??'',...(description!==undefined?{description}:{}),...(scalarType?{scalarType}:{}),extensions:{}}});
  });
 });return out;
}
