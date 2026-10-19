// SPDX-License-Identifier: MIT OR Apache-2.0
import {canonicalSchemaJson,checkSchemaLiteral} from '../../model/schema-literals';
import {UmfError,pointer,type Diagnostic,type Document,type Element,type Module} from '../../model/types';
import type {TableRef} from './types';
export const refKey=(r:TableRef):string=>JSON.stringify([r.module,r.element]);
export class TableContext {
 readonly diagnostics:Diagnostic[]=[];
 nodes=0;
 constructor(readonly document:Document,readonly module:Module,readonly path:string){}
 add(code:string,path:string,message:string,unknown=false):void{
  if(this.diagnostics.length>=256){if(this.diagnostics.length===256)this.diagnostics.push({code:'TABLES_DIAGNOSTIC_LIMIT',path:this.path,message:'Further diagnostics omitted after 256 entries; interpretation refused',severity:'error'});return;}
  this.diagnostics.push({code,path,message,severity:unknown?'warning':'error'});}
 element(ref:TableRef):Element|undefined{return this.document.modules.find(m=>m.id===ref.module)?.elements.find(e=>e.id===ref.element);}
 field(ref:TableRef,path:string):Element|undefined{
  const value=this.element(ref);
  if(value?.kind!=='field'){this.add('TABLES_FIELD',path,'Expected an exact core Field reference');return;}
  if(value.cardinality!=='one'||!['required','absent-allowed'].includes(value.nullability??''))this.add('TABLES_FIELD_SHAPE',path,'Native table fields require explicit singleton cardinality and nullability');
  return value;
 }
 literal(field:Element,value:unknown,path:string):void{
  try{checkSchemaLiteral(this.document,field,value);}catch(error){if(!(error instanceof UmfError))throw error;this.add('TABLES_LITERAL',path,error.message);}
 }
 identifier(name:string,path:string):void{if(new TextEncoder().encode(name).length>63||name.includes('\0'))this.add('TABLES_IDENTIFIER',path,'Native identifier exceeds 63 UTF-8 bytes or contains NUL');}
 charge(path:string,depth:number):boolean{
  if(++this.nodes>4096||depth>16){this.add('TABLES_COMPLEXITY',path,'Expression/rule depth or module node budget exceeded');return false;}return true;
 }
 unique<T>(items:readonly T[],key:(item:T)=>string,path:string,label:string):void{
  const seen=new Set<string>();for(const[i,item]of items.entries()){const value=key(item);if(seen.has(value))this.add('TABLES_DUPLICATE',path+'/'+i,'Duplicate '+label);seen.add(value);}
 }
}
export function domain(field:Element):string{return canonicalSchemaJson({scalarType:field.scalarType??null,cardinality:field.cardinality??null,facets:field.facets??{},allowedValues:field.allowedValues??null});}

/** Follow the selected schema branch, retaining all unfamiliar object members. */
export function inspectUnknown(value:unknown,schema:any,defs:Record<string,any>,ctx:TableContext,path:string):void{
 if(schema.$ref){const name=schema.$ref.split('/').at(-1);if(name&&defs[name])inspectUnknown(value,defs[name],defs,ctx,path);return;}
 if(schema.oneOf){
  const chosen=schema.oneOf.find((branch:any)=>{
   if(branch.type==='null')return value===null;
   if(value===null||typeof value!=='object'||Array.isArray(value))return false;
   if(!(branch.required??[]).every((key:string)=>Object.hasOwn(value,key)))return false;
   return Object.entries(branch.properties??{}).every(([key,property]:[string,any])=>{
    if(!Object.hasOwn(value,key))return true;
    if(property.const!==undefined)return (value as any)[key]===property.const;
    return !property.enum||property.enum.includes((value as any)[key]);
   });
  });
  if(chosen)inspectUnknown(value,chosen,defs,ctx,path);return;
 }
 if(Array.isArray(value)){for(const[i,item]of value.entries())if(schema.items)inspectUnknown(item,schema.items,defs,ctx,path+'/'+i);return;}
 if(value!==null&&typeof value==='object')for(const[key,item]of Object.entries(value)){
  const child=schema.properties?.[key];if(child)inspectUnknown(item,child,defs,ctx,path+'/'+pointer(key));
  else if(schema.additionalProperties&&typeof schema.additionalProperties==='object')inspectUnknown(item,schema.additionalProperties,defs,ctx,path+'/'+pointer(key));
  else ctx.add('TABLES_UNKNOWN',path+'/'+pointer(key),'Unknown table content is retained and not interpreted',true);
 }
}
