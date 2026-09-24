import manifest from '../../../spec/extensions/binding/package.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {readDocument,writeDocument} from '../../model/document';
import {copyJson} from '../../model/json';
import {pointer,UmfError,type Diagnostic,type Document,type ExtensionPackage,type Json,type Validation} from '../../model/types';

export const BINDING_EXTENSION='umf.binding';
export const bindingPackage=manifest as unknown as ExtensionPackage;

export interface BindingElementRef {module:string;element:string}
export interface BindingFieldRef extends BindingElementRef {field?:string}
export interface BindingRelationshipRef {module:string;name:string}
export interface BindingElement extends BindingElementRef {partition?:string|null;table?:string}
export interface BindingField extends BindingFieldRef {storage:'column'|'embedded';column?:string;documentColumn?:string;path?:string[]}
export interface BindingRelationship extends BindingRelationshipRef {storage:'edge'|'foreign_key'|'junction'|'inline'}
export type BindingIndexTarget={field:BindingFieldRef}|{documentPath:{field:BindingFieldRef;path:string[]}};
export interface BindingIndex {name:string;kind:'btree'|'hash'|'gin'|'gist'|'expression'|'partial'|'unique'|'clustering';on:BindingIndexTarget[];predicate?:{language:string;version:string;expression:string};unique:boolean;include?:BindingFieldRef[]}
export interface BindingPayload {
  profile:'umf-binding-1';
  logical:{documentId:string;coreVersion:string};
  target:{system:string;version:string;subset:string};
  elements:BindingElement[];
  fields:BindingField[];
  relationships:BindingRelationship[];
  indexes:BindingIndex[];
  [key:string]:unknown;
}

const refKey=(ref:BindingElementRef)=>JSON.stringify([ref.module,ref.element]);
const fieldKey=(ref:BindingFieldRef)=>JSON.stringify([ref.module,ref.element,ref.field??null]);
const relationshipKey=(ref:BindingRelationshipRef)=>JSON.stringify([ref.module,ref.name]);
function bindingSemantics(value:Json,context:{document:Document;path:string;scope:string}):Diagnostic[]{
  const out:Diagnostic[]=[];
  const path=context.path;
  const payload=value as unknown as BindingPayload;
  const add=(code:string,suffix:string,message:string,severity:'error'|'warning'='error')=>out.push({code,path:path+suffix,message,severity});
  if(context.scope!=='document')add('BINDING_SCOPE','','Binding payload belongs to its own document');
  if(context.document.modules.length)add('BINDING_SCOPE','/modules','A binding document does not contain logical modules');
  for(const key of Object.keys(payload))if(!['profile','logical','target','elements','fields','relationships','indexes'].includes(key))add('BINDING_UNKNOWN','/'+pointer(key),'Unknown binding content retained','warning');
  const unknown=(obj:Record<string,unknown>,known:string[],suffix:string)=>{
    for(const key of Object.keys(obj))if(!known.includes(key))add('BINDING_UNKNOWN',suffix+'/'+pointer(key),'Unknown binding content retained','warning');
  };
  unknown(payload.logical,['documentId','coreVersion'],'/logical');
  unknown(payload.target,['system','version','subset'],'/target');
  const unique=(rows:readonly unknown[],label:string,key:(item:any)=>string)=>{
    const seen=new Set<string>();
    rows.forEach((item,index)=>{const identity=key(item);if(seen.has(identity))add('BINDING_DUPLICATE',`/${label}/${index}`,'Duplicate '+label+' assignment');seen.add(identity);});
  };
  unique(payload.elements,'elements',refKey);
  payload.elements.forEach((item,index)=>unknown(item as unknown as Record<string,unknown>,['module','element','partition','table'],`/elements/${index}`));
  unique(payload.fields,'fields',fieldKey);
  payload.fields.forEach((item,index)=>unknown(item as unknown as Record<string,unknown>,['module','element','field','storage','column','documentColumn','path'],`/fields/${index}`));
  unique(payload.relationships,'relationships',relationshipKey);
  payload.relationships.forEach((item,index)=>unknown(item as unknown as Record<string,unknown>,['module','name','storage'],`/relationships/${index}`));
  for(const[index,field]of payload.fields.entries()){
    if(field.storage==='column'&&!field.column)add('BINDING_COLUMN',`/fields/${index}/column`,'Column storage needs an explicit column name');
    if(field.storage==='embedded'&&(field.documentColumn===undefined||!field.path?.length))add('BINDING_PATH',`/fields/${index}`,'Embedded storage needs a document column and nonempty path');
  }
  return out;
}

