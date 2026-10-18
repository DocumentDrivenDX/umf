import {CURRENT_CORE_VERSION} from '../generated/core-model';
import {copyJson} from './json';
import {UmfError,type Document,type Element} from './types';
import {validateDocument} from '../validation/document';
import {keyMeaning,facetMeaning,schemaProperties} from './internal/inspection-meanings';
import type {CoreRecordIdentity} from './keys';

/** Invocation-owned metadata only; snapshot reference identifies the exact retained source. */
export function prepareCoreInspection(input:Document) {
 const source=copyJson(input) as unknown as Document;
 const validation=validateDocument(source);
 if(source.umf!==CURRENT_CORE_VERSION||!validation.valid)throw new UmfError('CORE_INSPECTION_SOURCE','Expected valid current core 0.10.0 source');
 const elements=new Map<string,{element:Element;path:string}>();
 for(const [mi,module] of source.modules.entries())for(const [ei,element] of module.elements.entries())elements.set(JSON.stringify([module.id,element.id]),{element,path:`/modules/${mi}/elements/${ei}`});
 const freeze=(v:unknown):void=>{if(v!==null&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}};
 freeze(source);freeze(validation);
 const locate=(input:CoreRecordIdentity)=>{
  const identity=copyJson(input) as unknown as CoreRecordIdentity;
  if(!identity||typeof identity!=='object'||Array.isArray(identity)||Object.keys(identity).length!==2||Object.keys(identity).some(k=>k!=='module'&&k!=='element')||typeof identity.module!=='string'||!identity.module||typeof identity.element!=='string'||!identity.element)throw new UmfError('CORE_INSPECTION_IDENTITY','Expected exact module and element identity');
  const found=elements.get(JSON.stringify([identity.module,identity.element]));
  if(!found)throw new UmfError('CORE_INSPECTION_MISSING','Element identity does not resolve');
  return {source,validation,...found};
 };
 return Object.freeze({operation:'prepare-core-inspection' as const,version:'1.0.0' as const,source,provenance:'unverified' as const,
  keys:(identity:CoreRecordIdentity)=>keyMeaning(locate(identity)),
  facets:(identity:CoreRecordIdentity)=>facetMeaning(locate(identity)),
  schemaProperties:(identity:CoreRecordIdentity)=>schemaProperties(locate(identity).element),
 });
}
