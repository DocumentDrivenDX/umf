import {CURRENT_CORE_VERSION} from '../../src/model/types';
// Synthetic current-core fixture for active operation/projection behavior.
import {declareCoreNullability} from '../../src/model/nullability';
import {parquetCarriers} from '../../src/core-ideals/parquet-carriers';
import type {Document, Nullability, ScalarType} from '../../src/model/types';
import type {NullabilityParquetRequest} from '../../src/core-ideals/nullability-parquet-projection';
const families:Record<keyof typeof parquetCarriers,ScalarType>={boolean:'boolean',int32:'integer',int64:'integer',float32:'float',float64:'float',binary:'binary',string:'string',date:'date','time-millis':'time','time-micros':'time','timestamp-millis-utc':'timestamp','timestamp-micros-utc':'timestamp'};
export function parquetNullabilityProjectionCases(){
 const rows:Array<{id:string;nativeType:keyof typeof parquetCarriers;label:Nullability;variant:string;author:ReturnType<typeof declareCoreNullability>;request:NullabilityParquetRequest;status:'projected'|'blocked';required:boolean}>=[];
 function add(nativeType:keyof typeof parquetCarriers,label:Nullability,variant:string,mode:'strict'|'report'){
  const id='availability_'+rows.length,effectiveType=variant==='default'?'int32':nativeType,source:Document={umf:CURRENT_CORE_VERSION,id:'ideal-'+id,vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'e',name:'value',kind:'field',scalarType:families[effectiveType],extensions:{}}]}]};
  const request:NullabilityParquetRequest={id,recordName:'Example',fieldName:'value',nativeType:effectiveType,mode,scope:'row-leaf-value',carrier:'definition-level'},field=source.modules[0]!.elements[0]!;
  if(variant==='unknown')field.future={meaning:'unknown'};
  if(variant==='namespace')source.modules[0]!.namespace='sales';
  if(variant==='type')field.scalarType='string';
  if(variant==='scope')request.scope='repeated-element-value';
  if(variant==='carrier')request.carrier='unresolved';
  if(variant==='description')field.description='Human meaning remains retained';
  if(variant==='default')(field as Record<string,any>).default={on:'missing',value:{integerToken:'7'}};
  if(variant==='exactness')field.exactness={required:true,binaryWidth:64};
  if(variant==='cardinality'){field.cardinality='array';delete field.scalarType;}
  if(variant==='quoted'){request.fieldName='value.雪\n[]';field.name=request.fieldName;request.recordName='Root 雪';}
  let author:ReturnType<typeof declareCoreNullability>;
  try { author=declareCoreNullability(source,{module:'m',element:'e'},label); }
  catch(error) { throw new Error(`Invalid Parquet nullability fixture ${nativeType}/${label}/${variant}: ${String(error)}`); }
  const loss=['unknown','namespace','type','description','default','exactness','cardinality'].includes(variant)||['scope','carrier'].includes(variant)&&label!=='unspecified';
  rows.push({id,nativeType:effectiveType,label,variant,author,request,status:mode==='strict'&&loss?'blocked':'projected',required:label==='required'&&!['scope','carrier'].includes(variant)});
 }
 for(const type of Object.keys(parquetCarriers) as (keyof typeof parquetCarriers)[])for(const label of ['required','absent-allowed','unspecified'] as const)add(type,label,'plain','strict');
 for(const variant of ['unknown','namespace','type','scope','carrier','description','default','exactness','cardinality'])for(const label of ['required','absent-allowed','unspecified'] as const)for(const mode of ['strict','report'] as const)add('float32',label,variant,mode);
 add('int32','required','quoted','strict');return rows;
}
