import {importIcebergSchema,inspectIceberg} from './index';
import manifest from '../../../spec/extensions/iceberg-table/package.json';
import grammar from '../../../spec/extensions/iceberg-table/datatype-schema.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {createValidator} from '../../validation/schema';
import {copyJson} from '../../model/json';
import {parseNativeJson,renderTree,nativePointer,treeChild,type NativeJson} from '../../model/native-json';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../../model/types';
export const ICEBERG_TABLE_EXTENSION='umf.iceberg.table';
export const icebergTablePackage=manifest as unknown as ExtensionPackage;
type Payload={profile:'iceberg-table-json';root:NativeJson};
let check:ReturnType<ReturnType<typeof createValidator>['compile']>|undefined;
function inspect(value:Json):Diagnostic[]{
 const p=value as unknown as Payload,ds:Diagnostic[]=[{code:'ICEBERG_TABLE_CONTEXT',path:'',severity:'warning',message:'Metadata shapes do not validate physical files, schema evolution, transforms, reference histories, defaults, encryption or safe commits'}],add=(code:string,path:string,message:string,severity:'warning'|'error'='warning')=>ds.push({code,path,message,severity});
 if(Object.keys(p).some(k=>!['profile','root'].includes(k)))add('ICEBERG_TABLE_REPRESENTATION','','Unknown representation fields must remain in UMF');
 function tagged(n:NativeJson,path:string){const keys=n.kind==='null'?['kind']:n.kind==='array'?['kind','items']:n.kind==='object'?['kind','members']:['kind','value'];if(Object.keys(n).some(k=>!keys.includes(k)))add('ICEBERG_TABLE_REPRESENTATION',path,'Unknown tagged-tree fields must remain in UMF');if(n.kind==='object')for(const [k,v] of Object.entries(n.members))tagged(v,path+'/'+pointer(k));if(n.kind==='array')n.items.forEach((v,i)=>tagged(v,path+'/'+i));}
 tagged(p.root,'');check??=createValidator().compile(grammar);const v=JSON.parse(renderTree(p.root));if(!check(v)){for(const e of check.errors??[])add('ICEBERG_TABLE_STRUCTURE',e.instancePath,e.message??'Invalid table shape','error');return ds;}
 const known=[1,2,3].includes(v['format-version']);if(!known)add('ICEBERG_TABLE_VERSION','/format-version','Unknown table version preserved without native interpretation');
 const rootSchema=known?(grammar.allOf[0] as any).then:{properties:grammar.properties};
 function exact(n:NativeJson,s:any,path:string){
  if(s.$ref){const key=s.$ref.split('/').at(-1);return exact(n,(grammar.$defs as any)[key],path);}
  if(s.anyOf){if(n.kind==='null')return;const tag=n.kind==='object'&&n.members.type?.kind==='string'?n.members.type.value:undefined;const branch=(tag?s.anyOf.find((b:any)=>b.properties?.type?.const===tag):undefined)??s.anyOf.find((b:any)=>b.type===n.kind&&!b.properties?.type?.const||n.kind==='number'&&b.type==='integer')??s.anyOf.find((b:any)=>b.type==='object'&&!b.properties?.type?.const);if(branch)return exact(n,branch,path);return;}
  if(s.type==='integer'&&n.kind==='number'){if(!/^-?\d+$/.test(n.value)||n.value.replace('-','').length>19){add('ICEBERG_TABLE_INTEGER',path,'Expected bounded exact integer token','error');return;}const x=BigInt(n.value),lo=s.format==='int64'?-9223372036854775808n:BigInt(s.minimum??-2147483648),hi=s.format==='int64'?9223372036854775807n:BigInt(s.maximum??2147483647);if(x<lo||x>hi)add('ICEBERG_TABLE_INTEGER',path,'Integer exceeds signed width','error');}
  if(n.kind==='object'){for(const [k,child] of Object.entries(n.members)){const shape=s.properties&&Object.hasOwn(s.properties,k)?s.properties[k]:typeof s.additionalProperties==='object'?s.additionalProperties:undefined;if(shape)exact(child,shape,path+'/'+pointer(k));else if(s.properties)add('ICEBERG_TABLE_UNKNOWN',path+'/'+pointer(k),'Unknown native property preserved');}}
  if(n.kind==='array'&&s.items)n.items.forEach((child,i)=>exact(child,s.items,path+'/'+i));
 }
 exact(p.root,rootSchema,'');if(known&&p.root.kind==='object'){const schemas=p.root.members.schemas,legacy=p.root.members.schema,items=[...(legacy?[{node:legacy,path:'/schema'}]:[]),...(schemas?.kind==='array'?schemas.items.map((node,i)=>({node,path:'/schemas/'+i})):[])];for(const x of items){try{const d=importIcebergSchema(renderTree(x.node),{id:'embedded'});for(const diag of inspectIceberg(d).diagnostics)ds.push({...diag,path:x.path+diag.path});}catch(e){add('ICEBERG_TABLE_SCHEMA',x.path,(e as Error).message,'error');}}}
 return ds;
}
export function icebergTableRegistry(){return new Registry().register(icebergTablePackage,inspect);}
export function inspectIcebergTable(document:Document){return validateDocument(document,icebergTableRegistry());}
function payload(document:Document):Payload{
 const checked=inspectIcebergTable(document);if(!checked.valid)throw new UmfError('ICEBERG_TABLE_DOCUMENT',JSON.stringify(checked.diagnostics));
 const value=document.modules.find(m=>m.id==='table')?.elements.find(e=>e.id==='table')?.extensions[ICEBERG_TABLE_EXTENSION];if(!value||document.vocabularies[ICEBERG_TABLE_EXTENSION]?.version!=='0.1.0')throw new UmfError('ICEBERG_TABLE_PAYLOAD','Expected pinned Iceberg schema payload');return copyJson(value) as unknown as Payload;
}
export function importIcebergTable(text:string,options:{id:string}):Document{const document:Document={umf:'0.1.0',id:options.id,vocabularies:{[ICEBERG_TABLE_EXTENSION]:{version:'0.1.0'}},modules:[{id:'table',namespace:'',elements:[{id:'table',extensions:{[ICEBERG_TABLE_EXTENSION]:{profile:'iceberg-table-json',root:parseNativeJson(text)} as unknown as Json}}]}]};payload(document);return document;}
export function exportIcebergTable(document:Document){const p=payload(document);if(inspectIcebergTable(document).diagnostics.some(d=>d.code==='ICEBERG_TABLE_REPRESENTATION'))throw new UmfError('ICEBERG_TABLE_EXPORT','Unknown representation fields cannot be discarded');return renderTree(p.root);}
export function getIcebergTableNode(document:Document,path:string){let n=payload(document).root;for(const key of nativePointer(path))n=treeChild(n,key);return copyJson(n) as unknown as NativeJson;}
export function proposeIcebergTableNodeEdit(document:Document,path:string,text:string){const p=payload(document),parts=nativePointer(path),replacement=parseNativeJson(text);if(!parts.length)p.root=replacement;else{let n=p.root;for(const key of parts.slice(0,-1))n=treeChild(n,key);const key=parts.at(-1)!;treeChild(n,key);if(n.kind==='object')n.members[key]=replacement;else if(n.kind==='array')n.items[Number(key)]=replacement;else throw new UmfError('ICEBERG_TABLE_EDIT','Expected existing node');}const next=copyJson(document) as unknown as Document;next.modules.find(m=>m.id==='table')!.elements.find(e=>e.id==='table')!.extensions[ICEBERG_TABLE_EXTENSION]=p as unknown as Json;payload(next);return {document:next,validation:inspectIcebergTable(next)};}
