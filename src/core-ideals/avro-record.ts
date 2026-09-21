import {avroRecords} from './avro-records';
import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic} from '../model/types';
import {type CoreKindDeclaration,verifyCoreKindDeclaration} from '../model/field-kind';
import {classifyAvroField,type AvroFieldClassification} from './avro-field';
import {getAvroFieldMetadata,exportAvroBundle} from '../adapters/avro';
import {parseNativeJson,renderTree} from '../model/native-json';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import kinds from '../../spec/core/kind-operation.schema.json';import schema from '../../spec/core/avro-record-classification.schema.json';
export {default as avroRecordClassificationSchema} from '../../spec/core/avro-record-classification.schema.json';
export interface AvroRecordRequest {recordModule:string;recordId:string;mode:'strict'|'report';nativeSource:string;path:string;dependencyId?:string;dependencies?:{id:string;schema:string}[];authors?:CoreKindDeclaration[]}
const binding={id:'umf.avro.record',version:'1.0.0',nativeVersion:'1.12.0',subset:'Declared record/error with ordered fields and dependency-qualified identity; no value-domain or logical-type equivalence'} as const;
type Mapping=Omit<AvroFieldClassification['mapping'],'kind'|'basis'>&{kind:'field'|'record';basis:'checked-record-field-membership'|'checked-record-declaration'};
export interface AvroRecordClassification {
 operation:'classify-avro-record';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:AvroRecordRequest;binding:typeof binding;mappings:Mapping[];
 residuals:{path:string;value:Json;reason:string;recovery:'Source and native fragments retained; resolve conflict then recompute whole record classification'}[];diagnostics:Diagnostic[];
}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);validator.addSchema(kinds);const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
export function classifyAvroRecord(input:Document,options:AvroRecordRequest):AvroRecordClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as AvroRecordRequest;
 if(!checkRequest(request))throw new UmfError('AVRO_RECORD_REQUEST',JSON.stringify(checkRequest.errors));
 if(!validateDocument(source).valid||source.umf!=='0.2.0')throw new UmfError('AVRO_RECORD_VERSION','Explicitly migrated valid envelope required');
 const exported=exportAvroBundle(source);
 if(exported.schema!==renderTree(parseNativeJson(request.nativeSource))+'\n'||exported.dependencies.length!==(request.dependencies??[]).length||exported.dependencies.some((dep,i)=>dep.id!==request.dependencies![i]!.id||dep.schema!==renderTree(parseNativeJson(request.dependencies![i]!.schema))+'\n'))throw new UmfError('AVRO_RECORD_ARCHIVE','Native bundle archive differs from retained schemas');
 const declaration=avroRecords(source).find(r=>r.path===request.path&&r.dependencyId===request.dependencyId);if(!declaration)throw new UmfError('AVRO_RECORD_IDENTITY','Selected record declaration is missing');
 const native=declaration.native,nativePath=declaration.path,mi=source.modules.findIndex(m=>m.id==='avro.fields');if(mi<0)throw new UmfError('AVRO_RECORD_METADATA','Derived field module is required');
 const columns=getAvroFieldMetadata(source).filter(c=>c.dependencyId===request.dependencyId&&c.record===declaration.fullname);
 const result:AvroRecordClassification={operation:'classify-avro-record',version:'1.0.0',status:'classified',source,request,binding,mappings:[],residuals:[],diagnostics:[]};
 const block=(code:string,path:string,value:unknown,reason:string)=>{result.status='blocked';result.residuals.push({path,value:copyJson(value),reason,recovery:'Source and native fragments retained; resolve conflict then recompute whole record classification'});result.diagnostics.push({code,path,message:reason,severity:'error'});};
 if(source.modules.some(m=>m.id===request.recordModule))block('RECORD_IDENTITY_COLLISION','/modules',request.recordModule,'Requested record module already exists; no merge is implied');
 const authors=new Map<string,CoreKindDeclaration>();
 for(const author of request.authors??[]){
  try{verifyCoreKindDeclaration(author,source);}catch(error){if(!(error instanceof UmfError))throw error;block('STALE_AUTHOR',author.provenance.idealPath,author,'Author receipt differs from source: '+error.code);continue;}
  if(author.identity.module!=='avro.fields'||!columns.some(c=>c.element.id===author.identity.element)||authors.has(author.identity.element))block('AUTHOR_IDENTITY',author.provenance.idealPath,author,'Duplicate or unrelated member author receipt');else authors.set(author.identity.element,author);
 }
 for(const column of columns){const author=authors.get(column.element.id),classified=classifyAvroField(source,{column:column.element.id,nativeSource:request.nativeSource,dependencies:request.dependencies??[],mode:request.mode,...(author?{author}:{})});result.mappings.push(classified.mapping);for(const residual of classified.residuals)block('FIELD_KIND_CONFLICT',residual.path,residual.value,residual.reason);}
 const recordPath=`/modules/${source.modules.length}/elements/0`;
 result.mappings.push({origin:'classified',kind:'record',idealPath:recordPath+'/kind',nativePath,...(request.dependencyId!==undefined?{dependencyId:request.dependencyId}:{}),nativeFragment:copyJson(native),basis:'checked-record-declaration',outcome:result.status==='classified'?'exact':'unknown'});
 if(result.status==='classified'){
  const target=copyJson(source) as unknown as Document,ids=new Set(columns.map(c=>c.element.id));for(const element of target.modules[mi]!.elements)if(ids.has(element.id))element.kind='field';
  target.modules.push({id:request.recordModule,namespace:declaration.namespace,elements:[{id:request.recordId,name:declaration.name,kind:'record',extensions:{},references:columns.map(c=>({role:'member',module:'avro.fields',element:c.element.id}))}]});
  const validation=validateDocument(target);if(!validation.valid)throw new UmfError('AVRO_RECORD_TARGET',JSON.stringify(validation.diagnostics));result.target=target;
 }
 const output=copyJson(result);if(!check(output))throw new UmfError('AVRO_RECORD_RESULT',JSON.stringify(check.errors));return output as unknown as AvroRecordClassification;
}
export function recoverAvroRecordBundle(input:AvroRecordClassification,current:Document):{schema:string;dependencies:{id:string;schema:string}[]} {
 const receipt=copyJson(input) as unknown as AvroRecordClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('AVRO_RECORD_RECEIPT','Expected complete classification receipt');
 const expected=classifyAvroRecord(receipt.source,receipt.request);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('AVRO_RECORD_RECEIPT','Receipt differs from recomputation');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('AVRO_RECORD_STALE','Current model changed');return {schema:receipt.request.nativeSource,dependencies:copyJson(receipt.request.dependencies??[]) as {id:string;schema:string}[]};
}
