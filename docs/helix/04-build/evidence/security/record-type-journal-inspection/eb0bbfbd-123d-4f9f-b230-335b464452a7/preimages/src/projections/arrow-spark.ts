import {copyJson} from '../model/json';
import {UmfError,pointer,type Document} from '../model/types';
import {exportArrowFlatbufferModel} from '../adapters/arrow/flatbuffer-model';
import {importSparkSchema} from '../adapters/spark';
import type {SparkArrowIssue} from './spark-arrow';
export interface ArrowSparkPolicy {id:string;preferTimestampNtz:boolean;variant:'spark-tagged-struct'|'preserve-struct';lossPolicy:'strict'|'allow-reported-loss'}
export interface ArrowSparkProjection {status:'blocked'|'projected';complete:false;source:Document;policy:ArrowSparkPolicy;issues:SparkArrowIssue[];target?:Document}
/** Arrow logical schema to Spark 4.0.1 JSON, retaining source independently of recovery. */
export function projectArrowToSpark(source:Document,input:ArrowSparkPolicy):ArrowSparkProjection{
 if(!input||typeof input.id!=='string'||!input.id||typeof input.preferTimestampNtz!=='boolean'||!['spark-tagged-struct','preserve-struct'].includes(input.variant)||!['strict','allow-reported-loss'].includes(input.lossPolicy)||Object.keys(input).some(k=>!['id','preferTimestampNtz','variant','lossPolicy'].includes(k)))throw new UmfError('ARROW_SPARK_POLICY','Explicit supported Arrow-to-Spark policy required');
 const result:ArrowSparkProjection={status:'blocked',complete:false,source:copyJson(source) as unknown as Document,policy:copyJson(input) as unknown as ArrowSparkPolicy,issues:[]};const policy=result.policy,model=JSON.parse(exportArrowFlatbufferModel(source));let fatal=false;
 const issue=(path:string,code:string,classification:SparkArrowIssue['classification'],detail:string)=>result.issues.push({path,code,classification,detail,retainedInSource:true});
 const fail=(path:string,detail:string)=>{fatal=true;issue(path,'ARROW_SPARK_UNSUPPORTED','unsupported',detail);return 'void';};
 const known=(n:any,keys:string[],path:string)=>{for(const k of Object.keys(n))if(!keys.includes(k))fail(path+'/'+pointer(k),'Unknown Arrow property cannot be lowered');};
 const metadata=(n:any,path:string)=>{if(n?.length)issue(path,'ARROW_METADATA_LOSS','loss','Arrow metadata remains only in retained source');};
 function field(f:any,path:string):any{if(f.name===undefined)issue(path+'/name','ARROW_FIELD_NAME_DEFAULT','representation-change','Absent Arrow field name becomes an empty Spark name');return {name:f.name??'',type:type(f,path),nullable:f.nullable??false,metadata:{}};}
 function type(f:any,path:string):any{
  known(f,['name','nullable','type','dictionary','children','custom_metadata'],path);metadata(f.custom_metadata,path+'/custom_metadata');
  if(f.custom_metadata?.some((m:any)=>m.key==='ARROW:extension:name'||m.key==='ARROW:extension:metadata')){fatal=true;issue(path+'/custom_metadata','ARROW_EXTENSION_UNINTERPRETED','unsupported','Arrow extension semantics cannot be equated with the physical storage type without an explicit mapping');return 'void';}
  if(f.dictionary){known(f.dictionary,['id','indexType','isOrdered','dictionaryKind'],path+'/dictionary');if(f.dictionary.indexType)known(f.dictionary.indexType,['bitWidth','is_signed'],path+'/dictionary/indexType');issue(path+'/dictionary','ARROW_DICTIONARY_LOSS','loss','Dictionary identity, index encoding and ordering are not represented in Spark value type');}
  const tag=f.type?.type,v=f.type?.value??{},children=f.children??[];known(f.type??{},['type','value'],path+'/type');
  const allowed:Record<string,string[]>={Int:['bitWidth','is_signed'],FloatingPoint:['precision'],Decimal:['precision','scale','bitWidth'],Timestamp:['unit','timezone'],Duration:['unit'],Date:['unit'],Map:['keysSorted'],FixedSizeBinary:['byteWidth'],FixedSizeList:['listSize']};known(v,allowed[tag]??[],path+'/type/value');
  if(!['Struct_','List','LargeList','FixedSizeList','Map'].includes(tag)&&children.length)return fail(path+'/children','Scalar Arrow type has unexpected children');
  if(tag==='Bool')return 'boolean';
  if(tag==='Int'){const types:Record<number,string>={8:'byte',16:'short',32:'integer',64:'long'};return v.is_signed===true&&types[v.bitWidth]?types[v.bitWidth]:fail(path,'Unsigned or unsupported integer width');}
  if(tag==='FloatingPoint')return v.precision==='SINGLE'?'float':v.precision==='DOUBLE'?'double':fail(path,'Half precision has no verified Spark mapping');
  if(tag==='Utf8'||tag==='LargeUtf8'){if(tag==='LargeUtf8')issue(path,'ARROW_OFFSET_WIDTH_LOSS','loss','Spark string does not retain Arrow offset width');return 'string';}
  if(['Binary','LargeBinary','FixedSizeBinary'].includes(tag)){if(tag!=='Binary')issue(path,'ARROW_BINARY_LAYOUT_LOSS','loss','Spark binary does not retain fixed size or large-offset layout');if(tag==='FixedSizeBinary'&&!((v.byteWidth??0)>=0))return fail(path,'Invalid fixed binary width');return 'binary';}
  if(tag==='Null'){if(f.nullable!==true)return fail(path,'Non-nullable null field is invalid Arrow');return 'void';}
  if(tag==='Decimal'){const p=v.precision??0,s=v.scale??0;if(![32,64,128,256].includes(v.bitWidth??128)||p<1||p>38||s<0||s>p)return fail(path,'Decimal width/range/configuration outside verified Spark target');if((v.bitWidth??128)!==128)issue(path,'ARROW_DECIMAL_WIDTH_LOSS','loss','Spark decimal does not retain the Arrow physical decimal width');return `decimal(${p},${s})`;}
  if(tag==='Date')return v.unit==='DAY'?'date':fail(path,'Only date32 is mapped by the pinned native conversion');
  if(tag==='Timestamp'){
   if((v.unit??'SECOND')!=='MICROSECOND')issue(path,'ARROW_TIMESTAMP_UNIT_LOSS','loss','Spark timestamp is microsecond-based; data conversion may lose precision or require scaling');
   if(v.timezone){issue(path,'ARROW_TIMEZONE_LOSS','loss','Spark timestamp does not retain Arrow timezone label');return 'timestamp';}
   issue(path,'ARROW_TIMESTAMP_INTERPRETATION','representation-change','Timezone-free timestamp recovery follows the explicit preferTimestampNtz choice');return policy.preferTimestampNtz?'timestamp_ntz':'timestamp';
  }
  if(tag==='Duration'){issue(path,'ARROW_DURATION_INTERPRETATION','representation-change','Arrow duration lowers to Spark day-to-second interval; Arrow unit is not retained');return 'interval day to second';}
  if(['List','LargeList','FixedSizeList'].includes(tag)){
   if(children.length!==1)return fail(path,'List requires exactly one child');if(tag!=='List')issue(path,'ARROW_LIST_LAYOUT_LOSS','loss','Spark array does not retain large offsets or fixed list length');if(tag==='FixedSizeList'&&!((v.listSize??0)>=0))return fail(path,'Invalid fixed list size');
   if(children[0].nullable!==true)issue(path+'/children/0/nullable','ARROW_ELEMENT_NULLABILITY_LOSS','loss','Native Spark recovery widens array element nullability');
   if(children[0].name!=='element')issue(path+'/children/0/name','ARROW_CHILD_NAME_LOSS','loss','Spark array has no named element field');return {type:'array',elementType:type(children[0],path+'/children/0'),containsNull:true};
  }
  if(tag==='Map'){
   const entry=children[0],items=entry?.children;if(children.length!==1||entry?.type?.type!=='Struct_'||entry.nullable===true||items?.length!==2||items[0].nullable===true)return fail(path,'Invalid Arrow map entry/key layout');
   known(entry,['name','nullable','type','children','custom_metadata'],path+'/children/0');known(entry.type,['type','value'],path+'/children/0/type');known(entry.type.value??{},[],path+'/children/0/type/value');metadata(entry.custom_metadata,path+'/children/0/custom_metadata');
   if(v.keysSorted)issue(path,'ARROW_MAP_ORDER_LOSS','loss','Spark map does not retain keysSorted');if(items[1].nullable!==true)issue(path+'/children/0/children/1/nullable','ARROW_VALUE_NULLABILITY_LOSS','loss','Native Spark recovery widens map value nullability');
   if(entry.name!=='entries'||items[0].name!=='key'||items[1].name!=='value')issue(path+'/children','ARROW_CHILD_NAME_LOSS','loss','Spark map does not retain Arrow entry/key/value names');
   return {type:'map',keyType:type(items[0],path+'/children/0/children/0'),valueType:type(items[1],path+'/children/0/children/1'),valueContainsNull:true};
  }
  if(tag==='Struct_'){
   const marker=children.some((c:any)=>c.name==='metadata'&&c.custom_metadata?.some((m:any)=>m.key==='variant'&&m.value==='true'))&&children.some((c:any)=>c.name==='value');
   if(marker&&policy.variant==='spark-tagged-struct'){
    if(children.length!==2||children[0].name!=='value'||children[1].name!=='metadata'||children.some((c:any)=>c.type?.type!=='Binary'||c.nullable===true||c.dictionary||c.children?.length))return fail(path,'Variant marker on a noncanonical Spark physical struct');
    children.forEach((c:any,i:number)=>type(c,path+'/children/'+i));issue(path,'ARROW_SPARK_VARIANT','representation-change','Explicit Spark variant convention replaces the tagged physical struct');return 'variant';
   }
   return {type:'struct',fields:children.map((c:any,i:number)=>field(c,path+'/children/'+i))};
  }
  return fail(path,'Unsupported Arrow type '+tag);
 }
 known(model,['rootType','value'],'');let schema=model.value,at='/value';
 if(model.rootType==='Message'){
  known(schema,['version','header','bodyLength','custom_metadata'],at);if(schema.header?.type!=='Schema'||(schema.bodyLength??'0')!=='0'){fail(at,'Expected a body-free schema message');return result;}known(schema.header,['type','value'],at+'/header');metadata(schema.custom_metadata,at+'/custom_metadata');schema=schema.header.value;at+='/header/value';
 }else if(model.rootType!=='Schema'){fail('','Expected Schema or schema Message root');return result;}
 known(schema,['endianness','fields','custom_metadata','features'],at);metadata(schema.custom_metadata,at+'/custom_metadata');if(schema.endianness==='Big')issue(at+'/endianness','ARROW_ENDIANNESS_LOSS','loss','Spark schema does not retain Arrow physical byte order');if(schema.features?.length)issue(at+'/features','ARROW_FEATURES_LOSS','loss','Arrow protocol feature requirements remain only in source');
 for(const [key,value] of Object.entries(source))if(!['umf','id','modules','vocabularies'].includes(key))issue('/'+pointer(key),'ARROW_SOURCE_CONTEXT','loss','UMF document context remains in source only');
 for(const [i,m] of source.modules.entries()){if(m.id!=='metadata')fail('/modules/'+i,'Extra source module');for(const key of Object.keys(m))if(!['id','namespace','elements'].includes(key)||key==='namespace'&&m.namespace)issue('/modules/'+i+'/'+pointer(key),'ARROW_SOURCE_CONTEXT','loss','Module context remains in source');for(const [j,e] of m.elements.entries()){if(e.id!=='root')fail('/modules/'+i+'/elements/'+j,'Extra source element');for(const key of Object.keys(e))if(!['id','extensions'].includes(key))issue('/modules/'+i+'/elements/'+j+'/'+pointer(key),'ARROW_SOURCE_CONTEXT','loss','Element context remains in source');for(const key of Object.keys(e.extensions))if(key!=='umf.arrow.flatbuffer')issue('/modules/'+i+'/elements/'+j+'/extensions/'+pointer(key),'ARROW_SOURCE_CONTEXT','loss','Extension context remains in source');}}
 for(const [id,v] of Object.entries(source.vocabularies))if(id!=='umf.arrow.flatbuffer'||Object.keys(v).some(k=>k!=='version'))issue('/vocabularies/'+pointer(id),'ARROW_SOURCE_CONTEXT','loss','Vocabulary context remains in source');
 const target={type:'struct',fields:(schema.fields??[]).map((f:any,i:number)=>field(f,at+'/fields/'+i))};if(fatal||(policy.lossPolicy==='strict'&&result.issues.length))return result;
 result.target=importSparkSchema(JSON.stringify(target),{id:policy.id});result.status='projected';return result;
}
