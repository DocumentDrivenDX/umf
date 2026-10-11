import {copyJson} from '../../model/json';
import {UmfError,type Document,type Element,type Json,type ScalarType,type Diagnostic} from '../../model/types';
import {captureParquet,parquetRegistry,PARQUET_EXTENSION} from './index';
import {validateDocument} from '../../validation/document';
import {inspectParquetLogicalTypes} from './logical';
export interface ParquetFieldMetadata {index:number;path:string[];definitionLevel:number;repetitionLevel:number;element:Element;nativeField:Json;}
export interface ParquetFieldMetadataResult {status:'checked'|'blocked';complete:false;fields:ParquetFieldMetadata[];diagnostics:Diagnostic[];}
const physical:Record<string,ScalarType>={'0':'boolean','1':'integer','2':'integer','4':'float','5':'float','6':'binary','7':'binary'};
const logical:Record<string,ScalarType>={STRING:'string',ENUM:'string',DECIMAL:'decimal',DATE:'date',TIME:'time',TIMESTAMP:'timestamp',INTEGER:'integer',FLOAT16:'float'};
const unknown=(v:any):boolean=>!!(v&&typeof v==='object'&&(Array.isArray(v.$unknown)&&v.$unknown.length>0||Object.values(v).some(unknown)));
/** Field domains only, not row shape, repetition flattening or instance validation. */
export function getParquetFieldMetadata(source:Document):ParquetFieldMetadataResult{
 if(!validateDocument(source,parquetRegistry()).valid)throw new UmfError('PARQUET_CAPTURE','Invalid source envelope');
 const captured=source.modules.find(m=>m.id==='parquet')?.elements.find(e=>e.id==='source')?.extensions[PARQUET_EXTENSION];
 if(!captured||!source.vocabularies[PARQUET_EXTENSION])throw new UmfError('PARQUET_CAPTURE','Missing Parquet source');
 const raw:Document={umf:'0.1.0',id:source.id,vocabularies:{[PARQUET_EXTENSION]:{version:source.vocabularies[PARQUET_EXTENSION]!.version}},modules:[{id:'parquet',namespace:'',elements:[{id:'source',extensions:{[PARQUET_EXTENSION]:copyJson(captured)}}]}]};
 const inspected=inspectParquetLogicalTypes(raw),result:ParquetFieldMetadataResult={status:inspected.status,complete:false,fields:[],diagnostics:inspected.diagnostics};
 if(inspected.status!=='checked')return result;
 const schema=(inspected.metadata as any).schema,annotations=new Map(inspected.annotations?.map(a=>[a.index,a]));
 function walk(node:NonNullable<typeof inspected.tree>){
  if(node.index!==0){
   const native=schema[node.index],annotation=annotations.get(node.index);let scalarType:ScalarType|undefined;
   if(native.type!==undefined){
    if(annotation){if(annotation.validation==='checked'&&Object.hasOwn(logical,annotation.name))scalarType=logical[annotation.name];}
    else if(Object.hasOwn(physical,native.type))scalarType=physical[native.type];
    if(unknown(native))scalarType=undefined;
   }
   result.fields.push({index:node.index,path:[...node.path],definitionLevel:node.definitionLevel,repetitionLevel:node.repetitionLevel,nativeField:copyJson(native),element:{id:'schema:'+node.index,name:node.name,...(scalarType?{scalarType}:{}),extensions:{}}});
  }
  node.children.forEach(walk);
 }
 walk(inspected.tree!);return result;
}
export function importParquetSchema(bytes:Uint8Array,options:{id:string}):Document{
 const doc=captureParquet(bytes,options),view=getParquetFieldMetadata(doc);
 if(view.status!=='checked')throw new UmfError('PARQUET_FIELD_METADATA','Schema cannot be interpreted; captureParquet can preserve the source');
 doc.modules.push({id:'parquet.fields',namespace:'',elements:view.fields.map(f=>f.element)});return doc;
}
export function checkParquetFieldMetadata(doc:Document):void{
 const module=doc.modules.find(m=>m.id==='parquet.fields');if(!module)return;const view=getParquetFieldMetadata(doc);
 if(view.status!=='checked'||module.namespace!==''||module.elements.length!==view.fields.length||view.fields.some((f,i)=>['id','name','scalarType'].some(k=>module.elements[i]?.[k]!==f.element[k])))throw new UmfError('PARQUET_FIELD_METADATA','Native schema and core field metadata disagree');
}
/** Used after a verified native rewrite; preserve unrelated metadata by schema index. */
export function refreshParquetFieldMetadata(doc:Document):void{
 const module=doc.modules.find(m=>m.id==='parquet.fields');if(!module)return;const view=getParquetFieldMetadata(doc);
 if(view.status!=='checked')throw new UmfError('PARQUET_FIELD_METADATA','Rewritten schema metadata is unavailable');
 const previous=new Map(module.elements.map(e=>[e.id,e]));
 if(module.elements.some(e=>!view.fields.some(f=>f.element.id===e.id)&&(Object.keys(e.extensions).length||Object.keys(e).some(k=>!['id','name','scalarType','extensions'].includes(k)))))throw new UmfError('PARQUET_FIELD_METADATA','Rewrite would discard attached field metadata');
 module.elements=view.fields.map(f=>{const old=previous.get(f.element.id);if(!old)return f.element;delete old.scalarType;return {...old,...f.element,extensions:old.extensions};});
}
