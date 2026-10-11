import {inspectParquetLogicalTypes,type ParquetLogicalInspection} from './logical';
import type {ParquetSchemaNode} from './schema';
import type {Document} from '../../model/types';
export type ParquetContainer = {index:number;kind:'list';nullable:boolean;repeatedIndex:number;elementIndex:number;elementNullable:boolean;layout:'two-level'|'three-level'} | {index:number;kind:'map';nullable:boolean;repeatedIndex:number;keyIndex:number;valueIndex?:number;valueNullable:boolean;duplicateKeys:'last-value'};
export interface ParquetContainerInspection extends ParquetLogicalInspection {containers?:ParquetContainer[]}
/** Native reading interpretation only; source structure, names and annotations remain authoritative. */
export function inspectParquetContainers(source:Document):ParquetContainerInspection {
 const r:ParquetContainerInspection=inspectParquetLogicalTypes(source);if(!r.tree)return r;
 const schema=(r.metadata as any).schema,annotations=new Map(r.annotations?.map(a=>[a.index,a])),containers:ParquetContainer[]=[];
 const fail=(index:number,message:string)=>{r.status='blocked';r.diagnostics.push({code:'PARQUET_CONTAINER_STRUCTURE',path:'/schema/'+index,severity:'error',message});};
 function walk(node:ParquetSchemaNode,parent?:ParquetSchemaNode){
  const e=schema[node.index],a=annotations.get(node.index),name=a?.name;
  if(name==='LIST'||name==='MAP'||name==='MAP_KEY_VALUE'){
   const parentName=parent&&annotations.get(parent.index)?.name;
   // MAP_KEY_VALUE on the entry group describes its parent's map, not a second map.
   const entryMarker=name==='MAP_KEY_VALUE'&&(parentName==='MAP'||parentName==='MAP_KEY_VALUE');
   if(!entryMarker){
    const repeated=node.children[0];let valid=true;
    const bad=(message:string)=>{valid=false;fail(node.index,message);};
    if(node.index===0||e.type!==undefined)bad('Container must annotate a non-root group');
    if(node.children.length!==1||!repeated||schema[repeated.index].repetition_type!=='2')bad('Container requires exactly one repeated child');
    if(valid&&repeated){
     if(name==='LIST'){
      const child=schema[repeated.index],single=repeated.children[0];
      const two=child.type!==undefined||repeated.children.length>1||single&&schema[single.index].repetition_type==='2'||repeated.name==='array'||repeated.name===node.name+'_tuple';
      if(child.type===undefined&&repeated.children.length===0)bad('Repeated list group must have an element');
      if(e.repetition_type==='2'){
       // Repeated LIST is legal only when it is itself a two-level list element.
       const outer=containers.find(c=>c.kind==='list'&&c.elementIndex===node.index&&c.layout==='two-level');
       if(!outer)bad('Repeated LIST must be an element of another two-level LIST');
      }
      if(valid)containers.push({index:node.index,kind:'list',nullable:e.repetition_type==='1',repeatedIndex:repeated.index,elementIndex:two?repeated.index:single!.index,elementNullable:!two&&schema[single!.index].repetition_type==='1',layout:two?'two-level':'three-level'});
     }else{
      if(e.repetition_type==='2')bad('MAP cannot have repeated outer repetition');
      const key=repeated.children[0],value=repeated.children[1];
      if(schema[repeated.index].type!==undefined||repeated.children.length<1||repeated.children.length>2)bad('Map entry must be a group with a key and optional value');
      if(key&&schema[key.index].repetition_type!=='0')bad('Map key must be required');
      if(value&&schema[value.index].repetition_type==='2')bad('Map value cannot be repeated');
      if(valid)containers.push({index:node.index,kind:'map',nullable:e.repetition_type==='1',repeatedIndex:repeated.index,keyIndex:key!.index,...(value?{valueIndex:value.index}:{}),valueNullable:!value||schema[value.index].repetition_type==='1',duplicateKeys:'last-value'});
     }
    }
    if(!valid&&a)a.validation='invalid';
   }
  }
  for(const child of node.children)walk(child,node);
 }
 walk(r.tree);r.containers=containers;
 r.diagnostics.push({code:'PARQUET_CONTAINER_VALUES_UNVERIFIED',path:'',severity:'warning',message:'LIST/MAP schema interpretation does not decode values or verify key duplicates; partial views may accompany blocked sources'});
 return r;
}
