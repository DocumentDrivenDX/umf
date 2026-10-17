import {inspectParquetSchema,type ParquetSchemaInspection} from './schema';
import type {Document,Json} from '../../model/types';
export interface ParquetLogicalAnnotation {index:number;origin:'logical'|'converted';name:string;parameters:Json;validation:'checked'|'uninterpreted'|'invalid'}
export interface ParquetLogicalInspection extends ParquetSchemaInspection {annotations?:ParquetLogicalAnnotation[]}
const legacy=['STRING','MAP','MAP_KEY_VALUE','LIST','ENUM','DECIMAL','DATE','TIME_MILLIS','TIME_MICROS','TIMESTAMP_MILLIS','TIMESTAMP_MICROS','UINT_8','UINT_16','UINT_32','UINT_64','INT_8','INT_16','INT_32','INT_64','JSON','BSON','INTERVAL'];
/** Logical schema rules only: never inspects or coerces stored values. */
export function inspectParquetLogicalTypes(source:Document):ParquetLogicalInspection{
 const r:ParquetLogicalInspection=inspectParquetSchema(source);if(r.status!=='checked')return r;const schema=(r.metadata as any).schema,annotations:ParquetLogicalAnnotation[]=[];
 const issue=(code:string,path:string,message:string,error=false)=>{r.diagnostics.push({code,path,severity:error?'error':'warning',message});if(error)r.status='blocked';};
 for(const [index,e] of schema.entries()){
  if(!e.logicalType&&e.converted_type===undefined)continue;const at='/schema/'+index,origin=e.logicalType?'logical':'converted',modern=e.logicalType&&Object.keys(e.logicalType).filter(k=>k!=='$unknown')[0];let name=modern??(origin==='converted'?legacy[Number(e.converted_type)]:undefined),parameters:any=modern?e.logicalType[modern]:{};
  if(!name){annotations.push({index,origin,name:'unknown',parameters:e.logicalType??{code:e.converted_type},validation:'uninterpreted'});issue('PARQUET_LOGICAL_UNKNOWN',at,'Unknown logical/converted annotation retained without fallback interpretation');continue;}
  if(origin==='converted'){
   if(/^(U?INT)_/.test(name)){const [prefix,width]=name.split('_');name='INTEGER';parameters={bitWidth:width,isSigned:prefix==='INT'};}
   else if(name==='DECIMAL')parameters={...(e.precision===undefined?{}:{precision:e.precision}),scale:e.scale??'0'};
   else if(/^(TIME|TIMESTAMP)_/.test(name)){const [kind,unit]=name.split('_');name=kind;parameters={isAdjustedToUTC:true,unit:{[unit!]:{}}};}
  }
  const annotation:ParquetLogicalAnnotation={index,origin,name:name!,parameters,validation:'checked'};annotations.push(annotation);
  const bad=(message:string)=>{annotation.validation='invalid';issue('PARQUET_LOGICAL_CONFLICT',at,message,true);},unknown=(message:string)=>{if(annotation.validation!=='invalid')annotation.validation='uninterpreted';issue('PARQUET_LOGICAL_UNVERIFIED',at,message);},requireType=(...types:string[])=>{if(!types.includes(e.type))bad(name+' is incompatible with this physical type');};let converted:string|undefined;
  if(['STRING','ENUM','JSON','BSON','GEOMETRY','GEOGRAPHY'].includes(name!)){requireType('6');converted={STRING:'0',ENUM:'4',JSON:'19',BSON:'20'}[name as 'STRING'];if(name==='GEOMETRY'||name==='GEOGRAPHY')unknown('Physical carrier checked; CRS, interpolation and WKB semantics remain unverified');}
  else if(name==='UUID'||name==='FLOAT16'||name==='INTERVAL'){requireType('7');const width={UUID:'16',FLOAT16:'2',INTERVAL:'12'}[name as 'UUID'|'FLOAT16'|'INTERVAL'];if(e.type_length!==width)bad(name+' requires byte length '+width);if(name==='INTERVAL')converted='21';}
  else if(name==='DATE'){requireType('1');converted='6';}
  else if(name==='INTEGER'){const width=parameters.bitWidth;if(!['8','16','32','64'].includes(width))bad('Integer bitWidth must be 8, 16, 32 or 64');else{requireType(width==='64'?'2':'1');converted=String((parameters.isSigned?15:11)+['8','16','32','64'].indexOf(width));}}
  else if(name==='DECIMAL'){
   requireType('1','2','6','7');converted='5';const p=parameters.precision===undefined?0n:BigInt(parameters.precision),s=BigInt(parameters.scale);if(p<=0n||s<0n||s>p)bad('Decimal precision must be positive and scale between zero and precision');
   if(e.type==='1'&&p>9n||e.type==='2'&&p>18n)bad('Decimal precision exceeds integer physical capacity');if(e.type==='2'&&p<10n)issue('PARQUET_DECIMAL_SMALL_INT64',at,'Decimal precision below 10 uses an int64 carrier');
   if(e.type==='7'){const n=BigInt(e.type_length);if(n>4096n)unknown('Fixed-decimal capacity check exceeds the 4096-byte exact-arithmetic limit');else{const maximum=((1n<<(8n*n-1n))-1n).toString().length-1;if(p>BigInt(maximum))bad('Decimal precision exceeds fixed-byte physical capacity');}}
   if(origin==='logical')for(const key of ['precision','scale'])if(e[key]!==undefined&&e[key]!==parameters[key])issue('PARQUET_LEGACY_ANNOTATION_CONFLICT',at+'/'+key,'Legacy decimal parameter differs from authoritative logical annotation');
  }
  else if(name==='TIME'||name==='TIMESTAMP'){
   const units=Object.keys(parameters.unit).filter(k=>k!=='$unknown'),unit=units[0];if(!unit){if(parameters.unit.$unknown)unknown('Future temporal unit remains uninterpreted');else bad('Temporal unit must select one alternative');}else if(!['MILLIS','MICROS','NANOS'].includes(unit))unknown('Future temporal unit remains uninterpreted');else{requireType(name==='TIME'&&unit==='MILLIS'?'1':'2');converted=unit==='NANOS'?undefined:String((name==='TIME'?7:9)+(unit==='MICROS'?1:0));}
  }
  else if(['LIST','MAP','MAP_KEY_VALUE','VARIANT','FILE'].includes(name!)){if(e.type!==undefined)bad(name+' requires a group');unknown('Nested layout and value rules remain unverified');converted={LIST:'3',MAP:'1',MAP_KEY_VALUE:'2'}[name as 'LIST'];}
  else if(name==='UNKNOWN')unknown('Always-null annotation retained; stored nullness has not been verified');
  else unknown('Logical annotation has no implemented rule set');
  const hasUnknown=(v:any):boolean=>v&&typeof v==='object'&&(Array.isArray(v.$unknown)&&v.$unknown.length>0||Object.values(v).some(hasUnknown));if(hasUnknown(parameters))unknown('Additional logical parameters remain uninterpreted');
  if(origin==='logical'&&converted!==undefined){if(e.converted_type===undefined)issue('PARQUET_LEGACY_ANNOTATION_ABSENT',at,'Corresponding legacy annotation is absent; source remains unchanged');else if(e.converted_type!==converted)issue('PARQUET_LEGACY_ANNOTATION_CONFLICT',at,'Legacy annotation conflicts with authoritative logical annotation');}
 }
 r.annotations=annotations;issue('PARQUET_LOGICAL_VALUES_UNVERIFIED','','Annotation checks do not verify values, statistics, sort order or safe cross-system lowering');return r;
}
