import {inspectParquetContainers} from '../adapters/parquet/containers';
import type {ParquetSchemaNode} from '../adapters/parquet/schema';
import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic} from '../model/types';
import {type CoreKindDeclaration,verifyCoreKindDeclaration} from '../model/field-kind';
import type {ParquetFieldClassification} from './parquet-field';
import {getParquetFieldMetadata} from '../adapters/parquet/field-metadata';
import {exportParquetCapture} from '../adapters/parquet';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import kinds from '../../spec/core/kind-operation.schema.json';import schema from '../../spec/core/parquet-record-classification.schema.json';
export {default as parquetRecordClassificationSchema} from '../../spec/core/parquet-record-classification.schema.json';
export interface ParquetRecordRequest {recordModule:string;recordId:string;index:number;mode:'strict'|'report';authors?:CoreKindDeclaration[]}
const binding={id:'umf.parquet.record',version:'1.0.0',nativeVersion:'parquet-format@219e3f12a62f9476e830c21e26d030d231f7c017',subset:'Unannotated root/struct definitions after LIST/MAP interpretation; direct members only, no cardinality or value-domain equivalence'} as const;
type Mapping=Omit<ParquetFieldClassification['mapping'],'kind'|'basis'>&{kind:'field'|'record';basis:'checked-record-field-membership'|'checked-record-declaration'};
export interface ParquetRecordClassification {
 operation:'classify-parquet-record';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:ParquetRecordRequest;binding:typeof binding;mappings:Mapping[];
 residuals:{path:string;value:Json;reason:string;recovery:'Source and native fragments retained; resolve conflict then recompute whole record classification'}[];diagnostics:Diagnostic[];
}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);validator.addSchema(kinds);const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
export function classifyParquetRecord(input:Document,options:ParquetRecordRequest):ParquetRecordClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as ParquetRecordRequest;
 if(!checkRequest(request))throw new UmfError('PARQUET_RECORD_REQUEST',JSON.stringify(checkRequest.errors));
 if(!validateDocument(source).valid||source.umf!=='0.2.0')throw new UmfError('PARQUET_RECORD_VERSION','Explicitly migrated valid envelope required');
 exportParquetCapture(source);
 const inspected=inspectParquetContainers(source),inventory=getParquetFieldMetadata(source);
 if(inspected.status!=='checked'||!inspected.tree||inventory.status!=='checked')throw new UmfError('PARQUET_RECORD_SCHEMA','Checked schema and container topology required');
 const nodes:ParquetSchemaNode[]=[],parents=new Map<number,ParquetSchemaNode>();function walk(n:ParquetSchemaNode){nodes.push(n);for(const child of n.children){parents.set(child.index,n);walk(child);}}walk(inspected.tree);
 const declaration=nodes.find(n=>n.index===request.index);if(!declaration)throw new UmfError('PARQUET_RECORD_IDENTITY','Selected schema index is missing');
 const native=(inspected.metadata as any).schema[request.index],nativePath='/schema/'+request.index,mi=source.modules.findIndex(m=>m.id==='parquet.fields');if(mi<0)throw new UmfError('PARQUET_RECORD_METADATA','Derived field module is required');
 const columns=declaration.children.map(n=>inventory.fields.find(f=>f.index===n.index)!);
 const result:ParquetRecordClassification={operation:'classify-parquet-record',version:'1.0.0',status:'classified',source,request,binding,mappings:[],residuals:[],diagnostics:[]};
 const block=(code:string,path:string,value:unknown,reason:string)=>{result.status='blocked';result.residuals.push({path,value:copyJson(value),reason,recovery:'Source and native fragments retained; resolve conflict then recompute whole record classification'});result.diagnostics.push({code,path,message:reason,severity:'error'});};
 const unknown=(v:any):boolean=>!!(v&&typeof v==='object'&&(Array.isArray(v.$unknown)&&v.$unknown.length>0||Object.values(v).some(unknown)));
 const containers=inspected.containers??[];
 const wrapper=containers.some(c=>c.index===request.index||c.repeatedIndex===request.index&&(c.kind==='map'||c.layout==='three-level'));
 if(native.type!==undefined||native.logicalType!==undefined||native.converted_type!==undefined||unknown(native)||wrapper)
  block('RECORD_ROLE_UNKNOWN',nativePath,native,'Selected node is primitive, annotated, unknown or a LIST/MAP encoding wrapper; no record assertion is implied');
 for(let parent=parents.get(request.index);parent;parent=parents.get(parent.index)){
  const fragment=(inspected.metadata as any).schema[parent.index];
  const interpretedContainer=containers.some(c=>c.index===parent!.index||c.kind==='map'&&c.repeatedIndex===parent!.index);
  if(unknown(fragment)||!interpretedContainer&&(fragment.logicalType!==undefined||fragment.converted_type!==undefined))
   block('RECORD_ANCESTOR_UNKNOWN','/schema/'+parent.index,fragment,'Uninterpreted ancestor annotation may change the selected group meaning');
 }
 if(new Set(columns.map(c=>c.element.name)).size!==columns.length)block('RECORD_DUPLICATE_NAMES',nativePath,native,'Duplicate sibling names require an explicit ideal member naming policy');
 if(source.modules.some(m=>m.id===request.recordModule))block('RECORD_IDENTITY_COLLISION','/modules',request.recordModule,'Requested record module already exists; no merge is implied');
 const authors=new Map<string,CoreKindDeclaration>();
 for(const author of request.authors??[]){
  try{verifyCoreKindDeclaration(author,source);}catch(error){if(!(error instanceof UmfError))throw error;block('STALE_AUTHOR',author.provenance.idealPath,author,'Author receipt differs from source: '+error.code);continue;}
  if(author.identity.module!=='parquet.fields'||!columns.some(c=>c.element.id===author.identity.element)||authors.has(author.identity.element))block('AUTHOR_IDENTITY',author.provenance.idealPath,author,'Duplicate or unrelated member author receipt');else authors.set(author.identity.element,author);
 }
 for(const column of columns){
  const author=authors.get(column.element.id),ei=source.modules[mi]!.elements.findIndex(e=>e.id===column.element.id),element=source.modules[mi]!.elements[ei]!,idealPath=`/modules/${mi}/elements/${ei}/kind`;
  let reason:string|undefined;
  if(author&&author.provenance.kind!=='field')reason='Authored kind conflicts with direct record member role';
  else if(!author&&Object.hasOwn(element,'kind'))reason='Existing kind requires verified author provenance';
  if(reason)block('FIELD_KIND_CONFLICT',idealPath,element.kind??null,reason);
  result.mappings.push({origin:'classified',kind:'field',idealPath,nativePath:'/schema/'+column.index,nativeFragment:copyJson(column.nativeField),basis:'checked-record-field-membership',outcome:reason?'unknown':'exact'});
 }
 const recordPath=`/modules/${source.modules.length}/elements/0`;
 result.mappings.push({origin:'classified',kind:'record',idealPath:recordPath+'/kind',nativePath,nativeFragment:copyJson(native),basis:'checked-record-declaration',outcome:result.status==='classified'?'exact':'unknown'});
 if(result.status==='classified'){
  const target=copyJson(source) as unknown as Document,ids=new Set(columns.map(c=>c.element.id));for(const element of target.modules[mi]!.elements)if(ids.has(element.id))element.kind='field';
  target.modules.push({id:request.recordModule,namespace:'',elements:[{id:request.recordId,name:declaration.name,kind:'record',extensions:{},references:columns.map(c=>({role:'member',module:'parquet.fields',element:c.element.id}))}]});
  const validation=validateDocument(target);if(!validation.valid)throw new UmfError('PARQUET_RECORD_TARGET',JSON.stringify(validation.diagnostics));result.target=target;
 }
 const output=copyJson(result);if(!check(output))throw new UmfError('PARQUET_RECORD_RESULT',JSON.stringify(check.errors));return output as unknown as ParquetRecordClassification;
}
export function recoverParquetRecordBytes(input:ParquetRecordClassification,current:Document):Uint8Array {
 const receipt=copyJson(input) as unknown as ParquetRecordClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('PARQUET_RECORD_RECEIPT','Expected complete classification receipt');
 const expected=classifyParquetRecord(receipt.source,receipt.request);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('PARQUET_RECORD_RECEIPT','Receipt differs from recomputation');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('PARQUET_RECORD_STALE','Current model changed');return exportParquetCapture(receipt.source);
}
