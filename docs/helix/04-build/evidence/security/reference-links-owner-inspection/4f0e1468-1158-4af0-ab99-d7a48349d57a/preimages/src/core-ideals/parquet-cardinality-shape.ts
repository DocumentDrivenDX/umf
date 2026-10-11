import {copyJson} from '../model/json';
import {UmfError,SCALAR_TYPES,type Document,type Json,type Cardinality,type ScalarType} from '../model/types';
import {inspectParquetContainers,type ParquetContainer} from '../adapters/parquet/containers';
import {getParquetFieldMetadata} from '../adapters/parquet/field-metadata';
import type {ParquetSchemaNode} from '../adapters/parquet/schema';

export interface ParquetCardinalityNode {
 index:number;path:string[];nativeFragment:Json;
 shape:Cardinality;role:'scalar'|'record'|'array'|'map'|'unresolved';
 nativeNullable:boolean|null;scalarType?:ScalarType;itemIndex?:number;
 recordMembers?:number[];container?:ParquetContainer;
 residuals:{path:string;reason:string}[];
}
export interface ParquetCardinalityShape {index:number;nodes:ParquetCardinalityNode[];}

/** Internal present-value shape interpretation. Does not publish core assertions or decode rows. */
export function inspectParquetCardinalityShape(source:Document,index:number):ParquetCardinalityShape {
 if(!Number.isSafeInteger(index)||index<=0)throw new UmfError('PARQUET_CARDINALITY_INDEX','A non-root schema index is required');
 const inspected=inspectParquetContainers(source),inventory=getParquetFieldMetadata(source);
 if(inspected.status!=='checked'||inventory.status!=='checked'||!inspected.tree)throw new UmfError('PARQUET_CARDINALITY_STRUCTURE','Checked physical/logical container topology required');
 const tree=new Map<number,ParquetSchemaNode>();
 const visit=(node:ParquetSchemaNode)=>{tree.set(node.index,node);node.children.forEach(visit);};visit(inspected.tree);
 if(!tree.has(index))throw new UmfError('PARQUET_CARDINALITY_INDEX','Schema index does not exist');
 const fields=new Map(inventory.fields.map(f=>[f.index,f])),containers=new Map(inspected.containers!.map(c=>[c.index,c]));
 const annotations=new Map(inspected.annotations?.map(a=>[a.index,a]));
 const wrappers=new Set<number>(),members=new Set<number>();
 for(const c of inspected.containers!){
  if(c.kind==='list'){members.add(c.elementIndex);if(c.repeatedIndex!==c.elementIndex)wrappers.add(c.repeatedIndex);}
  else{wrappers.add(c.repeatedIndex);members.add(c.keyIndex);if(c.valueIndex!==undefined)members.add(c.valueIndex);}
 }
 const hasUnknown=(v:Json):boolean=>v!==null&&typeof v==='object'&&(Array.isArray(v)?v.some(hasUnknown):(Array.isArray(v.$unknown)&&v.$unknown.length>0)||Object.values(v).some(hasUnknown));
 const result:ParquetCardinalityShape={index,nodes:[]},pending=[index],seen=new Set<number>();
 for(let i=0;i<pending.length;i++){
  const at=pending[i]!;if(seen.has(at))continue;seen.add(at);
  const native=fields.get(at)!,node=tree.get(at)!,fragment=native.nativeField as Record<string,Json>,container=containers.get(at),annotation=annotations.get(at);
  const row:ParquetCardinalityNode={index:at,path:[...node.path],nativeFragment:copyJson(fragment),shape:'unspecified',role:'unresolved',nativeNullable:null,residuals:[]};
  const loss=(reason:string,suffix='')=>row.residuals.push({path:'/schema/'+at+suffix,reason});
  if(wrappers.has(at))loss('Physical repeated wrapper is not a separate logical value Field');
  else if(fragment.repetition_type==='2'&&!members.has(at)&&!container)loss('Unannotated repetition requires an explicit legacy interpretation; no scalar or non-null array is inferred');
  else{
   row.nativeNullable=fragment.repetition_type==='1';
   if(container){
    row.container=copyJson(container) as unknown as ParquetContainer;
    if(container.kind==='list'){row.shape='array';row.role='array';row.itemIndex=container.elementIndex;}
    else if(container.valueIndex===undefined)loss('Key-only native MAP has no value role; a map value or list reinterpretation is not invented');
    else{
     row.shape='map';row.role='map';row.itemIndex=container.valueIndex;
     loss('Native MAP schema does not enforce ideal unique keys; ordered pairs and duplicate-key behavior remain native');
     const key=fields.get(container.keyIndex)!,keyAnnotation=annotations.get(container.keyIndex);
     if(key.element.scalarType!=='string'||keyAnnotation?.name!=='STRING'||keyAnnotation.validation!=='checked'||hasUnknown(key.nativeField))loss('Native map key is not an established exact string carrier; no key coercion is performed');
    }
   }else if(Object.hasOwn(fragment,'type')){
    row.shape='one';row.role='scalar';
    if(SCALAR_TYPES.includes(native.element.scalarType as ScalarType))row.scalarType=native.element.scalarType as ScalarType;
   }else if(annotation)loss('Annotated group has no established record/container interpretation');
   else{row.shape='one';row.role='record';row.recordMembers=node.children.map(c=>c.index);}
   if(hasUnknown(fragment))loss('Unknown native schema content remains uninterpreted');
   if(annotation?.validation==='uninterpreted'&&!container)loss('Native logical refinement remains uninterpreted');
   if(row.itemIndex!==undefined)pending.push(row.itemIndex);
   if(row.recordMembers)pending.push(...row.recordMembers);
  }
  result.nodes.push(row);
 }
 return result;
}
