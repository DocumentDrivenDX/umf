import {copyJson} from '../model/json';
import {readJsonValue} from '../model/serialization';
import {renderTree} from '../model/native-json';
import {UmfError,type Document,type Json} from '../model/types';
import {TABLESPEC_EXTENSION,exportTableSpec,exportTableSpecBundle,getTableSpecColumn,getTableSpecTable,inspectTableSpec} from '../adapters/tablespec';
import {importAvroSchema} from '../adapters/avro';
import type {ProjectionIssue} from './json-schema-protobuf';
export type TableSpecAvroRepresentation='string'|'int32'|'int64'|'float32'|'float64'|'boolean'|'decimal'|'date'|'timestamp-micros'|'local-timestamp-micros'|'embedding-float32';
export interface TableSpecAvroPolicy {id:string;recordName:string;namespace:string;context?:string;fields:Record<string,{name:string;representation:TableSpecAvroRepresentation;nullable:'source'|boolean;itemsNullable?:boolean}>;lossPolicy:'strict'|'allow-reported-loss';}
export interface TableSpecAvroProjection {status:'blocked'|'projected';source:Document;policy:TableSpecAvroPolicy;issues:ProjectionIssue[];mappings:{index:number;column:string;field:string;representation:TableSpecAvroRepresentation;nullable:boolean}[];target?:Document;nativeSchema?:string;}
const representations=['string','int32','int64','float32','float64','boolean','decimal','date','timestamp-micros','local-timestamp-micros','embedding-float32'],ident=/^[A-Za-z_][A-Za-z0-9_]*(?![\s\S])/;
export function projectTableSpecToAvro(source:Document,input:TableSpecAvroPolicy):TableSpecAvroProjection{
 const policy=copyJson(input) as unknown as TableSpecAvroPolicy,object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 if(!object(policy)||typeof policy.id!=='string'||!policy.id||typeof policy.recordName!=='string'||!ident.test(policy.recordName)||typeof policy.namespace!=='string'||!policy.namespace.split('.').every(p=>ident.test(p))||!object(policy.fields)||!Object.keys(policy.fields).length||!['strict','allow-reported-loss'].includes(policy.lossPolicy)||(policy.context!==undefined&&(typeof policy.context!=='string'||!policy.context))||Object.keys(policy).some(k=>!['id','recordName','namespace','context','fields','lossPolicy'].includes(k)))throw new UmfError('TABLESPEC_AVRO_POLICY','Expected explicit names, field bindings, context and loss policy');
 const names=new Set<string>();for(const binding of Object.values(policy.fields)){
  if(!object(binding)||typeof binding.name!=='string'||!ident.test(binding.name)||names.has(binding.name)||!representations.includes(binding.representation)||(binding.nullable!=='source'&&typeof binding.nullable!=='boolean')||(binding.itemsNullable!==undefined&&(typeof binding.itemsNullable!=='boolean'||binding.representation!=='embedding-float32'))||Object.keys(binding).some(k=>!['name','representation','nullable','itemsNullable'].includes(k)))throw new UmfError('TABLESPEC_AVRO_POLICY','Invalid, duplicate or incomplete field binding');names.add(binding.name);
 }
 if(!inspectTableSpec(source).valid)throw new UmfError('TABLESPEC_AVRO_SOURCE','Invalid source');
 const payload=source.extensions?.[TABLESPEC_EXTENSION];if(object(payload)&&Object.hasOwn(payload,'splitFiles'))exportTableSpecBundle(source);else exportTableSpec(source);
 const result:TableSpecAvroProjection={status:'blocked',source:copyJson(source) as Document,policy,issues:[],mappings:[]};let fatal=false;
 const issue=(path:string,code:string,classification:ProjectionIssue['classification'],detail:string)=>result.issues.push({path,code,classification,detail,retainedInSource:true});
 const fail=(path:string,detail:string)=>{fatal=true;issue(path,'TABLESPEC_AVRO_UNSUPPORTED','unsupported',detail);};
 issue('','TABLESPEC_EXECUTION','not-enforced','Native Pydantic validation/coercion, constraints, relationships, derivations, pipelines and split-loader migrations are not executed by this schema projection');
 issue('','SCHEMA_ONLY','representation-change','Native values require a separate encoder; the copied source UMF remains required for native meaning');
 const root=getTableSpecTable(source);
 if(root.kind==='object')for(const key of Object.keys(root.members)){
  if(key==='columns')continue;
  const path='/'+key.replace(/~/g,'~0').replace(/\//g,'~1');
  if(key==='primary_key')issue(path,'PRIMARY_KEY_NOT_ENFORCED','not-enforced','Avro record schemas do not enforce native table primary-key membership or uniqueness');
  else if(key==='context_column')issue(path,'CONTEXT_DISPATCH_NOT_ENFORCED','not-enforced','The policy selects a schema context; Avro does not dispatch validation from the native context column for each row');
  else issue(path,'NATIVE_TABLE_METADATA','not-enforced','Native table metadata remains in source without Avro interpretation; target record identity is supplied by policy');
 }
 const table=source.modules.find(m=>m.id==='table')!,columns=table.elements.map((_,index)=>{const tree=getTableSpecColumn(source,index);return {index,tree,native:JSON.parse(renderTree(tree))};});
 for(const {index,native:c} of columns)if(!Object.hasOwn(policy.fields,c.name))issue('/columns/'+index,'COLUMN_OMITTED','not-enforced','Native column omitted by explicit field selection');
 const fields:Json[]=[];
 for(const [column,binding] of Object.entries(policy.fields)){
  const found=columns.find(c=>c.native.name===column);if(!found){fail('/fields/'+column,'Selected column does not exist');continue;}const {index,native:c}=found,path='/columns/'+index;
  let sourceNullable:boolean|undefined;if(typeof c.nullable==='boolean')sourceNullable=c.nullable;else if(object(c.nullable)&&policy.context!==undefined&&Object.hasOwn(c.nullable,policy.context)&&typeof c.nullable[policy.context]==='boolean')sourceNullable=c.nullable[policy.context];
  const nullable=binding.nullable==='source'?sourceNullable:binding.nullable;
  if(nullable===undefined){fail(path+'/nullable','Missing/unknown source nullability or context; provide a known context or explicit boolean binding');continue;}
  if(binding.nullable!=='source'&&binding.nullable!==sourceNullable)issue(path+'/nullable','NULLABILITY_BINDING','not-enforced','Explicit target nullability overrides or supplies native/contextual nullability');
  if(object(c.nullable)&&sourceNullable!==undefined)issue(path+'/nullable','CONTEXT_SELECTED','annotation-only','Only the selected context is represented; other context meanings remain in source');
  const representation=binding.representation;let type:Json|undefined;
  let inexact=false;
  for(const key of representation==='decimal'?['precision','scale']:representation==='embedding-float32'?['dimension']:[]){
   const token=found.tree.kind==='object'?found.tree.members[key]:undefined;
   if(token?.kind==='number')try{const value=readJsonValue(token.value,'json');if(typeof value!=='number'||!Number.isSafeInteger(value))throw Error('Not an exact integer');}
   catch{fail(path+'/'+key,'Selected numeric qualifier must be an exact interoperable integer; source numeric rounding is not permitted');inexact=true;}
  }
  if(inexact)continue;
  if(representation==='string'){type='string';issue(path,['VARCHAR','TEXT','CHAR'].includes(c.data_type)?'TEXT_REFINEMENTS':'TEXT_REPRESENTATION',['VARCHAR','TEXT','CHAR'].includes(c.data_type)?'not-enforced':'representation-change','Native length, formats, conversion and lexical validation are not enforced by Avro string');}
  else if(['int32','int64'].includes(representation)&&c.data_type==='INTEGER'){type=representation==='int32'?'int':'long';issue(path,'INTEGER_PROFILE','not-enforced','Selected integer width is a binding choice; the pinned Spark helper uses 32 bits and other execution rules remain source-owned');}
  else if(['float32','float64'].includes(representation)&&c.data_type==='FLOAT'){type=representation==='float32'?'float':'double';issue(path,'FLOAT_PROFILE','not-enforced','Selected floating width does not establish native rounding, non-finite or execution semantics');}
  else if(representation==='boolean'&&c.data_type==='BOOLEAN')type='boolean';
  else if(representation==='decimal'&&c.data_type==='DECIMAL'){
   if(!Number.isSafeInteger(c.precision)||c.precision<1||c.precision>1000||!Number.isSafeInteger(c.scale)||c.scale<0||c.scale>c.precision)fail(path,'Explicit decimal precision 1–1000 and scale 0–precision are required; no native defaults are inferred');
   else{type={type:'bytes',logicalType:'decimal',precision:c.precision,scale:c.scale};issue(path,'DECIMAL_ENCODING','representation-change','Values require signed big-endian unscaled decimal bytes; native coercion/rounding and engine precision limits remain source-owned');}
  }else if(representation==='date'&&c.data_type==='DATE'){type={type:'int',logicalType:'date'};issue(path,'DATE_REPRESENTATION','representation-change','TableSpec helper profiles disagree on date storage; selected logical dates require parsing and epoch-day encoding');}
  else if(['timestamp-micros','local-timestamp-micros'].includes(representation)&&['DATETIME','TIMESTAMP'].includes(c.data_type)){type={type:'long',logicalType:representation};issue(path,'TIMESTAMP_REPRESENTATION','representation-change','Caller selects instant/local-wall-clock microseconds; native parsing, timezone, range and precision correspondence is not established');}
  else if(representation==='embedding-float32'&&c.data_type==='EMBEDDING'){
   if(!Number.isSafeInteger(c.dimension)||c.dimension<1||typeof binding.itemsNullable!=='boolean')fail(path,'Embedding requires positive native dimension and explicit item nullability');
   else{type={type:'array',items:binding.itemsNullable?['null','float']:'float'};issue(path,'EMBEDDING_DIMENSION','not-enforced','Avro array does not enforce native dimension '+c.dimension);issue(path,'EMBEDDING_PROFILE','representation-change','Float32 elements and their nullability are explicit bindings; vector execution semantics remain in source');}
  }else fail(path,'Representation does not match the known native type');
  if(c.internal===true)issue(path,'INTERNAL_FIELD_EXPOSED','representation-change','Explicit binding exposes a native internal column normally omitted from output schemas');
  for(const key of ['precision','scale','dimension','length'])if(Object.hasOwn(c,key)&&!((['precision','scale'].includes(key)&&representation==='decimal')||(key==='dimension'&&representation==='embedding-float32')||(key==='length'&&representation==='string')))issue(path+'/'+key,'NATIVE_REFINEMENT','not-enforced','Native refinement is not represented by the selected target type');
  for(const key of Object.keys(c))if(!['name','data_type','nullable','description','precision','scale','dimension','length','internal'].includes(key))issue(path+'/'+key,'NATIVE_METADATA','not-enforced','Native field metadata remains in source without Avro interpretation');
  if(type!==undefined){fields.push({name:binding.name,type:nullable?['null',type]:type,...(typeof c.description==='string'?{doc:c.description}:{})});result.mappings.push({index,column,field:binding.name,representation,nullable});}
 }
 if(fatal||policy.lossPolicy==='strict'&&result.issues.length)return result;
 result.nativeSchema=JSON.stringify({type:'record',name:policy.recordName,namespace:policy.namespace,fields},null,2)+'\n';result.target=importAvroSchema(result.nativeSchema,{id:policy.id});result.status='projected';return result;
}
