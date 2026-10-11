import {parseNativeJson,type NativeJson} from '../../model/native-json';
import {pointer,type Diagnostic} from '../../model/types';
/** Snapshot-local checks only: historical uniqueness and data-file field IDs require evidence outside this pair. */
export function deltaColumnMappingDiagnostics(context:NativeJson):Diagnostic[]{
 const ds:Diagnostic[]=[];const add=(code:string,path:string,message:string)=>ds.push({code,path,message,severity:'warning'});
 if(context.kind!=='object')return ds;const meta=context.members.metaData,protocol=context.members.protocol;if(meta?.kind!=='object'||protocol?.kind!=='object')return ds;
 const config=meta.members.configuration;if(config?.kind!=='object')return ds;
 const mode=config.members['delta.columnMapping.mode'];if(!mode||mode.kind==='string'&&mode.value==='none')return ds;
 const base='/metaData/configuration/';if(mode.kind!=='string'||!['id','name'].includes(mode.value)){add('DELTA_MAPPING_MODE',base+'delta.columnMapping.mode','Unknown mapping mode remains uninterpreted');return ds;}
 const num=(n:NativeJson|undefined)=>n?.kind==='number'?n.value:undefined;
 const has=(key:string,name:string)=>{const a=protocol.members[key];return a?.kind==='array'&&a.items.some(n=>n.kind==='string'&&n.value===name);};
 const reader=num(protocol.members.minReaderVersion),writer=num(protocol.members.minWriterVersion);
 if(!(reader==='2'||reader==='3'&&has('readerFeatures','columnMapping')))add('DELTA_MAPPING_READER_PROTOCOL','/protocol','Mapping requires reader 2 or reader 3 with columnMapping');
 if(!(['5','6'].includes(writer??'')||writer==='7'&&has('writerFeatures','columnMapping')))add('DELTA_MAPPING_WRITER_PROTOCOL','/protocol','Mapping requires writer 5/6 or writer 7 with columnMapping');
 add('DELTA_MAPPING_HISTORY_UNVERIFIED','/metaData/schemaString','Historical physical-path uniqueness, monotonic maxColumnId and actual Parquet field IDs are not verified');
 const max=config.members['delta.columnMapping.maxColumnId'];let maxId:bigint|undefined;
 const maxToken=max?.kind==='string'?max.value.replace(/^(-?)0+(?=\d)/,'$1'):undefined;
 if(maxToken!==undefined&&/^-?\d+$/.test(maxToken)&&maxToken.replace(/^-/, '').length<=10){maxId=BigInt(maxToken);if(maxId< -2147483648n||maxId>2147483647n){maxId=undefined;}}
 if(maxId===undefined)add('DELTA_MAPPING_MAX_ID',base+'delta.columnMapping.maxColumnId','Expected a string containing a signed int32 maximum column ID');
 const text=meta.members.schemaString;if(text?.kind!=='string')return ds;let schema:NativeJson;try{schema=parseNativeJson(text.value);}catch{return ds;}
 const ids=new Set<string>(),physicalPaths=new Set<string>();
 function type(n:NativeJson,path:string,physical:string[]|undefined){if(n.kind!=='object'||n.members.type?.kind!=='string')return;
  if(n.members.type.value==='struct'&&n.members.fields?.kind==='array')n.members.fields.items.forEach((f,i)=>{
   if(f.kind!=='object')return;const at=path+'/fields/'+i,m=f.members.metadata,metadata=m?.kind==='object'?m.members:{},id=metadata['delta.columnMapping.id'],name=metadata['delta.columnMapping.physicalName'];
   if(id?.kind!=='number'||! /^-?\d+$/.test(id.value)||id.value.replace(/^-/, '').length>10||BigInt(id.value)< -2147483648n||BigInt(id.value)>2147483647n)add('DELTA_MAPPING_ID',at+'/metadata/delta.columnMapping.id','Every mapped field requires an exact signed int32 column ID');
   else{const value=BigInt(id.value),key=value.toString();if(ids.has(key))add('DELTA_MAPPING_DUPLICATE_ID',at+'/metadata/delta.columnMapping.id','Column ID is reused in the current schema');ids.add(key);if(maxId!==undefined&&value>maxId)add('DELTA_MAPPING_MAX_ID_BELOW_FIELD',base+'delta.columnMapping.maxColumnId','Declared maximum is below an assigned field ID');}
   let next:string[]|undefined;if(name?.kind!=='string'||!name.value)add('DELTA_MAPPING_PHYSICAL_NAME',at+'/metadata/delta.columnMapping.physicalName','Every mapped field requires a nonempty physical name');else if(physical){next=[...physical,name.value];const key=JSON.stringify(next);if(physicalPaths.has(key))add('DELTA_MAPPING_DUPLICATE_PATH',at+'/metadata/delta.columnMapping.physicalName','Physical field path is reused in the current schema');physicalPaths.add(key);}
   if(f.members.type)type(f.members.type,at+'/type',next);
  });
  if(n.members.type.value==='array'&&n.members.elementType)type(n.members.elementType,path+'/elementType',physical&&[...physical,'element']);
  if(n.members.type.value==='map'){if(n.members.keyType)type(n.members.keyType,path+'/keyType',physical&&[...physical,'key']);if(n.members.valueType)type(n.members.valueType,path+'/valueType',physical&&[...physical,'value']);}
 }
 type(schema,'/metaData/schemaString',[]);return ds;
}
