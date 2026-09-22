import {copyJson} from './json';
import {UmfError,type Document,type Json} from './types';
import {validateDocument} from '../validation/document';
import {validateFacetElement} from '../validation/facets';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import availability from '../../spec/core/nullability-document.schema.json';import containers from '../../spec/core/cardinality-document.schema.json';import facets from '../../spec/core/facet-document.schema.json';import schema from '../../spec/core/facet-operation.schema.json';
export {default as coreFacetOperationSchema} from '../../spec/core/facet-operation.schema.json';
export interface CoreFacetIdentity {module:string;element:string}
export interface CoreFacetPatch {length?:{max:number;unit:'unicode-scalar'|'byte'};precision?:number;scale?:number;integerWidth?:{bits:number;signed:boolean}}
export interface CoreFacets {length?:{max:number;unit:string;[key:string]:unknown};precision?:number;scale?:number;integerWidth?:{bits:number;signed:boolean;[key:string]:unknown};[key:string]:unknown}
export type CoreFacetMeaning={state:'missing'|'inapplicable'}|{state:'legacy';value:Json}|{state:'known'|'partial';facets:CoreFacets;interpreted:CoreFacetPatch;uninterpretedPaths:string[]};
export interface CoreFacetInspection {operation:'inspect-core-facets';version:'1.0.0';source:Document;identity:CoreFacetIdentity;path:string;meaning:CoreFacetMeaning;provenance:'unverified'}
export interface CoreFacetDeclaration {operation:'declare-core-facets';version:'1.0.0';source:Document;target:Document;identity:CoreFacetIdentity;request:CoreFacetPatch;provenance:{origin:'authored';idealPath:string;binding:{id:'umf.core.facets.authoring';version:'1.0.0'};basis:'explicit-author-declaration';nativePath:null}}
const validator=createValidator();for(const s of [legacy,fields,availability,containers,facets])validator.addSchema(s);
const check=validator.compile(schema),checkRequest=validator.compile({$defs:schema.$defs,$ref:'#/$defs/request'});
function finish<T>(value:T):T{const copied=copyJson(value);if(!check(copied))throw new UmfError('CORE_FACET_RESULT',JSON.stringify(check.errors));return copied as T;}
function locate(input:Document,identityInput:CoreFacetIdentity){
 const source=copyJson(input) as unknown as Document,identity=copyJson(identityInput) as unknown as CoreFacetIdentity;
 if(!identity||typeof identity!=='object'||Array.isArray(identity)||Object.keys(identity).some(k=>k!=='module'&&k!=='element')||typeof identity.module!=='string'||!identity.module||typeof identity.element!=='string'||!identity.element)throw new UmfError('CORE_FACET_IDENTITY','Expected explicit module and element identities');
 const validation=validateDocument(source);if(!validation.valid)throw new UmfError('CORE_FACET_SOURCE',JSON.stringify(validation.diagnostics));
 const mi=source.modules.findIndex(m=>m.id===identity.module),ei=source.modules[mi]?.elements.findIndex(e=>e.id===identity.element)??-1;
 if(mi<0||ei<0)throw new UmfError('CORE_FACET_MISSING','Element identity is absent');
 return {source,identity,mi,ei,element:source.modules[mi]!.elements[ei]!,path:`/modules/${mi}/elements/${ei}/facets`};
}
/** Copies known assertions separately from uninterpreted members; never infers authorship. */
export function inspectCoreFacets(input:Document,identity:CoreFacetIdentity):CoreFacetInspection {
 const located=locate(input,identity),{source,element,path}=located;let meaning:CoreFacetMeaning={state:'missing'};
 if(Object.hasOwn(element,'facets')){
  if(source.umf!=='0.5.0')meaning={state:'legacy',value:copyJson(element.facets)};
  else{
   const value=copyJson(element.facets) as unknown as CoreFacets,interpreted:CoreFacetPatch={};
   if(value.length&&(value.length.unit==='unicode-scalar'||value.length.unit==='byte'))interpreted.length={max:value.length.max,unit:value.length.unit};
   if(value.integerWidth)interpreted.integerWidth={bits:value.integerWidth.bits,signed:value.integerWidth.signed};
   if(value.precision!==undefined){interpreted.precision=value.precision;interpreted.scale=value.scale!;}
   const uninterpretedPaths=validateFacetElement(element,path.slice(0,-7)).diagnostics.filter(d=>d.severity==='warning').map(d=>d.path);
   meaning={state:uninterpretedPaths.length?'partial':'known',facets:value,interpreted,uninterpretedPaths};
  }
 }else if(source.umf==='0.5.0'&&element.kind!=='field')meaning={state:'inapplicable'};
 return finish({operation:'inspect-core-facets',version:'1.0.0',source,identity:located.identity,path,meaning,provenance:'unverified'});
}
/** Patch known groups only; omitted groups and unknown nested qualifiers remain attached. */
export function declareCoreFacets(input:Document,identity:CoreFacetIdentity,options:CoreFacetPatch):CoreFacetDeclaration {
 const request=copyJson(options) as unknown as CoreFacetPatch;
 if(!checkRequest(request))throw new UmfError('CORE_FACET_REQUEST',JSON.stringify(checkRequest.errors));
 const located=locate(input,identity),{source,element,mi,ei,path}=located;
 if(source.umf!=='0.5.0')throw new UmfError('CORE_FACET_VERSION','Explicit envelope migration is required before authoring facets');
 if(element.kind!=='field')throw new UmfError('CORE_FACET_ROLE','Facets apply only to a Field',path);
 const target=copyJson(source) as unknown as Document,value=copyJson(element.facets??{}) as unknown as CoreFacets;
 if(request.length){
  if(value.length&&!['unicode-scalar','byte'].includes(value.length.unit))throw new UmfError('CORE_FACET_UNKNOWN','Unknown length unit cannot be overwritten',path+'/length/unit');
  value.length={...value.length,...request.length};
 }
 if(request.integerWidth)value.integerWidth={...value.integerWidth,...request.integerWidth};
 if(request.precision!==undefined){value.precision=request.precision;value.scale=request.scale!;}
 target.modules[mi]!.elements[ei]!.facets=value;
 const validation=validateDocument(target);if(!validation.valid)throw new UmfError('CORE_FACET_CONFLICT',JSON.stringify(validation.diagnostics),path);
 return finish({operation:'declare-core-facets',version:'1.0.0',source,target,identity:located.identity,request,provenance:{origin:'authored',idealPath:path,binding:{id:'umf.core.facets.authoring',version:'1.0.0'},basis:'explicit-author-declaration',nativePath:null}});
}
const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
/** Receipt consistency and current-document check, not source authentication. */
export function verifyCoreFacetDeclaration(input:CoreFacetDeclaration,current:Document):CoreFacetDeclaration {
 const receipt=copyJson(input) as unknown as CoreFacetDeclaration;
 if(!check(receipt)||receipt.operation!=='declare-core-facets')throw new UmfError('CORE_FACET_RECEIPT','Malformed facet declaration');
 const expected=declareCoreFacets(receipt.source,receipt.identity,receipt.request);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('CORE_FACET_RECEIPT','Declaration differs from retained source/request');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('CORE_FACET_STALE','Document changed since facets were declared');
 return receipt;
}
