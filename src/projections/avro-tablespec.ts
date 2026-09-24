import {copyJson} from '../model/json';
import {readJsonValue} from '../model/serialization';
import {UmfError,type Document,type Json} from '../model/types';
import {exportAvroBundle,inspectAvro} from '../adapters/avro';
import {importTableSpec} from '../adapters/tablespec';
import type {ProjectionIssue} from './json-schema-protobuf';
export type AvroTableSpecRepresentation='string'|'integer32'|'float32'|'boolean'|'decimal'|'date'|'timestamp'|'local-timestamp'|'hex-text'|'json-text';
export interface AvroTableSpecPolicy {id:string;tableName:string;fields:Record<string,{name:string;representation:AvroTableSpecRepresentation}>;lossPolicy:'strict'|'allow-reported-loss';}
export interface AvroTableSpecProjection {status:'blocked'|'projected';source:Document;policy:AvroTableSpecPolicy;issues:ProjectionIssue[];mappings:{sourcePath:string;field:string;column:string;representation:AvroTableSpecRepresentation;nullable:boolean}[];target?:Document;nativeSchema?:string;}
const representations=['string','integer32','float32','boolean','decimal','date','timestamp','local-timestamp','hex-text','json-text'],primitives=['null','boolean','int','long','float','double','bytes','string'];
/** Root-record schema projection. Instance encoders and TableSpec pipelines remain separate. */
export function projectAvroToTableSpec(input:Document,options:AvroTableSpecPolicy):AvroTableSpecProjection{
 const source=copyJson(input) as Document,policy=copyJson(options) as unknown as AvroTableSpecPolicy,object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 if(!object(policy)||typeof policy.id!=='string'||!policy.id||typeof policy.tableName!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,127}(?![\s\S])/.test(policy.tableName)||!object(policy.fields)||!Object.keys(policy.fields).length||!['strict','allow-reported-loss'].includes(policy.lossPolicy)||Object.keys(policy).some(k=>!['id','tableName','fields','lossPolicy'].includes(k)))throw new UmfError('AVRO_TABLESPEC_POLICY','Explicit table, field representations and loss policy required');
 const names=new Set<string>();for(const binding of Object.values(policy.fields)){if(!object(binding)||typeof binding.name!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,127}(?![\s\S])/.test(binding.name)||names.has(binding.name)||!representations.includes(binding.representation)||Object.keys(binding).some(k=>!['name','representation'].includes(k)))throw new UmfError('AVRO_TABLESPEC_POLICY','Invalid, duplicate or incomplete column binding');names.add(binding.name);}
 const checked=inspectAvro(source);if(!checked.valid)throw new UmfError('AVRO_TABLESPEC_SOURCE','Invalid source');
 const result:AvroTableSpecProjection={status:'blocked',source,policy,issues:[],mappings:[]};let fatal=false;
 const issue=(path:string,code:string,detail:string,classification:ProjectionIssue['classification']='not-enforced')=>result.issues.push({path,code,classification,detail,retainedInSource:true});
 const fail=(path:string,detail:string)=>{fatal=true;issue(path,'AVRO_TABLESPEC_UNSUPPORTED',detail,'unsupported');};
 for(const d of checked.diagnostics){issue(d.path,d.code,d.message);if(['AVRO_VALIDATOR_LIMIT','AVRO_NUMERIC','AVRO_REPRESENTATION'].includes(d.code))fatal=true;}if(fatal)return result;
 const bundle=exportAvroBundle(source),root=readJsonValue(bundle.schema,'json') as any,definitions=new Map<string,{node:any;namespace:string}>();
 function collect(node:any,namespace:string):void{
  if(Array.isArray(node)){node.forEach(n=>collect(n,namespace));return;}if(!object(node))return;
  if(['record','error','enum','fixed'].includes(node.type)){
   const full=node.name.includes('.')?node.name:(node.namespace??namespace)?(node.namespace??namespace)+'.'+node.name:node.name;
   namespace=full.includes('.')?full.slice(0,full.lastIndexOf('.')):'';definitions.set(full,{node,namespace});
  }
  if(Array.isArray(node.fields))node.fields.forEach((f:any)=>collect(f.type,namespace));if(node.items)collect(node.items,namespace);if(node.values)collect(node.values,namespace);if(typeof node.type!=='string')collect(node.type,namespace);
 }
 for(const dep of bundle.dependencies)collect(readJsonValue(dep.schema,'json'),'');collect(root,'');
 if(!object(root)||!['record','error'].includes(root.type)){fail('','Only root records can become TableSpec tables');return result;}
 const fullname=root.name.includes('.')?root.name:(root.namespace?root.namespace+'.':'')+root.name,namespace=fullname.includes('.')?fullname.slice(0,fullname.lastIndexOf('.')):'';
 const resolve=(node:any):any=>{if(typeof node!=='string'||primitives.includes(node))return node;return definitions.get(node.includes('.')?node:namespace?namespace+'.'+node:node)?.node;};
 issue('','RECORD_IDENTITY','TableSpec table name is explicit; Avro namespaces, aliases, record/error identity, recursion, binary framing and schema resolution remain in source');
 issue('','SCHEMA_ONLY','No row encoding/coercion, writer-field presence, reader defaults or TableSpec pipeline execution is established','representation-change');
 if(bundle.dependencies.length)issue('','NAMED_DEPENDENCIES','Named-schema dependencies remain in the source bundle; TableSpec does not carry the Avro name registry');
 for(const [index,field] of root.fields.entries())if(!Object.hasOwn(policy.fields,field.name))issue('/fields/'+index,'FIELD_OMITTED','Source field omitted by explicit selection');
 const columns:Json[]=[];
 for(const [fieldName,binding] of Object.entries(policy.fields)){
  const index=root.fields.findIndex((f:any)=>f.name===fieldName),field=root.fields[index],path='/fields/'+index;if(!field){fail('/fields/'+fieldName,'Selected field is absent');continue;}
  const union=Array.isArray(field.type)?field.type:null,branches=union??[field.type],isNull=(n:any)=>n==='null'||object(n)&&n.type==='null',nullable=branches.some(isNull),nonNull=branches.filter((n:any)=>!isNull(n));
  if(union)issue(path+'/type','UNION_IDENTITY','Nullability is derived from a null branch; TableSpec does not preserve union order, branch tags or overlapping alternatives');
  if(Object.hasOwn(field,'default'))issue(path+'/default','READER_DEFAULT','Avro reader-resolution default is not a TableSpec default or permission to omit a writer field');
  if(field.aliases||field.order)issue(path,'FIELD_RESOLUTION','Native aliases and field sort order are not TableSpec alias or ordering semantics');
  let node=nonNull.length===1?resolve(nonNull[0]):undefined,type=typeof node==='string'?node:node?.type,logical=object(node)?node.logicalType:undefined;
  const representation=binding.representation,column:Record<string,Json>={name:binding.name,nullable,...(typeof field.doc==='string'?{description:field.doc}:{})};let consumedLogical=false;
  if(representation==='json-text'){column.data_type='TEXT';issue(path,'JSON_TEXT_ENCODING','Non-null values require an explicit Avro JSON encoder (including tags, names, bytes and exact numbers). Null remains null; target text does not enforce the source shape','representation-change');}
  else if(!node||nonNull.length!==1){fail(path,'Non-text bindings require one resolved non-null branch');continue;}
  else if(representation==='string'&&['string','enum'].includes(type)){column.data_type='TEXT';if(type==='enum')issue(path,'ENUM_SYMBOLS','Enum symbols, default and named identity are not enforced by TEXT');}
  else if(representation==='integer32'&&type==='int'){column.data_type='INTEGER';issue(path,'INTEGER_EXECUTION_PROFILE','The pinned Spark helper uses int32; this does not establish all TableSpec execution, coercion or range enforcement');}
  else if(representation==='float32'&&['float','double'].includes(type)){column.data_type='FLOAT';issue(path,type==='double'?'FLOAT64_TO_FLOAT32':'FLOAT_EXECUTION_PROFILE',type==='double'?'Explicit narrowing to the pinned Spark float32 helper requires a separate rounding/overflow policy; source double precision is not preserved':'Native non-finite values, signed zero and execution behavior remain source-owned',type==='double'?'representation-change':'not-enforced');}
  else if(representation==='boolean'&&type==='boolean')column.data_type='BOOLEAN';
  else if(representation==='hex-text'&&['bytes','fixed'].includes(type)){column.data_type='TEXT';issue(path,'BINARY_HEX_ENCODING','Caller must encode bytes as hexadecimal; TableSpec TEXT does not enforce alphabet, width or native fixed identity','representation-change');}
  else if(representation==='decimal'&&['bytes','fixed'].includes(type)&&logical==='decimal'){
   const p=node.precision,s=Object.hasOwn(node,'scale')?node.scale:0;
   const capacity=type==='fixed'&&Number.isInteger(node.size)&&node.size>0&&node.size<17?((1n<<BigInt(8*node.size-1))-1n).toString().length-1:38;
   if(!Number.isInteger(p)||p<1||p>38||!Number.isInteger(s)||s<0||s>p||type==='fixed'&&(!Number.isInteger(node.size)||node.size<1||p>capacity)){fail(path,'Valid decimal precision 1–38, scale and fixed capacity required for the selected target profile');continue;}
   column.data_type='DECIMAL';column.precision=p;column.scale=s;consumedLogical=true;issue(path,'DECIMAL_REPRESENTATION','Precision/scale retained; Avro signed big-endian bytes/fixed encoding, native rounding and reader resolution require separate value handling','representation-change');
  }else if(representation==='date'&&type==='int'&&logical==='date'){column.data_type='DATE';consumedLogical=true;issue(path,'DATE_EXECUTION_PROFILE','Avro epoch days require decoding; pinned TableSpec date helpers disagree between string and date carriers','representation-change');}
  else if(type==='long'&&typeof logical==='string'&&((representation==='timestamp'&&/^timestamp-(millis|micros|nanos)(?![\s\S])/.test(logical))||(representation==='local-timestamp'&&/^local-timestamp-(millis|micros|nanos)(?![\s\S])/.test(logical)))){
   column.data_type=representation==='timestamp'?'TIMESTAMP':'DATETIME';consumedLogical=true;issue(path,'TEMPORAL_REPRESENTATION','Source units, range and instant/local distinction are not enforced by the target type token; parsing/timezone/precision conversion requires a separate binding','representation-change');
  }else{fail(path,'Representation does not match the resolved native Avro type');continue;}
  if(logical&&!consumedLogical)issue(path+'/type','LOGICAL_TYPE_NOT_REPRESENTED','Logical meaning remains in source; selected representation describes its carrier only');
  columns.push(column);result.mappings.push({sourcePath:path,field:fieldName,column:binding.name,representation,nullable});
 }
 if(fatal||policy.lossPolicy==='strict'&&result.issues.length)return result;
 result.nativeSchema=JSON.stringify({version:'1.0',table_name:policy.tableName,...(typeof root.doc==='string'?{description:root.doc}:{}),columns},null,2)+'\n';result.target=importTableSpec(result.nativeSchema,{id:policy.id,format:'json'});result.status='projected';return result;
}
