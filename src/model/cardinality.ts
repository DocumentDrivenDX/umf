import facets from '../../spec/core/facet-document.schema.json';
import schemaV2 from '../../spec/core/cardinality-operation-v2.schema.json';
export {default as coreCardinalityOperationV2Schema} from '../../spec/core/cardinality-operation-v2.schema.json';
import {copyJson} from './json';
import {UmfError,CARDINALITIES,type Document,type Cardinality,type CoreItemTypeReference,type Json} from './types';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import availability from '../../spec/core/nullability-document.schema.json';
import containers from '../../spec/core/cardinality-document.schema.json';
import schema from '../../spec/core/cardinality-operation.schema.json';
export {default as coreCardinalityOperationSchema} from '../../spec/core/cardinality-operation.schema.json';
export interface CoreCardinalityIdentity {module:string;element:string}
export type CoreCardinalityMeaning={state:'known';cardinality:Cardinality;itemType?:CoreItemTypeReference}|{state:'missing'}|{state:'inapplicable'}|{state:'legacy';value:Json}|{state:'unknown';value:string};
export interface CoreCardinalityInspection {operation:'inspect-core-cardinality';version:'1.0.0'|'2.0.0';source:Document;identity:CoreCardinalityIdentity;path:string;meaning:CoreCardinalityMeaning;provenance:'unverified'}
export interface CoreCardinalityRequest {cardinality:Cardinality;itemType?:CoreItemTypeReference|null}
export interface CoreCardinalityDeclaration {operation:'declare-core-cardinality';version:'1.0.0'|'2.0.0';source:Document;target:Document;identity:CoreCardinalityIdentity;request:CoreCardinalityRequest;provenance:{origin:'authored';idealPath:string;cardinality:Cardinality;binding:{id:'umf.core.cardinality.authoring';version:'1.0.0'|'2.0.0'};basis:'explicit-author-declaration';nativePath:null}}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);validator.addSchema(availability);validator.addSchema(containers);validator.addSchema(facets);const checkV1=validator.compile(schema),checkV2=validator.compile(schemaV2);const checker=(version:unknown)=>version==='2.0.0'?checkV2:checkV1;const checkRequest=validator.compile({$defs:schema.$defs,$ref:"#/$defs/request"});
function finish<T extends {version:string}>(value:T):T {const result=copyJson(value),check=checker(value.version);if(!check(result))throw new UmfError('CORE_CARDINALITY_RESULT',JSON.stringify(check.errors));return result as T;}
function locate(input:Document,identityInput:CoreCardinalityIdentity){
 const source=copyJson(input) as unknown as Document,identity=copyJson(identityInput) as unknown as CoreCardinalityIdentity;
 if(!identity||typeof identity!=='object'||Array.isArray(identity)||Object.keys(identity).some(k=>k!=='module'&&k!=='element')||typeof identity.module!=='string'||!identity.module||typeof identity.element!=='string'||!identity.element)throw new UmfError('CORE_CARDINALITY_IDENTITY','Expected explicit module and element identities');
 const validation=validateDocument(source);if(!validation.valid)throw new UmfError('CORE_CARDINALITY_SOURCE',JSON.stringify(validation.diagnostics));
 const mi=source.modules.findIndex(m=>m.id===identity.module),ei=source.modules[mi]?.elements.findIndex(e=>e.id===identity.element)??-1;
 if(mi<0||ei<0)throw new UmfError('CORE_CARDINALITY_MISSING','Element identity is absent');
 return {source,identity,mi,ei,element:source.modules[mi]!.elements[ei]!,path:`/modules/${mi}/elements/${ei}/cardinality`};
}
/** Inspect ideal container/item meaning without inferring native shape or author provenance. */
export function inspectCoreCardinality(input:Document,identity:CoreCardinalityIdentity):CoreCardinalityInspection {
 const located=locate(input,identity);const {source,element,path}=located;
 let meaning:CoreCardinalityMeaning={state:'missing'};
 if(Object.hasOwn(element,'cardinality')){
  if(source.umf!=='0.4.0'&&source.umf!=='0.5.0')meaning={state:'legacy',value:copyJson(element.cardinality)};
  else if((CARDINALITIES as readonly unknown[]).includes(element.cardinality))meaning={state:'known',cardinality:element.cardinality as Cardinality,...(Object.hasOwn(element,'itemType')?{itemType:copyJson(element.itemType) as unknown as CoreItemTypeReference}:{})};
  else meaning={state:'unknown',value:element.cardinality as string};
 }else if((source.umf==='0.4.0'||source.umf==='0.5.0')&&element.kind!=='field')meaning={state:'inapplicable'};
 return finish({operation:'inspect-core-cardinality',version:source.umf==='0.5.0'?'2.0.0':'1.0.0',source,identity:located.identity,path,meaning,provenance:'unverified'});
}
/** Explicit author action; archives previous meaning and makes no native classification claim. */
export function declareCoreCardinality(input:Document,identity:CoreCardinalityIdentity,options:CoreCardinalityRequest):CoreCardinalityDeclaration {
 const request=copyJson(options) as unknown as CoreCardinalityRequest;
 if(!checkRequest(request))throw new UmfError("CORE_CARDINALITY_REQUEST",JSON.stringify(checkRequest.errors));
 const cardinality=request.cardinality;
 const located=locate(input,identity);const {source,element,mi,ei,path}=located;
 if(source.umf!=='0.4.0'&&source.umf!=='0.5.0')throw new UmfError('CORE_CARDINALITY_VERSION','Explicit envelope migration is required before authoring cardinality');
 if(element.kind!=='field')throw new UmfError('CORE_CARDINALITY_ROLE','Cardinality applies only to an explicit Field',path);
 if(!(CARDINALITIES as readonly unknown[]).includes(cardinality))throw new UmfError('CORE_CARDINALITY_VALUE','Expected one, array, map or unspecified',path);
 if(Object.hasOwn(element,'cardinality')&&!(CARDINALITIES as readonly unknown[]).includes(element.cardinality))throw new UmfError('CORE_CARDINALITY_UNKNOWN','Unknown cardinality cannot be overwritten by this operation',path);
 const target=copyJson(source) as unknown as Document;target.modules[mi]!.elements[ei]!.cardinality=cardinality;
 if(Object.hasOwn(request,'itemType')){
  if(request.itemType===null)delete target.modules[mi]!.elements[ei]!.itemType;
  else target.modules[mi]!.elements[ei]!.itemType=copyJson(request.itemType);
 }
 const validation=validateDocument(target);if(!validation.valid)throw new UmfError('CORE_CARDINALITY_CONFLICT',JSON.stringify(validation.diagnostics),path);
 return finish({operation:'declare-core-cardinality',version:source.umf==='0.5.0'?'2.0.0':'1.0.0',source,target,identity:located.identity,request,provenance:{origin:'authored',idealPath:path,cardinality,binding:{id:'umf.core.cardinality.authoring',version:source.umf==='0.5.0'?'2.0.0':'1.0.0'},basis:'explicit-author-declaration',nativePath:null}});
}
/** Revalidate a retained declaration before relying on its provenance. Any model change requires a new declaration. */
export function verifyCoreCardinalityDeclaration(input:CoreCardinalityDeclaration,current:Document):CoreCardinalityDeclaration {
 const receipt=copyJson(input) as unknown as CoreCardinalityDeclaration;
 if(!checker(receipt?.version)(receipt)||receipt.operation!=='declare-core-cardinality')throw new UmfError('CORE_CARDINALITY_RECEIPT','Malformed cardinality declaration');
 const expected=declareCoreCardinality(receipt.source,receipt.identity,receipt.request);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('CORE_CARDINALITY_RECEIPT','Declaration does not match its archived input');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('CORE_CARDINALITY_STALE','Document changed since cardinality was declared');
 return receipt;
}
