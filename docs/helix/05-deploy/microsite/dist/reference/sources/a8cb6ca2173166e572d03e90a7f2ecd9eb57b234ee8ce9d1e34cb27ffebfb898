import {copyJson} from '../model/json';
import {UmfError,pointer,type Document} from '../model/types';
import {exportSparkSchema} from '../adapters/spark';
import {importArrowFlatbufferModel} from '../adapters/arrow/flatbuffer-model';
export interface SparkArrowPolicy {id:string;timestampUtc:boolean;largeTypes:boolean;rejectNestedDuplicates:boolean;lossPolicy:'strict'|'allow-reported-loss'}
export interface SparkArrowIssue {path:string;code:string;classification:'loss'|'unsupported'|'representation-change';detail:string;retainedInSource:true}
export interface SparkArrowProjection {status:'blocked'|'projected';complete:false;source:Document;policy:SparkArrowPolicy;issues:SparkArrowIssue[];target?:Document}
/** Spark 4.0.1 schema lowering to Arrow logical metadata. No record/data conversion. */
export function projectSparkToArrow(source:Document,input:SparkArrowPolicy):SparkArrowProjection{
 if(!input||typeof input.id!=='string'||!input.id||typeof input.timestampUtc!=='boolean'||typeof input.largeTypes!=='boolean'||typeof input.rejectNestedDuplicates!=='boolean'||!['strict','allow-reported-loss'].includes(input.lossPolicy)||Object.keys(input).some(k=>!['id','timestampUtc','largeTypes','rejectNestedDuplicates','lossPolicy'].includes(k)))throw new UmfError('SPARK_ARROW_POLICY','Explicit supported projection options required');
 const policy=copyJson(input) as unknown as SparkArrowPolicy,result:SparkArrowProjection={status:'blocked',complete:false,source:copyJson(source) as unknown as Document,policy,issues:[]};
 // Metadata numbers in this view are never used as target authority. Exact source stays in result.source.
 const root=JSON.parse(exportSparkSchema(source));let fatal=false;
 const issue=(path:string,code:string,classification:SparkArrowIssue['classification'],detail:string)=>result.issues.push({path,code,classification,detail,retainedInSource:true});
 const fail=(path:string,detail:string)=>{fatal=true;issue(path,'SPARK_ARROW_UNSUPPORTED','unsupported',detail);return {type:{type:'Null',value:{}},children:[]};};
 function known(n:any,keys:string[],path:string){for(const key of Object.keys(n))if(!keys.includes(key))fail(path+'/'+pointer(key),'Unknown source property has no established Arrow meaning');}
 const scalar=(type:string,value:Record<string,unknown>={})=>({type:{type,value},children:[] as any[]});
 function field(f:any,path:string,typePath=path+'/type'):any{
  known(f,['name','type','nullable','metadata'],path);
  if(f.nullable===undefined)issue(path+'/nullable','SPARK_DEFAULT_NULLABLE','representation-change','Spark nullable default is made explicit in Arrow');
  if(f.metadata&&Object.keys(f.metadata).length)for(const key of Object.keys(f.metadata))issue(path+'/metadata/'+pointer(key),key==='__COLLATIONS'?'SPARK_COLLATION_LOSS':'SPARK_METADATA_LOSS','loss','Spark field metadata is not conveyed by this native-compatible Arrow lowering');
  const nullable=f.nullable??true,shape=type(f.type,typePath);
  if(shape.type.type==='Null'&&!nullable)fail(path,'Arrow does not allow a non-nullable null field');
  return {name:f.name,...(nullable?{nullable:true}:{}),...shape};
 }
 function struct(n:any,path:string,nested:boolean){known(n,['type','fields'],path);if(nested&&policy.rejectNestedDuplicates&&new Set(n.fields.map((f:any)=>f.name)).size!==n.fields.length)fail(path+'/fields','Duplicate nested field names rejected by the selected policy');return n.fields.map((f:any,i:number)=>field(f,path+'/fields/'+i));}
 function type(n:any,path:string):any{
  if(typeof n==='string'){
   const ints:Record<string,number>={byte:8,short:16,integer:32,long:64};if(Object.hasOwn(ints,n))return scalar('Int',{bitWidth:ints[n],is_signed:true});
   if(n==='boolean')return scalar('Bool');if(n==='float'||n==='double')return scalar('FloatingPoint',{precision:n==='float'?'SINGLE':'DOUBLE'});
   if(n==='string')return scalar(policy.largeTypes?'LargeUtf8':'Utf8');if(n==='binary')return scalar(policy.largeTypes?'LargeBinary':'Binary');if(n==='void')return scalar('Null');if(n==='date')return scalar('Date',{unit:'DAY'});
   if(n==='timestamp'||n==='timestamp_ntz'){
    if(n==='timestamp'&&!policy.timestampUtc)issue(path,'SPARK_TIMESTAMP_ZONE_LOSS','loss','Timezone-free Arrow timestamp does not distinguish Spark timestamp from timestamp_ntz');
    if(n==='timestamp_ntz')issue(path,'SPARK_TIMESTAMP_RECOVERY','representation-change','Recovering Spark timestamp_ntz requires prefer_timestamp_ntz=true on target-only recovery');
    return scalar('Timestamp',{unit:'MICROSECOND',...(n==='timestamp'&&policy.timestampUtc?{timezone:'UTC'}:{})});
   }
   if(n==='variant'){issue(path,'SPARK_VARIANT_ENCODING','representation-change','Spark-specific tagged binary struct encodes variant; generic Arrow consumers need the Spark convention');return {type:{type:'Struct_',value:{}},children:[{name:'value',...scalar('Binary')},{name:'metadata',...scalar('Binary'),custom_metadata:[{key:'variant',value:'true'}]}]};}
   if(/^interval (day|hour|minute|second)( to (day|hour|minute|second))?$/.test(n)){
    const match=/^interval (day|hour|minute|second)(?: to (day|hour|minute|second))?$/.exec(n)!,order=['day','hour','minute','second'];if(match[2]&&order.indexOf(match[1]!)>=order.indexOf(match[2]))return fail(path,'Invalid interval range');
    if(n!=='interval day to second')issue(path,'SPARK_INTERVAL_RANGE_LOSS','loss','Arrow duration does not retain Spark interval start/end units; native recovery uses day to second');return scalar('Duration',{unit:'MICROSECOND'});
   }
   const decimal=/^decimal\(\s*(\d+)\s*,\s*(-?\d+)\s*\)$/.exec(n);if(decimal){const p=Number(decimal[1]),s=Number(decimal[2]);if(!Number.isInteger(p)||p<1||p>38||!Number.isSafeInteger(s)||s<0||s>p)return fail(path,'Decimal range or configuration is outside this verified lowering');return scalar('Decimal',{precision:p,...(s?{scale:s}:{})});}
   return fail(path,'Unsupported or unverified Spark type spelling: '+n);
  }
  if(n.type==='struct')return {type:{type:'Struct_',value:{}},children:struct(n,path,true)};
  if(n.type==='array'){known(n,['type','elementType','containsNull'],path);return {type:{type:'List',value:{}},children:[field({name:'element',type:n.elementType,nullable:n.containsNull},path+'/elementType',path+'/elementType')]};}
  if(n.type==='map'){known(n,['type','keyType','valueType','valueContainsNull'],path);return {type:{type:'Map',value:{}},children:[{name:'entries',type:{type:'Struct_',value:{}},children:[field({name:'key',type:n.keyType,nullable:false},path+'/keyType',path+'/keyType'),field({name:'value',type:n.valueType,nullable:n.valueContainsNull},path+'/valueType',path+'/valueType')]}]};}
  return fail(path,'Unknown type or opaque UDT cannot be lowered without its contract');
 }
 if(!root||root.type!=='struct'){fail('','Spark-to-Arrow schema requires a StructType root');return result;}
 for(const id of Object.keys(source.vocabularies))if(id!=='umf.spark')issue('/vocabularies/'+pointer(id),'SPARK_EXTENSION_CONTEXT','loss','Other extension semantics remain in the retained source only');
 for(const key of Object.keys(source))if(!['umf','id','vocabularies','modules','extensions'].includes(key))issue('/'+pointer(key),'SPARK_DOCUMENT_CONTEXT','loss','Document context remains in retained source only');
 for(const [i,module] of source.modules.entries()){
  if(module.id!=='schema')fail('/modules/'+i,'Additional modules require an explicit projection contract');
  for(const key of Object.keys(module))if(!['id','namespace','elements'].includes(key))issue('/modules/'+i+'/'+pointer(key),'SPARK_MODULE_CONTEXT','loss','Module context remains in retained source only');
  if(module.namespace)issue('/modules/'+i+'/namespace','SPARK_MODULE_CONTEXT','loss','Module namespace remains in retained source only');
  for(const [j,element] of module.elements.entries()){
   if(element.id!=='schema')fail('/modules/'+i+'/elements/'+j,'Additional elements require an explicit projection contract');
   for(const key of Object.keys(element))if(!['id','extensions'].includes(key))issue('/modules/'+i+'/elements/'+j+'/'+pointer(key),'SPARK_ELEMENT_CONTEXT','loss','Element context remains in retained source only');
   for(const key of Object.keys(element.extensions))if(key!=='umf.spark')issue('/modules/'+i+'/elements/'+j+'/extensions/'+pointer(key),'SPARK_EXTENSION_CONTEXT','loss','Other extension content remains in retained source only');
  }
 }
 for(const [id,declaration] of Object.entries(source.vocabularies))for(const key of Object.keys(declaration))if(key!=='version')issue('/vocabularies/'+pointer(id)+'/'+pointer(key),'SPARK_EXTENSION_CONTEXT','loss','Vocabulary context remains in retained source only');
 if(source.extensions)issue('/extensions','SPARK_DOCUMENT_CONTEXT','loss','Document extensions remain in the retained source only');
 const fields=struct(root,'',false);
 if(fatal||(policy.lossPolicy==='strict'&&result.issues.length))return result;
 result.target=importArrowFlatbufferModel(JSON.stringify({rootType:'Message',value:{version:'V5',header:{type:'Schema',value:{fields}}}}),{id:policy.id});result.status='projected';return result;
}
