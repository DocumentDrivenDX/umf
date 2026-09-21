import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic} from '../model/types';
import {verifyCoreKindDeclaration,type CoreKindDeclaration} from '../model/field-kind';
import {exportParquetCapture} from '../adapters/parquet';
import {getParquetFieldMetadata} from '../adapters/parquet/field-metadata';
import {inspectParquetContainers} from '../adapters/parquet/containers';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import kinds from '../../spec/core/kind-operation.schema.json';
import schema from '../../spec/core/parquet-field-classification.schema.json';
export {default as parquetFieldClassificationSchema} from '../../spec/core/parquet-field-classification.schema.json';
export interface ParquetFieldRequest {index:number;mode:'strict'|'report';author?:CoreKindDeclaration}
const binding={id:'umf.parquet.field',version:'1.0.0',nativeVersion:'parquet-format@219e3f12a62f9476e830c21e26d030d231f7c017',subset:'Checked primitive schema leaves only; groups and container wrappers excluded; repetition remains native, not scalar cardinality'} as const;
export interface ParquetFieldClassification {
 operation:'classify-parquet-field';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:ParquetFieldRequest;binding:typeof binding;diagnostics:Diagnostic[];
 mapping:{origin:'classified';kind:'field';idealPath:string;nativePath:string;nativeFragment:Json;basis:'checked-primitive-schema-leaf';outcome:'exact'|'unknown'};
 residuals:{path:string;value:Json;reason:string;recovery:'Original assertion and native fragment retained in source; reclassify with corrected provenance'}[];
}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);validator.addSchema(kinds);const check=validator.compile(schema);
/** Classify one checked native member. Does not infer scalar family, cardinality, requiredness or author intent. */
export function classifyParquetField(input:Document,options:ParquetFieldRequest):ParquetFieldClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as ParquetFieldRequest;
 if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(k=>!['index','mode','author'].includes(k))||!Number.isSafeInteger(request.index)||request.index<0||!['strict','report'].includes(request.mode))throw new UmfError('FIELD_CLASSIFICATION_REQUEST','Expected column index and strict/report policy');
 if(!validateDocument(source).valid||source.umf!=='0.2.0')throw new UmfError('FIELD_CLASSIFICATION_VERSION','Valid 0.2.0 envelope required; migrate explicitly');
 exportParquetCapture(source);
 const inventory=getParquetFieldMetadata(source),containers=inspectParquetContainers(source);
 if(inventory.status!=='checked'||containers.status!=='checked')throw new UmfError('PARQUET_FIELD_SCHEMA','Checked schema and container topology required');
 const field=inventory.fields.find(f=>f.index===request.index);if(!field)throw new UmfError('PARQUET_FIELD_INDEX','Native schema member index not found');
 const nativeFragment=copyJson(field.nativeField),mi=source.modules.findIndex(m=>m.id==='parquet.fields'),ei=source.modules[mi]?.elements.findIndex(e=>e.id===field.element.id)??-1;
 if(mi<0||ei<0)throw new UmfError('PARQUET_FIELD_METADATA','Materialized field module required');
 const element=source.modules[mi]!.elements[ei]!,idealPath=`/modules/${mi}/elements/${ei}/kind`,nativePath='/schema/'+request.index;
 const result:ParquetFieldClassification={operation:'classify-parquet-field',version:'1.0.0',status:'classified',source,request,binding,mapping:{origin:'classified',kind:'field',idealPath,nativePath,nativeFragment,basis:'checked-primitive-schema-leaf',outcome:'exact'},residuals:[],diagnostics:[]};
 let reason:string|undefined;
 if(!nativeFragment||typeof nativeFragment!=='object'||Array.isArray(nativeFragment)||!Object.hasOwn(nativeFragment,'type'))reason='Group/container role requires a separate binding; it cannot be classified as a primitive field';
 if(!reason&&request.author!==undefined){
  try{
   const author=verifyCoreKindDeclaration(request.author,source);
   if(author.identity.module!=='parquet.fields'||author.identity.element!==element.id)reason='Author receipt identifies a different member';
   else if(author.provenance.kind!=='field')reason='Authored kind conflicts with native primitive schema membership';
  }catch(error){if(!(error instanceof UmfError))throw error;reason='Author provenance is invalid or stale: '+error.code;}
 }else if(!reason&&Object.hasOwn(element,'kind'))reason='Existing kind requires verified author provenance; native-only observation cannot replace it';
 if(reason){
  result.status='blocked';result.mapping.outcome='unknown';
  result.diagnostics.push({code:'FIELD_KIND_CONFLICT',path:idealPath,message:reason,severity:'error'});
  result.residuals.push({path:idealPath,value:Object.hasOwn(element,'kind')?copyJson(element.kind):null,reason,recovery:'Original assertion and native fragment retained in source; reclassify with corrected provenance'});
 }else{
  const target=copyJson(source) as unknown as Document;target.modules[mi]!.elements[ei]!.kind='field';result.target=target;
 }
 const copied=copyJson(result);if(!check(copied))throw new UmfError('FIELD_CLASSIFICATION_RESULT',JSON.stringify(check.errors));
 return copied as unknown as ParquetFieldClassification;
}
/** Recompute the native basis and reject classification receipts after any target edit. */
export function verifyParquetFieldClassification(input:ParquetFieldClassification,current:Document):ParquetFieldClassification {
 const receipt=copyJson(input) as unknown as ParquetFieldClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('FIELD_CLASSIFICATION_RECEIPT','Expected a complete classified receipt');
 const expected:ParquetFieldClassification=classifyParquetField(receipt.source,receipt.request);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('FIELD_CLASSIFICATION_RECEIPT','Classification disagrees with checked native source');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('FIELD_CLASSIFICATION_STALE','Target changed; recompute classification from retained native source');
 return receipt;
}

export function recoverParquetFieldBytes(input:ParquetFieldClassification,current:Document):Uint8Array{const receipt=verifyParquetFieldClassification(input,current);return exportParquetCapture(receipt.source);}
