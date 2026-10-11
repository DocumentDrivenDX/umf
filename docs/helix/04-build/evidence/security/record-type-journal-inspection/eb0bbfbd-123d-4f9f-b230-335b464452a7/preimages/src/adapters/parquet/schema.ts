import {inspectParquetMetadata,type ParquetMetadataInspection} from './metadata';
import type {Document} from '../../model/types';
export interface ParquetSchemaNode {index:number;name:string;path:string[];definitionLevel:number;repetitionLevel:number;children:ParquetSchemaNode[]}
export interface ParquetSchemaLeaf {index:number;ordinal:number;path:string[];physicalType:string;definitionLevel:number;repetitionLevel:number}
export interface ParquetSchemaInspection extends Omit<ParquetMetadataInspection,'status'> {status:'checked'|'blocked';tree?:ParquetSchemaNode;leaves?:ParquetSchemaLeaf[]}
const physical=['BOOLEAN','INT32','INT64','INT96','FLOAT','DOUBLE','BYTE_ARRAY','FIXED_LEN_BYTE_ARRAY'];
/** Checks physical schema topology and available row-group column links, not logical semantics. */
export function inspectParquetSchema(source:Document):ParquetSchemaInspection{
 const named=inspectParquetMetadata(source),r:ParquetSchemaInspection={...named,status:'blocked'};if(named.status!=='mapped')return r;
 const metadata=named.metadata as any,schema=metadata.schema as any[],leaves:ParquetSchemaLeaf[]=[];let next=0;
 const fail=(path:string,message:string):never=>{r.diagnostics.push({code:'PARQUET_SCHEMA_STRUCTURE',path,severity:'error',message});throw Error(message);};
 const warn=(code:string,path:string,message:string)=>r.diagnostics.push({code,path,severity:'warning',message});
 function node(parentPath:string[],definitionLevel:number,repetitionLevel:number,depth:number):ParquetSchemaNode{
  if(depth>64)fail('/schema','Schema nesting exceeds 64');if(next>=schema.length)fail('/schema','Child count exceeds remaining schema elements');const index=next++,e=schema[index],at='/schema/'+index,isRoot=index===0,isLeaf=e.type!==undefined;
  if(isRoot){if(isLeaf)fail(at,'Root must be a group');if(e.repetition_type!==undefined){if(e.repetition_type!=='0')fail(at+'/repetition_type','Only absent or legacy REQUIRED root repetition is understood');warn('PARQUET_ROOT_REPETITION',at+'/repetition_type','REQUIRED root repetition retained; root contributes no definition/repetition level');}}
  else{if(!['0','1','2'].includes(e.repetition_type))fail(at+'/repetition_type','Non-root node requires known repetition');if(e.repetition_type!=='0')definitionLevel++;if(e.repetition_type==='2')repetitionLevel++;}
  const path=isRoot?[]:[...parentPath,e.name],out:ParquetSchemaNode={index,name:e.name,path,definitionLevel,repetitionLevel,children:[]};
  if(isLeaf){if(e.num_children!==undefined)fail(at,'Primitive cannot also declare children');const type=physical[Number(e.type)];if(!type)fail(at+'/type','Unknown physical type cannot supply a physical schema view');if(e.type==='7'&&(e.type_length===undefined||BigInt(e.type_length)<=0n))fail(at+'/type_length','Fixed byte arrays require a positive length');leaves.push({index,ordinal:leaves.length,path,physicalType:type!,definitionLevel,repetitionLevel});}
  else{if(e.num_children===undefined||BigInt(e.num_children)<0n||BigInt(e.num_children)>BigInt(schema.length-next))fail(at+'/num_children','Group requires a feasible nonnegative child count');const names=new Set<string>();for(let i=0;i<Number(e.num_children);i++){const child=node(path,definitionLevel,repetitionLevel,depth+1);if(names.has(child.name))warn('PARQUET_DUPLICATE_FIELD_NAME',at,'Sibling names repeat; use schema indexes/column ordinals as identity');names.add(child.name);out.children.push(child);}}
  return out;
 }
 try{
  if(!schema.length)fail('/schema','Schema must contain a root');const tree=node([],0,0,0);if(next!==schema.length)fail('/schema/'+next,'Unattached schema elements remain after the root tree');
  if(metadata.column_orders!==undefined&&metadata.column_orders.length!==leaves.length)fail('/column_orders','Column order count must match physical leaf count');
  let rowCount=0n;for(const [g,group] of metadata.row_groups.entries()){
   const at='/row_groups/'+g;if(BigInt(group.num_rows)<0n)fail(at+'/num_rows','Row count cannot be negative');rowCount+=BigInt(group.num_rows);if(group.columns.length!==leaves.length)fail(at+'/columns','Column count must match physical schema leaves');
   for(const [i,column] of group.columns.entries()){
    const leaf=leaves[i]!,where=at+'/columns/'+i,chunk=column.meta_data;
    if(!chunk){warn('PARQUET_COLUMN_METADATA_UNAVAILABLE',where,'Missing/encrypted column metadata prevents physical link verification');continue;}
    if(JSON.stringify(chunk.path_in_schema)!==JSON.stringify(leaf.path))fail(where+'/meta_data/path_in_schema','Column path does not match its schema leaf ordinal');if(physical[Number(chunk.type)]!==leaf.physicalType)fail(where+'/meta_data/type','Column physical type differs from schema leaf');
    if(column.file_path!==undefined)warn('PARQUET_EXTERNAL_COLUMN',where+'/file_path','External column source is retained without fetching or checking its bytes');
   }
  }
  if(rowCount!==BigInt(metadata.num_rows))fail('/num_rows','File row count differs from row-group total');r.status='checked';r.tree=tree;r.leaves=leaves;warn('PARQUET_LOGICAL_SEMANTICS_UNVERIFIED','','Physical topology and available column links checked; logical annotations, page values, offsets and safe transforms remain unverified');
 }catch(e){if(!r.diagnostics.some(d=>d.code==='PARQUET_SCHEMA_STRUCTURE'))r.diagnostics.push({code:'PARQUET_SCHEMA_STRUCTURE',path:'',severity:'error',message:(e as Error).message});}
 return r;
}
