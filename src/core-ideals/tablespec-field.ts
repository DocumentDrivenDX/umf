import {copyJson} from '../model/json';
import {UmfError,type Document,type Json} from '../model/types';
import {verifyCoreKindDeclaration,type CoreKindDeclaration} from '../model/field-kind';
import {exportTableSpec,exportTableSpecBundle,getTableSpecColumn,TABLESPEC_EXTENSION} from '../adapters/tablespec';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import kinds from '../../spec/core/kind-operation.schema.json';
import schema from '../../spec/core/tablespec-field-classification.schema.json';
export {default as tableSpecFieldClassificationSchema} from '../../spec/core/tablespec-field-classification.schema.json';
export interface TableSpecFieldRequest {column:number;mode:'strict'|'report';author?:CoreKindDeclaration}
const binding={id:'umf.tablespec.field',version:'1.0.0',nativeVersion:'647e8e566ad78b864282ec65c0b0b2237aa63084',subset:'Table version 1.0 captured column member role; no scalar/container/native validation claim'} as const;
export interface TableSpecFieldClassification {
 operation:'classify-tablespec-field';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:TableSpecFieldRequest;binding:typeof binding;
 mapping:{origin:'classified';kind:'field';idealPath:string;nativePath:string;nativeFragment:Json;basis:'checked-native-column-membership';outcome:'exact'|'unknown'};
 residuals:{path:string;value:Json;reason:string;recovery:'Original assertion and native fragment retained in source; reclassify with corrected provenance'}[];
}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);validator.addSchema(kinds);const check=validator.compile(schema);
/** Classify one checked native member. Does not infer scalar family, cardinality, requiredness or author intent. */
export function classifyTableSpecField(input:Document,options:TableSpecFieldRequest):TableSpecFieldClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as TableSpecFieldRequest;
 if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(k=>!['column','mode','author'].includes(k))||!Number.isSafeInteger(request.column)||request.column<0||!['strict','report'].includes(request.mode))throw new UmfError('FIELD_CLASSIFICATION_REQUEST','Expected column index and strict/report policy');
 if(!validateDocument(source).valid||source.umf!=='0.2.0')throw new UmfError('FIELD_CLASSIFICATION_VERSION','Valid 0.2.0 envelope required; migrate explicitly');
 const payload=source.extensions?.[TABLESPEC_EXTENSION];
 if(payload&&typeof payload==='object'&&!Array.isArray(payload)&&Object.hasOwn(payload,'splitFiles'))exportTableSpecBundle(source);else exportTableSpec(source);
 const nativeFragment=copyJson(getTableSpecColumn(source,request.column));
 const mi=source.modules.findIndex(m=>m.id==='table'),element=source.modules[mi]!.elements[request.column]!;
 const idealPath=`/modules/${mi}/elements/${request.column}/kind`,nativePath=`/extensions/umf.tablespec/root/members/columns/items/${request.column}`;
 const result:TableSpecFieldClassification={operation:'classify-tablespec-field',version:'1.0.0',status:'classified',source,request,binding,mapping:{origin:'classified',kind:'field',idealPath,nativePath,nativeFragment,basis:'checked-native-column-membership',outcome:'exact'},residuals:[]};
 let reason:string|undefined;
 if(request.author!==undefined){
  try{
   const author=verifyCoreKindDeclaration(request.author,source);
   if(author.identity.module!=='table'||author.identity.element!==element.id)reason='Author receipt identifies a different member';
   else if(author.provenance.kind!=='field')reason='Authored kind conflicts with native column membership';
  }catch(error){if(!(error instanceof UmfError))throw error;reason='Author provenance is invalid or stale: '+error.code;}
 }else if(Object.hasOwn(element,'kind'))reason='Existing kind requires verified author provenance; native-only observation cannot replace it';
 if(reason){
  result.status='blocked';result.mapping.outcome='unknown';
  result.residuals.push({path:idealPath,value:Object.hasOwn(element,'kind')?copyJson(element.kind):null,reason,recovery:'Original assertion and native fragment retained in source; reclassify with corrected provenance'});
 }else{
  const target=copyJson(source) as unknown as Document;target.modules[mi]!.elements[request.column]!.kind='field';result.target=target;
 }
 const copied=copyJson(result);if(!check(copied))throw new UmfError('FIELD_CLASSIFICATION_RESULT',JSON.stringify(check.errors));
 return copied as unknown as TableSpecFieldClassification;
}
/** Recompute the native basis and reject classification receipts after any target edit. */
export function verifyTableSpecFieldClassification(input:TableSpecFieldClassification,current:Document):TableSpecFieldClassification {
 const receipt=copyJson(input) as unknown as TableSpecFieldClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('FIELD_CLASSIFICATION_RECEIPT','Expected a complete classified receipt');
 const expected=classifyTableSpecField(receipt.source,receipt.request);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('FIELD_CLASSIFICATION_RECEIPT','Classification disagrees with checked native source');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('FIELD_CLASSIFICATION_STALE','Target changed; recompute classification from retained native source');
 return receipt;
}
