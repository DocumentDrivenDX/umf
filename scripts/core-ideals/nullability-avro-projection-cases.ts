import {declareCoreNullability} from '../../src/model/nullability';
import {avroCarriers} from '../../src/core-ideals/avro-carriers';
import type {Document,Nullability,ScalarType} from '../../src/model/types';
import type {NullabilityAvroRequest} from '../../src/core-ideals/nullability-avro-projection';
const families:Record<string,ScalarType>={boolean:'boolean',int:'integer',long:'integer',float:'float',double:'float',bytes:'binary',string:'string',date:'date','time-millis':'time','time-micros':'time','timestamp-millis':'timestamp','timestamp-micros':'timestamp','local-timestamp-micros':'timestamp','decimal(38,9)':'decimal'};
export function avroNullabilityProjectionCases(){
 const rows:Array<{id:string;nativeType:keyof typeof avroCarriers;label:Nullability;variant:string;author:ReturnType<typeof declareCoreNullability>;request:NullabilityAvroRequest;status:'projected'|'blocked';allowsNull:boolean}>=[];
 function add(nativeType:keyof typeof avroCarriers,label:Nullability,variant:string,mode:'strict'|'report'){
  const id='availability_'+rows.length;
  const source:Document={umf:'0.3.0',id:'ideal-'+id,vocabularies:{},modules:[{id:'m',namespace:'availability',elements:[{id:'e',name:'value',kind:'field',description:'Availability "meaning" 雪 \\ retained',...(families[nativeType]?{scalarType:families[nativeType]}:{}),extensions:{}}]}]};
  const request:NullabilityAvroRequest={id,namespace:'availability',recordName:'Example',fieldName:'value',nativeType,mode,scope:'underlying-field-value',carrier:'avro-null'};
  const field=source.modules[0]!.elements[0]!;
  if(variant==='unknown')field.future={meaning:'unknown'};
  if(variant==='namespace')source.modules[0]!.namespace='other';
  if(variant==='type')field.scalarType='string';
  if(variant==='scope')request.scope='write-input';
  if(variant==='carrier')request.carrier='unresolved';
  if(variant==='default')field.default=7;
  if(variant==='exactness')field.exactness={required:true,binaryWidth:64};
  const author=declareCoreNullability(source,{module:'m',element:'e'},label);
  const loss=['unknown','namespace','type','default','exactness'].includes(variant)||['scope','carrier'].includes(variant)&&label!=='unspecified'||nativeType==='null'&&label==='required';
  rows.push({id,nativeType,label,variant,author,request,status:mode==='strict'&&loss?'blocked':'projected',allowsNull:nativeType==='null'||label==='absent-allowed'&&!['scope','carrier'].includes(variant)});
 }
 for(const type of Object.keys(avroCarriers) as (keyof typeof avroCarriers)[])for(const label of ['required','absent-allowed','unspecified'] as const)add(type,label,'plain','strict');
 for(const variant of ['unknown','namespace','type','scope','carrier','default','exactness'])for(const label of ['required','absent-allowed','unspecified'] as const)for(const mode of ['strict','report'] as const)add('float',label,variant,mode);
 add('null','required','plain','report');return rows;
}
