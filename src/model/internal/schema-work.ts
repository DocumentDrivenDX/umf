// SPDX-License-Identifier: MIT OR Apache-2.0
import coreInput from '../../../spec/core/schema.json';
import referenceInput from '../../../spec/core/semantic-type-reference.schema.json';
import keyReceiptInput from '../../../spec/core/key-tuple-operation-v4.schema.json';
import datasetInput from '../../../spec/core/dataset-value-operation.schema.json';
import compactInput from '../../../spec/core/dataset-value-compact-operation.schema.json';
import type {ValueWork} from './value-context';
import {snapshotSchema} from '../../validation/internal-schema';
const core=snapshotSchema(coreInput),reference=snapshotSchema(referenceInput),keyReceipt=snapshotSchema(keyReceiptInput),dataset=snapshotSchema(datasetInput),compact=snapshotSchema(compactInput);
/** Resource reservation only: visits every possible branch; never accepts or
 * rejects source meaning. The original public validator remains authoritative. */
export function reserveSchemaWork(root:any,schema:any,value:unknown,work:ValueWork,category='source-schema'){
 const charge=(part:string,n=1)=>{work.charge(category+'-meter-'+part,n);work.charge(category+'-validator-'+part,n);};
 const canonical=(value:any):void=>{charge('canonical');if(value!==null&&typeof value==='object'){const children=Object.values(value);if(!Array.isArray(value))charge('key-sort',children.length*Math.ceil(Math.log2(children.length+1)));for(const child of children)canonical(child);}};
 const reserve=(root:any,schema:any,value:any):void=>{
  charge('branch');if(typeof schema==='boolean')return;
  if(schema.$ref){const [id,path]=schema.$ref.split('#');const targetRoot=id?[core,reference,keyReceipt,dataset,compact].find(s=>s.$id===id):root;if(!targetRoot)throw Error('Unregistered resource schema');const target=(path??'').split('/').slice(1).reduce((node:any,key:string)=>node[key.replace(/~1/g,'/').replace(/~0/g,'~')],targetRoot);reserve(targetRoot,target,value);}
  for(const key of ['allOf','anyOf','oneOf'])for(const branch of schema[key]??[])reserve(root,branch,value);
  for(const key of ['if','then','else','not'])if(schema[key])reserve(root,schema[key],value);
  if(Object.hasOwn(schema,'const')){canonical(schema.const);canonical(value);}
  for(const candidate of schema.enum??[]){canonical(candidate);canonical(value);}
  if(value!==null&&typeof value==='object'&&!Array.isArray(value)){
   if(schema.propertyNames)for(const key of Object.keys(value))reserve(root,schema.propertyNames,key);
   for(const [key,branch] of Object.entries(schema.properties??{}))if(Object.hasOwn(value,key)){charge('property');reserve(root,branch,(value as any)[key]);}
   if(Object.keys(schema.patternProperties??{}).length||schema.additionalProperties===false||typeof schema.additionalProperties==='object')for(const [key,child] of Object.entries(value)){
    charge('property');let matched=Object.hasOwn(schema.properties??{},key);
    for(const [pattern,branch] of Object.entries(schema.patternProperties??{})){charge('pattern');if(new RegExp(pattern).test(key)){reserve(root,branch,child);matched=true;}}
    if(!matched&&schema.additionalProperties&&typeof schema.additionalProperties==='object')reserve(root,schema.additionalProperties,child);
   }
  }
  if(Array.isArray(value)){
   for(let i=0;i<value.length;i++){if(schema.prefixItems?.[i])reserve(root,schema.prefixItems[i],value[i]);else if(schema.items&&typeof schema.items==='object')reserve(root,schema.items,value[i]);if(schema.contains)reserve(root,schema.contains,value[i]);}
   if(schema.uniqueItems)for(const child of value)canonical(child);
  }
 };
 reserve(root,schema,value);
}
export function reserveSourceSchemaWork(source:unknown,work:ValueWork){
 // The generated current schema owns all structural branch reservations.
 reserveSchemaWork(core,core,source,work);
}
export const reserveLiteralSchemaWork=(value:unknown,work:ValueWork)=>reserveSchemaWork(core,core.$defs.literal,value,work,'literal-schema');
export const reserveInputSchemaWork=(value:unknown,work:ValueWork)=>reserveSchemaWork(dataset,dataset.$defs.input,value,work,'input-schema');
export const reserveCompactSchemaWork=(value:unknown,work:ValueWork)=>reserveSchemaWork(compact,compact,value,work,'compact-schema');
