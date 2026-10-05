import manifest from '../../../spec/extensions/semantic-types/package.json';
import {Registry} from '../../registry/registry';
import {copyJson} from '../../model/json';
import {validateDocument} from '../../validation/document';
import {UmfError, pointer, type Document, type Json, type JsonObject, type ExtensionPackage, type Diagnostic} from '../../model/types';

export const SEMANTIC_TYPES_EXTENSION='umf.semantic-types';
export const semanticTypesPackage=manifest as unknown as ExtensionPackage;
export interface SemanticTypeReference {vocabulary:string;version:string;term:string;[key:string]:unknown}
export interface SemanticTypeAnnotation {types:SemanticTypeReference[];[key:string]:unknown}
export interface SemanticTypeCheck {status:'valid'|'invalid'|'unknown';complete:boolean;issues:string[]}
export interface SemanticTypeValueResult extends SemanticTypeCheck {reference:SemanticTypeReference}
export type SemanticTypeValidator=(value:Json,definition:JsonObject)=>SemanticTypeCheck;

function referenceCopy(input:SemanticTypeReference):SemanticTypeReference {
 const ref=copyJson(input) as unknown as SemanticTypeReference;
 if(!ref||typeof ref!=='object'||Array.isArray(ref)||['vocabulary','version','term'].some(k=>typeof ref[k]!=='string'||!(ref[k] as string).length))throw new UmfError('SEMANTIC_TYPE_STRUCTURE','Expected vocabulary, exact version and term strings');
 return ref;
}
const identity=(ref:SemanticTypeReference)=>JSON.stringify([ref.vocabulary,ref.version,ref.term]);
/** No remote lookup or code loading. Callers explicitly install trusted implementations. */
export class SemanticTypeRegistry {
 #entries=new Map<string,{definition:JsonObject;validator?:SemanticTypeValidator}>();
 register(reference:SemanticTypeReference,definition:JsonObject,validator?:SemanticTypeValidator):this {
  const ref=referenceCopy(reference);
  if(Object.keys(ref).some(k=>!['vocabulary','version','term'].includes(k)))throw new UmfError('SEMANTIC_TYPE_STRUCTURE','Registration identity cannot contain unknown qualifiers');
  const copied=copyJson(definition);
  if(!copied||typeof copied!=='object'||Array.isArray(copied))throw new UmfError('SEMANTIC_TYPE_STRUCTURE','Expected JSON object definition');
  if(validator!==undefined&&typeof validator!=='function')throw new UmfError('SEMANTIC_TYPE_STRUCTURE','Expected explicit validator function');
  const key=identity(ref);
  if(this.#entries.has(key))throw new UmfError('SEMANTIC_TYPE_DUPLICATE','Exact semantic term already registered');
  this.#entries.set(key,{definition:copied as JsonObject,...(validator?{validator}:{})});
  return this;
 }
 lookup(reference:SemanticTypeReference):JsonObject|undefined {
  const entry=this.#entries.get(identity(referenceCopy(reference)));
  return entry?copyJson(entry.definition) as JsonObject:undefined;
 }
 check(reference:SemanticTypeReference,value:Json):SemanticTypeValueResult {
  const ref=referenceCopy(reference);
  const unknown=(issue:string):SemanticTypeValueResult=>({reference:ref,status:'unknown',complete:false,issues:[issue]});
  if(Object.keys(ref).some(k=>!['vocabulary','version','term'].includes(k)))return unknown('Unknown semantic reference qualifiers retained without interpretation');
  const entry=this.#entries.get(identity(ref));
  if(!entry)return unknown('Exact semantic term is unavailable');
  if(!entry.validator)return unknown('No value validator supplied for the exact semantic term');
  try {
   const result=copyJson(entry.validator(copyJson(value),copyJson(entry.definition) as JsonObject)) as unknown as SemanticTypeCheck;
   if(!result||typeof result!=='object'||Array.isArray(result)||!['valid','invalid','unknown'].includes(result.status)||typeof result.complete!=='boolean'||!Array.isArray(result.issues)||result.issues.some(i=>typeof i!=='string')||Object.keys(result).some(k=>!['status','complete','issues'].includes(k))||(result.status==='unknown'&&result.complete))return unknown('Malformed validator result');
   return {reference:ref,status:result.status,complete:result.complete,issues:result.issues};
  } catch {return unknown('Value validator failed; no validation conclusion available');}
 }
}
export function validateSemanticTypeValue(reference:SemanticTypeReference,value:Json,registry:SemanticTypeRegistry):SemanticTypeValueResult {return registry.check(reference,value);}
export function semanticTypesRegistry():Registry {
 return new Registry().register(semanticTypesPackage,(payload,context)=>{
  const annotation=payload as unknown as SemanticTypeAnnotation;
  const out:Diagnostic[]=[];
  const add=(code:string,path:string,message:string,severity:'error'|'warning')=>out.push({code,path:context.path+path,message,severity});
   for(const k of Object.keys(annotation))if(k!=='types')add('SEMANTIC_TYPE_UNKNOWN','/'+pointer(k),'Unknown annotation retained','warning');
  annotation.types.forEach((ref,i)=>{
   for(const k of Object.keys(ref))if(!['vocabulary','version','term'].includes(k))add('SEMANTIC_TYPE_UNKNOWN',`/types/${i}/${pointer(k)}`,'Unknown reference qualifier retained','warning');
  });
  // Schema validation establishes reference shape, never the referenced meaning.
  add('SEMANTIC_TYPE_EXTERNAL','','External semantic definitions and value validators are resolved separately','warning');
  return out;
 });
}
export function getSemanticTypes(document:Document,module:string,element:string):SemanticTypeAnnotation {
 const source=copyJson(document) as unknown as Document;
 if(source?.vocabularies?.[SEMANTIC_TYPES_EXTENSION]?.version!=='0.1.0')throw new UmfError('SEMANTIC_TYPE_PROFILE','Expected umf.semantic-types 0.1.0');
 const validation=validateDocument(source,semanticTypesRegistry());
 if(!validation.valid)throw new UmfError('SEMANTIC_TYPE_DOCUMENT',JSON.stringify(validation.diagnostics));
 const payload=source.modules.find(m=>m.id===module)?.elements.find(e=>e.id===element)?.extensions[SEMANTIC_TYPES_EXTENSION];
 if(!payload)throw new UmfError('SEMANTIC_TYPE_PROFILE','Missing semantic type annotation at requested element');
 return copyJson(payload) as unknown as SemanticTypeAnnotation;
}
/** Copy-on-write authoring; preserves native payloads and unfamiliar annotations. */
export function setSemanticTypes(document:Document,module:string,element:string,annotation:SemanticTypeAnnotation):Document {
 const candidate=copyJson(document) as unknown as Document;
 const existing=candidate.vocabularies[SEMANTIC_TYPES_EXTENSION];
 if(existing&&existing.version!=='0.1.0')throw new UmfError('SEMANTIC_TYPE_PROFILE','Cannot overwrite a different semantic type profile');
 const target=candidate.modules.find(m=>m.id===module)?.elements.find(e=>e.id===element);
 if(!target)throw new UmfError('SEMANTIC_TYPE_PROFILE','Missing requested element');
 candidate.vocabularies[SEMANTIC_TYPES_EXTENSION]=existing??{version:'0.1.0'};
 target.extensions[SEMANTIC_TYPES_EXTENSION]=copyJson(annotation) as Json;
 getSemanticTypes(candidate,module,element);
 return candidate;
}