export function bindingRegistry():Registry{return new Registry().register(bindingPackage,bindingSemantics);}

/** Validate a separate binding document against an explicitly supplied logical model. */
export function inspectBinding(binding:Document,logical:Document):Validation{
  const base=validateDocument(binding,bindingRegistry());
  const diagnostics=[...base.diagnostics];
  const add=(code:string,path:string,message:string)=>diagnostics.push({code,path,message,severity:'error' as const});
  const payload=binding.extensions?.[BINDING_EXTENSION] as unknown as BindingPayload|undefined;
  if(binding.vocabularies[BINDING_EXTENSION]?.version!=='0.1.0'||!payload)add('BINDING_PROFILE','/extensions','Expected a document-scoped umf.binding 0.1.0 payload');
  if(payload&&base.valid){
    if(payload.logical.documentId!==logical.id||payload.logical.coreVersion!==logical.umf)add('BINDING_MODEL','/extensions/umf.binding/logical','Logical document id/version mismatch');
    const logicalCheck=validateDocument(logical);
    if(!logicalCheck.valid)add('BINDING_MODEL','/extensions/umf.binding/logical','Supplied logical document is invalid');
    const elements=new Set(logical.modules.flatMap(m=>m.elements.map(e=>refKey({module:m.id,element:e.id}))));
    for(const [index,row]of payload.elements.entries())if(!elements.has(refKey(row)))add('BINDING_REFERENCE',`/extensions/umf.binding/elements/${index}`,'Missing logical element');
    for(const [index,row]of payload.fields.entries()){
      const owner=logical.modules.find(m=>m.id===row.module)?.elements.find(e=>e.id===row.element);
      const ddd=owner?.extensions?.['umf.ddd'] as {fields?:Record<string,unknown>}|undefined;
      const found=row.field===undefined ? !!owner && (owner.kind==='field'||logical.umf==='0.1.0') : !!ddd?.fields && Object.hasOwn(ddd.fields,row.field);
      if(!found)add('BINDING_REFERENCE',`/extensions/umf.binding/fields/${index}`,'Missing exact logical Field or DDD owner/field');
    }
    for(const [index,row]of payload.relationships.entries()){
      const module=logical.modules.find(m=>m.id===row.module);
      const relationships=(module as {relationships?:{name:string}[]}|undefined)?.relationships;
      if(!relationships?.some(r=>r.name===row.name))add('BINDING_REFERENCE',`/extensions/umf.binding/relationships/${index}`,'Missing authored relationship');
    }
  }
  return {valid:!diagnostics.some(d=>d.severity==='error'),complete:diagnostics.length===0,diagnostics};
}

export function readBindingDocument(text:string,logical:Document,format:'json'|'yaml'='yaml'):Document{
  const binding=readDocument(text,format);
  const checked=inspectBinding(binding,logical);
  if(!checked.valid)throw new UmfError('BINDING_DOCUMENT',JSON.stringify(checked.diagnostics));
  return binding;
}

export function writeBindingDocument(binding:Document,logical:Document,format:'json'|'yaml'='yaml'):string{
  const checked=inspectBinding(binding,logical);
  if(!checked.valid)throw new UmfError('BINDING_DOCUMENT',JSON.stringify(checked.diagnostics));
  return writeDocument(binding,format);
}

export function getBinding(binding:Document,logical:Document):BindingPayload{
  const checked=inspectBinding(binding,logical);
  if(!checked.valid)throw new UmfError('BINDING_DOCUMENT',JSON.stringify(checked.diagnostics));
  return copyJson(binding.extensions![BINDING_EXTENSION]) as unknown as BindingPayload;
}
