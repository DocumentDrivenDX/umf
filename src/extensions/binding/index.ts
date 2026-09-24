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
  const fields=new Map(payload.fields.map(field=>[fieldKey(field),field]));
  const names=new Set<string>();
  for(const[index,item]of payload.indexes.entries()){
    const base=`/indexes/${index}`;
    unknown(item as unknown as Record<string,unknown>,['name','kind','on','predicate','unique','include'],base);
    if(item.predicate)unknown(item.predicate as unknown as Record<string,unknown>,['language','version','expression'],base+'/predicate');
    if(item.kind==='unique'&&!item.unique)add('BINDING_INDEX',base+'/unique','Unique kind requires unique true');
    if(item.kind==='clustering'&&item.unique)add('BINDING_INDEX',base+'/unique','Clustering cannot be unique');
    if(item.kind==='partial'&&!item.predicate)add('BINDING_INDEX',base+'/predicate','Partial kind requires a predicate');
    if(item.kind!=='partial'&&item.predicate)add('BINDING_INDEX',base+'/predicate','Predicate requires partial kind');
    const owners=new Set<string>();
    const targets=new Set<string>();
    for(const[targetIndex,target]of item.on.entries()){
      const ref='field'in target?target.field:target.documentPath.field;
      const key=fieldKey(ref),field=fields.get(key);
      const targetPath=base+`/on/${targetIndex}`;
      unknown(target as unknown as Record<string,unknown>,['field','documentPath'],targetPath);
      if('documentPath'in target)unknown(target.documentPath as unknown as Record<string,unknown>,['field','path'],targetPath+'/documentPath');
      unknown(ref as unknown as Record<string,unknown>,['module','element','field'],targetPath+('field'in target?'/field':'/documentPath/field'));
      owners.add(refKey(ref));
      if(targets.has(JSON.stringify(target)))add('BINDING_INDEX',targetPath,'Duplicate ordered index target');
      targets.add(JSON.stringify(target));
      if(!field)add('BINDING_INDEX',targetPath,'Index target has no declared field binding');
      else if('documentPath'in target){
        if(field.storage!=='embedded'||JSON.stringify(field.path)!==JSON.stringify(target.documentPath.path))add('BINDING_INDEX',targetPath,'Document path differs from embedded field binding');
      }else if(field.storage!=='column')add('BINDING_INDEX',targetPath,'Field target requires column storage');
    }
    if(owners.size!==1)add('BINDING_INDEX',base+'/on','One index cannot span logical owner elements');
    const owner=[...owners][0]??'';
    const scoped=JSON.stringify([owner,item.name]);
    if(names.has(scoped))add('BINDING_DUPLICATE',base+'/name','Duplicate index name in table scope');
    names.add(scoped);
    const included=new Set<string>();
    for(const[includeIndex,ref]of (item.include??[]).entries()){
      const key=fieldKey(ref),field=fields.get(key),includePath=base+`/include/${includeIndex}`;
      unknown(ref as unknown as Record<string,unknown>,['module','element','field'],includePath);
      if(!field||field.storage!=='column')add('BINDING_INDEX',includePath,'Included field requires declared column storage');
      if(refKey(ref)!==owner)add('BINDING_INDEX',includePath,'Included field belongs to another table');
      if(included.has(key)||item.on.some(target=>'field'in target&&fieldKey(target.field)===key))add('BINDING_INDEX',includePath,'Duplicate or overlapping include field');
      included.add(key);
    }
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

export interface BindingIndexOutcome {name:string;path:string;outcome:'exact'|'approximated'|'not-expressible'|'unknown';reason?:string}
export interface BindingIndexProjection {status:'projected'|'reported'|'blocked';source:Document;logical:Document;target:BindingPayload['target'];outcomes:BindingIndexOutcome[];candidate?:BindingIndex[]}

/** Qualifies planned index carriers. Native DDL/catalog validation is a separate gate. */
export function projectBindingIndexes(binding:Document,logical:Document,lossPolicy:'strict'|'report'):BindingIndexProjection{
  const checked=inspectBinding(binding,logical);
  if(checked.diagnostics.some(d=>d.code==='BINDING_UNKNOWN'))throw new UmfError('BINDING_INCOMPLETE','Unknown binding content may affect index projection');
  const payload=getBinding(binding,logical);
  const outcomes:BindingIndexOutcome[]=payload.indexes.map((item,index)=>{
    const path=`/extensions/umf.binding/indexes/${index}`;
    const system=payload.target.system,version=payload.target.version;
    if(system==='postgresql'&&version.startsWith('17')){
      if(item.kind==='clustering')return {name:item.name,path,outcome:'not-expressible',reason:'PostgreSQL clustering is not a declared index kind'};
      if(item.predicate&&(item.predicate.language!=='postgresql'||!item.predicate.version.startsWith('17')))return {name:item.name,path,outcome:'unknown',reason:'Predicate language/version is not the selected PostgreSQL profile'};
      return {name:item.name,path,outcome:'exact'};
    }
    if(system==='sqlserver'){
      if(['btree','unique'].includes(item.kind))return {name:item.name,path,outcome:'exact'};
      if(item.kind==='partial'&&item.predicate?.language==='tsql')return {name:item.name,path,outcome:'exact'};
      return {name:item.name,path,outcome:'not-expressible',reason:'No supported SQL Server index carrier for this kind'};
    }
    if(system==='delta')return {name:item.name,path,outcome:item.kind==='clustering'?'exact':'not-expressible',...(item.kind==='clustering'?{}:{reason:'Delta profile only represents liquid clustering'})} as BindingIndexOutcome;
    if(system==='iceberg')return {name:item.name,path,outcome:item.kind==='clustering'?'approximated':'not-expressible',reason:item.kind==='clustering'?'Iceberg sort order is an analogue, not index enforcement':'No Iceberg index carrier for this kind'};
    if(system==='parquet')return {name:item.name,path,outcome:'not-expressible',reason:'Parquet file schema does not enforce indexes'};
    return {name:item.name,path,outcome:'unknown',reason:'Target profile has no qualified index mapping'};
  });
  const nonExact=outcomes.some(row=>row.outcome!=='exact');
  const result:BindingIndexProjection={status:nonExact?(lossPolicy==='strict'?'blocked':'reported'):'projected',source:copyJson(binding) as unknown as Document,logical:copyJson(logical) as unknown as Document,target:copyJson(payload.target) as BindingPayload['target'],outcomes};
  if(result.status!=='blocked')result.candidate=payload.indexes.filter((_,index)=>outcomes[index]!.outcome==='exact');
  return result;
}
