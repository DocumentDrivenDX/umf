import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic,type Nullability,type ExtensionPackage} from '../model/types';
import {type NativeJson,parseNativeJson,renderTree} from '../model/native-json';
import {verifyCoreNullabilityDeclaration,type CoreNullabilityDeclaration} from '../model/nullability';
import {exportAvroBundle,getAvroFieldMetadata,getAvroNode} from '../adapters/avro';
import {avroFieldAllowsNull} from './avro-availability-type';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import core from '../../spec/core/nullability-document.schema.json';
import authorSchema from '../../spec/core/nullability-operation.schema.json';
import nativeSchema from '../../spec/core/native-json.schema.json';
import schema from '../../spec/core/avro-nullability-classification.schema.json';
import manifest from '../../spec/extensions/avro-nullability/package.json';
export const AVRO_NULLABILITY_EXTENSION='umf.avro.nullability';
export const avroNullabilityPackage=manifest as unknown as ExtensionPackage;
export {default as avroNullabilityClassificationSchema} from '../../spec/core/avro-nullability-classification.schema.json';
export interface AvroNullabilityRequest {
 column:string;nativeSource:string;mode:'strict'|'report';scope:'underlying-field-value'|'reader-resolution'|'write-input'|'unresolved';carrier:'avro-null'|'unresolved';dependencies?:{id:string;schema:string}[];author?:CoreNullabilityDeclaration;
}
const binding=schema.properties.binding.const;
const recovery='Retain the complete source and native archive; unknown native meaning is not replaced by the core label' as const;
export interface AvroNullabilityClassification {
 operation:'classify-avro-nullability';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:AvroNullabilityRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;nativePath:string;dependencyId?:string;nativeFragment:NativeJson;nullability:Nullability;interpretation:'declared'|'unknown'|'unsupported';outcome:'exact'|'unknown'|'not-expressible';scope:AvroNullabilityRequest['scope'];carrier:AvroNullabilityRequest['carrier'];basis:'Underlying field type in a present containing record; not member omission, reader defaults, ancestor availability or logical refinements'};
 residuals:{path:string;value:Json;reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator();for(const s of [legacy,fields,core,authorSchema,nativeSchema])validator.addSchema(s);
const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k]!)).join(',')+'}':JSON.stringify(value);
export function classifyAvroNullability(input:Document,options:AvroNullabilityRequest):AvroNullabilityClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as AvroNullabilityRequest;
 if(!checkRequest(request))throw new UmfError('AVRO_NULLABILITY_REQUEST',JSON.stringify(checkRequest.errors));
 if(!validateDocument(source).valid||source.umf!=='0.3.0')throw new UmfError('AVRO_NULLABILITY_SOURCE','Valid core 0.3.0 required; migrate explicitly');
 const exported=exportAvroBundle(source);
 if(exported.schema!==renderTree(parseNativeJson(request.nativeSource))+'\n'||exported.dependencies.length!==(request.dependencies??[]).length||exported.dependencies.some((d,i)=>d.id!==request.dependencies![i]!.id||d.schema!==renderTree(parseNativeJson(request.dependencies![i]!.schema))+'\n'))throw new UmfError('AVRO_NULLABILITY_ARCHIVE','Native bundle differs from retained archive');
 const metadata=getAvroFieldMetadata(source).find(c=>c.element.id===request.column);
 if(!metadata)throw new UmfError('AVRO_NULLABILITY_COLUMN','Declared field not found',request.column);
 const mi=source.modules.findIndex(m=>m.id==='avro.fields'),ei=source.modules[mi]?.elements.findIndex(e=>e.id===metadata.element.id)??-1;
 if(mi<0||ei<0)throw new UmfError('AVRO_NULLABILITY_COLUMN','Derived column member is required');
 const element=source.modules[mi]!.elements[ei]!,nativeFragment=metadata.nativeField;
 if(nativeFragment.kind!=='object')throw new UmfError('AVRO_NULLABILITY_COLUMN','Expected native column object');
 const idealPath=`/modules/${mi}/elements/${ei}/nullability`,base=metadata.path+'/type';
 const result:AvroNullabilityClassification={operation:'classify-avro-nullability',version:'1.0.0',status:'classified',source,request,binding,mapping:{origin:'classified',idealPath,nativePath:base,...(metadata.dependencyId!==undefined?{dependencyId:metadata.dependencyId}:{}),nativeFragment,nullability:'unspecified',interpretation:'unknown',outcome:'unknown',scope:request.scope,carrier:request.carrier,basis:'Underlying field type in a present containing record; not member omission, reader defaults, ancestor availability or logical refinements'},residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string)=>result.residuals.push({path,value:copyJson(value),reason,recovery});
 let reason:string|undefined,allowsNull:boolean|undefined;
 if(request.scope!=='underlying-field-value')reason='Explicit underlying-field-value scope required; writer omission, reader resolution and ancestor availability remain separate';
 else if(request.carrier!=='avro-null')reason='Explicit Avro null-value carrier required; omitted members are not equated with null';
 else{
  try{allowsNull=avroFieldAllowsNull([...(request.dependencies??[]).map(d=>getAvroNode(source,'',d.id)),getAvroNode(source,'')],metadata.record,metadata.element.name!);}
  catch(error){if(!(error instanceof Error))throw error;reason='Underlying type/name structure is unresolved: '+error.message;result.mapping.interpretation='unsupported';result.mapping.outcome='not-expressible';}
 }
 if(reason)loss(base,nativeFragment,reason);
 else{result.mapping.nullability=allowsNull?'absent-allowed':'required';result.mapping.interpretation='declared';result.mapping.outcome='exact';}
 let conflict:string|undefined;
 if(element.kind!=='field')conflict='Selected native member must already be an explicit Field; this operation does not replace its kind';
 if(request.author!==undefined){
  try{
   const author=verifyCoreNullabilityDeclaration(request.author,source);
   if(author.identity.module!=='avro.fields'||author.identity.element!==element.id)conflict='Author receipt identifies a different member';
   else if(author.provenance.nullability!==result.mapping.nullability)conflict='Authored availability differs from the native observation; neither assertion may be overwritten';
  }catch(error){if(!(error instanceof UmfError))throw error;conflict='Author provenance is invalid or stale: '+error.code;}
 }else if(Object.hasOwn(element,'nullability'))conflict='Existing availability requires verified author provenance before native classification';
 if(Object.hasOwn(element.extensions,AVRO_NULLABILITY_EXTENSION))conflict='Existing binding scope cannot be overwritten; reclassify from its retained source';
 if(source.vocabularies[AVRO_NULLABILITY_EXTENSION]&&source.vocabularies[AVRO_NULLABILITY_EXTENSION]!.version!=='1.0.0')conflict='Existing binding vocabulary version is incompatible';
 if(conflict){loss(idealPath,Object.hasOwn(element,'nullability')?element.nullability:null,conflict);result.mapping.outcome='unknown';}
 if(conflict||request.mode==='strict'&&result.residuals.length)result.status='blocked';
 else{const target=copyJson(source) as unknown as Document;const selected=target.modules[mi]!.elements[ei]!;selected.nullability=result.mapping.nullability;
  target.vocabularies[AVRO_NULLABILITY_EXTENSION]??={version:'1.0.0'};
  selected.extensions[AVRO_NULLABILITY_EXTENSION]={origin:'classified',binding:{id:binding.id,version:binding.version},scope:request.scope,carrier:request.carrier,interpretation:result.mapping.interpretation,nativePath:result.mapping.nativePath,...(metadata.dependencyId!==undefined?{dependencyId:metadata.dependencyId}:{})};result.target=target;}
 result.diagnostics=result.residuals.map(r=>({code:r.path===idealPath?'AVRO_NULLABILITY_CONFLICT':'AVRO_NULLABILITY_UNRESOLVED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const copied=copyJson(result);if(!check(copied))throw new UmfError('AVRO_NULLABILITY_RESULT',JSON.stringify(check.errors));return copied as unknown as AvroNullabilityClassification;
}
/** Receipt consistency is not authentication; any model edit requires reclassification. */
export function verifyAvroNullabilityClassification(input:AvroNullabilityClassification,current:Document):AvroNullabilityClassification {
 const receipt=copyJson(input) as unknown as AvroNullabilityClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('AVRO_NULLABILITY_RECEIPT','Expected complete classified receipt');
 const expected=classifyAvroNullability(receipt.source,receipt.request);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('AVRO_NULLABILITY_RECEIPT','Receipt disagrees with retained source and selected binding');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('AVRO_NULLABILITY_STALE','Target changed after classification');
 return receipt;
}
/** Recover exact original schema bundle text, including unclaimed native content. */
export function recoverAvroNullabilityBundle(input:AvroNullabilityClassification,current:Document):{schema:string;dependencies:{id:string;schema:string}[]}{
 const receipt=verifyAvroNullabilityClassification(input,current);return {schema:receipt.request.nativeSource,dependencies:copyJson(receipt.request.dependencies??[]) as {id:string;schema:string}[]};
}
