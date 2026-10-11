import {sparkParameterDiagnostics} from './parameters';
import {sparkCollationDiagnostics} from './collations';
import {sparkMetadataDiagnostics} from './metadata';
import manifest from '../../../spec/extensions/spark/package.json';
import grammar from '../../../spec/extensions/spark/datatype-schema.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {createValidator} from '../../validation/schema';
import {copyJson} from '../../model/json';
import {parseNativeJson,renderTree,nativePointer,treeChild,type NativeJson} from '../../model/native-json';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../../model/types';
export const SPARK_EXTENSION='umf.spark';
export const sparkPackage=manifest as unknown as ExtensionPackage;
type Payload={profile:'spark-datatype-json';root:NativeJson};
let check:ReturnType<ReturnType<typeof createValidator>['compile']>|undefined;
const atomic=new Set(['void','null','boolean','byte','short','integer','long','float','double','string','binary','date','timestamp','timestamp_ltz','timestamp_ntz','decimal','interval','variant']);
const parameters=/^(?:decimal\(\s*\d+\s*,\s*-?\d+\s*\)|(?:char|varchar)\(\s*\d+\s*\)|string collate .+|interval (?:year|month|day|hour|minute|second)(?: to (?:year|month|day|hour|minute|second))?)$/;
function inspect(value:Json):Diagnostic[]{
 const p=value as unknown as Payload,ds:Diagnostic[]=[{code:'SPARK_NATIVE_UNVERIFIED',path:'',severity:'warning',message:'Schema preservation is not Spark engine validity: runtime/configuration, metadata, collation and coercion checks remain separate'}];
 const add=(code:string,path:string,message:string,severity:'warning'|'error'='warning')=>ds.push({code,path,message,severity});
 if(Object.keys(p).some(k=>!['profile','root'].includes(k)))add('SPARK_REPRESENTATION','','Unknown representation fields must stay in UMF');
 function tagged(n:NativeJson,path:string){const keys=n.kind==='null'?['kind']:n.kind==='array'?['kind','items']:n.kind==='object'?['kind','members']:['kind','value'];if(Object.keys(n).some(k=>!keys.includes(k)))add('SPARK_REPRESENTATION',path,'Unknown tagged-tree fields must stay in UMF');if(n.kind==='object')for(const [key,v] of Object.entries(n.members))tagged(v,path+'/'+pointer(key));if(n.kind==='array')n.items.forEach((v,i)=>tagged(v,path+'/'+i));}
 tagged(p.root,'/root');const view=JSON.parse(renderTree(p.root));check??=createValidator().compile(grammar);
 if(!check(view)){for(const e of check.errors??[])add('SPARK_STRUCTURE',e.instancePath,e.message??'Invalid DataType shape','error');return ds;}
 function unknown(v:any,keys:string[],path:string){for(const key of Object.keys(v))if(!keys.includes(key))add('SPARK_UNKNOWN',path+'/'+pointer(key),'Uninterpreted native property preserved');}
 function type(v:any,path:string){
  if(typeof v==='string'){ds.push(...sparkParameterDiagnostics(v,path));if(!atomic.has(v)&&!parameters.test(v))add('SPARK_UNKNOWN_TYPE',path,'Unrecognized type spelling preserved');return;}
  switch(v.type){
   case 'array':unknown(v,['type','elementType','containsNull'],path);type(v.elementType,path+'/elementType');break;
   case 'map':unknown(v,['type','keyType','valueType','valueContainsNull'],path);type(v.keyType,path+'/keyType');type(v.valueType,path+'/valueType');break;
   case 'struct':unknown(v,['type','fields'],path);v.fields.forEach((f:any,i:number)=>{const at=path+'/fields/'+i;unknown(f,['name','type','nullable','metadata'],at);type(f.type,at+'/type');if(f.metadata)add('SPARK_METADATA_UNVERIFIED',at+'/metadata','Metadata retained exactly; engine value restrictions, collation paths and name dependencies are not interpreted');});break;
   case 'udt':unknown(v,['type','class','pyClass','serializedClass','sqlType'],path);add('SPARK_UDT_UNINTERPRETED',path,'UDT declaration retained without importing classes or deserializing executable content');if(v.sqlType!==undefined)type(v.sqlType,path+'/sqlType');break;
   default:add('SPARK_UNKNOWN_TYPE',path,'Unrecognized object-form type preserved');
  }
 }
 type(view,'');ds.push(...sparkMetadataDiagnostics(p.root),...sparkCollationDiagnostics(p.root));return ds;
}
export function sparkRegistry(){return new Registry().register(sparkPackage,inspect);}
export function inspectSpark(document:Document){return validateDocument(document,sparkRegistry());}
function payload(document:Document):Payload{
 const checked=inspectSpark(document);if(!checked.valid)throw new UmfError('SPARK_DOCUMENT',JSON.stringify(checked.diagnostics));
 const value=document.modules.find(m=>m.id==='schema')?.elements.find(e=>e.id==='schema')?.extensions[SPARK_EXTENSION];if(!value||document.vocabularies[SPARK_EXTENSION]?.version!=='0.1.0')throw new UmfError('SPARK_PAYLOAD','Expected pinned Spark schema payload');return copyJson(value) as unknown as Payload;
}
export function importSparkSchema(text:string,options:{id:string}):Document{const document:Document={umf:'0.1.0',id:options.id,vocabularies:{[SPARK_EXTENSION]:{version:'0.1.0'}},modules:[{id:'schema',namespace:'',elements:[{id:'schema',extensions:{[SPARK_EXTENSION]:{profile:'spark-datatype-json',root:parseNativeJson(text)} as unknown as Json}}]}]};payload(document);return document;}
export function exportSparkSchema(document:Document){const p=payload(document);if(inspectSpark(document).diagnostics.some(d=>d.code==='SPARK_REPRESENTATION'))throw new UmfError('SPARK_EXPORT','Unknown representation fields cannot be discarded');return renderTree(p.root);}
export function getSparkNode(document:Document,path:string){let n=payload(document).root;for(const key of nativePointer(path))n=treeChild(n,key);return copyJson(n) as unknown as NativeJson;}
export function proposeSparkNodeEdit(document:Document,path:string,text:string){const p=payload(document),parts=nativePointer(path),replacement=parseNativeJson(text);if(!parts.length)p.root=replacement;else{let n=p.root;for(const key of parts.slice(0,-1))n=treeChild(n,key);const key=parts.at(-1)!;treeChild(n,key);if(n.kind==='object')n.members[key]=replacement;else if(n.kind==='array')n.items[Number(key)]=replacement;else throw new UmfError('SPARK_EDIT','Expected existing node');}const next=copyJson(document) as unknown as Document;next.modules.find(m=>m.id==='schema')!.elements.find(e=>e.id==='schema')!.extensions[SPARK_EXTENSION]=p as unknown as Json;payload(next);return {document:next,validation:inspectSpark(next)};}
