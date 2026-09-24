import {copyJson} from '../model/json';
import {UmfError,type Document,type JsonObject} from '../model/types';
import {exportAvroBundle,inspectAvro} from '../adapters/avro';
import {importJsonSchema,inspectJsonSchema} from '../adapters/json-schema';
import type {ProjectionIssue} from './json-schema-protobuf';
export interface AvroDocumentBindings {
 id:string;schemaId:string;long:'decimal-string';bytes:'hex-string';union:'untagged';lossPolicy:'strict'|'allow-reported-loss';
}
export interface AvroDocumentProjection {
 status:'blocked'|'projected';source:Document;policy:AvroDocumentBindings;issues:ProjectionIssue[];
 mappings:{name:string;sourcePath:string;targetPointer:string}[];target?:Document;nativeSchema?:string;
}
/** Projects schema shapes; instance encoding is an explicit caller responsibility. */
export function projectAvroToJsonSchema(source:Document,input:AvroDocumentBindings):AvroDocumentProjection {
 const policy=copyJson(input) as unknown as AvroDocumentBindings;
 if(!policy.id||typeof policy.id!=='string'||typeof policy.schemaId!=='string'||policy.long!=='decimal-string'||policy.bytes!=='hex-string'||policy.union!=='untagged'||!['strict','allow-reported-loss'].includes(policy.lossPolicy)||Object.keys(policy).some(k=>!['id','schemaId','long','bytes','union','lossPolicy'].includes(k)))throw new UmfError('AVRO_BINDINGS','Explicit supported Avro document bindings are required');
 try{const uri=new URL(policy.schemaId);if(uri.hash)throw new Error('fragment');}catch{throw new UmfError('AVRO_BINDINGS','Schema ID must be absolute and fragment-free');}
 const checked=inspectAvro(source);if(!checked.valid)throw new UmfError('AVRO_SOURCE','Invalid Avro document');
 const result:AvroDocumentProjection={status:'blocked',source:copyJson(source) as unknown as Document,policy,issues:[],mappings:[]};
 const issue=(path:string,code:string,classification:ProjectionIssue['classification'],detail:string)=>result.issues.push({path,code,classification,detail,retainedInSource:true});
 let fatal=false;
 const fail=(path:string,detail:string)=>{fatal=true;issue(path,'AVRO_UNSUPPORTED','unsupported',detail);return {} as JsonObject;};
 for(const d of checked.diagnostics){issue(d.path,d.code,'unsupported',d.message);if(['AVRO_VALIDATOR_LIMIT','AVRO_NUMERIC','AVRO_REPRESENTATION'].includes(d.code))fatal=true;}
 if(fatal)return result;
 const bundle=exportAvroBundle(source);
 const defs:Record<string,JsonObject>=Object.create(null);const names=new Map<string,string>();
 const primitive=(type:string,path:string):JsonObject|undefined=>{
  switch(type){
   case 'null':case 'boolean':case 'string':return {type};
   case 'int':return {type:'integer',minimum:-2147483648,maximum:2147483647};
   case 'long':issue(path,'LONG_ENCODING','representation-change','Long values use decimal strings; signed 64-bit bounds remain unenforced by this pattern');return {type:'string',pattern:'^-?(0|[1-9][0-9]*)(?![\\s\\S])'};
   case 'float':issue(path,'FLOAT_PRECISION','not-enforced','JSON numbers do not enforce binary32 rounding or represent non-finite Avro values');return {type:'number'};
   case 'double':issue(path,'NONFINITE_ENCODING','representation-change','JSON numbers cannot represent non-finite Avro values');return {type:'number'};
   case 'bytes':issue(path,'BYTES_ENCODING','representation-change','Native bytes require lowercase hexadecimal string encoding');return {type:'string',pattern:'^([0-9a-f]{2})*(?![\\s\\S])'};
  }
 };
 function shape(node:any,namespace:string,path:string):JsonObject {
  if(typeof node==='string'){
   const scalar=primitive(node,path);if(scalar)return scalar;
   const full=node.includes('.')?node:namespace?namespace+'.'+node:node;const key=names.get(full);
   return key?{$ref:'#/$defs/'+key}:fail(path,'Unresolved native name '+full);
  }
  if(Array.isArray(node)){
   issue(path,'UNION_TAGS','representation-change','Untagged anyOf loses Avro branch identity and order; overlapping branches cannot be recovered from JSON values alone');
   return {anyOf:node.map((branch,i)=>shape(branch,namespace,path+'/'+i))};
  }
  if(!node||typeof node!=='object'||typeof node.type!=='string')return fail(path,'Unsupported native schema node');
  const type=node.type;
  if(node.logicalType!==undefined)issue(path+'/logicalType','LOGICAL_TYPE_UNENFORCED','not-enforced','Only the underlying carrier is projected; logical type interpretation, units, precision and scale remain source-owned');
  const annotations:JsonObject=typeof node.doc==='string'?{description:node.doc}:{};
  if(['record','error','enum','fixed'].includes(type)){
   const full=node.name.includes('.')?node.name:(node.namespace??namespace)?(node.namespace??namespace)+'.'+node.name:node.name;
   if(names.has(full))return fail(path,'Duplicate native declaration '+full);
   const localNs=full.includes('.')?full.slice(0,full.lastIndexOf('.')):'';
   const key='type_'+names.size;names.set(full,key);defs[key]={title:full,...annotations};
   result.mappings.push({name:full,sourcePath:path,targetPointer:'/$defs/'+key});
   issue(path,'NATIVE_TYPE_IDENTITY','not-enforced','Native named-type identity, aliases, resolution and binary representation are not enforced by JSON shape validation');
   if(type==='record'||type==='error'){
    const properties:Record<string,JsonObject>=Object.create(null);const required:string[]=[];
    for(let i=0;i<node.fields.length;i++){
     const field=node.fields[i];const fp=path+'/fields/'+i;
     properties[field.name]=shape(field.type,localNs,fp+'/type');required.push(field.name);
     if(typeof field.doc==='string')properties[field.name]={...properties[field.name],description:field.doc};
     if(Object.hasOwn(field,'default'))issue(fp+'/default','READER_DEFAULT','not-enforced','Avro reader-resolution default remains in source; writer field stays required and no JSON default insertion is implied');
     if(field.order!==undefined||field.aliases!==undefined)issue(fp,'FIELD_RESOLUTION','not-enforced','Native field aliases and sort order remain in source');
    }
    Object.assign(defs[key]!,{type:'object',properties,required,additionalProperties:false});
    issue(path,'RECORD_ENCODING','representation-change','All declared writer fields are required in a closed JSON object; binary field ordering and runtime extra-field behavior are not reproduced');
   }else if(type==='enum'){
    Object.assign(defs[key]!,{type:'string',enum:node.symbols});
    if(node.default!==undefined)issue(path+'/default','ENUM_RESOLUTION','not-enforced','Reader fallback for unknown enum symbols is not executed by JSON validation');
   }else{
    if(!Number.isSafeInteger(node.size)||node.size<0||node.size>Number.MAX_SAFE_INTEGER/2)return fail(path,'Fixed size cannot be represented safely');
    Object.assign(defs[key]!,{type:'string',pattern:'^([0-9a-f]{2})*(?![\\s\\S])',minLength:node.size*2,maxLength:node.size*2});
    issue(path,'FIXED_ENCODING','representation-change','Fixed bytes require lowercase hexadecimal strings with exact byte length');
   }
   return {$ref:'#/$defs/'+key};
  }
  if(type==='array')return {type:'array',items:shape(node.items,namespace,path+'/items'),...annotations};
  if(type==='map')return {type:'object',additionalProperties:shape(node.values,namespace,path+'/values'),...annotations};
  return {...shape(type,namespace,path+'/type'),...annotations};
 }
 for(let i=0;i<bundle.dependencies.length;i++)shape(JSON.parse(bundle.dependencies[i]!.schema),'','/dependencies/'+i+'/root');
 const root=shape(JSON.parse(bundle.schema),'','/root');
 issue('','SCHEMA_ONLY','representation-change','This projection defines a JSON instance binding; it does not convert Avro binary/JSON instances or implement reader/writer schema resolution');
 if(fatal||policy.lossPolicy==='strict'&&result.issues.length)return result;
 result.nativeSchema=JSON.stringify({$schema:'https://json-schema.org/draft/2020-12/schema',$id:policy.schemaId,...root,$defs:defs},null,2)+'\n';
 result.target=importJsonSchema(result.nativeSchema,{id:policy.id,baseUri:policy.schemaId});
 if(!inspectJsonSchema(result.target).valid)throw new UmfError('AVRO_TARGET','Generated JSON Schema is invalid');
 result.status='projected';return result;
}
