import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic} from '../model/types';
import {verifyCoreKindDeclaration,type CoreKindDeclaration} from '../model/field-kind';
import {getAvroFieldMetadata,exportAvroBundle} from '../adapters/avro';
import {parseNativeJson,renderTree} from '../model/native-json';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import kinds from '../../spec/core/kind-operation.schema.json';import schema from '../../spec/core/avro-field-classification.schema.json';
export {default as avroFieldClassificationSchema} from '../../spec/core/avro-field-classification.schema.json';
export interface AvroFieldRequest {column:string;nativeSource:string;dependencies?:{id:string;schema:string}[];mode:'strict'|'report';author?:CoreKindDeclaration}
const binding={id:'umf.avro.field',version:'1.0.0',nativeVersion:'1.12.0',subset:'Declared record/error field membership with named dependencies; logical refinements, presence and value-domain equivalence excluded'} as const;
export interface AvroFieldClassification {
 operation:'classify-avro-field';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:AvroFieldRequest;binding:typeof binding;
 mapping:{origin:'classified';kind:'field';idealPath:string;nativePath:string;dependencyId?:string;nativeFragment:Json;basis:'checked-record-field-membership';outcome:'exact'|'unknown'};
 residuals:{path:string;value:Json;reason:string;recovery:'Original assertion and native fragment retained in source; reclassify with corrected provenance'}[];diagnostics:Diagnostic[];
}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);validator.addSchema(kinds);const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
/** Native paths are JSON pointers into the retained capture text, not pointers into the tagged UMF encoding. */
export function classifyAvroField(input:Document,options:AvroFieldRequest):AvroFieldClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as AvroFieldRequest;
 if(!checkRequest(request))throw new UmfError('AVRO_FIELD_REQUEST',JSON.stringify(checkRequest.errors));
 if(!validateDocument(source).valid||source.umf!=='0.2.0')throw new UmfError('AVRO_FIELD_VERSION','Explicitly migrated valid envelope required');
 const exported=exportAvroBundle(source);
 if(exported.schema!==renderTree(parseNativeJson(request.nativeSource))+'\n'||exported.dependencies.length!==(request.dependencies??[]).length||exported.dependencies.some((dep,i)=>dep.id!==request.dependencies![i]!.id||dep.schema!==renderTree(parseNativeJson(request.dependencies![i]!.schema))+'\n'))throw new UmfError('AVRO_FIELD_ARCHIVE','Native bundle archive differs from retained schemas');
 const metadata=getAvroFieldMetadata(source).find(c=>c.element.id===request.column);
 if(!metadata)throw new UmfError('AVRO_FIELD_COLUMN','Declared field identity not found',request.column);
 const mi=source.modules.findIndex(m=>m.id==='avro.fields'),ei=source.modules[mi]?.elements.findIndex(e=>e.id===metadata.element.id)??-1;
 if(mi<0||ei<0)throw new UmfError('AVRO_FIELD_METADATA','Derived field module is required');
 const element=source.modules[mi]!.elements[ei]!,idealPath=`/modules/${mi}/elements/${ei}/kind`;
 const result:AvroFieldClassification={operation:'classify-avro-field',version:'1.0.0',status:'classified',source,request,binding,mapping:{origin:'classified',kind:'field',idealPath,nativePath:metadata.path,...(metadata.dependencyId!==undefined?{dependencyId:metadata.dependencyId}:{}),nativeFragment:copyJson(metadata.nativeField),basis:'checked-record-field-membership',outcome:'exact'},residuals:[],diagnostics:[]};
 let reason:string|undefined;
 if(request.author!==undefined){try{const author=verifyCoreKindDeclaration(request.author,source);if(author.identity.module!=='avro.fields'||author.identity.element!==element.id)reason='Author receipt identifies another field';else if(author.provenance.kind!=='field')reason='Authored kind conflicts with native record field membership';}catch(error){if(!(error instanceof UmfError))throw error;reason='Invalid or stale author provenance: '+error.code;}}
 else if(Object.hasOwn(element,'kind'))reason='Existing kind needs verified author provenance; native observation cannot replace it';
 if(reason){result.status='blocked';result.mapping.outcome='unknown';result.residuals.push({path:idealPath,value:Object.hasOwn(element,'kind')?copyJson(element.kind):null,reason,recovery:'Original assertion and native fragment retained in source; reclassify with corrected provenance'});result.diagnostics.push({code:'AVRO_FIELD_CONFLICT',path:idealPath,message:reason,severity:'error'});}
 else {const target=copyJson(source) as unknown as Document;target.modules[mi]!.elements[ei]!.kind='field';result.target=target;}
 const output=copyJson(result);if(!check(output))throw new UmfError('AVRO_FIELD_RESULT',JSON.stringify(check.errors));return output as unknown as AvroFieldClassification;
}
export function recoverAvroFieldBundle(input:AvroFieldClassification,current:Document):{schema:string;dependencies:{id:string;schema:string}[]} {
 const receipt=copyJson(input) as unknown as AvroFieldClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('AVRO_FIELD_RECEIPT','Expected complete classified receipt');
 const expected=classifyAvroField(receipt.source,receipt.request);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('AVRO_FIELD_RECEIPT','Receipt disagrees with native basis');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('AVRO_FIELD_STALE','Current model changed; recompute classification');
 return {schema:receipt.request.nativeSource,dependencies:copyJson(receipt.request.dependencies??[]) as {id:string;schema:string}[]};
}
