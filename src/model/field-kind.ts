import {copyJson} from './json';
import {UmfError,ELEMENT_KINDS,type Document,type ElementKind,type Json} from './types';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import schema from '../../spec/core/kind-operation.schema.json';
import availability from '../../spec/core/nullability-document.schema.json';
import containers from '../../spec/core/cardinality-document.schema.json';
import schemaV3 from '../../spec/core/kind-operation-v3.schema.json';
export {default as coreKindOperationV3Schema} from '../../spec/core/kind-operation-v3.schema.json';
import schemaV2 from '../../spec/core/kind-operation-v2.schema.json';
export {default as coreKindOperationV2Schema} from '../../spec/core/kind-operation-v2.schema.json';
export {default as coreKindOperationSchema} from '../../spec/core/kind-operation.schema.json';
export interface CoreKindIdentity {module:string;element:string}
export type CoreKindMeaning={state:'known';kind:ElementKind}|{state:'unspecified'}|{state:'legacy';value:Json}|{state:'unknown';value:string};
export interface CoreKindInspection {operation:'inspect-core-kind';version:'1.0.0'|'2.0.0'|'3.0.0';source:Document;identity:CoreKindIdentity;path:string;meaning:CoreKindMeaning;provenance:'unverified'}
export interface CoreKindDeclaration {operation:'declare-core-kind';version:'1.0.0'|'2.0.0'|'3.0.0';source:Document;target:Document;identity:CoreKindIdentity;provenance:{origin:'authored';idealPath:string;kind:ElementKind;binding:{id:'umf.core.kind.authoring';version:'1.0.0'|'2.0.0'|'3.0.0'};basis:'explicit-author-declaration';nativePath:null}}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);validator.addSchema(availability);validator.addSchema(containers);const checkV1=validator.compile(schema),checkV2=validator.compile(schemaV2),checkV3=validator.compile(schemaV3);
const checker=(version:unknown)=>version==='3.0.0'?checkV3:version==='2.0.0'?checkV2:checkV1;
function finish<T extends {version:string}>(value:T):T {const result=copyJson(value),check=checker(value.version);if(!check(result))throw new UmfError('CORE_KIND_RESULT',JSON.stringify(check.errors));return result as T;}
function locate(input:Document,identityInput:CoreKindIdentity){
 const source=copyJson(input) as unknown as Document,identity=copyJson(identityInput) as unknown as CoreKindIdentity;
 if(!identity||typeof identity!=='object'||Array.isArray(identity)||Object.keys(identity).some(k=>k!=='module'&&k!=='element')||typeof identity.module!=='string'||!identity.module||typeof identity.element!=='string'||!identity.element)throw new UmfError('CORE_KIND_IDENTITY','Expected explicit module and element identities');
 const validation=validateDocument(source);if(!validation.valid)throw new UmfError('CORE_KIND_SOURCE',JSON.stringify(validation.diagnostics));
 const mi=source.modules.findIndex(m=>m.id===identity.module),ei=source.modules[mi]?.elements.findIndex(e=>e.id===identity.element)??-1;
 if(mi<0||ei<0)throw new UmfError('CORE_KIND_MISSING','Element identity is absent');
 return {source,identity,mi,ei,element:source.modules[mi]!.elements[ei]!,path:`/modules/${mi}/elements/${ei}/kind`};
}
/** Read a role without inventing author/classifier provenance or interpreting legacy collisions. */
export function inspectCoreElementKind(input:Document,identity:CoreKindIdentity):CoreKindInspection {
 const located=locate(input,identity);const {source,element,path}=located;
 let meaning:CoreKindMeaning={state:'unspecified'};
 if(Object.hasOwn(element,'kind')){
  if(source.umf==='0.1.0')meaning={state:'legacy',value:copyJson(element.kind)};
  else if((ELEMENT_KINDS as readonly unknown[]).includes(element.kind))meaning={state:'known',kind:element.kind as ElementKind};
  else meaning={state:'unknown',value:element.kind as string};
 }
 return finish({operation:'inspect-core-kind',version:source.umf==='0.4.0'?'3.0.0':source.umf==='0.3.0'?'2.0.0':'1.0.0',source,identity:located.identity,path,meaning,provenance:'unverified'});
}
/** Explicit author action; archives previous meaning and makes no native classification claim. */
export function declareCoreElementKind(input:Document,identity:CoreKindIdentity,kind:ElementKind):CoreKindDeclaration {
 const located=locate(input,identity);const {source,element,mi,ei,path}=located;
 if(source.umf!=='0.2.0'&&source.umf!=='0.3.0'&&source.umf!=='0.4.0')throw new UmfError('CORE_KIND_VERSION','Explicit envelope migration is required before authoring kind');
 if(!(ELEMENT_KINDS as readonly unknown[]).includes(kind))throw new UmfError('CORE_KIND_VALUE','Expected field, record or group',path);
 if(Object.hasOwn(element,'kind')&&!(ELEMENT_KINDS as readonly unknown[]).includes(element.kind))throw new UmfError('CORE_KIND_UNKNOWN','Unknown kind cannot be overwritten by this operation',path);
 const target=copyJson(source) as unknown as Document;target.modules[mi]!.elements[ei]!.kind=kind;
 const validation=validateDocument(target);if(!validation.valid)throw new UmfError('CORE_KIND_CONFLICT',JSON.stringify(validation.diagnostics),path);
 return finish({operation:'declare-core-kind',version:source.umf==='0.4.0'?'3.0.0':source.umf==='0.3.0'?'2.0.0':'1.0.0',source,target,identity:located.identity,provenance:{origin:'authored',idealPath:path,kind,binding:{id:'umf.core.kind.authoring',version:source.umf==='0.4.0'?'3.0.0':source.umf==='0.3.0'?'2.0.0':'1.0.0'},basis:'explicit-author-declaration',nativePath:null}});
}
/** Revalidate a retained declaration before relying on its provenance. Any model change requires a new declaration. */
export function verifyCoreKindDeclaration(input:CoreKindDeclaration,current:Document):CoreKindDeclaration {
 const receipt=copyJson(input) as unknown as CoreKindDeclaration;
 if(!checker(receipt?.version)(receipt)||receipt.operation!=='declare-core-kind')throw new UmfError('CORE_KIND_RECEIPT','Malformed kind declaration');
 const expected=declareCoreElementKind(receipt.source,receipt.identity,receipt.provenance.kind);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('CORE_KIND_RECEIPT','Declaration does not match its archived input');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('CORE_KIND_STALE','Document changed since kind was declared');
 return receipt;
}
