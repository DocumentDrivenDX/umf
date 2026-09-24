import {copyJson} from '../model/json';
import {UmfError,type Document,type Json} from '../model/types';
import {exportParquetCapture} from '../adapters/parquet';
import {inspectParquetContainers} from '../adapters/parquet/containers';
import {getParquetArrowSchema} from '../adapters/parquet/arrow-schema';
import {exportArrowFlatbufferModel} from '../adapters/arrow/flatbuffer-model';
import type {ParquetSchemaNode} from '../adapters/parquet/schema';
import {importAvroSchema} from '../adapters/avro';
import type {ProjectionIssue} from './json-schema-protobuf';
export interface ParquetAvroPolicy {id:string;recordName:string;namespace:string;fieldNames:Record<string,string>;maps:'entry-arrays';lossPolicy:'strict'|'allow-reported-loss';}
export interface ParquetAvroProjection {status:'blocked'|'projected';source:Document;policy:ParquetAvroPolicy;issues:ProjectionIssue[];mappings:{index:number;path:string[]}[];target?:Document;nativeSchema?:string;}
const ident=/^[A-Za-z_][A-Za-z0-9_]*(?![\s\S])/;
const unknown=(v:any):boolean=>!!(v&&typeof v==='object'&&(Array.isArray(v.$unknown)&&v.$unknown.length||Object.values(v).some(unknown)));
/** Schema lowering only; never decodes or silently coerces stored page values. */
export function projectParquetToAvro(source:Document,input:ParquetAvroPolicy):ParquetAvroProjection{
 const policy=copyJson(input) as unknown as ParquetAvroPolicy;
 const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 if(!object(policy)||typeof policy.id!=='string'||!policy.id||typeof policy.recordName!=='string'||!ident.test(policy.recordName)||typeof policy.namespace!=='string'||!policy.namespace.split('.').every(n=>ident.test(n))||!object(policy.fieldNames)||Object.entries(policy.fieldNames).some(([k,v])=>! /^[1-9][0-9]*(?![\s\S])/.test(k)||typeof v!=='string'||!ident.test(v))||policy.maps!=='entry-arrays'||!['strict','allow-reported-loss'].includes(policy.lossPolicy)||Object.keys(policy).some(k=>!['id','recordName','namespace','fieldNames','maps','lossPolicy'].includes(k)))throw new UmfError('PARQUET_AVRO_POLICY','Expected valid Avro names, schema-index field overrides, entry-arrays map binding and loss policy');
 exportParquetCapture(source);const inspected=inspectParquetContainers(source);
 const result:ParquetAvroProjection={status:'blocked',source:copyJson(source) as Document,policy,issues:[],mappings:[]};let fatal=false;
 const issue=(index:number,code:string,classification:ProjectionIssue['classification'],detail:string)=>result.issues.push({path:'/schema/'+index,code,classification,detail,retainedInSource:true});
 const fail=(index:number,detail:string):Json=>{fatal=true;issue(index,'PARQUET_AVRO_UNSUPPORTED','unsupported',detail);return 'null';};
 for(const d of inspected.diagnostics)result.issues.push({path:d.path,code:d.code,classification:'not-enforced',detail:d.message,retainedInSource:true});
 if(inspected.status!=='checked'||!inspected.tree)return result;
 const embedded=getParquetArrowSchema(source);
 if(embedded.status!=='absent'){
  const path=embedded.metadataIndex===undefined?'/key_value_metadata':'/key_value_metadata/'+embedded.metadataIndex+'/value';
  const arrowIssue=(code:string,detail:string,classification:ProjectionIssue['classification']='not-enforced')=>result.issues.push({path,code,classification,detail,retainedInSource:true});
  if(embedded.status!=='decoded'){
   arrowIssue('EMBEDDED_ARROW_SCHEMA_UNINTERPRETED','Embedded Arrow declaration is ambiguous or uninterpreted; physical-only lowering cannot establish its meaning. '+embedded.diagnostics.filter(d=>d.severity==='error').map(d=>d.message).join('; '),'unsupported');
   return result;
  }
  arrowIssue('EMBEDDED_ARROW_SCHEMA_NOT_PROJECTED','Avro is derived from the physical Parquet schema. The independent embedded Arrow declaration, custom metadata and schema/data correspondence remain in source; no field correspondence or semantic equivalence is inferred.','representation-change');
  const model=JSON.parse(exportArrowFlatbufferModel(embedded.schema!));
  function arrowFields(fields:any[],pointer:string){for(const [i,field] of fields.entries()){
   const location=pointer+'/'+i,type=field.type?.type,parameters=field.type?.value,context='Embedded Arrow '+location+' ('+JSON.stringify(field.name)+'): ';
   if(type==='Duration')arrowIssue('ARROW_DURATION_NOT_PROJECTED',context+'duration unit '+parameters?.unit+' is not a physical integer or Avro duration semantic; any row binding must preserve the unit explicitly.');
   if(type==='Timestamp'&&parameters?.timezone)arrowIssue('ARROW_TIMEZONE_NOT_PROJECTED',context+'named timezone '+JSON.stringify(parameters.timezone)+' is not retained by Avro instant timestamps.');
   if(['LargeList','FixedSizeList','ListView','LargeListView'].includes(type))arrowIssue('ARROW_LIST_REFINEMENT_NOT_PROJECTED',context+type+' width/layout'+(parameters?.listSize!==undefined?' and size '+parameters.listSize:'')+' are not enforced by an Avro array.');
   if(Array.isArray(field.children))arrowFields(field.children,location+'/children');
  }}
  arrowFields(model.value.fields??[],'/fields');
 }
 const schema=(inspected.metadata as any).schema,annotations=new Map(inspected.annotations?.map(a=>[a.index,a])),containers=new Map(inspected.containers?.map(c=>[c.index,c])),nodes=new Map<number,ParquetSchemaNode>();
 const collect=(n:ParquetSchemaNode)=>{nodes.set(n.index,n);n.children.forEach(collect);};collect(inspected.tree);
 const usedOverrides=new Set<string>();
 for(const [index,e] of schema.entries())if(unknown(e))fail(index,'Unknown schema wire content prevents safe lowering, including container wrappers');
 issue(0,'SCHEMA_ONLY','representation-change','Schema lowering only: page encodings, column metadata, statistics, field IDs, sort order, unknown metadata and stored values remain in the source; a separate encoder is required');
 const fieldName=(n:ParquetSchemaNode)=>{const key=String(n.index),name=Object.hasOwn(policy.fieldNames,key)?policy.fieldNames[key]!:n.name;if(Object.hasOwn(policy.fieldNames,key)){usedOverrides.add(key);issue(n.index,'FIELD_RENAMED','representation-change','Explicit Avro field name differs from native name or confirms the selected spelling');}if(!ident.test(name))fail(n.index,'Native name is not an Avro identifier; provide a schema-index override');return name;};
 function fields(children:ParquetSchemaNode[]):Json[]{const names=new Set<string>();return children.map(n=>{const name=fieldName(n);if(names.has(name))fail(n.index,'Duplicate target field names');names.add(name);return {name,type:lower(n)};});}
 function lower(n:ParquetSchemaNode,ignoreRepetition=false):Json{
  const e=schema[n.index],a=annotations.get(n.index),container=containers.get(n.index);let type:Json;
  result.mappings.push({index:n.index,path:[...n.path]});
  if(unknown(e))return fail(n.index,'Unknown schema wire content prevents safe lowering');
  if(container){
   if(container.kind==='list'){
    const element=nodes.get(container.elementIndex)!;type={type:'array',items:lower(element,container.layout==='two-level')};
    issue(n.index,'LIST_LAYOUT','representation-change','Native LIST wrappers and repetition levels lower to an Avro array; source layout remains in the capture');
   }else{
    const key=nodes.get(container.keyIndex)!,value=container.valueIndex===undefined?undefined:nodes.get(container.valueIndex)!;
    type={type:'array',items:{type:'record',name:policy.recordName+'_entry_'+n.index,fields:[{name:'key',type:lower(key,true)},{name:'value',type:value?lower(value):'null'}]}};
    issue(n.index,'MAP_ENTRY_ARRAY','representation-change','Explicit ordered key/value entry array supports non-string keys and retains duplicates; Parquet last-value map semantics and key equality require a separate consumer');
   }
  }else if(e.type===undefined){
   if(a)return fail(n.index,'Unmapped annotated group');
   type={type:'record',name:policy.recordName+'_record_'+n.index,fields:fields(n.children)};
  }else if(a){
   if(a.validation!=='checked')return fail(n.index,'Uninterpreted logical annotation');
   const p=a.parameters as any;
   if(a.name==='STRING'||a.name==='ENUM'||a.name==='JSON'){
    type='string';if(a.name!=='STRING')issue(n.index,'TEXT_LOGICAL_CONSTRAINT','not-enforced','Avro string does not enforce native enumeration or JSON interpretation');
   }else if(a.name==='BSON'){type='bytes';issue(n.index,'BSON_VALIDATION','not-enforced','BSON interpretation is not enforced by Avro bytes');}
   else if(a.name==='INTEGER'){
    const width=Number(p.bitWidth);type=p.isSigned?(width<=32?'int':'long'):width<32?'int':width===32?'long':{type:'bytes',logicalType:'decimal',precision:20,scale:0};
    if(!p.isSigned||width<32)issue(n.index,'INTEGER_DOMAIN','not-enforced','Target admits values outside native signed/unsigned width; uint64 requires exact decimal encoding');
   }else if(a.name==='DECIMAL'){
    const precision=Number(p.precision),scale=Number(p.scale);if(!Number.isSafeInteger(precision)||precision<1||precision>1000)return fail(n.index,'Decimal precision exceeds current 1–1000 projection bound');
    type={type:'bytes',logicalType:'decimal',precision,scale};issue(n.index,'DECIMAL_CARRIER','representation-change','Physical integer or fixed/variable decimal carrier requires exact Avro decimal bytes encoding');
   }else if(a.name==='DATE')type={type:'int',logicalType:'date'};
   else if(a.name==='TIME'||a.name==='TIMESTAMP'){
    const unit=Object.keys(p.unit).find(k=>k!=='$unknown')!,suffix={MILLIS:'millis',MICROS:'micros',NANOS:'nanos'}[unit];
    if(a.name==='TIME'&&unit==='NANOS'){type='long';issue(n.index,'TIME_NANOS','representation-change','Avro has no time-nanos logical type: long retains nanoseconds with unit and time-of-day bounds remaining in source');}
    else type={type:a.name==='TIME'&&unit==='MILLIS'?'int':'long',logicalType:(a.name==='TIME'?'time':p.isAdjustedToUTC?'timestamp':'local-timestamp')+'-'+suffix};
    issue(n.index,'TEMPORAL_INTERPRETATION','not-enforced','Native UTC-adjustment, time-of-day bounds and target runtime range/annotation support require a value encoder; no units are rounded');
   }else if(a.name==='UUID'){type={type:'fixed',name:policy.recordName+'_fixed_'+n.index,size:16,logicalType:'uuid'};issue(n.index,'UUID_RUNTIME_SUPPORT','not-enforced','Avro 1.12 permits fixed UUID, but some runtimes interpret only string UUID; verify the selected consumer');}
   else if(a.name==='FLOAT16'){type='float';issue(n.index,'FLOAT16_WIDTH','representation-change','Half-float bytes require decoding; Avro float widens the value domain and does not preserve NaN payload bits');}
   else if(a.name==='INTERVAL'){type={type:'fixed',name:policy.recordName+'_fixed_'+n.index,size:12};issue(n.index,'INTERVAL_MEANING','not-enforced','Raw 12-byte carrier retains native components; interval interpretation and arithmetic remain in source');}
   else return fail(n.index,'Logical annotation has no implemented target mapping');
  }else{
   const types:Record<string,Json>={'0':'boolean','1':'int','2':'long','4':'float','5':'double','6':'bytes'};
   if(e.type==='7'){const size=Number(e.type_length);if(!Number.isSafeInteger(size)||size<1||size>4096)return fail(n.index,'Fixed size exceeds current 1–4096 projection bound');type={type:'fixed',name:policy.recordName+'_fixed_'+n.index,size};}
   else if(Object.hasOwn(types,e.type))type=types[e.type]!;
   else return fail(n.index,'Physical type has no portable mapping (including INT96)');
  }
  if(!ignoreRepetition){if(e.repetition_type==='1')type=['null',type];else if(e.repetition_type==='2'){type={type:'array',items:type};issue(n.index,'REPEATED_ARRAY','representation-change','Unannotated repeated field lowers to an array of non-null items');}}
  return type;
 }
 if(unknown(schema[0])||annotations.has(0))fail(0,'Annotated or unknown root schema cannot be lowered');
 const targetFields=fields(inspected.tree.children);
 for(const k of Object.keys(policy.fieldNames))if(!usedOverrides.has(k))fail(Number(k),'Field-name override does not identify an emitted record field');
 if(fatal||policy.lossPolicy==='strict'&&result.issues.length)return result;
 result.nativeSchema=JSON.stringify({type:'record',name:policy.recordName,namespace:policy.namespace,fields:targetFields},null,2)+'\n';result.target=importAvroSchema(result.nativeSchema,{id:policy.id});result.status='projected';return result;
}
