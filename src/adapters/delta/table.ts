import {deltaColumnMappingDiagnostics} from './column-mapping';
import manifest from '../../../spec/extensions/delta-table/package.json';
import grammar from '../../../spec/extensions/delta-table/context-schema.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {createValidator} from '../../validation/schema';
import {copyJson} from '../../model/json';
import {parseNativeJson,renderTree,nativePointer,treeChild,type NativeJson} from '../../model/native-json';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../../model/types';
import {importDeltaSchema,inspectDelta} from './index';
export const DELTA_TABLE_EXTENSION='umf.delta.table';
export const deltaTablePackage=manifest as unknown as ExtensionPackage;
type Payload={profile:'delta-table-context';root:NativeJson};
let check:ReturnType<ReturnType<typeof createValidator>['compile']>|undefined;
function inspect(value:Json):Diagnostic[]{
 const p=value as unknown as Payload,ds:Diagnostic[]=[{code:'DELTA_TABLE_UNVERIFIED',path:'',severity:'warning',message:'Supplied metadata/protocol context is not a reconciled snapshot; reader/writer support and safe evolution remain unverified'}];
 const add=(code:string,path:string,message:string,severity:'warning'|'error'='warning')=>ds.push({code,path,message,severity});
 if(Object.keys(p).some(k=>!['profile','root'].includes(k)))add('DELTA_TABLE_REPRESENTATION','','Unknown profile fields must remain in UMF');
 function tagged(n:NativeJson,path:string){const keys=n.kind==='null'?['kind']:n.kind==='array'?['kind','items']:n.kind==='object'?['kind','members']:['kind','value'];if(Object.keys(n).some(k=>!keys.includes(k)))add('DELTA_TABLE_REPRESENTATION',path,'Unknown tagged-tree fields must remain in UMF');if(n.kind==='object')for(const [k,v] of Object.entries(n.members))tagged(v,path+'/'+pointer(k));if(n.kind==='array')n.items.forEach((v,i)=>tagged(v,path+'/'+i));}
 tagged(p.root,'/root');const v=JSON.parse(renderTree(p.root));check??=createValidator().compile(grammar);if(!check(v)){for(const e of check.errors??[])add('DELTA_TABLE_STRUCTURE',e.instancePath,e.message??'Invalid table context','error');return ds;}
 const unknown=(n:any,keys:string[],path:string)=>{for(const k of Object.keys(n))if(!keys.includes(k))add('DELTA_TABLE_UNKNOWN',path+'/'+pointer(k),'Unknown native property retained');};
 unknown(v,['protocol','metaData'],'');unknown(v.protocol,['minReaderVersion','minWriterVersion','readerFeatures','writerFeatures'],'/protocol');unknown(v.metaData,['id','name','description','format','schemaString','partitionColumns','configuration','createdTime'],'/metaData');unknown(v.metaData.format,['provider','options'],'/metaData/format');
 const proto=v.protocol,reader=proto.readerFeatures??[],writer=proto.writerFeatures??[];
 for(const [version,key,expected] of [[proto.minReaderVersion,'readerFeatures',3],[proto.minWriterVersion,'writerFeatures',7]] as const){
  if((version===expected)!==(proto[key]!==undefined))add('DELTA_FEATURE_VERSION','/protocol/'+key,'Feature-list presence does not match the pinned protocol version rule');
  if(version>expected)add('DELTA_FUTURE_PROTOCOL','/protocol','Future protocol version remains uninterpreted');
  if(proto[key]){if(new Set(proto[key]).size!==proto[key].length)add('DELTA_DUPLICATE_FEATURE','/protocol/'+key,'Feature names must be unique');for(const [i,name] of proto[key].entries())add('DELTA_FEATURE_UNVERIFIED','/protocol/'+key+'/'+i,'Feature preserved; implementation capability is not asserted: '+name);}
 }
 for(const name of reader)if(!writer.includes(name))add('DELTA_READER_FEATURE_WRITER','/protocol/readerFeatures','Reader feature absent from writer feature list: '+name);
 if(v.metaData.format.provider!=='parquet')add('DELTA_FORMAT_UNVERIFIED','/metaData/format/provider','Storage provider is outside the verified examples');
 for(const k of Object.keys(v.metaData.configuration))add('DELTA_CONFIGURATION_UNVERIFIED','/metaData/configuration/'+pointer(k),'Table configuration and embedded SQL preserved without execution or enforcement');
 try{
  const doc=importDeltaSchema(v.metaData.schemaString,{id:'embedded'});for(const d of inspectDelta(doc).diagnostics)ds.push({...d,path:'/metaData/schemaString'+d.path});
  const schema=JSON.parse(v.metaData.schemaString);const names=new Set(schema.fields.map((f:any)=>f.name));const seen=new Set();for(const [i,name] of v.metaData.partitionColumns.entries()){if(!names.has(name))add('DELTA_PARTITION_UNRESOLVED','/metaData/partitionColumns/'+i,'Partition name does not exactly match a top-level field');if(seen.has(name))add('DELTA_PARTITION_DUPLICATE','/metaData/partitionColumns/'+i,'Duplicate partition column');seen.add(name);}
  function type(n:any,path:string){if(n==='timestamp_ntz'&&(!reader.includes('timestampNtz')||!writer.includes('timestampNtz')))add('DELTA_TIMESTAMP_NTZ_FEATURE',path,'timestamp_ntz requires reader and writer feature declarations');if(n&&typeof n==='object'){if(n.type==='struct')n.fields.forEach((f:any,i:number)=>type(f.type,path+'/fields/'+i+'/type'));if(n.type==='array')type(n.elementType,path+'/elementType');if(n.type==='map'){type(n.keyType,path+'/keyType');type(n.valueType,path+'/valueType');}}}type(schema,'/metaData/schemaString');
 }catch{add('DELTA_EMBEDDED_SCHEMA','/metaData/schemaString','Embedded schema is invalid or outside known shape; exact string retained');}
 ds.push(...deltaColumnMappingDiagnostics(p.root));return ds;
}
export function deltaTableRegistry(){return new Registry().register(deltaTablePackage,inspect);}
export function inspectDeltaTable(document:Document){return validateDocument(document,deltaTableRegistry());}
function payload(document:Document):Payload{
 const checked=inspectDeltaTable(document);if(!checked.valid)throw new UmfError('DELTA_TABLE_DOCUMENT',JSON.stringify(checked.diagnostics));
 const value=document.modules.find(m=>m.id==='table')?.elements.find(e=>e.id==='table')?.extensions[DELTA_TABLE_EXTENSION];if(!value||document.vocabularies[DELTA_TABLE_EXTENSION]?.version!=='0.1.0')throw new UmfError('DELTA_TABLE_PAYLOAD','Expected pinned Delta schema payload');return copyJson(value) as unknown as Payload;
}
export function importDeltaTable(text:string,options:{id:string}):Document{const document:Document={umf:'0.1.0',id:options.id,vocabularies:{[DELTA_TABLE_EXTENSION]:{version:'0.1.0'}},modules:[{id:'table',namespace:'',elements:[{id:'table',extensions:{[DELTA_TABLE_EXTENSION]:{profile:'delta-table-context',root:parseNativeJson(text)} as unknown as Json}}]}]};payload(document);return document;}
export function exportDeltaTable(document:Document){const p=payload(document);if(inspectDeltaTable(document).diagnostics.some(d=>d.code==='DELTA_TABLE_REPRESENTATION'))throw new UmfError('DELTA_TABLE_EXPORT','Unknown representation fields cannot be discarded');return renderTree(p.root);}
export function getDeltaTableNode(document:Document,path:string){let n=payload(document).root;for(const key of nativePointer(path))n=treeChild(n,key);return copyJson(n) as unknown as NativeJson;}
export function proposeDeltaTableNodeEdit(document:Document,path:string,text:string){const p=payload(document),parts=nativePointer(path),replacement=parseNativeJson(text);if(!parts.length)p.root=replacement;else{let n=p.root;for(const key of parts.slice(0,-1))n=treeChild(n,key);const key=parts.at(-1)!;treeChild(n,key);if(n.kind==='object')n.members[key]=replacement;else if(n.kind==='array')n.items[Number(key)]=replacement;else throw new UmfError('DELTA_TABLE_EDIT','Expected existing node');}const next=copyJson(document) as unknown as Document;next.modules.find(m=>m.id==='table')!.elements.find(e=>e.id==='table')!.extensions[DELTA_TABLE_EXTENSION]=p as unknown as Json;payload(next);return {document:next,validation:inspectDeltaTable(next)};}

/** Parse a copied view; this never normalizes the authoritative schemaString. */
export function getDeltaTableSchema(document:Document):Document{const n=getDeltaTableNode(document,'/metaData/schemaString');if(n.kind!=='string')throw new UmfError('DELTA_TABLE_SCHEMA','Expected embedded schema string');return importDeltaSchema(n.value,{id:document.id+'/schema'});}
