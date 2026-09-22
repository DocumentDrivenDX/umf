import facets from '../../spec/core/facet-document.schema.json';
import schemaV3 from '../../spec/core/nullability-operation-v3.schema.json';
export {default as coreNullabilityOperationV3Schema} from '../../spec/core/nullability-operation-v3.schema.json';
import {copyJson} from './json';
import {UmfError,NULLABILITIES,type Document,type Nullability,type Json} from './types';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import availability from '../../spec/core/nullability-document.schema.json';
import schema from '../../spec/core/nullability-operation.schema.json';
import containers from '../../spec/core/cardinality-document.schema.json';
import schemaV2 from '../../spec/core/nullability-operation-v2.schema.json';
export {default as coreNullabilityOperationV2Schema} from '../../spec/core/nullability-operation-v2.schema.json';
export {default as coreNullabilityOperationSchema} from '../../spec/core/nullability-operation.schema.json';
export interface CoreNullabilityIdentity {module:string;element:string}
export type CoreNullabilityMeaning={state:'known';nullability:Nullability}|{state:'missing'}|{state:'inapplicable'}|{state:'legacy';value:Json}|{state:'unknown';value:string};
export interface CoreNullabilityInspection {operation:'inspect-core-nullability';version:'1.0.0'|'2.0.0'|'3.0.0';source:Document;identity:CoreNullabilityIdentity;path:string;meaning:CoreNullabilityMeaning;provenance:'unverified'}
export interface CoreNullabilityDeclaration {operation:'declare-core-nullability';version:'1.0.0'|'2.0.0'|'3.0.0';source:Document;target:Document;identity:CoreNullabilityIdentity;provenance:{origin:'authored';idealPath:string;nullability:Nullability;binding:{id:'umf.core.nullability.authoring';version:'1.0.0'|'2.0.0'|'3.0.0'};basis:'explicit-author-declaration';nativePath:null}}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);validator.addSchema(availability);validator.addSchema(containers);validator.addSchema(facets);const checkV1=validator.compile(schema),checkV2=validator.compile(schemaV2),checkV3=validator.compile(schemaV3);
const checker=(version:unknown)=>version==='3.0.0'?checkV3:version==='2.0.0'?checkV2:checkV1;
function finish<T extends {version:string}>(value:T):T {const result=copyJson(value),check=checker(value.version);if(!check(result))throw new UmfError('CORE_NULLABILITY_RESULT',JSON.stringify(check.errors));return result as T;}
function locate(input:Document,identityInput:CoreNullabilityIdentity){
 const source=copyJson(input) as unknown as Document,identity=copyJson(identityInput) as unknown as CoreNullabilityIdentity;
 if(!identity||typeof identity!=='object'||Array.isArray(identity)||Object.keys(identity).some(k=>k!=='module'&&k!=='element')||typeof identity.module!=='string'||!identity.module||typeof identity.element!=='string'||!identity.element)throw new UmfError('CORE_NULLABILITY_IDENTITY','Expected explicit module and element identities');
 const validation=validateDocument(source);if(!validation.valid)throw new UmfError('CORE_NULLABILITY_SOURCE',JSON.stringify(validation.diagnostics));
 const mi=source.modules.findIndex(m=>m.id===identity.module),ei=source.modules[mi]?.elements.findIndex(e=>e.id===identity.element)??-1;
 if(mi<0||ei<0)throw new UmfError('CORE_NULLABILITY_MISSING','Element identity is absent');
 return {source,identity,mi,ei,element:source.modules[mi]!.elements[ei]!,path:`/modules/${mi}/elements/${ei}/nullability`};
}
/** Inspect availability without inferring a native absence carrier or provenance. */
export function inspectCoreNullability(input:Document,identity:CoreNullabilityIdentity):CoreNullabilityInspection {
 const located=locate(input,identity);const {source,element,path}=located;
 let meaning:CoreNullabilityMeaning={state:'missing'};
 if(Object.hasOwn(element,'nullability')){
  if(source.umf!=='0.3.0'&&source.umf!=='0.4.0'&&source.umf!=='0.5.0')meaning={state:'legacy',value:copyJson(element.nullability)};
  else if((NULLABILITIES as readonly unknown[]).includes(element.nullability))meaning={state:'known',nullability:element.nullability as Nullability};
  else meaning={state:'unknown',value:element.nullability as string};
 }else if((source.umf==='0.3.0'||source.umf==='0.4.0'||source.umf==='0.5.0')&&element.kind!=='field')meaning={state:'inapplicable'};
 return finish({operation:'inspect-core-nullability',version:source.umf==='0.5.0'?'3.0.0':source.umf==='0.4.0'?'2.0.0':'1.0.0',source,identity:located.identity,path,meaning,provenance:'unverified'});
}
/** Explicit author action; archives previous meaning and makes no native classification claim. */
export function declareCoreNullability(input:Document,identity:CoreNullabilityIdentity,nullability:Nullability):CoreNullabilityDeclaration {
 const located=locate(input,identity);const {source,element,mi,ei,path}=located;
 if(source.umf!=='0.3.0'&&source.umf!=='0.4.0'&&source.umf!=='0.5.0')throw new UmfError('CORE_NULLABILITY_VERSION','Explicit envelope migration is required before authoring nullability');
 if(element.kind!=='field')throw new UmfError('CORE_NULLABILITY_ROLE','Availability applies only to an explicit Field',path);
 if(!(NULLABILITIES as readonly unknown[]).includes(nullability))throw new UmfError('CORE_NULLABILITY_VALUE','Expected required, absent-allowed or unspecified',path);
 if(Object.hasOwn(element,'nullability')&&!(NULLABILITIES as readonly unknown[]).includes(element.nullability))throw new UmfError('CORE_NULLABILITY_UNKNOWN','Unknown nullability cannot be overwritten by this operation',path);
 const target=copyJson(source) as unknown as Document;target.modules[mi]!.elements[ei]!.nullability=nullability;
 const validation=validateDocument(target);if(!validation.valid)throw new UmfError('CORE_NULLABILITY_CONFLICT',JSON.stringify(validation.diagnostics),path);
 return finish({operation:'declare-core-nullability',version:source.umf==='0.5.0'?'3.0.0':source.umf==='0.4.0'?'2.0.0':'1.0.0',source,target,identity:located.identity,provenance:{origin:'authored',idealPath:path,nullability,binding:{id:'umf.core.nullability.authoring',version:source.umf==='0.5.0'?'3.0.0':source.umf==='0.4.0'?'2.0.0':'1.0.0'},basis:'explicit-author-declaration',nativePath:null}});
}
/** Revalidate a retained declaration before relying on its provenance. Any model change requires a new declaration. */
export function verifyCoreNullabilityDeclaration(input:CoreNullabilityDeclaration,current:Document):CoreNullabilityDeclaration {
 const receipt=copyJson(input) as unknown as CoreNullabilityDeclaration;
 if(!checker(receipt?.version)(receipt)||receipt.operation!=='declare-core-nullability')throw new UmfError('CORE_NULLABILITY_RECEIPT','Malformed nullability declaration');
 const expected=declareCoreNullability(receipt.source,receipt.identity,receipt.provenance.nullability);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('CORE_NULLABILITY_RECEIPT','Declaration does not match its archived input');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('CORE_NULLABILITY_STALE','Document changed since nullability was declared');
 return receipt;
}
