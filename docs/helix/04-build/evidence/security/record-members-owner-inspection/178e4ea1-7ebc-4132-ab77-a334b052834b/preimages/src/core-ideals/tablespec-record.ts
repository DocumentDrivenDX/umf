import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic} from '../model/types';
import {type CoreKindDeclaration,verifyCoreKindDeclaration} from '../model/field-kind';
import {classifyTableSpecField,type TableSpecFieldClassification} from './tablespec-field';
import {getTableSpecTable,exportTableSpec,exportTableSpecBundle,TABLESPEC_EXTENSION} from '../adapters/tablespec';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import kinds from '../../spec/core/kind-operation.schema.json';
import schema from '../../spec/core/tablespec-record-classification.schema.json';
export {default as tableSpecRecordClassificationSchema} from '../../spec/core/tablespec-record-classification.schema.json';
export interface TableSpecRecordRequest {recordModule:string;recordId:string;mode:'strict'|'report';authors?:CoreKindDeclaration[]}
const binding={id:'umf.tablespec.record',version:'1.0.0',nativeVersion:'647e8e566ad78b864282ec65c0b0b2237aa63084',subset:'Captured table defines named column members; contextual groups and execution remain native'} as const;
type Mapping=Omit<TableSpecFieldClassification['mapping'],'kind'|'basis'>&{kind:'field'|'record';basis:'checked-native-column-membership'|'checked-native-table-members'};
export interface TableSpecRecordClassification {
 operation:'classify-tablespec-record';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:TableSpecRecordRequest;binding:typeof binding;mappings:Mapping[];
 residuals:{path:string;value:Json;reason:string;recovery:'Source and native fragments retained; resolve conflict then recompute whole record classification'}[];diagnostics:Diagnostic[];
}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);validator.addSchema(kinds);const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
/** One record and its named members; atomic across every column. Physical/context groupings stay native. */
export function classifyTableSpecRecord(input:Document,options:TableSpecRecordRequest):TableSpecRecordClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as TableSpecRecordRequest;
 if(!checkRequest(request))throw new UmfError('TABLESPEC_RECORD_REQUEST',JSON.stringify(checkRequest.errors));
 if(!validateDocument(source).valid||source.umf!=='0.2.0')throw new UmfError('TABLESPEC_RECORD_VERSION','Explicitly migrated valid envelope required');
 const payload=source.extensions?.[TABLESPEC_EXTENSION];
 if(payload&&typeof payload==='object'&&!Array.isArray(payload)&&Object.hasOwn(payload,'splitFiles'))exportTableSpecBundle(source);else exportTableSpec(source);
 const native=getTableSpecTable(source),mi=source.modules.findIndex(m=>m.id==='table'),module=source.modules[mi]!;
 const result:TableSpecRecordClassification={operation:'classify-tablespec-record',version:'1.0.0',status:'classified',source,request,binding,mappings:[],residuals:[],diagnostics:[]};
 const block=(code:string,path:string,value:unknown,reason:string)=>{result.status='blocked';result.residuals.push({path,value:copyJson(value),reason,recovery:'Source and native fragments retained; resolve conflict then recompute whole record classification'});result.diagnostics.push({code,path,message:reason,severity:'error'});};
 if(source.modules.some(m=>m.id===request.recordModule))block('RECORD_IDENTITY_COLLISION','/modules',request.recordModule,'Record module identity already exists; no merge or overwrite is implied');
 const authors=new Map<string,CoreKindDeclaration>();
 for(const author of request.authors??[]){
  try{verifyCoreKindDeclaration(author,source);}catch(error){if(!(error instanceof UmfError))throw error;block('STALE_AUTHOR',author.provenance.idealPath,author,'Author declaration does not match current source: '+error.code);continue;}
  if(author.identity.module!=='table'||!module.elements.some(e=>e.id===author.identity.element)||authors.has(author.identity.element))block('AUTHOR_IDENTITY',author.provenance.idealPath,author,'Author declaration is duplicated or does not identify a captured table member');
  else authors.set(author.identity.element,author);
 }
 module.elements.forEach((element,column)=>{
  const author=authors.get(element.id),classified=classifyTableSpecField(source,{column,mode:request.mode,...(author?{author}:{})});
  result.mappings.push(classified.mapping);
  for(const residual of classified.residuals)block('FIELD_KIND_CONFLICT',residual.path,residual.value,residual.reason);
 });
 const recordPath=`/modules/${source.modules.length}/elements/0`;
 result.mappings.push({origin:'classified',kind:'record',idealPath:recordPath+'/kind',nativePath:'/extensions/umf.tablespec/root',nativeFragment:copyJson(native),basis:'checked-native-table-members',outcome:result.status==='classified'?'exact':'unknown'});
 if(result.status==='classified'){
  const target=copyJson(source) as unknown as Document;for(const element of target.modules[mi]!.elements)element.kind='field';
  target.modules.push({id:request.recordModule,namespace:module.namespace,elements:[{id:request.recordId,name:module.namespace,kind:'record',extensions:{},references:module.elements.map(e=>({role:'member',module:'table',element:e.id}))}]});
  const validation=validateDocument(target);if(!validation.valid)throw new UmfError('TABLESPEC_RECORD_TARGET',JSON.stringify(validation.diagnostics));result.target=target;
 }
 const output=copyJson(result);if(!check(output))throw new UmfError('TABLESPEC_RECORD_RESULT',JSON.stringify(check.errors));return output as unknown as TableSpecRecordClassification;
}
/** Whole-record receipt verification; native or authored changes require recomputation. */
export function verifyTableSpecRecordClassification(input:TableSpecRecordClassification,current:Document):TableSpecRecordClassification {
 const receipt=copyJson(input) as unknown as TableSpecRecordClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('TABLESPEC_RECORD_RECEIPT','Expected complete classified receipt');
 const expected=classifyTableSpecRecord(receipt.source,receipt.request);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('TABLESPEC_RECORD_RECEIPT','Receipt differs from recomputed classification');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('TABLESPEC_RECORD_STALE','Current model changed since classification');
 return receipt;
}
